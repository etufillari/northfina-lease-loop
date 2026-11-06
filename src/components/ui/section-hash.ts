// Which section of the current page a link points to. Pure: no DOM, so it is tested in Node.

/** Drops one trailing slash, so `/en/` and `/en` are the same page. */
function samePath(a: string, b: string): boolean {
  const strip = (path: string) =>
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return strip(a) === strip(b);
}

/**
 * The id of the section `href` points to when that section is on the page at `pathname`,
 * else null. `/en#how-it-works` on `/en` gives `how-it-works`; `#how-it-works` (no path) is
 * always this page; on `/en/catalogue`, or with no hash or an empty one, it gives null and the
 * link is left to navigate.
 */
export function sectionOnPage(href: string, pathname: string): string | null {
  const cut = href.indexOf('#');
  if (cut === -1) return null;
  const path = href.slice(0, cut);
  const hash = href.slice(cut + 1);
  if (hash === '') return null;
  if (path !== '' && !samePath(path, pathname)) return null;
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash; // a malformed escape (`%E0`) is taken as written
  }
}
