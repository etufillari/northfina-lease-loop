// Marks a back-office page (the demo tools, the audit log) in the staff strip's teal, so a
// viewer always knows they are looking behind the scenes, not at what a customer sees.
export function StaffNote({ children }: { children: string }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full bg-staff px-3 py-1 text-sm font-semibold text-staff-contrast">
      <span aria-hidden="true" className="size-2 rounded-full bg-staff-contrast/70" />
      {children}
    </p>
  );
}
