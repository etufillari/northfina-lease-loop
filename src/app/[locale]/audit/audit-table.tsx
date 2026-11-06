'use client';
// The audit table with a details dock: each row's "View details" opens a small card in a
// panel docked to the bottom of the screen. Several cards sit side by side, newest on the
// right, so entries can be compared; a spacer as tall as the dock keeps every row's button
// reachable above it. The page passes the rows with their detail lines already worked out.
import { useEffect, useRef, useState } from 'react';
import type { AuditDetailLine } from '@/domain/audit';
import { cx } from '@/components/ui';

export type AuditTableRow = {
  id: number;
  createdAt: string;
  when: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  lines: AuditDetailLine[];
};

export type AuditTableLabels = {
  caption: string;
  when: string;
  who: string;
  action: string;
  target: string;
  details: string;
  none: string;
  view: string;
  hide: string;
  /** "Entry #{id}" with `{id}` left in, filled here. */
  entry: string;
  /** "Close entry #{id}" with `{id}` left in. */
  close: string;
  closeAll: string;
  /** "Open entries ({count})" with `{count}` left in. */
  dock: string;
  fields: string;
};

function fill(template: string, key: string, value: number): string {
  return template.replace(`{${key}}`, String(value));
}

export function AuditTable({ rows, labels }: { rows: AuditTableRow[]; labels: AuditTableLabels }) {
  const [openIds, setOpenIds] = useState<number[]>([]);
  const [dockHeight, setDockHeight] = useState(0);
  const dockRef = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const lastOpened = useRef<number | null>(null);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const openRows = openIds.flatMap((id) => byId.get(id) ?? []);
  const hasOpen = openRows.length > 0;

  function toggle(id: number) {
    setOpenIds((ids) => {
      if (ids.includes(id)) return ids.filter((other) => other !== id);
      lastOpened.current = id;
      return [...ids, id];
    });
  }

  // Keep the spacer as tall as the dock, whatever its cards hold.
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) {
      setDockHeight(0);
      return;
    }
    const observer = new ResizeObserver(() => setDockHeight(dock.offsetHeight));
    observer.observe(dock);
    return () => observer.disconnect();
  }, [hasOpen]);

  // Bring a newly opened card into view in the dock's strip.
  useEffect(() => {
    const id = lastOpened.current;
    if (id === null) return;
    lastOpened.current = null;
    const card = strip.current?.querySelector<HTMLElement>(`[data-entry="${id}"]`);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'end',
    });
  }, [openIds]);

  const headers = [labels.when, labels.who, labels.action, labels.target, labels.details];

  return (
    <>
      <div className="relative overflow-x-auto" tabIndex={0} aria-labelledby="audit-caption">
        <table className="w-full text-left text-sm">
          <caption id="audit-caption" className="px-5 pt-4 pb-2 text-left text-ink-muted">
            {labels.caption}
          </caption>
          <thead className="border-b border-line">
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col" className="px-5 py-3 font-semibold whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const open = openIds.includes(row.id);
              return (
                <tr
                  key={row.id}
                  className={cx('align-middle transition-colors', open && 'bg-brand-soft')}
                >
                  <td className="px-5 py-3 whitespace-nowrap tabular-nums">
                    <time dateTime={row.createdAt}>{row.when}</time>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.actor}</td>
                  <td className="px-5 py-3 font-mono text-xs">{row.action}</td>
                  <td className="px-5 py-3">
                    {row.entityType}{' '}
                    <span className="font-mono text-xs break-all">{row.entityId}</span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {row.lines.length === 0 ? (
                      <span className="text-ink-muted">{labels.none}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggle(row.id)}
                        aria-pressed={open}
                        aria-controls={open ? `audit-entry-${row.id}` : undefined}
                        className={cx(
                          'inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 px-3 text-xs font-bold transition-colors',
                          open
                            ? 'border-brand bg-brand text-brand-contrast hover:bg-brand-hover'
                            : 'border-brand text-brand-text hover:bg-brand-soft'
                        )}
                      >
                        {open ? labels.hide : labels.view}
                        <span className="font-normal opacity-80">· {row.lines.length}</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Room under the table for the dock, so the last rows' buttons stay above it. */}
      <div aria-hidden="true" style={{ height: dockHeight }} />

      {openRows.length > 0 ? (
        <aside
          ref={dockRef}
          aria-label={fill(labels.dock, 'count', openRows.length)}
          className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-brand bg-surface shadow-[0_-8px_24px_rgb(0_0_0/0.12)]"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-2.5 sm:px-6">
            <p className="text-sm font-bold">{fill(labels.dock, 'count', openRows.length)}</p>
            <button
              type="button"
              onClick={() => setOpenIds([])}
              className="rounded-full px-3 py-1 text-sm font-semibold text-brand-text underline-offset-4 hover:bg-brand-soft hover:underline"
            >
              {labels.closeAll}
            </button>
          </div>
          <div
            ref={strip}
            className="mx-auto flex max-w-6xl snap-x gap-3 overflow-x-auto px-4 pt-2 pb-4 sm:px-6"
          >
            {openRows.map((row) => (
              <EntryCard key={row.id} row={row} labels={labels} onClose={() => toggle(row.id)} />
            ))}
          </div>
        </aside>
      ) : null}
    </>
  );
}

function EntryCard({
  row,
  labels,
  onClose,
}: {
  row: AuditTableRow;
  labels: AuditTableLabels;
  onClose: () => void;
}) {
  return (
    <section
      id={`audit-entry-${row.id}`}
      data-entry={row.id}
      aria-labelledby={`audit-entry-${row.id}-title`}
      className="audit-card flex h-[34vh] w-[min(20rem,85vw)] shrink-0 snap-end flex-col rounded-lg border border-line bg-raised shadow-sm"
    >
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <p className="text-xs text-ink-muted">{fill(labels.entry, 'id', row.id)}</p>
          <h2 id={`audit-entry-${row.id}-title`} className="font-mono text-sm font-bold break-all">
            {row.action}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={fill(labels.close, 'id', row.id)}
          className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-brand-soft hover:text-ink"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div className="overflow-y-auto px-4 py-2.5 text-sm">
        <h3 className="mb-0.5 text-sm font-bold">{labels.fields}</h3>
        <dl className="divide-y divide-line">
          {row.lines.map((line, index) => (
            <div key={index} className="py-1.5">
              <dt className="font-mono text-xs text-ink-muted">{line.path}</dt>
              <dd className="font-mono text-[0.8125rem] break-all">{line.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
