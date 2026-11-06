import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getT, messages } from '@/i18n/get-t';
import type { AuditLogEntry } from '@/server/audit';
import { AuditLogTable } from './audit-log-table';

const entry = (overrides: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: 1,
  created_at: '2026-11-06T10:30:00.000Z',
  actor: 'staff-admin',
  action: 'application.reviewed',
  entity_type: 'application',
  entity_id: 'app-1',
  details: { from: 'manual_review', to: 'approved' },
  ...overrides,
});

const renderTable = (entries: AuditLogEntry[], locale: 'en' | 'fi' = 'en') =>
  render(<AuditLogTable entries={entries} locale={locale} t={getT(locale)} />);

describe('AuditLogTable', () => {
  it('shows who did what, to which record', () => {
    renderTable([entry()]);

    expect(screen.getByText('staff-admin')).toBeTruthy();
    expect(screen.getByText(messages.en['audit.action.applicationReviewed'])).toBeTruthy();
    expect(screen.getByText('app-1')).toBeTruthy();
    expect(screen.getByText(/"to":"approved"/)).toBeTruthy();
  });

  it('shows the time in Finland', () => {
    renderTable([entry()]);
    expect(screen.getByText(/12:30/)).toBeTruthy();
  });

  it('uses the language of the page', () => {
    renderTable([entry()], 'fi');
    expect(screen.getByText(messages.fi['audit.action.applicationReviewed'])).toBeTruthy();
  });

  it.each([
    'application.submitted',
    'application.reviewed',
    'contract.signed',
    'contract.ended',
    'asset.status_changed',
    'asset.relisted',
    'asset.released',
    'asset.held',
    'invoice.vat_updated',
    'demo_date.changed',
  ])('has words for %s', (action) => {
    renderTable([entry({ action })]);
    expect(screen.queryByText(action)).toBeNull();
  });

  it('falls back to the action itself for one it does not know', () => {
    renderTable([entry({ action: 'something.new' })]);
    expect(screen.getByText('something.new')).toBeTruthy();
  });

  it('shows a dash for no details', () => {
    renderTable([entry({ details: null })]);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
