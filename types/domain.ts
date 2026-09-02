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
  observedDate: string | null;
  fetchedAt: string;
  publishAt: string;
  visibility: EventVisibility;
  hiddenReason: string | null;
  playCount7d: number;
  consecutiveCount: number;
  firstSeenAt: string;
  comment: {
    id: string;
    body: string;
    updatedAt: string;
  } | null;
};

export type HomeTastemaker = {
  id: string;
  slug: string;
  name: string;
  roleLine: string;
  avatarUrl: string | null;
  latestTrack: { title: string; artists: string[] } | null;
  updatedAt: string | null;
};

export type PublicActivity = {
  id: string;
  kind: "listen" | "comment";
  tastemakerName: string;
  tastemakerSlug: string;
  trackTitle: string;
  artists: string[];
  comment: string | null;
  eventId: string;
  occurredAt: string;
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
  historyAccess: "teaser" | "full";
  totalEventCount30d: number;
  telegram: {
    available: boolean;
    connected: boolean;
    subscribed: boolean;
  };
  fixture: boolean;
  events: ListeningEvent[];
};

export type SessionUser = {
  id: string;
  role: Role;
  displayName: string;
  avatarUrl: string | null;
  yandexId: string;
  authContext: "yandex" | "owner_password";
};

export type AnalyticsSummary = {
  uniqueVisitors7d: number;
  profileViews7d: number;
  followClicks7d: number;
  follows7d: number;
  trackOpens7d: number;
  playlistOpens7d: number;
  returnVisitors7d: number;
  d1Retention: number;
  d7Retention: number;
};
