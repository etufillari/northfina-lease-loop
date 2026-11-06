'use client';

// Shows this person's notifications as short pop-ups that go away by themselves. The browser
// keeps the connection open and reconnects by itself. Anything sent while offline is missed.
import { useEffect } from 'react';
import { toast, Toaster } from 'sonner';

import type { AppNotification } from '@/domain/notifications';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

const SHOWN_FOR_MS = 6_000;

export function NotificationToasts({ locale }: { locale: Locale }) {
  useEffect(() => {
    const t = getT(locale);
    const source = new EventSource('/api/notifications/stream');

    source.onmessage = (event: MessageEvent<string>) => {
      const { kind, item } = JSON.parse(event.data) as AppNotification;
      toast(t(`notification.${kind}`, { item }));
    };

    return () => source.close();
  }, [locale]);

  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      duration={SHOWN_FOR_MS}
      visibleToasts={3}
      closeButton
    />
  );
}
