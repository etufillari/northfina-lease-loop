import { isDateOnly } from '@/domain/lease-engine/calendar';

export function latestLifecycleDate(
  currentDate: string,
  ...milestones: (string | null | undefined)[]
): string {
  const dates = [
    currentDate,
    ...milestones.filter((date): date is string => date !== null && date !== undefined),
  ];
  if (dates.some((date) => !isDateOnly(date))) throw new RangeError('Invalid lifecycle date');
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}
