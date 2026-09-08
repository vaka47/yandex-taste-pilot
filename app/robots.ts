import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/server/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/auth/", "/creator/", "/following/", "/invite/"]
    },
    sitemap: `${appUrl()}/sitemap.xml`
  };
}
