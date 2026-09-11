import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://oak-index-studio.netlify.app/sitemap.xml",
    host: "https://oak-index-studio.netlify.app"
  };
}
