import { describe, expect, it } from 'vitest';
import { mailtoHref } from './mailto';

describe('mailtoHref', () => {
  const body = 'Hi,\n\nRevontuli Gamer 17: http://localhost:3000/en/products/laptop-008?a=1&b=2';
  it('builds a link with no recipient and an encoded subject and body', () => {
    const href = mailtoHref('Could you help me lease this?', body);
    expect(href.startsWith('mailto:?subject=')).toBe(true);
    const url = new URL(href);
    expect(url.searchParams.get('subject')).toBe('Could you help me lease this?');
    expect(url.searchParams.get('body')).toBe(body);
  });
  it('addresses the recipient when one is given', () => {
    const href = mailtoHref('Please sign', body, 'ceo@norvi.example.com');
    expect(href.startsWith('mailto:ceo%40norvi.example.com?subject=')).toBe(true);
    expect(new URL(href).searchParams.get('body')).toBe(body);
  });
});
