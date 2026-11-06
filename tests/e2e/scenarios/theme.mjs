// The light/dark button in the header: it switches at once, the choice survives a reload
// (the server renders it from the cookie), and it wins over the device's setting.
const state = `({
  theme: document.documentElement.dataset.theme ?? null,
  pressed: document.querySelector('header button[aria-pressed]')?.getAttribute('aria-pressed'),
  background: getComputedStyle(document.body).backgroundColor,
})`;
const toggle = `document.querySelector('header button[aria-pressed]').click()`;

export default async function theme(page, check) {
  await page.emulateDark(false);
  await page.open('/en');
  const light = await page.js(state);
  check(
    'no choice yet: the device (light) decides',
    light.theme === null && light.pressed === 'false',
    JSON.stringify(light)
  );

  await page.js(toggle);
  const dark = await page.js(state);
  check(
    'the button switches to dark at once',
    dark.theme === 'dark' && dark.pressed === 'true',
    JSON.stringify(dark)
  );
  check(
    '…and the colours change',
    dark.background !== light.background,
    `${light.background} → ${dark.background}`
  );

  await page.open('/fi/contracts');
  const kept = await page.js(state);
  check(
    'the choice is kept on the next page, from the server',
    kept.theme === 'dark' && kept.pressed === 'true',
    JSON.stringify(kept)
  );

  await page.emulateDark(true);
  await page.js(toggle);
  await page.open('/en');
  const chosenLight = await page.js(state);
  check(
    'choosing light wins over a dark device',
    chosenLight.theme === 'light' && chosenLight.background === light.background,
    JSON.stringify(chosenLight)
  );

  await page.js(`document.cookie = 'lease-loop-theme=; path=/; max-age=0'`);
  await page.emulateDark(false);
}
