import Anthropic from '@anthropic-ai/sdk';
import type {
  Activity,
  ActivityFilters,
  ChildProfile,
  Venue,
  WeatherData,
  CategoryWeights,
  ActivityCategory,
  EnergyLevel,
  IndoorOutdoor,
  LocalEvent,
} from '@/types';

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

// Strip characters that could be used to inject new instructions into the prompt.
// Primary vectors: newlines (create new paragraphs/sections), backticks (close
// code fences), XML-like angle brackets (create fake <system>/<user> turns),
// and common markdown section dividers (---, ===, ###, TASK:, RULES: etc.).
function sanitiseForPrompt(value: string): string {
  return value
    .replace(/[\r\n`<>]/g, ' ')                    // newlines, code fences, angle brackets
    .replace(/^[-=#{]+\s*/gm, ' ')                 // markdown headers / hr lines at line start
    .replace(/\b(TASK|RULES|SYSTEM|INST|SYS)\s*:/gi, ' ')  // common prompt-injection keywords
    .replace(/\s{2,}/g, ' ')                        // collapse repeated spaces
    .trim();
}

const VALID_CATEGORIES = new Set<ActivityCategory>([
  'playground_adventure', 'museum_mission', 'soft_play', 'cheap_cinema',
  'nature_walk', 'at_home_creative', 'local_event',
]);
const VALID_ENERGY = new Set<EnergyLevel>(['low', 'medium', 'high']);
const VALID_IO = new Set<IndoorOutdoor>(['indoor', 'outdoor', 'either']);

function buildPrompt(
  filters: ActivityFilters,
  children: ChildProfile[],
  venues: Venue[],
  weather: WeatherData,
  recentActivityIds: string[],
  categoryWeights: CategoryWeights,
  count = 3,
  events: LocalEvent[] = [],
  focusNote = ''
): string {
  const safeChildren = children.map((c) => ({
    name: sanitiseForPrompt(c.name),
    age: c.age,
    gender: c.gender ?? null,
    interests: c.interests ? sanitiseForPrompt(c.interests) : null,
  }));

  const childrenDesc = safeChildren.map((c) => `${c.name} (age ${c.age})`).join(' and ');

  // Gender note: mention only to inform developmental context, not to assume interests
  const genderNote = safeChildren.some((c) => c.gender)
    ? `\nChild genders: ${safeChildren.map((c) => c.gender ? `${c.name} identifies as ${c.gender}` : null).filter(Boolean).join(', ')}. Use this for developmental context where genuinely relevant — do not make assumptions about interests based on gender.`
    : '';

  const venueList =
    venues.length > 0
      ? venues
          .slice(0, 20)
          .map(
            (v) =>
              `- ${sanitiseForPrompt(v.name)} (${sanitiseForPrompt(v.type)}) at ${sanitiseForPrompt(v.address)}${v.rating ? ` — rated ${v.rating}/5` : ''}${v.openNow ? '' : ' [MAY BE CLOSED]'}`
          )
          .join('\n')
      : 'No nearby venues found — focus on at-home or outdoor activities requiring no specific venue.';

  const sortedCategories = Object.entries(categoryWeights).sort(([, a], [, b]) => a - b);
  const avoidCategories = sortedCategories
    .slice(0, 2)
    .filter(([, w]) => w < 0.7)
    .map(([cat]) => cat);
  const avoidNote = avoidCategories.length > 0
    ? `\nCategories to avoid (user has rejected these repeatedly): ${avoidCategories.join(', ')}`
    : '';

  const timeLabel: Record<string, string> = {
    '1-2h': '1 to 2 hours',
    'half-day': 'a half day (3-4 hours)',
    'full-day': 'a full day',
  };

  const safeWeatherDesc = sanitiseForPrompt(weather.description);

  const eventsSection =
    events.length > 0
      ? `\nREAL LOCAL EVENTS HAPPENING THIS WEEKEND (use these when they suit the family):\n` +
        events
          .slice(0, 10)
          .map((ev) => {
            const urlPart = ev.url ? ` [URL: ${sanitiseForPrompt(ev.url).slice(0, 200)}]` : '';
            const parts = [
              `- "${sanitiseForPrompt(ev.title)}"`,
              ev.dateDescription ? `— ${sanitiseForPrompt(ev.dateDescription)}` : '',
              ev.venue ? `at ${sanitiseForPrompt(ev.venue)}` : '',
              ev.costDescription ? `(${sanitiseForPrompt(ev.costDescription)})` : '',
              ev.summary ? `: ${sanitiseForPrompt(ev.summary).slice(0, 120)}` : '',
              urlPart,
            ];
            return parts.filter(Boolean).join(' ');
          })
          .join('\n')
      : '';

  return `You are a creative family activity expert helping a parent plan a fun, low-cost outing.

FAMILY:
${safeChildren.map((c) => `- ${c.name}, age ${c.age}${c.interests ? ` (known interests: ${c.interests})` : ''}`).join('\n')}${genderNote}

TODAY'S CONDITIONS:
- Weather: ${safeWeatherDesc}, ${weather.temperatureCelsius}°C${weather.isRaining ? ' (raining)' : ''}
- Time available: ${timeLabel[filters.timeAvailable] ?? filters.timeAvailable}
- Preference: ${filters.indoorOutdoor}
- Energy level: ${filters.energyLevel}
- Transport: ${filters.transport === 'car' ? 'has a car' : filters.transport === 'walking' ? 'walking only (1.5km radius max)' : 'public transport only'}
- Budget: £${filters.budgetPerChild} per child maximum${avoidNote}

REAL NEARBY VENUES (use these — they are confirmed open and nearby):
${venueList}
${eventsSection}
TASK:
Generate exactly ${count} distinct activity ideas for ${childrenDesc}. Make each one feel like a mini adventure with a creative title, not a generic suggestion.${focusNote ? `\n\nFOCUS: ${focusNote}` : ''}

RULES:
- Use venues from the list above where possible (they are real and nearby)
- If fewer than ${count} suitable venues exist, some activities may be home-based (venue: null)
- Each activity must be distinct in type and feel — vary venues, energy levels, and activity types
- Cost MUST be under £${filters.budgetPerChild} per child
- Duration must fit within ${timeLabel[filters.timeAvailable] ?? filters.timeAvailable}
- ${weather.isRaining ? 'It is raining — strongly favour indoor activities or rain-proof plans' : ''}
- Titles should be imaginative (e.g. "Dinosaur Detective Mission" not "Museum Visit")
- Plans should have 3–5 clear, fun steps
- Explain why each activity works for each child using their age and developmental stage.
  Use known interests ONLY if listed above; do NOT invent personality traits.
- If REAL LOCAL EVENTS are listed above and suit this family, use them for 1–2 activities.
  For event-based activities, set sourceUrl to the event URL if provided.

RESPONSE FORMAT:
Return a JSON array of exactly ${count} activities. No other text, just the JSON.

[
  {
    "title": "string — creative, themed title",
    "emoji": "single emoji",
    "category": "playground_adventure | museum_mission | soft_play | cheap_cinema | nature_walk | at_home_creative | local_event",
    "costPerChild": number (in pounds, e.g. 5.00),
    "plan": ["step 1", "step 2", "step 3"],
    "whyItWorks": [
      { "age": number, "name": "child name", "reason": "specific reason for this age" }
    ],
    "duration": "e.g. 1.5 hours",
    "energyLevel": "low | medium | high",
    "indoorOutdoor": "indoor | outdoor",
    "venue": {
      "placeId": "from venues list",
      "name": "exact name from list",
      "address": "address from list"
    } or null for home-based activities,
    "sourceUrl": "URL string if based on a real event, otherwise omit this field"
  }
]`;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function validateActivity(
  a: unknown,
  fallbackEnergyLevel: EnergyLevel,
  fallbackIndoorOutdoor: IndoorOutdoor,
  originalVenues: Venue[] = []
): Activity | null {
  if (!a || typeof a !== 'object') return null;
  const raw = a as Record<string, unknown>;

  const title =
    typeof raw.title === 'string' && raw.title.trim().length > 0
      ? raw.title.trim().slice(0, 120)
      : 'Adventure Time';

  const emoji =
    typeof raw.emoji === 'string' && raw.emoji.trim().length <= 10
      ? raw.emoji.trim()
      : '🎉';

  const category = VALID_CATEGORIES.has(raw.category as ActivityCategory)
    ? (raw.category as ActivityCategory)
    : 'at_home_creative';

  const costPerChild =
    typeof raw.costPerChild === 'number' && raw.costPerChild >= 0 && raw.costPerChild <= 500
      ? raw.costPerChild
      : 0;

  const plan = Array.isArray(raw.plan)
    ? (raw.plan as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 10)
        .map((s) => s.slice(0, 300))
    : [];

  const whyItWorks = Array.isArray(raw.whyItWorks)
    ? (raw.whyItWorks as unknown[])
        .filter(
          (w): w is { age: number; name: string; reason: string } =>
            typeof w === 'object' && w !== null &&
            typeof (w as Record<string, unknown>).age === 'number' &&
            typeof (w as Record<string, unknown>).name === 'string' &&
            typeof (w as Record<string, unknown>).reason === 'string'
        )
        .slice(0, 6)
        .map((w) => ({
          age: Math.max(0, Math.min(17, Math.round(w.age))),
          name: w.name.slice(0, 50),
          reason: w.reason.slice(0, 300),
        }))
    : [];

  const duration =
    typeof raw.duration === 'string' ? raw.duration.slice(0, 50) : '1-2 hours';

  const energyLevel = VALID_ENERGY.has(raw.energyLevel as EnergyLevel)
    ? (raw.energyLevel as EnergyLevel)
    : fallbackEnergyLevel;

  const indoorOutdoor = VALID_IO.has(raw.indoorOutdoor as IndoorOutdoor)
    ? (raw.indoorOutdoor as IndoorOutdoor)
    : fallbackIndoorOutdoor;

  let venue: Activity['venue'] = null;
  if (raw.venue && typeof raw.venue === 'object') {
    const v = raw.venue as Record<string, unknown>;
    if (typeof v.name === 'string' && typeof v.address === 'string') {
      const placeId = typeof v.placeId === 'string' ? v.placeId.slice(0, 200) : '';
      const original =
        originalVenues.find((ov) => ov.placeId === placeId) ??
        originalVenues.find((ov) => ov.name.toLowerCase() === (v.name as string).toLowerCase());
      if (!original) {
        console.log(`[anthropic] VENUE NOT MATCHED: Claude said "${v.name}" (placeId="${placeId}"), ${originalVenues.length} originals available: [${originalVenues.map(ov => ov.name).join(', ')}]`);
      } else {
        console.log(`[anthropic] Venue matched: "${v.name}" → "${original.name}" (photo: ${original.photoName ? 'YES' : 'NO'})`);
      }
      venue = {
        placeId,
        name: (v.name as string).slice(0, 100),
        address: (v.address as string).slice(0, 200),
        openNow: original?.openNow ?? true,
        type: original?.type ?? 'venue',
        photoName: original?.photoName,
        website: original?.website,
        phoneNumber: original?.phoneNumber,
        openingHours: original?.openingHours,
        priceLevel: original?.priceLevel,
        rating: original?.rating,
      };
    }
  }

  // sourceUrl — only accept http/https URLs to prevent injection
  let sourceUrl: string | undefined;
  if (typeof raw.sourceUrl === 'string' && raw.sourceUrl.trim().length > 0) {
    const trimmed = raw.sourceUrl.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      sourceUrl = trimmed.slice(0, 500);
    }
  }

  return { id: generateId(), title, emoji, category, costPerChild, plan, whyItWorks, duration, energyLevel, indoorOutdoor, venue, sourceUrl };
}

export async function generateActivities(
  filters: ActivityFilters,
  children: ChildProfile[],
  venues: Venue[],
  weather: WeatherData,
  recentActivityIds: string[],
  categoryWeights: CategoryWeights,
  count = 3,
  events: LocalEvent[] = [],
  focusNote = ''
): Promise<Activity[]> {
  const client = getClient();
  if (!client) {
    console.warn('[anthropic] No API key — returning mock activities');
    return getMockActivities(children);
  }

  const prompt = buildPrompt(
    filters, children, venues, weather, recentActivityIds,
    categoryWeights, count, events, focusNote
  );

  // 20 activities × ~350 tokens = 7000 + overhead; cap at 8192
  const maxTokens = Math.min(8192, Math.max(2000, count * 380 + 600));

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const parsed: unknown = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      console.error('[anthropic] Response was not an array');
      return getMockActivities(children);
    }

    const activities = parsed
      .slice(0, count)
      .map((a) => validateActivity(a, filters.energyLevel, filters.indoorOutdoor, venues))
      .filter((a): a is Activity => a !== null);

    return activities.length > 0 ? activities : getMockActivities(children);
  } catch (err) {
    console.error('[anthropic] Generation failed:', err);
    return getMockActivities(children);
  }
}

function getMockActivities(children: ChildProfile[]): Activity[] {
  return [{
    id: generateId(),
    title: 'Pirate Treasure Hunt',
    emoji: '🏴‍☠️',
    category: 'playground_adventure',
    costPerChild: 0,
    plan: [
      'Head to your nearest park or playground',
      'Draw a simple treasure map together',
      'Set 3 hidden challenges around the playground',
      'Award a small treat to the winning team',
    ],
    whyItWorks: children.map((c) => ({
      age: c.age,
      name: c.name,
      reason: c.age <= 4
        ? 'Simple movement and imaginative play at their level'
        : 'Loves the challenge, storytelling, and sense of achievement',
    })),
    duration: '1.5 hours',
    energyLevel: 'high',
    indoorOutdoor: 'outdoor',
    venue: null,
  }];
}
