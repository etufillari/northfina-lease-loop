# Lease Loop · Northfina × Hive Helsinki hackathon

**Every item has more than one life.** Lease Loop takes an e-bike, a laptop or a tractor round the whole leasing loop, from the first quote to its second and third lives.

Everything in the app is rules, data and algorithms: no AI, ML or LLM inside the product.

- 📋 **The challenge:** [CHALLENGE.md](CHALLENGE.md) · 📐 **Engineering rules:** [RULES.md](RULES.md) · 🗂️ **Data pack:** [data/DATA.md](data/DATA.md)

**Northfina** is a Helsinki-based leasing platform. This repo is a fork of their hackathon starter, not their product code.

---

## How to run

You need **Git** and **Node.js 22** (`nvm install` reads `.nvmrc`). No secrets or accounts are needed.

```bash
npm ci               # dependencies and Git hooks
npm run db:setup     # .env and a local SQLite database seeded with the 30 assets
npm run dev          # http://localhost:3000
```

For a demo, a production build is faster: `npm run build && npm run start`.

| Command                 | What it does                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `npm run dev`           | Start the app with hot reload                                    |
| `npm test`              | Run all tests once                                               |
| `npm run test:coverage` | Tests with the coverage gate                                     |
| `npm run check:all`     | **Everything CI runs**: format, lint, types, sizes, no-AI, build |
| `npm run db:reset`      | Wipe the database and seed it again                              |
| `npm run db:studio`     | Browse the database in your browser                              |

---

## License

The starter code is MIT-licensed (see [LICENSE](LICENSE)). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
