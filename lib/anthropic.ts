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

function buildPrompt(
  filters: ActivityFilters,
  children: ChildProfile[],
  venues: Venue[],
  weather: WeatherData,
  recentActivityIds: string[],
  categoryWeights: CategoryWeights
): string {
  const childrenDesc = children
    .map((c) => `${c.name} (age ${c.age})`)
    .join(' and ');

  const venueList =
    venues.length > 0
      ? venues
          .slice(0, 12)
          .map(
            (v) =>
              `- ${v.name} (${v.type}) at ${v.address}${v.rating ? ` — rated ${v.rating}/5` : ''}${v.openNow ? '' : ' [MAY BE CLOSED]'}`
          )
          .join('\n')
      : 'No nearby venues found — focus on at-home or outdoor activities requiring no specific venue.';

  // Find lowest-weight categories to avoid
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

  return `You are a creative family activity expert helping a parent plan a fun, low-cost outing.

FAMILY:
${children.map((c) => `- ${c.name}, age ${c.age}`).join('\n')}

TODAY'S CONDITIONS:
- Weather: ${weather.description}, ${weather.temperatureCelsius}°C${weather.isRaining ? ' (raining)' : ''}
- Time available: ${timeLabel[filters.timeAvailable] ?? filters.timeAvailable}
- Preference: ${filters.indoorOutdoor}
- Energy level: ${filters.energyLevel}
- Transport: ${filters.transport === 'car' ? 'has a car' : 'public transport only'}
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
- Explain why each activity works specifically for each child by name and age
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

  const prompt = buildPrompt(
    filters,
    children,
    venues,
    weather,
    recentActivityIds,
    categoryWeights
  );

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw =
      message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';

    // Strip markdown code blocks if present
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    const parsed = JSON.parse(cleaned) as Array<{
      title: string;
      emoji: string;
      category: ActivityCategory;
      costPerChild: number;
      plan: string[];
      whyItWorks: Array<{ age: number; name: string; reason: string }>;
      duration: string;
      energyLevel: EnergyLevel;
      indoorOutdoor: IndoorOutdoor;
      venue: { placeId: string; name: string; address: string } | null;
    }>;

    return parsed.slice(0, 3).map((a) => ({
      id: generateId(),
      title: a.title,
      emoji: a.emoji ?? '🎉',
      category: a.category,
      costPerChild: a.costPerChild ?? 0,
      plan: a.plan ?? [],
      whyItWorks: a.whyItWorks ?? [],
      duration: a.duration ?? '1-2 hours',
      energyLevel: a.energyLevel ?? filters.energyLevel,
      indoorOutdoor: a.indoorOutdoor ?? filters.indoorOutdoor,
      venue: a.venue
        ? {
            placeId: a.venue.placeId ?? '',
            name: a.venue.name,
            address: a.venue.address,
            openNow: true,
            type: 'venue',
          }
        : null,
    }));
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
