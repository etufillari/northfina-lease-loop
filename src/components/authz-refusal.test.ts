import { describe, expect, it } from 'vitest';
import { messages } from '@/i18n/get-t';
import { authzRefusalKey } from './authz-refusal';

describe('authzRefusalKey', () => {
  it.each(['not_signed_in', 'not_owner', 'admin_only', 'signatory_required'])(
    '%s has a message in every language',
    (code) => {
      const key = authzRefusalKey(code);
      expect(key).toBe(`authz.refusal.${code}`);
      for (const locale of Object.values(messages)) expect(key! in locale).toBe(true);
    }
  );

  it('is null for any other code or a missing one', () => {
    expect(authzRefusalKey('already_signed')).toBeNull();
    expect(authzRefusalKey(undefined)).toBeNull();
  });
});
