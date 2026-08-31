export type Role = "user" | "creator" | "admin";
export type TastemakerStatus = "draft" | "invited" | "connected" | "active" | "paused" | "disconnected" | "archived";
export type EventVisibility = "public" | "hidden" | "pending";

export type Track = {
  id: string;
  albumId: string | null;
  title: string;
  artists: string[];
  coverTone: string;
  coverUrl: string | null;
  yandexUrl: string;
};

export type ListeningEvent = {
  id: string;
  track: Track;
  observedAt: string | null;
  fetchedAt: string;
  publishAt: string;
  visibility: EventVisibility;
  hiddenReason: string | null;
  playCount7d: number;
  consecutiveCount: number;
  firstSeenAt: string;
};

export type TastemakerProfile = {
  id: string;
  slug: string;
  name: string;
  bio: string;
  roleLine: string;
  avatarUrl: string | null;
  verified: boolean;
  status: TastemakerStatus;
  isPublic: boolean;
  publishEnabled: boolean;
  publicationDelaySeconds: number;
  followerCount: number;
  playlistUrl: string | null;
  playlistTrackCount: number;
  lastSyncAt: string | null;
  viewerFollows: boolean;
  fixture: boolean;
  events: ListeningEvent[];
};

export type SessionUser = {
  id: string;
  role: Role;
  displayName: string;
  avatarUrl: string | null;
  yandexId: string;
};

export type AnalyticsSummary = {
  uniqueVisitors7d: number;
  profileViews7d: number;
  followClicks7d: number;
  follows7d: number;
  trackOpens7d: number;
  playlistOpens7d: number;
  d1Retention: number;
  d7Retention: number;
};
