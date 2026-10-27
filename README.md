# Hyundai AU · Dealer Workspace

Independent interview prototype: a dealer workspace and Hyundai internal management demo. All customers and amounts are fictional. No official Australian vehicle specification or promotion is asserted.

## Run

Node.js 24 (uses built-in `node:sqlite`).

```sh
npm ci --cache /tmp/dealer-npm
npm run dev
```

Open the application on port 3000 through your development environment. SQLite records are stored in ignored `.data/`. Use the existing checkout; do not create a Git worktree for ordinary tasks.

For a production-mode local check:

```sh
npm run build
npm start
```

## Demo

1. Dealer → New contract → Explore a prepared example.
2. Edit fields, choose the opportunity, check the review confirmation, save.
3. Contracts → see the saved record.
4. Hyundai internal → Sales overview → inspect the contract and pipeline.
5. Training management → publish a text lesson and its three-question quiz.
6. Dealer → Learning hub → select the course, answer and submit.
7. Hyundai internal → Learning performance → see participation, every attempt and knowledge-check status.
8. Sales assistant → ask about winter range. Without a key, responses are labelled prepared guidance, not live AI.

## Optional live AI

Put a key in ignored `.env.local` as `OPENAI_API_KEY` (or `DEALER_OPENAI_API_KEY` for an environment-settings binding). Never paste keys into chat or commit them. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Real uploads are sent to OpenAI; only reviewed fields are retained locally. API upload supports JPG, PNG and PDF up to 10 MB. Contract extraction returns schema fields, evidence and warnings. The sales agent calls a read-only guidance search tool.

**Local fictional-data prototype only:** role switching is not authentication; APIs have no authorisation or dealer isolation. Do not deploy publicly or upload real customer contracts. SDK tracing is disabled; this does not establish API Zero Data Retention. No DMS, Salesforce, vector file search, agent handoffs or role-play assessment is connected yet.

## Validation

```sh
npm test
npm run typecheck
npm run build
# With server running, installed Chromium and a disposable data directory:
npm run test:e2e
```

Tests cover contract review gates, invalid financial data, SQLite audit persistence, course publication, quiz grading and attempt history. E2E uses the running server and creates clearly labelled demo data.

Korean architecture lesson and decision record: [docs/01-architecture.ko.md](docs/01-architecture.ko.md).

## Public screen preview

`npm run build:preview` exports a browser-only demo into `preview-dist/`. It excludes server routes, keys, SQLite and all existing records. Contracts and course changes stay in the viewer's browser; uploads and live AI calls are disabled. This mode can be hosted statically. Netlify build settings are included in `netlify.toml`. See [preview deployment instructions](docs/preview-deployment.ko.md). Actual hosting account access is still required to issue a public URL.
