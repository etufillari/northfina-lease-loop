'use client';

// Add a signatory, or revoke one: POST /api/customers/:id/signatories(/:signatoryId/revoke),
// then re-render (D46). A refusal is written from the code the server sends.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Notice, inputClasses } from '@/components/ui';

type Failure = { error?: { code?: string } };

/** Error code → sentence; `error` for anything else. */
export type SignatoryFormLabels = Record<string, string> & { error: string };

function failureText(body: Failure, labels: SignatoryFormLabels): string {
  const code = body.error?.code;
  return (code && labels[code]) || labels.error;
}

async function post(url: string, body?: unknown): Promise<Failure | null> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.ok ? null : ((await response.json().catch(() => ({}))) as Failure);
}

export function RevokeButton(props: {
  customerId: string;
  signatoryId: string;
  label: string;
  labels: SignatoryFormLabels;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function revoke() {
    setPending(true);
    setFailed(null);
    try {
      const failure = await post(
        `/api/customers/${props.customerId}/signatories/${props.signatoryId}/revoke`
      );
      if (failure) setFailed(failureText(failure, props.labels));
      else router.refresh();
    } catch {
      setFailed(props.labels.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="danger" size="sm" onClick={revoke} pending={pending}>
        {props.label}
      </Button>
      {failed ? (
        <Notice tone="error" live>
          {failed}
        </Notice>
      ) : null}
    </div>
  );
}

type AddFields = { name: string; email: string; validFrom: string; validTo: string; add: string };

export function AddSignatoryForm(props: {
  customerId: string;
  today: string;
  fields: AddFields;
  labels: SignatoryFormLabels;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [validFrom, setValidFrom] = useState(props.today);
  const [validTo, setValidTo] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setFailed(null);
    try {
      const failure = await post(`/api/customers/${props.customerId}/signatories`, {
        name,
        email,
        validFrom,
        validTo: validTo === '' ? null : validTo,
      });
      if (failure) {
        setFailed(failureText(failure, props.labels));
      } else {
        setName('');
        setEmail('');
        setValidTo('');
        router.refresh();
      }
    } catch {
      setFailed(props.labels.error);
    } finally {
      setPending(false);
    }
  }

  const input = (
    id: string,
    label: string,
    value: string,
    set: (value: string) => void,
    type = 'text'
  ) => (
    <Field id={id} label={label}>
      {(control) => (
        <input
          {...control}
          type={type}
          value={value}
          onChange={(e) => set(e.target.value)}
          className={inputClasses}
        />
      )}
    </Field>
  );

  return (
    <form onSubmit={add} noValidate className="space-y-4">
      {input('signatory-name', props.fields.name, name, setName)}
      {input('signatory-email', props.fields.email, email, setEmail, 'email')}
      <div className="grid gap-4 sm:grid-cols-2">
        {input('signatory-from', props.fields.validFrom, validFrom, setValidFrom, 'date')}
        {input('signatory-to', props.fields.validTo, validTo, setValidTo, 'date')}
      </div>
      {failed ? (
        <Notice tone="error" live>
          {failed}
        </Notice>
      ) : null}
      <Button type="submit" pending={pending} disabled={name.trim() === '' || email.trim() === ''}>
        {props.fields.add}
      </Button>
    </form>
  );
}
