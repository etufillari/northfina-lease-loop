/** Integration input: signed net rent, never a fresh catalogue price. */
export type LeaseTerms = Readonly<{
  contractId: string;
  assetId: string;
  customerId: string;
  startDate: string;
  termMonths: 12 | 24 | 36 | 48;
  monthlyNetCents: number;
  paymentDueDays: number;
}>;

export type BillingPeriod = Readonly<{
  index: number;
  startDate: string;
  endDateExclusive: string;
  issueDate: string;
  dueDate: string;
  netCents: number;
}>;

export type EngineError =
  | 'invalid_terms'
  | 'invalid_date'
  | 'invalid_period'
  | 'tax_rule_missing'
  | 'tax_rule_overlap'
  | 'invalid_tax_rule'
  | 'amount_overflow'
  | 'invalid_transition'
  | 'before_end_date';

export type EngineResult<T> = { ok: true; value: T } | { ok: false; reason: EngineError };

export type LeaseStatus = 'ACTIVE' | 'COMPLETED' | 'TERMINATED';
