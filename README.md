# Hyundai Dealer Workspace

Independent, fictional-data prototype of a shared dealer CRM and learning portal. The existing Australian demo context is preserved; no official vehicle specification, price, warranty or Hyundai certification is asserted.

## Run

Node.js 24 is required for built-in SQLite.

```sh
npm ci
npm run seed
npm run dev
```

Open http://localhost:3000. For a production-mode local check:

```sh
npm run build
npm start
```

Use this checkout for ordinary work; do not create an extra worktree. Records are stored in ignored `.data/dealer.sqlite`. Set `DEALER_DATA_DIR` to use another directory. Seeding runs automatically on first access and can also be run explicitly; rerunning it preserves existing records.

## Two demo accounts

| Account | Email | First-run demo password |
|---|---|---|
| Dealer consultant Olivia Bennett | dealer@demo.local | DealerDemo!2026 |
| Hyundai learning team | internal@demo.local | InternalDemo!2026 |

The sign-in screen can fill these public demo credentials. They are for fictional records only. `Switch account` signs out and returns to sign-in; it does not turn a dealer session into an administrator.

Set `DEALER_DEMO_PASSWORD` and `INTERNAL_DEMO_PASSWORD` before the first seed to override the defaults. Passwords are hashed. Changing these environment variables later does not rotate passwords in an existing database. `APP_ORIGIN` can explicitly set the allowed origin when running behind a reverse proxy.

Sessions use random, hashed server-side tokens and HttpOnly SameSite cookies. APIs check role, dealer, consultant and conversation ownership. This is a small demo login, not enterprise SSO or a production identity deployment.

## Shared data and sample records

The initial seed creates:

- 2 dealer Accounts, 3 employee Contacts and 4 buyer Contacts.
- 2 User accounts; other Contacts have no login.
- 3 product models, 5 Opportunities with buyer Contact Roles, 2 Leads.
- 2 Assets with owning buyer Contacts and 4 fictional AssetWarranty records.
- 3 versioned Courses, 3 assignment rules, 4 personal Enrollments.
- 2 labelled prepared quiz attempts and 4 knowledge articles, including an internal-only article.

Foreign keys and unique constraints protect relationships. Published course contents, active assignment definitions and quiz attempts cannot be overwritten. Legacy `contracts`, `audit_events` and any existing legacy learning tables are retained. Name-only legacy learning events are not guessed into new Contact identities.

## Demo walkthrough

1. Sign in as Hyundai internal. Open **Dealer network** to inspect Accounts, employee/customer relationships, vehicles and warranties.
2. In **Training management**, publish a course version and quiz. Publication alone does not assign it.
3. In **Assign learning**, select Tier, New status, a dealer or an individual consultant. Preview recipients and apply.
4. Sign out and sign in as Olivia. Open **Learning hub**, complete assigned lessons and submit the knowledge check.
5. Retry a quiz or reload. Every attempt and its original course version remain available under **Your progress**.
6. Sign in as internal and filter **Learning performance** by Account and Contact to see the same records.
7. Change Geelong Riverside to Tier 1 and assign EV01 to new dealers as well. Priya gets one EV01 enrollment with multiple assignment reasons.
8. Open **Customers & vehicles** as Olivia. Only her own dealer's assigned customers and related assets appear; colleague and other-dealer records remain excluded.
9. Ask the **Sales assistant** about winter range or charging. Answers show eligible article versions, and conversation history is private to its owner.

Tier and New status are independent attributes. Stopping a rule prevents new allocations while retaining existing obligations and results. A course completes only when all required lessons are marked complete and its quiz has been passed. Scores use the version's question count and pass mark rather than a hardcoded three-question full-score rule.

## Knowledge chatbot and optional live AI

Without an API key the application returns labelled **Prepared coaching guidance**, not a simulated live model response. No matching article results in an explicit no-source answer.

For live responses, set `OPENAI_API_KEY` or `DEALER_OPENAI_API_KEY` in ignored `.env.local`. Do not paste keys into chat or commit them. `OPENAI_MODEL` preserves the existing `gpt-4.1-mini` default and can be configured. The Agents SDK uses a read-only, server-scoped knowledge tool and structured source references. Source IDs are checked against actual retrieval results; this does not guarantee semantic factuality.

Retrieval filters market, audience, publication status, effective dates and version. Quiz answer keys and customer documents are not searchable. The chatbot cannot inspect an individual VIN's warranty eligibility, change CRM records or perform sales role play. Existing reviewed contract extraction remains available when configured; original uploads are not retained.

SDK tracing remains disabled for the existing document workflow. This does not establish Zero Data Retention. Production SSO, distributed rate limiting, background jobs, consent/retention administration and a full model-based eval framework are outside this build.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

Tests use disposable databases and do not call live models. They cover role and object access, cross-site requests, overlapping assignments, immutable versions, submission idempotency, course completion, citations and private chat histories.

For browser checks, start a server against a disposable data directory and install Playwright Chromium:

```sh
npx playwright install chromium
npm run test:e2e
```

`PLAYWRIGHT_BASE_URL` selects the server and `CHROMIUM_PATH` optionally selects an existing compatible browser. Browser tests create labelled E2E courses and records, so use a disposable `DEALER_DATA_DIR`, not a live demo database. Automated accessibility checks cover sign-in, learning and management screens.

## Design and implementation records

- [Shared data model and process design](docs/03-shared-data-model.ko.md)
- [Build walkthrough and implementation boundaries](docs/04-shared-model-build.ko.md)
- [Earlier architecture learning record](docs/01-architecture.ko.md) — historical baseline, predating shared identity and assignment support.
- [Hyundai visual design record](docs/02-design.ko.md)

## Static screen preview

`npm run build:preview` creates a **read-only design preview** in `preview-dist/`. It contains fictional display fixtures only, no server routes, existing database, credentials or live AI. Sign-in, shared writes, quizzes and chat require the server application. This replaces the old browser-local mutable preview so it cannot be mistaken for the shared-data implementation. Netlify configuration remains available for this static mode.
