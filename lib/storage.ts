import type {
  UserPreferences,
  ChildProfile,
  ActivityHistoryItem,
  RejectionFeedback,
  CategoryWeights,
  Activity,
  RejectionReason,
} from '@/types';

const STORAGE_KEY = 'recs-for-kids-prefs';
const MAX_RECENT_IDS = 20;

const DEFAULT_WEIGHTS: CategoryWeights = {
  playground_adventure: 1,
  museum_mission: 1,
  soft_play: 1,
  cheap_cinema: 1,
  nature_walk: 1,
  at_home_creative: 1,
  local_event: 1,
};

const DEFAULT_PREFS: UserPreferences = {
  children: [],
  categoryWeights: { ...DEFAULT_WEIGHTS },
  history: [],
  rejections: [],
  recentActivityIds: [],
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function loadPreferences(): UserPreferences {
  if (!isBrowser()) return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      children: parsed.children ?? [],
      categoryWeights: { ...DEFAULT_WEIGHTS, ...(parsed.categoryWeights ?? {}) },
      history: parsed.history ?? [],
      rejections: parsed.rejections ?? [],
      recentActivityIds: parsed.recentActivityIds ?? [],
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePreferences(prefs: UserPreferences): void {
  if (!isBrowser()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function saveChildren(children: ChildProfile[]): void {
  const prefs = loadPreferences();
  savePreferences({ ...prefs, children });
}

export function acceptActivity(activity: Activity): void {
  const prefs = loadPreferences();

  const historyItem: ActivityHistoryItem = {
    id: `${activity.id}-${Date.now()}`,
    activity,
    acceptedAt: new Date().toISOString(),
  };

  // Boost the accepted category
  const newWeights = { ...prefs.categoryWeights };
  newWeights[activity.category] = Math.min(3, (newWeights[activity.category] ?? 1) + 0.3);

  // Track recent IDs to avoid repetition
  const recentActivityIds = [activity.id, ...prefs.recentActivityIds].slice(
    0,
    MAX_RECENT_IDS
  );

  savePreferences({
    ...prefs,
    history: [historyItem, ...prefs.history].slice(0, 100), // keep last 100
    categoryWeights: newWeights,
    recentActivityIds,
  });
}

export function rejectActivity(
  activity: Activity,
  reason: RejectionReason
): void {
  const prefs = loadPreferences();

  const feedback: RejectionFeedback = {
    activityId: activity.id,
    category: activity.category,
    reason,
    timestamp: new Date().toISOString(),
  };

  // Reduce weight for the rejected category (except not_today which is circumstantial)
  const newWeights = { ...prefs.categoryWeights };
  if (reason !== 'not_today') {
    newWeights[activity.category] = Math.max(0.1, (newWeights[activity.category] ?? 1) - 0.2);
  }

  savePreferences({
    ...prefs,
    rejections: [feedback, ...prefs.rejections].slice(0, 200),
    categoryWeights: newWeights,
  });
}

export function clearHistory(): void {
  const prefs = loadPreferences();
  savePreferences({ ...prefs, history: [], recentActivityIds: [] });
}
