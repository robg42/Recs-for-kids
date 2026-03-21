export type TimeAvailable = '1-2h' | 'half-day' | 'full-day';
export type IndoorOutdoor = 'indoor' | 'outdoor' | 'either';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type Transport = 'car' | 'public';
export type ActivityCategory =
  | 'playground_adventure'
  | 'museum_mission'
  | 'soft_play'
  | 'cheap_cinema'
  | 'nature_walk'
  | 'at_home_creative'
  | 'local_event';

export type RejectionReason =
  | 'not_today'
  | 'too_expensive'
  | 'too_much_effort'
  | 'not_interested';

export interface ChildProfile {
  id: string;
  name: string;
  age: number;
  interests?: string; // free-text: e.g. "dinosaurs, drawing, football"
}

export interface ActivityFilters {
  timeAvailable: TimeAvailable;
  indoorOutdoor: IndoorOutdoor;
  energyLevel: EnergyLevel;
  transport: Transport;
  budgetPerChild: number;
  surpriseMe: boolean;
}

export interface Venue {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  openNow: boolean;
  type: string;
  photoName?: string;
  website?: string;
  phoneNumber?: string;
  openingHours?: string[]; // human-readable weekday descriptions
  priceLevel?: string;     // e.g. "PRICE_LEVEL_INEXPENSIVE"
}

export interface WhyItWorks {
  age: number;
  name: string;
  reason: string;
}

export interface Activity {
  id: string;
  title: string;
  emoji: string;
  category: ActivityCategory;
  costPerChild: number;
  plan: string[];
  whyItWorks: WhyItWorks[];
  duration: string;
  energyLevel: EnergyLevel;
  indoorOutdoor: IndoorOutdoor;
  venue: Venue | null;
}

export interface ActivityHistoryItem {
  id: string;
  activity: Activity;
  acceptedAt: string; // ISO date string
}

export interface RejectionFeedback {
  activityId: string;
  category: ActivityCategory;
  reason: RejectionReason;
  timestamp: string;
}

export interface CategoryWeights {
  playground_adventure: number;
  museum_mission: number;
  soft_play: number;
  cheap_cinema: number;
  nature_walk: number;
  at_home_creative: number;
  local_event: number;
}

export interface UserPreferences {
  children: ChildProfile[];
  categoryWeights: CategoryWeights;
  history: ActivityHistoryItem[];
  rejections: RejectionFeedback[];
  recentActivityIds: string[]; // for deduplication
}

export interface WeatherData {
  condition: string;
  description: string;
  temperatureCelsius: number;
  isRaining: boolean;
  icon: string;
}

// API request/response shapes
export interface GenerateActivitiesRequest {
  filters: ActivityFilters;
  children: ChildProfile[];
  coords: { lat: number; lon: number };
  recentActivityIds: string[];
  categoryWeights: CategoryWeights;
}

export interface GenerateActivitiesResponse {
  activities: Activity[];
  weather: WeatherData;
  error?: string;
}
