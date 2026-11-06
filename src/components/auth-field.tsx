type AuthFieldProps = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete: string;
  defaultValue?: string;
  minLength?: number;
  maxLength?: number;
};

export function AuthField({ label, ...input }: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={input.name} className="mb-2 block text-caption font-semibold">
        {label}
      </label>
      <input
        {...input}
        id={input.name}
        required
        className="min-h-target w-full rounded-sm border border-hairline bg-canvas px-4 py-3 text-body text-ink"
      />
    </div>
  );
}

export const authButtonClass =
  'pressable inline-flex min-h-target items-center justify-center rounded-pill bg-primary px-6 py-3 text-body text-on-dark disabled:cursor-wait disabled:opacity-60';
