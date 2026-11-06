// The footer on every page. The contact details are placeholders for this demo.
import Link from 'next/link';
import { assetCategorySchema } from '@/data/schemas';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

const contactEmail = 'service@example.com';
const contactPhone = '+358 00 000 0000';

const linkClasses =
  'underline-offset-4 hover:text-white hover:underline focus-visible:outline-brand-300';

export function SiteFooter({ locale, t }: { locale: Locale; t: Translate }) {
  return (
    <footer className="mt-10 bg-ink-900 text-sm text-ink-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <div>
          <p className="text-lg font-semibold tracking-tight text-white">{t('brand.name')}</p>
          <p className="mt-2 max-w-xs leading-[1.4]">{t('brand.tagline')}</p>
        </div>

        <nav aria-labelledby="footer-browse">
          <h2 id="footer-browse" className="font-semibold text-white">
            {t('footer.browse')}
          </h2>
          <ul className="mt-3 space-y-2">
            {assetCategorySchema.options.map((category) => (
              <li key={category}>
                <Link href={`/${locale}/catalogue/${category}`} className={linkClasses}>
                  {t(`category.${category}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="font-semibold text-white">{t('footer.customerService')}</h2>
          <ul className="mt-3 space-y-2">
            <li>
              <a href={`mailto:${contactEmail}`} className={`${linkClasses} break-words`}>
                {contactEmail}
              </a>
            </li>
            <li>
              <a href={`tel:${contactPhone.replaceAll(' ', '')}`} className={linkClasses}>
                {contactPhone}
              </a>
            </li>
            <li>{t('footer.hours')}</li>
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="border-t-2 border-ink-500 py-4">{t('footer.copyright')}</p>
      </div>
    </footer>
  );
}
