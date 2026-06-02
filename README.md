# AI-Powered Contract Review Agent

Coding Challenge #122 — durable contract review workflows with [Trigger.dev](https://trigger.dev), Next.js, PostgreSQL, and swappable LLM providers.

**Trigger.dev project:** [AI-powered Contract Review](https://cloud.trigger.dev/projects/v3/proj_diijtejjchsqgmnogxlk) (`proj_diijtejjchsqgmnogxlk`)

## Step 1 — Authentication

- **Homepage** (`/`) — product overview with sign up / log in CTAs
- **Sign up** (`/signup`) — email + password (min 8 chars), optional name
- **Log in** (`/login`) — session cookie, 30-day expiry
- **Dashboard** (`/dashboard`) — post-login landing (protected)

Passwords are hashed with bcrypt. Sessions are stored in PostgreSQL.

After pulling schema changes:

```bash
npm run db:push
```

If you have existing `User` rows without `passwordHash`, reset the dev database or delete those rows first.

### Step 1 testing

1. Visit `/` — homepage renders with product explanation
2. Register at `/signup` — redirects to `/dashboard` when logged in
3. Log out from the header — returns to `/`
4. Log in with same credentials
5. Register again with same email → “An account with this email already exists.”
6. Wrong password on login → “Invalid email or password.” (no crash)

## Step Zero checklist

Before building the full pipeline, verify each layer works on its own:

| Check | How |
|-------|-----|
| Trigger.dev task | Run `hello-world` from the app or dashboard |
| LLM provider | Test Groq (or OpenAI / Anthropic) on the home page |
| Database | Test DB button after `db:push` |

## Prerequisites

- Node.js 18.20+
- PostgreSQL
- Trigger.dev account (already linked)
- At least one of: Groq, OpenAI, or Anthropic API key

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment**

   ```bash
   cp .env.example .env.local
   ```

   Fill in:

   - `TRIGGER_SECRET_KEY` — DEV key from the [API Keys](https://cloud.trigger.dev/projects/v3/proj_diijtejjchsqgmnogxlk) page
   - `DATABASE_URL` — PostgreSQL connection string
   - `GROQ_API_KEY` (recommended) and/or `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
   - `LLM_PROVIDER=groq` if you have multiple keys

3. **Database**

   ```bash
   npm run db:push
   ```

   Example local Postgres:

   ```bash
   docker run --name contract-review-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
   createdb contract_review  # or use DATABASE_URL with db name in path
   ```

4. **Run dev (Next.js + Trigger.dev worker)**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) and run the three Step Zero tests.

## Project structure

```
app/                    # Next.js App Router (UI + API routes)
src/
  trigger/              # Trigger.dev tasks (durable background work)
  lib/
    llm/                 # Provider abstraction (Groq, OpenAI, Anthropic)
    db.ts               # Prisma client
prisma/schema.prisma    # Users, contracts, clauses, analyses, decisions
trigger.config.ts       # Trigger.dev project config
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js + Trigger.dev dev worker (concurrent) |
| `npm run dev:next` | Next.js only |
| `npm run dev:trigger` | Trigger.dev worker only |
| `npm run db:push` | Apply Prisma schema to DB |
| `npm run db:studio` | Prisma Studio |
| `npm run deploy:trigger` | Deploy tasks to Trigger.dev |

## API routes (Step Zero)

- `POST /api/hello-world` — triggers `hello-world` task
- `POST /api/test/llm?provider=groq` — LLM smoke test
- `POST /api/test/db` — creates/read/deletes test rows

## LLM abstraction

Use `complete()` from `@/lib/llm` in tasks or API routes:

```ts
import { complete } from "@/lib/llm";

const result = await complete({
  provider: "groq", // optional; uses LLM_PROVIDER or first configured key
  messages: [{ role: "user", content: "Analyse this clause…" }],
});
```

Swap providers without changing call sites.

## Next steps (Challenge steps 1+)

- PDF upload and text extraction
- Clause splitting task
- Parallel per-clause risk analysis with retries
- Human-in-the-loop waitpoints
- Realtime streaming summary to the UI

## Docs

- [Trigger.dev tasks](https://trigger.dev/docs/tasks/overview)
- [Next.js + Trigger.dev](https://trigger.dev/docs/guides/frameworks/nextjs)
- [Human-in-the-loop](https://trigger.dev/docs/wait-for-token)
