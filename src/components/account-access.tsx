'use client';

import Link from 'next/link';
import { useRef } from 'react';

type AccountAccessProps = {
  locale: string;
  devMode: boolean;
  labels: {
    account: string;
    login: string;
    loginTitle: string;
    loginMessage: string;
    close: string;
  };
};

export function AccountAccess({ locale, devMode, labels }: AccountAccessProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonClass =
    'h-10 w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800';

  if (devMode) {
    return (
      <Link
        href={`/${locale}/account`}
        className={`${buttonClass} inline-flex items-center justify-center`}
      >
        {labels.account}
      </Link>
    );
  }

  return (
    <>
      <button type="button" className={buttonClass} onClick={() => dialogRef.current?.showModal()}>
        {labels.login}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="login-placeholder-title"
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-stone-200 bg-white p-6 text-stone-900 shadow-xl backdrop:bg-stone-950/50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
      >
        <h2 id="login-placeholder-title" className="text-xl font-semibold">
          {labels.loginTitle}
        </h2>
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-300">{labels.loginMessage}</p>
        <form method="dialog" className="mt-6 flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            {labels.close}
          </button>
        </form>
      </dialog>
    </>
  );
}
