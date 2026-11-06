# Account foundation

This branch provides identity and ownership for the future leasing dashboard.
It does not implement contracts, invoices, exchanges, payments or rewards.

## Implementation plan

1. Add User, AuthIdentity, AuthSession, AuthVerification and AuthRateLimit models
   for Better Auth, plus a Customer owned by one user. Generate the migration
   with Prisma; preserve existing assets and audit rows.
2. Configure email/password authentication, server-side sessions, explicit trusted
   origin, secure production cookies, throttling and short-lived sessions.
   Keep credentials and session tokens out of application responses and audit details.
3. Expose only the supported authentication operations through the existing API
   envelope. Run all authentication writes and their audit row in one transaction.
   Reads must not silently refresh or delete sessions outside that transaction.
4. Add translated registration/login and a protected account screen, profile name
   editing, password change, logout and logout on every device.
5. Derive identity and customer ownership from the verified session on the server.
   Existing inventory mutation and global audit routes require staff access.
6. Test authentication, session expiry/revocation, customer isolation, forged input,
   CSRF, throttling and rollback when auditing fails. Run `npm run check:all`.

## Ownership contract for future features

- User identifies a login; Customer identifies the leasing party. A newly registered
  user owns a new private customer record, never a pre-existing data-pack persona.
- Future contracts, applications and rewards should reference Customer.id.
- Obtain the customer ID using the server authentication helper. Never accept a
  request's customer ID or actor as evidence of ownership.
- Signing authority for a company and financing eligibility are separate business
  decisions. Registration grants neither. Company membership is a later feature.
- Public registration cannot assign staff privileges. Staff provisioning must happen
  through a trusted administrative process; no public role-changing endpoint exists.

## Scope and deployment

The initial local workflow supports email/password registration without sending mail.
An email address is therefore a login identifier, not verified proof of identity.
Do not use email matching to claim existing customers, invite users to companies or
approve leases. Before public production onboarding, add email verification and a
time-limited, single-use recovery workflow through a configured email provider.

Set BETTER_AUTH_URL to the application's exact origin and provide a random
BETTER_AUTH_SECRET of at least 32 characters. Use HTTPS in production. Do not trust
forwarded client IP headers unless a trusted deployment proxy overwrites them.

The auth library's schema is generated through Prisma migrations. Its request
handlers are deliberately not mounted as an unrestricted catch-all: only reviewed
operations are exposed. Every write uses the transaction supplied by withAudit().

Source references: [Better Auth security](https://www.better-auth.com/docs/reference/security),
[Next.js authentication](https://nextjs.org/docs/app/guides/authentication).

## Using this implementation

Run `npm run db:setup` on a fresh checkout, or `npm run auth:setup` and
`npm run db:migrate` on an existing local database. Setup creates a random local
secret without displaying it and preserves it on subsequent runs.

Visit `/en/register`, `/en/login` or `/en/account` (also available in fi, sv, et).
The account icon in the header links to the protected account page.

| Endpoint                  | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| POST /api/auth/register   | Name, email and password; creates a new personal customer |
| POST /api/auth/login      | Email and password; creates a 24-hour session             |
| GET /api/auth/me          | Current user and owned customer ID; no session token      |
| POST /api/auth/profile    | Update the current user's name                            |
| POST /api/auth/password   | Current and new password; revokes other sessions          |
| POST /api/auth/logout     | Revoke this session and clear its cookie                  |
| POST /api/auth/logout-all | Revoke every session and clear this browser's cookie      |

All mutations require the configured Origin and JSON. All endpoints use the
standard response envelope. Passwords are 15–128 characters; password hashes and
signed session cookies are handled by Better Auth. The application never returns
the raw library response containing a session token.

`readIdentity`, `requireIdentity` and `requireStaff` in `src/server/auth-session.ts`
are the entry points for future protected features. Query owned records using the
returned customerId, never an untrusted customer ID supplied by the browser.
Reads bypass cookie caches and do not refresh or delete expired database sessions.

Inventory status changes now require staff and accept only `{ status }`.
The global audit feed is staff-only. Neither endpoint trusts a client-supplied actor.

Without a trusted IP header, throttling deliberately uses one shared per-path
database bucket. This prevents bypass through spoofed forwarding headers, but can
temporarily block all users on a busy deployment. Configure a trusted edge proxy
and its verified IP header before public deployment. Add verified-email onboarding
and recovery there too; local registration alone does not establish email ownership.
