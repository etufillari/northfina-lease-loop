// The catalogue's left panel: categories with their item counts, then the condition and
// availability filters. Every choice is a plain link to the filtered catalogue URL, so it works
// without JavaScript. A server component.
import Link from 'next/link';
import {
  BROWSE_CATEGORIES,
  type BrowseCategory,
  type CatalogueFilter,
  catalogueQuery,
} from '@/domain/catalogue-filter';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { CategoryIcon } from './ui/category-icon';

type CatalogueSidebarProps = {
  filter: CatalogueFilter;
  counts: Record<BrowseCategory, number>;
  total: number;
  locale: Locale;
  t: Translate;
};

export function CatalogueSidebar({ filter, counts, total, locale, t }: CatalogueSidebarProps) {
  const href = (change: Partial<CatalogueFilter>) =>
    `/${locale}${catalogueQuery({ ...filter, ...change })}`;
  const filtered = filter.category !== null || filter.condition !== null || filter.availableOnly;

  return (
    <nav
      aria-label={t('catalogue.filters')}
      className="flex flex-col gap-6 rounded-xl bg-stage p-3 text-sm text-stage-muted lg:sticky lg:top-24"
    >
      <ul className="flex flex-col gap-0.5">
        <li>
          <Item
            href={href({ category: null })}
            current={filter.category === null}
            icon="all"
            label={t('catalogue.allItems')}
            count={formatNumber(total, locale)}
          />
        </li>
      </ul>

      <Group title={t('catalogue.categories')}>
        {BROWSE_CATEGORIES.map((category) => (
          <li key={category}>
            <Item
              href={href({ category })}
              current={filter.category === category}
              icon={category}
              label={t(`category.${category}`)}
              count={formatNumber(counts[category], locale)}
              empty={counts[category] === 0}
            />
          </li>
        ))}
      </Group>

      <Group title={t('catalogue.filterCondition')}>
        <li className="flex flex-wrap gap-1.5 px-2">
          <Chip href={href({ condition: null })} on={filter.condition === null}>
            {t('catalogue.conditionAny')}
          </Chip>
          <Chip href={href({ condition: 'new' })} on={filter.condition === 'new'}>
            {t('catalogue.conditionNew')}
          </Chip>
          <Chip href={href({ condition: 'second_life' })} on={filter.condition === 'second_life'}>
            {t('catalogue.conditionSecondLife')}
          </Chip>
        </li>
      </Group>

      <Group title={t('catalogue.filterAvailability')}>
        <li className="flex flex-wrap gap-1.5 px-2">
          <Chip href={href({ availableOnly: !filter.availableOnly })} on={filter.availableOnly}>
            {t('catalogue.availableOnly')}
          </Chip>
        </li>
      </Group>

      {filtered ? (
        <Link
          href={`/${locale}`}
          className="mx-2 self-start text-xs font-semibold text-stage-accent underline-offset-4 hover:underline"
        >
          {t('catalogue.clearFilters')}
        </Link>
      ) : null}
    </nav>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="px-2 text-xs font-medium tracking-wide text-stage-muted/70">{title}</h2>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function Item({
  href,
  current,
  icon,
  label,
  count,
  empty = false,
}: {
  href: string;
  current: boolean;
  icon: BrowseCategory | 'all';
  label: string;
  count: string;
  empty?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5 hover:text-stage-fg ${
        current ? 'bg-white/10 font-semibold text-stage-fg' : ''
      } ${empty && !current ? 'text-stage-muted/60' : ''}`}
    >
      <CategoryIcon category={icon} className={`size-4 ${current ? 'text-stage-accent' : ''}`} />
      <span className="flex-1">{label}</span>
      <span className="text-xs tabular-nums opacity-70">{count}</span>
    </Link>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? 'true' : undefined}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        on
          ? 'border-stage-accent bg-stage-accent text-[#1a0d08]'
          : 'border-white/15 hover:border-white/40 hover:text-stage-fg'
      }`}
    >
      {children}
    </Link>
  );
}
