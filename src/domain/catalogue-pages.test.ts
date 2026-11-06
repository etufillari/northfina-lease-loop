import { describe, expect, it } from 'vitest';
import { defaultCatalogueQuery } from './catalogue';
import {
  catalogueSearch,
  DEFAULT_PER_PAGE,
  pageLinks,
  pageOf,
  parseCataloguePaging,
} from './catalogue-pages';

const thirty = Array.from({ length: 30 }, (_, i) => i + 1);

describe('parseCataloguePaging', () => {
  it('shows 10 items from page 1 by default', () => {
    expect(parseCataloguePaging({})).toEqual({ page: 1, perPage: 10 });
    expect(DEFAULT_PER_PAGE).toBe(10);
  });

  it('reads the page and an offered page size', () => {
    expect(parseCataloguePaging({ page: '3', per: '20' })).toEqual({ page: 3, perPage: 20 });
    expect(parseCataloguePaging({ page: ['2', '9'], per: '50' })).toEqual({ page: 2, perPage: 50 });
  });

  it('falls back for anything it does not offer or cannot read', () => {
    for (const per of ['7', '0', '-10', 'all', '10.5', '']) {
      expect(parseCataloguePaging({ per }).perPage, per).toBe(10);
    }
    for (const page of ['0', '-1', '1.5', 'abc', '', '1e400']) {
      expect(parseCataloguePaging({ page }).page, page).toBe(1);
    }
  });
});

describe('catalogueSearch', () => {
  it('leaves out the defaults', () => {
    expect(catalogueSearch(defaultCatalogueQuery, { page: 1, perPage: 10 })).toBe('');
  });

  it('adds the page and the page size after the filters', () => {
    const query = { ...defaultCatalogueQuery, category: 'laptop' as const };
    expect(catalogueSearch(query, { page: 2, perPage: 10 })).toBe('?category=laptop&page=2');
    expect(catalogueSearch(defaultCatalogueQuery, { page: 1, perPage: 20 })).toBe('?per=20');
  });

  it('round-trips through the parser', () => {
    const paging = { page: 3, perPage: 20 };
    const params = Object.fromEntries(
      new URLSearchParams(catalogueSearch(defaultCatalogueQuery, paging))
    );
    expect(parseCataloguePaging(params)).toEqual(paging);
  });
});

describe('pageOf', () => {
  it('cuts 30 items into three pages of 10', () => {
    expect(pageOf(thirty, { page: 1, perPage: 10 })).toMatchObject({
      items: thirty.slice(0, 10),
      page: 1,
      pageCount: 3,
      total: 30,
      from: 1,
      to: 10,
    });
    expect(pageOf(thirty, { page: 3, perPage: 10 })).toMatchObject({ from: 21, to: 30 });
  });

  it('has a shorter last page', () => {
    expect(pageOf(thirty, { page: 2, perPage: 20 })).toMatchObject({
      items: thirty.slice(20),
      pageCount: 2,
      from: 21,
      to: 30,
    });
  });

  it('shows everything on one page when the page size is big enough', () => {
    expect(pageOf(thirty, { page: 1, perPage: 50 })).toMatchObject({ pageCount: 1, to: 30 });
  });

  it('shows the last page for a page past the end, e.g. after a filter shrank the list', () => {
    expect(pageOf(thirty, { page: 9, perPage: 10 })).toMatchObject({ page: 3, from: 21 });
  });

  it('is page 1 of 1, showing nothing, when nothing matches', () => {
    expect(pageOf([], { page: 2, perPage: 10 })).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
      from: 0,
      to: 0,
    });
  });
});

describe('pageLinks', () => {
  it('lists every page when there are few', () => {
    expect(pageLinks(1, 3)).toEqual([1, 2, 3]);
    expect(pageLinks(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('leaves gaps far from the current page', () => {
    expect(pageLinks(6, 12)).toEqual([1, 'gap', 4, 5, 6, 7, 8, 'gap', 12]);
    expect(pageLinks(1, 12)).toEqual([1, 2, 3, 'gap', 12]);
    expect(pageLinks(12, 12)).toEqual([1, 'gap', 10, 11, 12]);
    // Near the start the numbers run on from 1 without a gap.
    expect(pageLinks(3, 12)).toEqual([1, 2, 3, 4, 5, 'gap', 12]);
  });
});
