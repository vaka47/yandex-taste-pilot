import type { AnalyticsSummary, ListeningEvent, TastemakerProfile } from "@/types/domain";

const now = Date.now();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

export const fixtureEvents: ListeningEvent[] = [
  {
    id: "evt-sirotkin-kapli",
    track: { id: "search-sirotkin-kapli", albumId: null, title: "Капли", artists: ["Сироткин"], coverTone: "sunset", coverUrl: null, yandexUrl: "https://music.yandex.ru/search?text=%D0%A1%D0%B8%D1%80%D0%BE%D1%82%D0%BA%D0%B8%D0%BD%20%D0%9A%D0%B0%D0%BF%D0%BB%D0%B8" },
    observedAt: minutesAgo(7), observedDate: null, fetchedAt: minutesAgo(5), publishAt: minutesAgo(5), visibility: "public", hiddenReason: null, playCount7d: 4, consecutiveCount: 3, firstSeenAt: daysAgo(18)
  },
  {
    id: "evt-air-kyoto",
    track: { id: "search-air-kyoto", albumId: null, title: "Alone in Kyoto", artists: ["Air"], coverTone: "sky", coverUrl: null, yandexUrl: "https://music.yandex.ru/search?text=Air%20Alone%20in%20Kyoto" },
    observedAt: minutesAgo(42), observedDate: null, fetchedAt: minutesAgo(40), publishAt: minutesAgo(40), visibility: "public", hiddenReason: null, playCount7d: 2, consecutiveCount: 1, firstSeenAt: daysAgo(3)
  },
  {
    id: "evt-cameron-winter",
    track: { id: "search-cameron-heavy-metal", albumId: null, title: "Heavy Metal", artists: ["Cameron Winter"], coverTone: "acid", coverUrl: null, yandexUrl: "https://music.yandex.ru/search?text=Cameron%20Winter%20Heavy%20Metal" },
    observedAt: minutesAgo(96), observedDate: null, fetchedAt: minutesAgo(94), publishAt: minutesAgo(94), visibility: "public", hiddenReason: null, playCount7d: 6, consecutiveCount: 5, firstSeenAt: daysAgo(11)
  },
  {
    id: "evt-sky-embarrassing",
    track: { id: "search-sky-everything", albumId: null, title: "Everything Is Embarrassing", artists: ["Sky Ferreira"], coverTone: "violet", coverUrl: null, yandexUrl: "https://music.yandex.ru/search?text=Sky%20Ferreira%20Everything%20Is%20Embarrassing" },
    observedAt: minutesAgo(184), observedDate: null, fetchedAt: minutesAgo(181), publishAt: minutesAgo(181), visibility: "public", hiddenReason: null, playCount7d: 3, consecutiveCount: 2, firstSeenAt: daysAgo(1)
  },
  {
    id: "evt-oqjav-son",
    track: { id: "search-oqjav-son", albumId: null, title: "Сон", artists: ["OQJAV"], coverTone: "ink", coverUrl: null, yandexUrl: "https://music.yandex.ru/search?text=OQJAV%20%D0%A1%D0%BE%D0%BD" },
    observedAt: daysAgo(1), observedDate: null, fetchedAt: daysAgo(1), publishAt: daysAgo(1), visibility: "public", hiddenReason: null, playCount7d: 2, consecutiveCount: 1, firstSeenAt: daysAgo(29)
  },
  {
    id: "evt-saluki-ogney",
    track: { id: "search-saluki-ogney", albumId: null, title: "Огней", artists: ["SALUKI"], coverTone: "ember", coverUrl: null, yandexUrl: "https://music.yandex.ru/search?text=SALUKI%20%D0%9E%D0%B3%D0%BD%D0%B5%D0%B9" },
    observedAt: daysAgo(2), observedDate: null, fetchedAt: daysAgo(2), publishAt: daysAgo(2), visibility: "public", hiddenReason: null, playCount7d: 1, consecutiveCount: 1, firstSeenAt: daysAgo(2)
  }
];

export const fixtureProfile: TastemakerProfile = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "safonov-ivan",
  name: "Сафонов Иван",
  bio: "Музыка, к которой я возвращаюсь сам — без редакторской подборки и чужих рекомендаций.",
  roleLine: "автор пилота",
  avatarUrl: null,
  verified: true,
  status: "active",
  isPublic: true,
  publishEnabled: true,
  publicationDelaySeconds: 0,
  followerCount: 12864,
  playlistUrl: "https://music.yandex.ru/home",
  playlistTrackCount: 47,
  lastSyncAt: minutesAgo(3),
  viewerFollows: false,
  historyAccess: "full",
  totalEventCount30d: fixtureEvents.length,
  telegram: { available: false, connected: false, subscribed: false },
  fixture: true,
  events: fixtureEvents
};

export const fixtureAnalytics: AnalyticsSummary = {
  uniqueVisitors7d: 18420,
  profileViews7d: 24710,
  followClicks7d: 7240,
  follows7d: 6106,
  trackOpens7d: 6834,
  playlistOpens7d: 4721,
  returnVisitors7d: 3918,
  d1Retention: 28.4,
  d7Retention: 17.2
};

export const fixtureAdminTastemakers = [
  { ...fixtureProfile, visitors7d: 18420, trackOpens7d: 6834, playlistStatus: "healthy", connectionStatus: "connected" },
  { ...fixtureProfile, id: "10000000-0000-4000-8000-000000000002", slug: "max-volna", name: "Макс Волна", followerCount: 4287, status: "paused" as const, visitors7d: 7610, trackOpens7d: 1940, playlistStatus: "paused", connectionStatus: "connected" },
  { ...fixtureProfile, id: "10000000-0000-4000-8000-000000000003", slug: "sasha-luch", name: "Саша Луч", followerCount: 0, status: "invited" as const, visitors7d: 0, trackOpens7d: 0, playlistStatus: "not_created", connectionStatus: "pending" }
];
