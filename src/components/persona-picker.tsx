'use client';
// The demo's "login": pick who you are. No passwords — the data-pack customers plus anyone
// added via "+ New customer". The choice lives in a cookie and becomes the customerId and
// audit actor behind every action.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

import { PERSONA_COOKIE } from './persona-cookie';

type CustomerOption = { id: string; name: string; type: string };

// Outside the component on purpose: writing document.cookie inside one trips the
// react-hooks immutability rule.
function setPersonaCookie(id: string) {
  document.cookie = `${PERSONA_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=86400`;
}

export function PersonaPicker({ locale, initialId }: { locale: Locale; initialId: string | null }) {
  const t = getT(locale);
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selected, setSelected] = useState<string>(initialId ?? '');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/customers')
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled && body.success) setCustomers(body.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function choose(id: string) {
    setSelected(id);
    setPersonaCookie(id);
    router.refresh();
  }

  async function addCustomer() {
    const name = window.prompt(t('persona.newName'));
    if (!name) return;
    const email = window.prompt(t('persona.newEmail')) ?? '';
    const response = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, actor: name }),
    });
    const body = await response.json();
    if (body.success) {
      setCustomers((list) => [...list, body.data]);
      choose(body.data.id);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-stone-600 dark:text-stone-400">{t('persona.label')}</span>
        <select
          value={selected}
          onChange={(event) =>
            event.target.value === '__new__' ? addCustomer() : choose(event.target.value)
          }
          className="max-w-44 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
        >
          <option value="" disabled>
            {t('persona.none')}
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
          <option value="__new__">{t('persona.new')}</option>
        </select>
      </label>
      {selected ? (
        <Link
          href={`/${locale}/me`}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {t('persona.myPage')}
        </Link>
      ) : null}
    </div>
  );
}
