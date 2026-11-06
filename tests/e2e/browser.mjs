// A tiny headless-Chrome driver over the DevTools protocol, using Node's own WebSocket: no
// test framework or browser download needed, only an installed Chrome or Edge.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function findChrome() {
  const found = CANDIDATES.find((path) => path && existsSync(path));
  if (!found) throw new Error('No Chrome or Edge found: set CHROME_PATH to its executable.');
  return found;
}

/**
 * Starts Chrome and waits up to `timeoutMs` for its first page's DevTools socket. A cold
 * start on a busy CI runner can take well over 10 s, so this waits 30 s, and `launch` tries
 * three times before giving up, saying what Chrome printed.
 */
async function startChrome(port, timeoutMs = 30_000) {
  const profile = mkdtempSync(join(tmpdir(), 'lease-loop-e2e-'));
  const chrome = spawn(findChrome(), [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    // CI containers often can't use Chrome's sandbox or a large /dev/shm.
    ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    'about:blank',
  ]);
  let output = '';
  chrome.stderr?.on('data', (chunk) => (output = (output + chunk).slice(-2000)));
  let exited = false;
  chrome.on('exit', () => (exited = true));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !exited) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const socketUrl = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
      if (socketUrl) return { chrome, profile, socketUrl };
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold the profile on Windows; it is in the temp folder anyway.
  }
  throw new Error(`Chrome did not start${exited ? ' (it exited)' : ''}. ${output.trim()}`);
}

/** Starts headless Chrome and returns a page driver bound to `baseUrl`. */
export async function launch(baseUrl, { port = 9350 } = {}) {
  let started = null;
  for (let attempt = 1; !started; attempt++) {
    try {
      // A fresh port each time, in case the last Chrome still holds the old one.
      started = await startChrome(port + attempt - 1);
    } catch (error) {
      if (attempt >= 3) throw error;
      console.warn(`Chrome did not start (attempt ${attempt} of 3), trying again…`);
    }
  }
  const { chrome, profile, socketUrl } = started;

  const ws = new WebSocket(socketUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.exception?.description ?? 'exception');
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');

  /** Evaluates `expression` in the page and returns its (JSON) value. */
  const js = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.result?.exceptionDetails) {
      throw new Error(res.result.exceptionDetails.exception?.description ?? 'evaluation failed');
    }
    return res.result?.result?.value;
  };
  const waitFor = async (expression, timeout = 20_000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (await js(expression)) return true;
      } catch {
        // page navigating
      }
      await sleep(200);
    }
    return false;
  };
  const settle = () => sleep(800);

  const page = {
    baseUrl,
    js,
    waitFor,
    consoleErrors,
    /** Opens `path` and waits for the app's header (the page has hydrated). */
    async open(path) {
      await send('Page.navigate', { url: baseUrl + path });
      await waitFor(
        `document.readyState === 'complete' && !!document.querySelector('header select')`
      );
      await settle();
    },
    /** Sets a select, input or textarea value the way React notices, then waits. */
    async set(selector, value, eventName = 'change') {
      await js(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('missing ' + ${JSON.stringify(selector)});
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event(${JSON.stringify(eventName)}, { bubbles: true }));
      })()`);
      await sleep(1200);
    },
    /** "Acting as": a customer id, 'staff' or 'guest'. */
    actAs: (who) => page.set('header select', who),
    /** Time travel to an ISO date. */
    travelTo: (date) => page.set('#time-travel-date', date, 'input'),
    /** Clicks the first element matching `selector` whose text starts with `text`. */
    async click(selector, text = '') {
      const done = await js(`(() => {
        const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
          .find((e) => e.innerText.trim().startsWith(${JSON.stringify(text)}));
        if (!el) return false;
        el.click();
        return true;
      })()`);
      if (!done) throw new Error(`nothing to click: ${selector} "${text}"`);
      await settle();
    },
    /** The main content's text, whitespace collapsed. */
    text: () => js(`document.querySelector('main').innerText.replace(/\\s+/g, ' ')`),
    /** A same-origin JSON POST from the page, so it carries the page's cookies. */
    post: (url, body) =>
      js(
        `fetch(${JSON.stringify(url)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }).then((r) => r.json())`
      ),
    /** Pretends the system is in dark mode (or back to light). */
    emulateDark: (on) =>
      send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: on ? 'dark' : 'light' }],
      }),
    async close() {
      ws.close();
      chrome.kill();
      await sleep(300);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Chrome may still hold the profile on Windows; it is in the temp folder anyway.
      }
    },
  };
  return page;
}
