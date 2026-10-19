import type { MetadataRoute } from "next";
import { APP_URL } from "@/lib/const";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    ...(APP_URL ? { sitemap: `${APP_URL}/sitemap.xml`, host: new URL(APP_URL).origin } : {}),
  };
}
