import type { AssetStatus } from '@/data/schemas';
import type { Translate } from '@/i18n/get-t';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

const statusVariants: Record<AssetStatus, BadgeVariant> = {
  available: 'success',
  reserved: 'warning',
  leased: 'neutral',
  returned: 'info',
  sold: 'neutral',
};

type AssetStatusBadgeProps = {
  status: AssetStatus;
  heldForYou?: boolean;
  t: Translate;
};

export function AssetStatusBadge({ status, heldForYou = false, t }: AssetStatusBadgeProps) {
  if (heldForYou) {
    return (
      <Badge variant="info" dot>
        <span className="sr-only">{t('status.label')}: </span>
        {t('status.reservedForYou')}
      </Badge>
    );
  }

  return (
    <Badge variant={statusVariants[status]} dot>
      <span className="sr-only">{t('status.label')}: </span>
      {t(`status.${status}`)}
    </Badge>
  );
}
