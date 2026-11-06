// The catalogue banner: the app name and one line, over the e-bike photo. The photo's own studio
// backdrop is close to the stage colour, so a fade from the left blends it into the panel and the
// text sits on solid ground. A server component.
import Image from 'next/image';
import type { Translate } from '@/i18n/get-t';

export function CatalogueHero({ t }: { t: Translate }) {
  return (
    <section
      aria-labelledby="catalogue-title"
      className="relative isolate flex min-h-64 items-center overflow-hidden rounded-xl bg-[#1b1e26] text-stage-fg sm:min-h-80"
    >
      <div aria-hidden="true" className="absolute inset-y-0 right-0 -z-10 w-full sm:w-[62%]">
        <Image
          src="/images/e-bike.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1b1e26] via-[#1b1e26]/40 via-25% to-transparent to-50%" />
      </div>
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[#1b1e26]/60 sm:hidden" />
      <div className="flex flex-col gap-3 px-6 py-10 sm:px-12">
        <h1
          id="catalogue-title"
          className="font-display text-4xl leading-none font-extrabold tracking-tight sm:text-6xl"
        >
          {t('brand.name')}
        </h1>
        <p className="max-w-md text-base text-stage-muted sm:text-lg">
          {t('catalogue.heroSubtitle')}
        </p>
      </div>
    </section>
  );
}
