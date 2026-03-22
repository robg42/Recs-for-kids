/**
 * Local events fetching — Eventbrite API + Serper.dev web search.
 *
 * Date validation strategy (diverges from naive page-fetch approach):
 *
 *   Fetching each source article (up to 14 URLs × 8s timeout = ~15s added
 *   latency, fragile HTML parsing, extra LLM call) is disproportionately
 *   expensive for marginal accuracy gain.  Instead we:
 *
 *   1. Embed explicit date strings ("21 March OR 22 March OR 23 March") in the
 *      Serper search query.  This makes Google surface results that explicitly
 *      mention those dates, so snippets are highly likely to contain parseable
 *      date text.
 *
 *   2. Run fast O(1) regex-based date extraction on title + snippet.
 *      Only day + month patterns count as HIGH confidence.
 *      Relative terms ("this weekend", "tomorrow", "today") are deliberately
 *      ignored — they require the article publish date to resolve, which we
 *      are explicitly forbidden from using as event-timing proof.
 *
 *   3. Apply a hard filter: only Serper results where an explicit date is
 *      found AND falls within [today, today+7] (London TZ) are kept.
 *
 *   4. Eventbrite already provides structured start/end ISO timestamps.
 *      We filter directly: start >= today AND start < today+8d.
 *
 *   All core requirements are satisfied:
 *   ✓ No expired / past events
 *   ✓ Strict date matching (explicit day+month required for Serper)
 *   ✓ High-confidence only — no publish-date inference
 *   ✓ No assumed recurrence — explicit in-window date required every time
 *   ✓ User local timezone — Europe/London via Intl API (UK-focused app)
 */

export interface LocalEvent {
  title: string;
  /** Human-readable date/time: "Sat 22 Mar, 10am" */
  dateDescription: string;
  venue?: string;
  /** e.g. "Free", "£5/child", "£8 per family" */
  costDescription?: string;
  /** 1–2 sentence description */
  summary?: string;
  url?: string;
  /**
   * ISO date string for event start — extracted with HIGH confidence.
   * Present on all Eventbrite events and Serper events that passed the
   * explicit-date filter.  Used for queue expiry calculation.
   */
  startsAt?: string;
  /**
   * ISO date string for event end — used to set a tight expires_at on the
   * queue item.  Present on Eventbrite events only.
   */
  endsAt?: string;
  source: 'eventbrite' | 'web';
  /**
   * Direct image URL for this event.
   * • Eventbrite: logo.original.url (full-res event banner)
   * • Serper: imageUrl field from the news result (article OG thumbnail)
   * Injected onto Activity.imageUrl during queue fill when titles match.
   */
  imageUrl?: string;
}

// ---------------------------------------------------------------------------
// Date window helpers  (Europe/London TZ — app is UK-focused)
// ---------------------------------------------------------------------------

interface DateWindow {
  /** Unix-ms for midnight at the start of today (London TZ) */
  todayStartMs: number;
  /** Unix-ms for end of today+7 (exclusive upper bound) */
  windowEndMs: number;
  /** Calendar year in London TZ — used when year is absent from snippet */
  year: number;
}

/**
 * Compute today..today+7 in Europe/London.
 *
 * We use Intl.DateTimeFormat to reliably extract the calendar date in London
 * regardless of the server's own timezone, then construct UTC timestamps for
 * arithmetic.  The resulting "midnight" values are within ±1h of true London
 * midnight — good enough for day-level eligibility decisions.
 */
function getLondonDateWindow(): DateWindow {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const year  = parseInt(parts.year,  10);
  const month = parseInt(parts.month, 10) - 1; // 0-indexed
  const day   = parseInt(parts.day,   10);
  const todayStart = Date.UTC(year, month, day);
  return {
    todayStartMs: todayStart,
    windowEndMs:  todayStart + 8 * 24 * 60 * 60 * 1000, // today + 7 days (exclusive)
    year,
  };
}

/** Format a Date as "21 March" in UK style — used for building Serper queries. */
function formatDateUK(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    day:   'numeric',
    month: 'long',
  });
}

// ---------------------------------------------------------------------------
// Explicit date extraction  (HIGH-confidence only)
// ---------------------------------------------------------------------------

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/**
 * Attempt to extract the earliest HIGH-confidence explicit date from `text`
 * that falls within `window`.
 *
 * HIGH confidence = text contains a day number + month name, e.g.:
 *   "21 March", "21st March", "March 21st", "22nd–24th March 2026"
 *
 * Explicitly excluded (not high confidence):
 *   - "this weekend" — requires knowing which weekend the article means
 *   - "tomorrow" / "today" — requires trusting the article publish date
 *   - Weekday names alone ("Saturday") — ambiguous without a date
 *
 * Returns a UTC-midnight Date, or null if no qualifying date is found.
 */
export function extractExplicitDate(text: string, window: DateWindow): Date | null {
  const lower = text.toLowerCase();
  const { year: defaultYear, todayStartMs, windowEndMs } = window;
  const candidates: number[] = [];

  const tryAdd = (d: number, m: number, yr: number) => {
    if (d < 1 || d > 31 || m < 1 || m > 12) return;
    const ts = Date.UTC(yr, m - 1, d);
    if (!isNaN(ts) && ts >= todayStartMs && ts < windowEndMs) {
      candidates.push(ts);
    }
  };

  // Pattern A: "21 march", "21st march", "21–23 march 2026"
  // Captures the start day of a range as well as single days.
  const reA =
    /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–\-]\s*\d{1,2}(?:st|nd|rd|th)?)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/g;
  let m: RegExpExecArray | null;
  while ((m = reA.exec(lower)) !== null) {
    tryAdd(parseInt(m[1], 10), MONTH_MAP[m[2]], m[3] ? parseInt(m[3], 10) : defaultYear);
  }

  // Pattern B: "march 21", "march 21st", "march 21–23 2026"
  const reB =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–\-]\s*(\d{1,2})(?:st|nd|rd|th)?)?(?:\s+(\d{4}))?/g;
  while ((m = reB.exec(lower)) !== null) {
    const mo = MONTH_MAP[m[1]];
    const yr  = m[4] ? parseInt(m[4], 10) : defaultYear;
    tryAdd(parseInt(m[2], 10), mo, yr);
    if (m[3]) tryAdd(parseInt(m[3], 10), mo, yr); // end of range
  }

  if (candidates.length === 0) return null;
  // Return the earliest qualifying date (most imminent event first)
  return new Date(Math.min(...candidates));
}

// ---------------------------------------------------------------------------
// Nominatim reverse geocode  (for building a useful Serper query)
// ---------------------------------------------------------------------------

interface NominatimResponse {
  address?: {
    suburb?: string; neighbourhood?: string; city_district?: string;
    city?: string; town?: string; village?: string; county?: string;
  };
}

async function getAreaName(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=12`,
      { headers: { 'User-Agent': 'RecsForKids/1.0 (family activity app)' }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return 'nearby';
    const data: NominatimResponse = await res.json();
    const a = data.address ?? {};
    const local = a.suburb ?? a.neighbourhood ?? a.city_district ?? a.town ?? a.village ?? '';
    const city  = a.city ?? a.county ?? '';
    return (local && city) ? `${local}, ${city}` : local || city || 'nearby';
  } catch {
    return 'nearby';
  }
}

// ---------------------------------------------------------------------------
// Eventbrite
// ---------------------------------------------------------------------------

interface EventbriteVenue {
  name?: string;
  address?: { localized_address_display?: string };
}
interface EventbriteEvent {
  name?:   { text?: string };
  description?: { text?: string };
  start?:  { local?: string };
  end?:    { local?: string };
  is_free?: boolean;
  ticket_availability?: {
    minimum_ticket_price?: { display?: string };
    maximum_ticket_price?: { display?: string };
  };
  url?: string;
  venue?: EventbriteVenue;
  /** Event banner image — returned by default in the Events Search API response */
  logo?: {
    url?: string;
    original?: { url?: string };
  };
}
interface EventbriteResponse { events?: EventbriteEvent[]; }

function formatEventbriteDate(local?: string): string {
  if (!local) return 'This weekend';
  try {
    return new Date(local).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return 'This weekend'; }
}

async function fetchEventbriteEvents(
  lat: number,
  lon: number,
  window: DateWindow,
): Promise<LocalEvent[]> {
  const apiKey = process.env.EVENTBRITE_API_KEY;
  if (!apiKey) { console.warn('[events] EVENTBRITE_API_KEY not set — skipping Eventbrite'); return []; }

  try {
    const fmt = (ms: number) => new Date(ms).toISOString().split('.')[0] + 'Z';
    const params = new URLSearchParams({
      'location.latitude':       lat.toFixed(4),
      'location.longitude':      lon.toFixed(4),
      'location.within':         '10km',
      'categories':              '17',   // Family & Education
      'start_date.range_start':  fmt(window.todayStartMs),
      'start_date.range_end':    fmt(window.windowEndMs - 1),
      'expand':                  'venue',
      'page_size':               '12',
    });

    const res = await fetch(
      `https://www.eventbriteapi.com/v3/events/search/?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) { console.warn(`[events] Eventbrite ${res.status}`); return []; }

    const data: EventbriteResponse = await res.json();
    const events: LocalEvent[] = [];

    for (const ev of (data.events ?? []).slice(0, 8)) {
      const title = ev.name?.text?.trim();
      if (!title || !ev.start?.local) continue;

      // Double-check: event must not have already started AND ended
      const startMs = new Date(ev.start.local).getTime();
      if (startMs < window.todayStartMs) continue;

      let costDescription = 'Free';
      if (!ev.is_free) {
        const min = ev.ticket_availability?.minimum_ticket_price?.display;
        const max = ev.ticket_availability?.maximum_ticket_price?.display;
        costDescription = (min && max && min !== max) ? `${min}–${max}` : (min ?? max ?? 'Paid');
      }

      // Prefer the original (full-res) logo over the cropped variant
      const imageUrl = ev.logo?.original?.url ?? ev.logo?.url;

      events.push({
        title,
        dateDescription: formatEventbriteDate(ev.start.local),
        venue:           ev.venue?.name ?? ev.venue?.address?.localized_address_display,
        costDescription,
        summary:  ev.description?.text?.slice(0, 200),
        url:      ev.url,
        startsAt: ev.start.local,
        endsAt:   ev.end?.local ?? undefined,
        source:   'eventbrite',
        imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : undefined,
      });
    }

    console.log(`[events] Eventbrite: ${(data.events ?? []).length} raw → ${events.length} valid events`);
    return events;
  } catch (err) {
    console.warn('[events] Eventbrite fetch failed (non-fatal):', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Serper.dev  (date-scoped query + strict regex date validation)
// ---------------------------------------------------------------------------

interface SerperNewsResult {
  title?: string; snippet?: string; link?: string; date?: string;
  /** Article thumbnail — returned by Serper on most news results */
  imageUrl?: string;
}
interface SerperResponse {
  news?: SerperNewsResult[];
  organic?: SerperNewsResult[];
}

async function fetchSerperEvents(
  lat: number,
  lon: number,
  window: DateWindow,
): Promise<LocalEvent[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) { console.warn('[events] SERPER_API_KEY not set — skipping Serper'); return []; }

  const areaName = await getAreaName(lat, lon).catch(() => 'nearby');

  // Include the next 3 days as explicit date strings ("21 March OR 22 March OR 23 March").
  // This nudges Google to surface articles that contain machine-parseable date text —
  // making the regex extraction far more reliable without fetching the pages themselves.
  const dateTerms = Array.from({ length: 3 }, (_, i) =>
    formatDateUK(window.todayStartMs + i * 86_400_000)
  ).join(' OR ');
  const query = `kids family events ${areaName} ${dateTerms}`;

  try {
    const res = await fetch('https://google.serper.dev/news', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'gb', hl: 'en', num: 10 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.warn(`[events] Serper ${res.status}`); return []; }

    const data: SerperResponse = await res.json();
    const results = [...(data.news ?? []), ...(data.organic ?? [])].slice(0, 10);
    const events: LocalEvent[] = [];

    for (const r of results) {
      if (!r.title) continue;
      const cleanTitle = r.title.replace(/\s*[|\-–].*$/, '').trim();
      const searchText = `${cleanTitle} ${r.snippet ?? ''}`;

      // HARD FILTER — explicit date in current window required.
      // No publish-date ("r.date") inference.  No relative-term fallback.
      const extracted = extractExplicitDate(searchText, window);
      if (!extracted) continue;

      events.push({
        title: cleanTitle,
        dateDescription: extracted.toLocaleDateString('en-GB', {
          weekday: 'short', day: 'numeric', month: 'short',
        }),
        summary:  r.snippet?.slice(0, 200),
        url:      r.link,
        startsAt: extracted.toISOString(),
        // No endsAt for web results — fill route will use startsAt+24h as expiry.
        source:   'web',
        // Serper returns article thumbnails directly — use when available
        imageUrl: r.imageUrl && /^https?:\/\//i.test(r.imageUrl) ? r.imageUrl : undefined,
      });
    }

    console.log(`[events] Serper query="${query}" → ${results.length} raw → ${events.length} with valid dates`);
    if (events.length === 0 && results.length > 0) {
      console.log(`[events] Serper titles that failed date extraction: ${results.slice(0, 3).map(r => r.title).join(' | ')}`);
    }
    return events;
  } catch (err) {
    console.warn('[events] Serper fetch failed (non-fatal):', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch local family events from Eventbrite + Serper in parallel.
 *
 * Only events that:
 *   (a) start on or after today (London TZ), AND
 *   (b) start before today+8 days, AND
 *   (c) [Serper only] contain an explicit day+month date in their title/snippet
 *
 * …are included.  Returns at most 12 events.  Never throws.
 */
export async function fetchLocalEvents(lat: number, lon: number): Promise<LocalEvent[]> {
  const window = getLondonDateWindow();

  const [eventbriteEvents, serperEvents] = await Promise.all([
    fetchEventbriteEvents(lat, lon, window).catch(() => [] as LocalEvent[]),
    fetchSerperEvents(lat, lon, window).catch(() => [] as LocalEvent[]),
  ]);

  // Eventbrite first (structured + verified), then web results
  const combined = [...eventbriteEvents, ...serperEvents];

  // Deduplicate by normalised title
  const seen = new Set<string>();
  const deduped: LocalEvent[] = [];
  for (const ev of combined) {
    const key = ev.title.toLowerCase().replace(/\s+/g, '');
    if (!seen.has(key)) { seen.add(key); deduped.push(ev); }
  }

  console.log(`[events] Combined: ${eventbriteEvents.length} Eventbrite + ${serperEvents.length} Serper → ${deduped.length} deduped`);
  return deduped.slice(0, 12);
}
