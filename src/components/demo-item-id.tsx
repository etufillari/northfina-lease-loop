// Demo mode only: the data-pack ID of an item (e.g. ebike-003), so a presenter running a
// scenario card can find the item it names. Hidden from customers outside demo mode.
export function DemoItemId({ id, label }: { id: string; label: string }) {
  return (
    <span
      title={label}
      className="inline-flex items-center rounded-sm bg-nav px-1.5 py-0.5 font-mono text-fine text-on-dark"
    >
      <span className="sr-only">{label}: </span>
      {id}
    </span>
  );
}
