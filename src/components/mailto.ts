/**
 * A mailto: link with an optional recipient and an encoded subject and body. The person's own
 * mail app sends it: the app itself sends no e-mail and stores no addresses.
 */
export function mailtoHref(subject: string, body: string, to = ''): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
