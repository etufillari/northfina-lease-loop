# Live hackathon preview

**Temporary demo:** https://solving-poll-tiles-heating.trycloudflare.com/en

This is a [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), not durable production hosting. It requires no account/domain, but stops when the local server/tunnel stops and has no uptime guarantee. Keep the team computer awake and online. Public testing uses a separately seeded synthetic SQLite database, not the team's local test records.

The current interactive app uses development-only identities. A production build passes checks but intentionally disables these demo flows. Do not disable those guards or put real data into this preview. Share the operator password privately, never in Git or a public PR.

## Recreate a preview

1. Install the official `cloudflared` client and prepare a separate database with Prisma migrations and the synthetic seed.
2. Run `cloudflared tunnel --url http://localhost:3012 --protocol http2` to obtain a new temporary hostname.
3. Set `DATABASE_URL` to the separate SQLite file, `LEASE_LOOP_OPERATOR_PASSWORD` to a private demo password, and `LEASE_LOOP_DEMO_HOST` to that exact hostname without `https://`.
4. Run `npm run dev -- --webpack --port 3012`. The configured hostname is allowed for development assets and HTTPS origin validation; all other origin checks remain enforced.
5. Check the catalogue and customer flow; check company sign-in manually. No private operator password was sent during automated public verification.

The live preview was started from a separate app copy under `/private/tmp/lease-loop-public-demo/app`. It does not disturb the normal local server.

## Durable hosting

The current database needs writable persistent storage. [Render free web services](https://render.com/docs/free) have ephemeral filesystems and lose SQLite data on restart/redeploy/spin-down, so that is not persistent hosting for this app as written. Durable deployment needs an external database or persistent volume plus production identity and an explicit demo access policy.

A demo URL does not replace the required submission PR into `etufillari/northfina-lease-loop` main. Follow README's Submitting section.
