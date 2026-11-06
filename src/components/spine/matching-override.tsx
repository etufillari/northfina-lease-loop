import { useState } from 'react';
import type {
  MatchingPreview,
  MatchingPreviewInput,
  MatchingSelection,
} from '@/data/second-life-schemas';
import type { MatchCandidate } from '@/domain/second-life-matching';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { buttonClass, Field, inputClass, messageFor } from './ui';

export function MatchingOverride({
  preview,
  input,
  locale,
  disabled,
  readyToday,
  onClear,
  onSelect,
}: {
  preview: MatchingPreview;
  input: MatchingPreviewInput;
  locale: Locale;
  disabled: boolean;
  readyToday: boolean;
  onClear: () => void;
  onSelect: (selection: MatchingSelection, candidate: MatchCandidate) => void;
}) {
  const t = getT(locale);
  const [choice, setChoice] = useState('');
  const [reason, setReason] = useState('');
  const alternatives = preview.candidates.filter(
    (row) =>
      row.customerId &&
      row.reasons.length === 0 &&
      (row.requestId !== preview.recommendation?.requestId ||
        row.condition !== preview.recommendation?.condition)
  );
  const candidate = alternatives.find((_, index) => String(index) === choice);
  if (alternatives.length === 0) return null;
  return (
    <fieldset disabled={disabled} className="mt-4 space-y-3 rounded-lg border p-4">
      <legend className="px-2 font-semibold">{t('match.overrideTitle')}</legend>
      <p className="text-sm">{t('match.overrideHelp')}</p>
      <Field id="match-alternative" label={t('match.alternative')}>
        <select
          id="match-alternative"
          className={inputClass}
          value={choice}
          onChange={(event) => {
            setChoice(event.target.value);
            setReason('');
            onClear();
          }}
        >
          <option value="">{t('match.chooseAlternative')}</option>
          {alternatives.map((row, index) => (
            <option key={row.requestId + ':' + row.condition} value={String(index)}>
              {t('match.alternativeOption', {
                customer: row.customerName ?? row.requestId,
                request: row.requestId,
                condition: messageFor(locale, 'condition.' + row.condition),
                term: row.termMonths,
                rent: formatEuro(row.monthlyNetCents!, intlLocale[locale]),
                cost: formatEuro(row.workNetCents!, intlLocale[locale]),
              })}
            </option>
          ))}
        </select>
      </Field>
      {candidate ? (
        <>
          <p className="text-sm">
            {t(candidate.imported ? 'match.importedLink' : 'wait.autoLinked')}
          </p>
          <Field id="match-override-reason" label={t('match.overrideReason')}>
            <textarea
              id="match-override-reason"
              className={inputClass}
              minLength={10}
              maxLength={500}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                onClear();
              }}
            />
          </Field>
          <p className="text-sm">{t('match.readinessHelp')}</p>
          <button
            type="button"
            className={buttonClass}
            disabled={!readyToday || reason.trim().length < 10}
            onClick={() => {
              if (candidate.customerId)
                onSelect(
                  {
                    ...input,
                    waitingRequestId: candidate.requestId,
                    waitingRevision: candidate.waitingRevision ?? undefined,
                    nextCustomerId: candidate.customerId,
                    overrideReason: reason.trim(),
                  },
                  candidate
                );
            }}
          >
            {t('match.useAlternative')}
          </button>
        </>
      ) : null}
    </fieldset>
  );
}
