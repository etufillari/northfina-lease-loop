/** A rounded bar in the action colour. The caller's visible text carries the actual numbers. */
export function ProgressBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className="h-2 w-full overflow-hidden rounded-pill bg-hairline"
    >
      {percent > 0 ? (
        <div className="h-full min-w-2 rounded-pill bg-primary" style={{ width: `${percent}%` }} />
      ) : null}
    </div>
  );
}
