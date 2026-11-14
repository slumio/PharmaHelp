# PharmaHelp

Your pharmacy, connected. A responsive workspace for inventory, shelf locations, supplier imports, customer bills, and a voice copilot. The visual theme adapts Rig AI’s electric blue, charcoal panels, cream typography and angular controls. Built with Next.js and MongoDB, with simple Python run commands.

## Instant preview on Vercel (no database)

Deploy the pushed repository to Vercel with `DEMO_MODE=true`, `APP_USERNAME=admin`, and a strong `APP_PASSWORD`. This shows realistic fictional inventory, sales, shelves, charts and store questions without MongoDB. The preview is clearly labeled and read-only. Disable `DEMO_MODE` and add `MONGODB_URI` when you are ready to use real stock.

## Deploy to Render + MongoDB Atlas

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/slumio/PharmaHelp)

Commit and push these changes to your GitHub repository before using the deployment button. Render deploys the code on GitHub, not uncommitted local changes.

1. Create a MongoDB Atlas cluster. Add a database user and configure network access for your hosting service. Copy the driver's `mongodb+srv://...` connection string with the database user's password inserted and URL-encoded.
2. Click **Deploy to Render**, connect the repository, and paste the connection string into `MONGODB_URI`. Set `DEMO_MODE=false` for your own store; the Blueprint initially enables the sample-data preview. `OPENAI_API_KEY` is optional; leave it blank to use database-backed answers and browser voice without AI image extraction or recording transcription.
3. Deploy. Open the service URL, sign in as `admin`, and use the generated `APP_PASSWORD` from Render's Environment page.

The included `render.yaml` handles the build, startup, generated password and `/api/health` check. MongoDB indexes and an empty store are initialized automatically. No migration command, Python dependencies, local database or seed step is required on Render. The Blueprint selects a paid Starter instance; review the provider's displayed pricing before creating it.

Render's outbound IP ranges are available in the service dashboard; allow those in Atlas. Use the same hosting region where practical. For production, restrict the Atlas network list instead of leaving all IPs allowed. See [Render Blueprints](https://render.com/docs/infrastructure-as-code) and [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/).

## Deploy to Vercel + MongoDB Atlas

[Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fslumio%2FPharmaHelp&env=DEMO_MODE,APP_USERNAME,APP_PASSWORD&envDescription=MongoDB%20Atlas%20connection%20string%20and%20a%20secure%20operator%20login&project-name=pharmahelp&repository-name=pharmahelp)

Import the pushed repository as a Next.js project. Set `MONGODB_URI`, `APP_USERNAME=admin`, and a strong `APP_PASSWORD`. Set `DEMO_MODE=false` for real data, or `true` for the preview. Optionally set `OPENAI_API_KEY`, then deploy. `MONGODB_DB` defaults to `pharmahelp`; indexes initialize automatically, and connections reuse a small cached pool. Configure Atlas network access for Vercel; fixed outbound networking may depend on your hosting plan. Use HTTPS (provided by both hosts). Set `APP_ORIGIN` to your public URL if you use a reverse proxy with a different request origin.

Vercel's request-size limits apply to uploads; keep bill photos under 3 MB. Render is the recommended straightforward Docker option; Vercel works without a separate backend server.

## Run locally — two commands

Install Python 3.10+ and Docker with Compose v2:

```sh
python3 manage.py init
python3 manage.py up
```

Open http://localhost:3000. Sign in as `admin` with `APP_PASSWORD` from `.env`. The first start builds the app and starts a local MongoDB replica set. Subsequent starts preserve all records.

```sh
python3 manage.py logs
python3 manage.py status
python3 manage.py down
python3 manage.py backup --output pharmacy.archive.gz
```

Backups cover the bundled local MongoDB. If using Atlas, use Atlas backups or `mongodump` with your Atlas URI. Keep offsite copies and test restoration into a separate database. Never use `docker compose down -v` unless you intend to erase the local database. Local MongoDB binds to loopback and has no authentication; use Atlas for hosted deployments.

## Develop locally

Install Node.js 24 and Python 3.10+, run `npm ci`, and run `python3 manage.py init`. Set `MONGODB_URI` in `.env` to Atlas, or start only the local database with `docker compose up -d --wait mongo`.

```sh
python3 manage.py setup-db
python3 manage.py dev
```

`python3 manage.py build` creates a production build, and `python3 manage.py start` serves it. `./run.sh` is a compatibility wrapper. The Python CLI has no package dependencies. `.env` is never overwritten or committed.

## Voice and imports

The **Ask your store** page supports English (India) and Hindi dictation, a microphone button, transcript review before sending, and optional spoken answers. Chrome's speech recognition works without an API key where the browser supports it; browser speech services may process audio externally. Microphone access requires HTTPS or localhost and browser permission.

Other supported browsers record up to 30 seconds and send audio to OpenAI for transcription when `OPENAI_API_KEY` is set. The fallback uses `OPENAI_TRANSCRIPTION_MODEL` (default `gpt-transcribe`). OpenAI API usage is billed separately. Speech output uses browser voices; voice availability varies by device. Without an API key, the rule router understands English and selected Hindi transliterations; natural Hindi questions need AI mode.

CSV columns: `name,pack,batch,expiry,qty,mrp,purchase`. Dates use `YYYY-MM-DD`. Quantities must be positive integers. Quoted commas are supported. The import screen always shows editable rows before confirmation; retries use an idempotency key. Bill photos need `OPENAI_API_KEY`.

## AI database operations

Ask questions normally. With `OPENAI_API_KEY`, the copilot can search for medicines and prepare validated changes from natural language. Without a key, these command patterns work:

- `Add 20 Dolo 650mg at MRP 32.50`
- `Reduce 2 of Dolo 650mg`
- `Set stock of Dolo 650mg to 50`
- `Remove all stock of Dolo 650mg`
- `Sell 2 of Dolo 650mg to Demo Customer`

Review the action card and click **Confirm change** to write to MongoDB. The AI never executes arbitrary database queries. Stock removal zeros the balance and preserves its audit history. Ambiguous medicine batches require clarification. Demo mode shows proposals but does not allow confirmation.

## Reliability and scope

MongoDB Atlas or a replica set is required for multi-document transactions. Stock writes, sales and bill confirmation commit atomically; concurrent inventory writes retry on store-level conflicts. Stock balances have an append-only movement audit, prices use integer paise, duplicate sale lines are consolidated, expired stock cannot be sold, and indexes enforce medicine and invoice uniqueness per store.

This is a single-store application with a shared operator login and signed, HTTP-only sessions that expire after eight hours. Production refuses access if credentials are absent. The AI queries stock and metrics and can prepare stock additions, reductions, count corrections, stock removal and sales. Each write appears as a review card and requires explicit confirmation. Confirmation and the stock operation share one MongoDB transaction, making repeated approval safe. Proposals expire after 15 minutes; confirmed actions remain in the audit trail. Multi-user roles, per-person audit identity, host-level rate limiting and monitoring remain deployment-specific work. Tax retains the original fixed 12% rule; validate your billing requirements before operational use. Dashboard days use UTC.

The former PostgreSQL schema is replaced by MongoDB. Existing PostgreSQL records are not automatically transferred. Export and reconcile real stock, bills and ledger records before switching an existing operational installation.

## Checks

Use a disposable MongoDB replica set. Tests require a database name ending in `_test` and add records without clearing existing collections:

```sh
export MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true'
export MONGODB_DB=pharmahelp_test
npm run typecheck
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npm audit --omit=dev
npm run build
ALLOW_DEMO_SEED=true npm run db:seed
npm run test:e2e
```

The demo seed only adds records and is never run on startup or deployment. CI creates a disposable MongoDB replica set, runs integration and Python tests, audits dependencies, builds production, and runs browser checks. It never publishes automatically.
