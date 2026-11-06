import { describe, expect, it } from 'vitest';
import { sectionOnPage } from './section-hash';

// The "How it works" link (PR #30): it scrolls on its own page and navigates from any other.
describe('sectionOnPage', () => {
  it('finds the section when the link points to this page', () => {
    expect(sectionOnPage('/en#how-it-works', '/en')).toBe('how-it-works');
    expect(sectionOnPage('/fi#how-it-works', '/fi')).toBe('how-it-works');
  });

  it('treats a hash with no path as this page', () => {
    expect(sectionOnPage('#how-it-works', '/en/catalogue')).toBe('how-it-works');
  });

  it('ignores one trailing slash on either side', () => {
    expect(sectionOnPage('/en/#how-it-works', '/en')).toBe('how-it-works');
    expect(sectionOnPage('/en#how-it-works', '/en/')).toBe('how-it-works');
  });

  it('leaves a link to another page alone, so it navigates', () => {
    expect(sectionOnPage('/en#how-it-works', '/en/catalogue')).toBeNull();
    expect(sectionOnPage('/en#how-it-works', '/fi')).toBeNull();
    expect(sectionOnPage('/en/catalogue#top', '/en')).toBeNull();
  });

  it('leaves a link with no hash, or an empty one, alone', () => {
    expect(sectionOnPage('/en', '/en')).toBeNull();
    expect(sectionOnPage('/en#', '/en')).toBeNull();
  });

  it('decodes an encoded id', () => {
    expect(sectionOnPage('/en#hinta%20ja%20ehdot', '/en')).toBe('hinta ja ehdot');
  });

  it('takes a malformed escape as written instead of throwing', () => {
    expect(sectionOnPage('/en#bad%E0', '/en')).toBe('bad%E0');
  });
});
