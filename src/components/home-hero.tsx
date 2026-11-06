// The first screen: the headline, one sentence on what Lease Loop is, whose kinds of item
// (e-bike, laptop, farm machine) link straight to that category of the catalogue, and the two
// ways in. Only promises the app keeps: no shops, no delivery, no PDFs.
import Link from 'next/link';
import type { AssetCategory } from '@/data/schemas';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { HashLink, LinkButton, buttonClasses } from './ui';

/** A character no translation contains, used to find where the green word and the links go. */
const MARK = '\u0000';
const CATEGORIES: AssetCategory[] = ['e_bike', 'laptop', 'farm_machine'];

export function HomeHero({ locale, t }: { locale: Locale; t: Translate }) {
  // "A {accent} way to own things." / "{accent} tapa omistaa.": the word order is the
  // translation's, so the title is one message and the green word is cut out of it.
  const [before = '', after = ''] = t('home.title', { accent: MARK }).split(MARK);
  // The intro the same way: each {e_bike}-style placeholder becomes MARK + its name + MARK,
  // so after the split the odd pieces are category names and the even ones plain text.
  const intro = t(
    'home.intro',
    Object.fromEntries(CATEGORIES.map((c) => [c, `${MARK}${c}${MARK}`]))
  ).split(MARK);

  return (
    <section
      aria-labelledby="hero-title"
      className="mx-auto max-w-6xl px-4 pt-16 pb-24 text-center sm:px-6 lg:pt-24 lg:pb-32"
    >
      <h1
        id="hero-title"
        className="mx-auto max-w-5xl text-6xl leading-[1.02] text-balance sm:text-7xl lg:text-8xl"
      >
        {before}
        <span className="text-brand-text">{t('home.titleAccent')}</span>
        {after}
      </h1>
      <p className="mx-auto mt-8 max-w-3xl text-xl text-balance text-ink-muted sm:text-2xl">
        {intro.map((piece, index) => {
          const category = CATEGORIES.find((c) => c === piece);
          return index % 2 === 1 && category ? (
            <Link
              key={index}
              href={`/${locale}/catalogue?category=${category}`}
              className="font-bold text-brand-text underline decoration-accent decoration-[3px] underline-offset-[6px] hover:decoration-brand"
            >
              {t(`home.intro.${category}`)}
            </Link>
          ) : (
            piece
          );
        })}
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <LinkButton href={`/${locale}/catalogue`} size="lg">
          {t('home.cta.catalogue')} <span aria-hidden="true">→</span>
        </LinkButton>
        <HashLink href={`/${locale}#how-it-works`} className={buttonClasses('secondary', 'lg')}>
          {t('home.cta.how')}
        </HashLink>
      </div>
    </section>
  );
}
