// A message box: info, success, warning or error. Pass `live` when it appears after an
// action, so a screen reader announces it (error → alert, the others → status).
import type { ReactNode } from 'react';
import { cx } from './cx';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

const tones: Record<NoticeTone, string> = {
  info: 'border-info-line bg-info-soft text-info-ink',
  success: 'border-success-line bg-success-soft text-success-ink',
  warning: 'border-warning-line bg-warning-soft text-warning-ink',
  error: 'border-danger-line bg-danger-soft text-danger-ink',
};

type NoticeProps = {
  tone?: NoticeTone;
  title?: ReactNode;
  live?: boolean;
  className?: string;
  children?: ReactNode;
};

export function Notice({ tone = 'info', title, live = false, className, children }: NoticeProps) {
  const role = live ? (tone === 'error' ? 'alert' : 'status') : undefined;
  return (
    <div role={role} className={cx('rounded-lg border-2 p-4', tones[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-1' : undefined}>{children}</div> : null}
    </div>
  );
}
