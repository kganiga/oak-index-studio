import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oak Index Studio — AEM Query Analysis & Oak Lucene Index Generator",
    short_name: "Oak Index Studio",
    description: "Generate production-ready Apache Jackrabbit Oak Lucene index definitions from AEM SQL2, XPath, and Query Builder queries.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e1114",
    theme_color: "#d9a441",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
