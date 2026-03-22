# Adventure Time — AI-Powered Family Activity Planner

A personalised family activity recommendation engine for parents who want to find something fun to do with their kids today. Powered by Claude AI, real nearby venues, live weather data, and local event discovery.

---

## Features

- **Magic-link authentication** — no passwords, invite-only access
- **AI-generated activity plans** — 3 hand-picked suggestions at a time, each with a creative title, step-by-step plan, and a "why it works for each child" explanation
- **Real venues** — pulls nearby family-friendly places from Google Places and includes them in suggestions
- **Live weather awareness** — suggestions adapt to whether it's raining, cold, or sunny
- **Local event discovery** — integrates Eventbrite and web search to surface real, date-validated events happening this week
- **Smart rotation queue** — 40+ activities pre-generated and queued per user; new ones arrive in the background so suggestions are always instant
- **Shared suggestion pool** — users with the same location, weather, and filters share a generated pool, saving API calls
- **Category learning** — accept/reject feedback adjusts activity category weights over time
- **Venue blocking** — block any venue from ever appearing again
- **Swipe or list mode** — browse suggestions as a swipe stack or a scrollable list
- **Pull-to-refresh** — new suggestions served instantly from the queue

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | Turso (SQLite edge database) |
| AI | Anthropic Claude API (`claude-opus-4-5` / `claude-sonnet-4-5`) |
| Venues | Google Places API (New) |
| Weather | OpenWeatherMap |
| Events | Eventbrite API + Serper.dev web search |
| Email | Nodemailer with Gmail SMTP |
| Auth | JWT (jose), magic links, server-side session management |
| Hosting | Vercel |

---

## Architecture

### Request flow

```
Browser
  │
  ├── GET /api/activities/queue        ← instant: serves from pre-built queue
  ├── GET /api/activities/cached       ← instant: serves from server-side cache
  └── POST /api/activities             ← fresh generation (fallback only)
          │
          ├── Google Places → nearby venues
          ├── OpenWeatherMap → current weather
          ├── Eventbrite + Serper → local events (date-validated)
          └── Claude AI → 3–20 activity recommendations
```

### Background queue fill

When the queue drops below threshold, the client fires a background `POST /api/activities/queue/fill`. This generates ~40 activities in two parallel Claude calls, checks a shared suggestion pool (keyed by location + weather + filters) to avoid redundant work, and stores the results ready for instant serving on the next request.

### File layout

```
app/
  page.tsx                  Main discover page
  login/page.tsx            Magic link login
  settings/page.tsx         User settings
  api/
    auth/
      request/route.ts      Magic link email dispatch
      verify/route.ts       Magic link verification + session creation
      logout/route.ts       Session clearance
    profile/route.ts        Child profile CRUD
    settings/route.ts       User preferences (session duration)
    blocked-places/route.ts Venue blocklist
    activities/
      route.ts              On-demand fresh generation
      cached/route.ts       Server-side cached results
      queue/route.ts        Queue-based instant serve
      queue/fill/route.ts   Background bulk generation
    photo/route.ts          Google Places photo proxy
    admin/
      login/route.ts        Admin authentication
      users/route.ts        User management
      sessions/route.ts     Session revocation
components/
  ActivityCard.tsx          Full activity detail card
  SwipeCard.tsx             Swipe-to-decide card stack
  InputForm.tsx             Filter form (time, budget, transport)
  FeedbackModal.tsx         Rejection reason picker
  WeatherBadge.tsx          Current weather display
  Navigation.tsx            Bottom nav bar
hooks/
  usePreferences.ts         Local prefs + server sync
  useLocation.ts            GPS + manual postcode location
lib/
  anthropic.ts              Claude prompt engineering + output validation
  events.ts                 Eventbrite + Serper event pipeline
  places.ts                 Google Places integration + 7-day cache
  auth.ts                   JWT tokens, session cookies, admin sessions
  users.ts                  User management (DB CRUD)
  blocked-places.ts         Venue blocklist persistence
  geocode.ts                UK postcode → lat/lon (postcodes.io)
  storage.ts                Browser localStorage (prefs, filters, results cache)
  suggestion-queue.ts       Per-user queue: serve, track, rotate
  suggestion-pool.ts        Shared cross-user activity cache
  activity-cache.ts         Per-user server-side results cache
  rate-limit.ts             In-memory per-IP/user rate limiter
  weather.ts                OpenWeatherMap + in-process cache
  email.ts                  Magic link email delivery
  db.ts                     Turso client singleton
  schema.ts                 DB schema init + migrations (cached in-process)
  ip.ts                     Client IP extraction (proxy-aware)
types/
  index.ts                  All TypeScript interfaces
middleware.ts               Route-level auth protection
next.config.ts              Security headers, image config
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `users` | Email, child profiles (JSON), admin flag, session duration |
| `magic_tokens` | Consumed token hashes (replay prevention) |
| `admin_sessions` | Active admin sessions (server-side revocable) |
| `suggestion_queue` | Per-user pre-generated activity queue (40+ items, 3 served at a time) |
| `suggestion_pool` | Shared activity cache keyed by location/weather/filters (4h TTL) |
| `activity_cache` | Per-user server-side results cache (10-min TTL) |
| `places_cache` | Google Places API results (7-day TTL) |
| `blocked_places` | Per-user venue blocklist |
| `recommendation_history` | Which sets of activities each user has seen (rotation dedup) |
| `settings` | Key/value store (`sessions_nbf` for global session invalidation) |

---

## Setup

### Prerequisites

- Node.js 18+
- A [Turso](https://turso.tech) database (free tier is more than enough)
- Gmail account with [App Password](https://myaccount.google.com/apppasswords) enabled
- [Anthropic API key](https://console.anthropic.com)
- [Google Places API key](https://console.cloud.google.com) (enable "Places API (New)")
- [OpenWeatherMap API key](https://openweathermap.org/api) (free tier)

### Installation

```bash
git clone <repo>
cd Lee-Kids
npm install
cp .env.example .env
# edit .env with your keys
npm run dev
```

### Environment variables

See `.env.example` for the full list. Required variables:

| Variable | Description |
|---|---|
| `AUTH_SECRET` | JWT signing secret — min 32 chars. Generate: `openssl rand -base64 32` |
| `ADMIN_PASSWORD` | Admin panel password |
| `TURSO_DATABASE_URL` | Turso database URL |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `GMAIL_USER` | Gmail address for sending magic links |
| `GMAIL_APP_PASSWORD` | Gmail App Password (not your account password) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `GOOGLE_PLACES_API_KEY` | Google Places API (New) key |
| `OPENWEATHER_API_KEY` | OpenWeatherMap API key |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app (used in magic link emails) |

Optional:

| Variable | Description |
|---|---|
| `EVENTBRITE_API_KEY` | Eventbrite API key for structured event data |
| `SERPER_API_KEY` | Serper.dev key for web-search event discovery |
| `SEED_EMAIL` | Primary admin email seeded on first run (default: `mail@robgregg.com`) |
| `SEED_USER_2` | Optional second user granted access on first run |

### Adding users

Access is invite-only. Add users through the admin panel at `/admin` (requires `ADMIN_PASSWORD`) or directly via the database.

---

## Deployment

Deploy to [Vercel](https://vercel.com) — it's a standard Next.js app:

```bash
vercel deploy
```

Set all environment variables in the Vercel dashboard. The Turso database is remote and shared across all serverless function instances.

---

## Security

| Control | Implementation |
|---|---|
| Authentication | Magic links (JWT, 15-min expiry, one-time use via consumed token DB) |
| Session management | HttpOnly + Secure + SameSite=Lax cookie; 30-day JWT; global invalidation via `sessions_nbf` |
| Admin sessions | Separate cookie (SameSite=Strict, 8h); DB-backed for server-side revocation |
| Rate limiting | Per-IP and per-user limits on auth + generation endpoints |
| SQL injection | Parameterised queries throughout (Turso/libsql) |
| Prompt injection | User-supplied text stripped of newlines, backticks, angle brackets, and common injection keywords before inclusion in prompts |
| XSS | HttpOnly cookies; Content-Security-Policy header; React's default HTML escaping |
| Clickjacking | `X-Frame-Options: DENY`; `frame-ancestors 'none'` in CSP |
| Data exposure | All API queries scoped to authenticated user's email (server-side session only, never from request body) |
| Open redirect | Logout redirects use `NEXT_PUBLIC_APP_URL` env var, never `req.url` |
| Shared device privacy | localStorage cleared on login page mount |

> **Note on rate limiting:** The rate limiter is in-process and resets on serverless cold starts. This is acceptable for a small invite-only app. For higher-traffic deployments, replace with a Redis-backed solution.

---

## How the suggestion queue works

1. **On first load:** client fires `GET /api/activities/cached` and `GET /api/activities/queue` in parallel
2. **Queue hit:** instantly serves the next 3 activities from the pre-built queue; updates `shown_count` and records the set in `recommendation_history`
3. **Queue miss / stale:** falls back to cached results with an "Updating picks…" indicator, triggers an immediate background fill
4. **Rotation logic:**
   - Tier 1: activities not in the last served set AND not seen in the last 2 hours
   - Tier 2: not in the last set but seen recently
   - Tier 3: anything eligible (fallback)
   - Within each tier: time-sensitive events (with a `sourceUrl`) surface first, sorted by urgency (soonest expiry)
5. **Background fill (`POST /api/activities/queue/fill`):**
   - Checks the shared suggestion pool (same location + weather + filters) first
   - If pool hit: copies activities directly — no Claude call needed
   - If pool miss: fires two parallel Claude calls (20 activities each)
   - Stores results in both the pool and the user's queue
   - Triggers automatically when `eligibleRemaining < 12`
6. **Expiry:**
   - Timed events: `endsAt + 2h` grace, or `startsAt + 26h` if no end time
   - Events with no date data: end of today + 24h
   - Evergreen activities: 5-day TTL from generation time

---

## Local event pipeline

Events are sourced from two APIs and combined:

**Eventbrite** — structured family/education events within 10km, filtered to start within the next 7 days using `start.local` timestamps.

**Serper.dev** — web search with a date-scoped query (`kids family events near [location] 21 March OR 22 March OR 23 March`) to maximise the chance of extracting explicit dates from snippets. A regex-based date parser (HIGH confidence only — must have day + month explicitly in text) filters out any result that doesn't contain a verifiable date within the current window. This prevents expired or future events from appearing.

Both sources are deduplicated by normalised title before being passed to Claude.

---

## Admin panel

Available at `/admin`. Requires `ADMIN_PASSWORD`.

- **Users** — view, add, and remove allowed users; set admin flag
- **Sessions** — revoke all active user sessions (useful after suspected account compromise)
