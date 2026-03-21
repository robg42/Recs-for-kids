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
} from '@/types';

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

// Strip characters that are meaningful as prompt instruction delimiters.
// Newlines are the primary injection vector — they allow user-controlled content
// to appear as separate instructions in the prompt.
function sanitiseForPrompt(value: string): string {
  return value.replace(/[\r\n`]/g, ' ').trim();
}

const VALID_CATEGORIES = new Set<ActivityCategory>([
  'playground_adventure',
  'museum_mission',
  'soft_play',
  'cheap_cinema',
  'nature_walk',
  'at_home_creative',
  'local_event',
]);
const VALID_ENERGY = new Set<EnergyLevel>(['low', 'medium', 'high']);
const VALID_IO = new Set<IndoorOutdoor>(['indoor', 'outdoor', 'either']);

function buildPrompt(
  filters: ActivityFilters,
  children: ChildProfile[],
  venues: Venue[],
  weather: WeatherData,
  recentActivityIds: string[],
  categoryWeights: CategoryWeights
): string {
  // Sanitise all user-controlled and external values before prompt interpolation
  const safeChildren = children.map((c) => ({
    name: sanitiseForPrompt(c.name),
    age: c.age,
    interests: c.interests ? sanitiseForPrompt(c.interests) : null,
  }));

  const childrenDesc = safeChildren.map((c) => `${c.name} (age ${c.age})`).join(' and ');

  const venueList =
    venues.length > 0
      ? venues
          .slice(0, 12)
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

  const avoidNote =
    avoidCategories.length > 0
      ? `\nCategories to avoid (user has rejected these repeatedly): ${avoidCategories.join(', ')}`
      : '';

  const timeLabel: Record<string, string> = {
    '1-2h': '1 to 2 hours',
    'half-day': 'a half day (3-4 hours)',
    'full-day': 'a full day',
  };

  // Sanitise weather description — comes from an external API
  const safeWeatherDesc = sanitiseForPrompt(weather.description);

  return `You are a creative family activity expert helping a parent plan a fun, low-cost outing.

FAMILY:
${safeChildren.map((c) => `- ${c.name}, age ${c.age}${c.interests ? ` (known interests: ${c.interests})` : ''}`).join('\n')}

TODAY'S CONDITIONS:
- Weather: ${safeWeatherDesc}, ${weather.temperatureCelsius}°C${weather.isRaining ? ' (raining)' : ''}
- Time available: ${timeLabel[filters.timeAvailable] ?? filters.timeAvailable}
- Preference: ${filters.indoorOutdoor}
- Energy level: ${filters.energyLevel}
- Transport: ${filters.transport === 'car' ? 'has a car' : filters.transport === 'walking' ? 'walking only (1.5km radius max)' : 'public transport only'}
- Budget: £${filters.budgetPerChild} per child maximum${avoidNote}

REAL NEARBY VENUES (use these — they are confirmed open and nearby):
${venueList}

TASK:
Generate exactly 3 distinct activity ideas for ${childrenDesc}. Make each one feel like a mini adventure with a creative title, not a generic suggestion.

RULES:
- Use venues from the list above where possible (they are real and nearby)
- If fewer than 3 suitable venues exist, one activity may be home-based (venue: null)
- Each activity must be distinct in type and feel
- Cost MUST be under £${filters.budgetPerChild} per child
- Duration must fit within ${timeLabel[filters.timeAvailable] ?? filters.timeAvailable}
- ${weather.isRaining ? 'It is raining — strongly favour indoor activities or rain-proof plans' : ''}
- Titles should be imaginative (e.g. "Dinosaur Detective Mission" not "Museum Visit")
- Plans should have 3–5 clear, fun steps
- Explain why each activity works for each child using their age, developmental stage, and any
  known interests listed in the FAMILY section. Do NOT invent interests or personality traits
  beyond what is explicitly listed.
  Good: "At 7, children enjoy rule-based challenges — and with an interest in dinosaurs, the
  fossil discovery trail will feel personally meaningful."
  Bad (no listed interests): "Chazzy has strong focus and loves detective activities."
  If no interests are listed, base reasoning solely on typical child development at that age.
- Vary the activities: different energy levels, different types

RESPONSE FORMAT:
Return a JSON array of exactly 3 activities. No other text, just the JSON.

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
    } or null for home-based activities
  }
]`;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Validate and clamp a single parsed activity from the AI response.
// Returns null if the activity is malformed beyond repair.
function validateActivity(
  a: unknown,
  fallbackEnergyLevel: EnergyLevel,
  fallbackIndoorOutdoor: IndoorOutdoor
): Activity | null {
  if (!a || typeof a !== 'object') return null;
  const raw = a as Record<string, unknown>;

  const title =
    typeof raw.title === 'string' && raw.title.trim().length > 0
      ? raw.title.trim().slice(0, 120)
      : 'Family Adventure';

  const emoji =
    typeof raw.emoji === 'string' && raw.emoji.trim().length <= 10
      ? raw.emoji.trim()
      : '🎉';

  const category = VALID_CATEGORIES.has(raw.category as ActivityCategory)
    ? (raw.category as ActivityCategory)
    : 'at_home_creative';

  const costPerChild =
    typeof raw.costPerChild === 'number' &&
    raw.costPerChild >= 0 &&
    raw.costPerChild <= 500
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
            typeof w === 'object' &&
            w !== null &&
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
      venue = {
        placeId: typeof v.placeId === 'string' ? v.placeId.slice(0, 200) : '',
        name: v.name.slice(0, 100),
        address: v.address.slice(0, 200),
        openNow: true,
        type: 'venue',
      };
    }
  }

  return {
    id: generateId(),
    title,
    emoji,
    category,
    costPerChild,
    plan,
    whyItWorks,
    duration,
    energyLevel,
    indoorOutdoor,
    venue,
  };
}

export async function generateActivities(
  filters: ActivityFilters,
  children: ChildProfile[],
  venues: Venue[],
  weather: WeatherData,
  recentActivityIds: string[],
  categoryWeights: CategoryWeights
): Promise<Activity[]> {
  const client = getClient();

  if (!client) {
    console.warn('[anthropic] No API key — returning mock activities');
    return getMockActivities(children);
  }

  const prompt = buildPrompt(filters, children, venues, weather, recentActivityIds, categoryWeights);

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw =
      message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';

    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    const parsed: unknown = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      console.error('[anthropic] Response was not an array');
      return getMockActivities(children);
    }

    const activities = parsed
      .slice(0, 3)
      .map((a) => validateActivity(a, filters.energyLevel, filters.indoorOutdoor))
      .filter((a): a is Activity => a !== null);

    return activities.length > 0 ? activities : getMockActivities(children);
  } catch (err) {
    console.error('[anthropic] Generation failed:', err);
    return getMockActivities(children);
  }
}

function getMockActivities(children: ChildProfile[]): Activity[] {
  return [
    {
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
        reason:
          c.age <= 4
            ? 'Simple movement and imaginative play at their level'
            : 'Loves the challenge, storytelling, and sense of achievement',
      })),
      duration: '1.5 hours',
      energyLevel: 'high',
      indoorOutdoor: 'outdoor',
      venue: null,
    },
  ];
}
