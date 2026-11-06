'use client';

import { useState } from 'react';
import { CustomerBuyoutRequest } from './customer-buyout-request';
import { CustomerReturnRequest } from './customer-return-request';
import type { Locale } from '@/i18n/locales';

type Action = 'buyout' | 'return';

type Props = {
  token: string;
  locale: Locale;
  buyoutNetCents: number;
  initialAction: Action | null;
};

export function CustomerEndOfTermActions({ token, locale, buyoutNetCents, initialAction }: Props) {
  const [action, setAction] = useState<Action | null>(initialAction);

  if (action === 'buyout') {
    return (
      <CustomerBuyoutRequest
        token={token}
        locale={locale}
        buyoutNetCents={buyoutNetCents}
        onSubmitted={() => setAction('buyout')}
        initialSubmitted
      />
    );
  }

  if (action === 'return') {
    return (
      <CustomerReturnRequest
        token={token}
        locale={locale}
        onSubmitted={() => setAction('return')}
        initialSubmitted
      />
    );
  }

  return (
    <>
      <CustomerBuyoutRequest
        token={token}
        locale={locale}
        buyoutNetCents={buyoutNetCents}
        onSubmitted={() => setAction('buyout')}
      />
      <CustomerReturnRequest
        token={token}
        locale={locale}
        onSubmitted={() => setAction('return')}
      />
    </>
  );
}
