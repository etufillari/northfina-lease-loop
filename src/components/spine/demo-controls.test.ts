import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getT } from '@/i18n/get-t';
import { locales } from '@/i18n/locales';
import { DemoControls } from './demo-controls';
import { selectionSchema } from './draft';

describe('explicit demo roles', () => {
  it('restores the selected role without discarding the previous customer or older selections', () => {
    const prior = { customerId: 'cust-lena', businessDate: '2026-11-06' };
    expect(selectionSchema.parse(prior)).toEqual(prior);
    expect(
      selectionSchema.parse(JSON.parse(JSON.stringify({ ...prior, role: 'operator' })))
    ).toEqual({ ...prior, role: 'operator' });
    expect(selectionSchema.safeParse({ ...prior, role: 'admin' }).success).toBe(false);
  });

  it.each(locales)(
    'shows distinct labelled roles and no customer selector for the dealer in %s',
    (locale) => {
      const t = getT(locale);
      const props = {
        locale,
        busy: false,
        onChange: () => {},
        customers: [{ id: 'cust-lena', name: 'Demo customer' }],
      };
      const selection = { customerId: 'cust-lena', businessDate: '2026-11-06' };
      const customer = renderToStaticMarkup(createElement(DemoControls, { ...props, selection }));
      const dealer = renderToStaticMarkup(
        createElement(DemoControls, {
          ...props,
          selection: { ...selection, role: 'operator' },
        })
      );
      expect(customer).toContain('id="demo-customer"');
      expect(customer).toContain('value="customer" selected=""');
      expect(dealer).not.toContain('id="demo-customer"');
      expect(dealer).toContain('value="operator" selected=""');
      expect(dealer).toContain(t('spine.dealerMode'));
      expect(dealer).toContain(t('spine.dealerHelp'));
      expect(dealer).toContain('id="demo-date"');
    }
  );
});
