import type { Translate } from '@/i18n/get-t';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

type ApplicationDecision = 'approved' | 'rejected' | 'manual_review';

const statusVariants: Record<ApplicationDecision, BadgeVariant> = {
  approved: 'success',
  rejected: 'warning',
  manual_review: 'info',
};

type ApplicationStatusBadgeProps = {
  status: ApplicationDecision;
  t: Translate;
};

export function ApplicationStatusBadge({ status, t }: ApplicationStatusBadgeProps) {
  return (
    <Badge variant={statusVariants[status]} dot>
      <span className="sr-only">{t('status.label')}: </span>
      {t(`account.applications.status.${status === 'manual_review' ? 'manualReview' : status}`)}
    </Badge>
  );
}
