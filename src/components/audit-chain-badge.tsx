// The audit chain's state above the audit table (docs/features/audit-chain.md): intact with
// the entry count and the head hash, whether the signatures were checked (with the public key
// that checks them) and how far the anchors outside the database reach; or the first broken
// entry and why. A server component; the page passes the verification and the translator.
import type { AuditVerification } from '@/server/audit';
import type { Translate } from '@/i18n/get-t';
import { Badge, Card } from './ui';

type AuditChainBadgeProps = {
  verdict: AuditVerification;
  t: Translate;
};

/** `ab12…ef`: enough of a hash to recognise it at a glance. */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 4)}…${hash.slice(-2)}`;
}

export function AuditChainBadge({ verdict, t }: AuditChainBadgeProps) {
  return (
    <Card className="mb-6">
      <div className="space-y-3 text-sm">
        {verdict.ok ? (
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">
              {t('audit.chain.intact', {
                count: verdict.length,
                head: shortHash(verdict.headHash),
              })}
            </Badge>
            <Badge tone={verdict.signaturesChecked ? 'success' : 'warning'}>
              {t(verdict.signaturesChecked ? 'audit.chain.signed' : 'audit.chain.unsigned')}
            </Badge>
            <Badge tone={verdict.anchoredLength === verdict.length ? 'success' : 'warning'}>
              {verdict.anchoredLength === verdict.length
                ? t('audit.chain.anchored', { count: verdict.length })
                : t('audit.chain.anchorLag', {
                    anchored: verdict.anchoredLength,
                    count: verdict.length,
                  })}
            </Badge>
          </div>
        ) : verdict.reason === 'anchor_unreadable' ? (
          <Badge tone="danger">{t('audit.chain.brokenAnchorFile')}</Badge>
        ) : (
          <Badge tone="danger">
            {t('audit.chain.broken', {
              id: verdict.brokenAt,
              reason: t(`audit.chain.reason.${verdict.reason}`),
            })}
          </Badge>
        )}
        <p className="text-ink-muted">{t('audit.chain.explain')}</p>
        {verdict.ok ? (
          <div>
            <p className="font-medium">{t('audit.chain.headLabel')}</p>
            <code className="font-mono text-xs break-all select-all">{verdict.headHash}</code>
          </div>
        ) : null}
        {verdict.publicKey ? (
          <div>
            <p className="font-medium">{t('audit.chain.publicKeyLabel')}</p>
            <code className="font-mono text-xs break-all select-all">{verdict.publicKey}</code>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
