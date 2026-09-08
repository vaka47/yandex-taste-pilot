import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/server/config";
import { getHomeDiscoveryData } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  let profiles: Awaited<ReturnType<typeof getHomeDiscoveryData>>["profiles"] = [];
  try {
    ({ profiles } = await getHomeDiscoveryData());
  } catch {
    // A sitemap must remain available while the database is restarting. The next
    // request will repopulate the dynamic profile entries from the live store.
  }
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: .6 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: .4 },
    ...profiles.map(profile => ({
      url: `${base}/t/${profile.slug}`,
      lastModified: profile.updatedAt || profile.updatedDate || profile.fetchedAt || undefined,
      changeFrequency: "daily" as const,
      priority: .9
    }))
  ];
}
