import type { Metadata } from "next";
import "./globals.css";

const TITLE = "Oak Index Studio — AEM Query Analysis & Oak Lucene Index Generator";
const DESCRIPTION =
  "Paste an AEM SQL2, XPath, or Query Builder query and get a production-shaped Oak lucene index definition, " +
  "an index health score, a heuristic performance estimate, query-quality checks, and best-practice guidance " +
  "for AEMaaCS and AEM 6.5.";

export const metadata: Metadata = {
  metadataBase: new URL("https://oak-index-studio.netlify.app"),
  title: {
    default: TITLE,
    template: "%s | Oak Index Studio"
  },
  description: DESCRIPTION,
  applicationName: "Oak Index Studio",
  authors: [{ name: "Khalil Ganiga", url: "https://khalilganiga.in" }],
  creator: "Khalil Ganiga",
  publisher: "Oak Index Studio",
  keywords: [
    "Oak index",
    "AEM Oak index",
    "Jackrabbit Oak",
    "lucene index",
    "JCR-SQL2",
    "SQL2 query",
    "AEM query builder",
    "Oak query performance",
    "AEMaaCS index",
    "AEM 6.5 index",
    "Explain Query",
    "OakUtils",
    "OakUtils alternative",
    "Adobe Experience Manager indexing",
    "AEM index definition generator",
    "index health score",
    "Oak index best practices"
  ],
  alternates: {
    canonical: "/"
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://oak-index-studio.netlify.app",
    siteName: "Oak Index Studio",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1280,
        height: 720,
        alt: TITLE
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.jpg"]
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined
  }
};

const THEME_INIT = `
(function () {
  try {
    var t = localStorage.getItem("oak-index-studio:theme");
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {}
})();
`;

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Oak Index Studio",
  url: "https://oak-index-studio.netlify.app",
  description: DESCRIPTION,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript. Requires HTML5.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD"
  },
  featureList: [
    "JCR-SQL2, XPath, and Query Builder query parsing",
    "Production-ready Oak Lucene index generator for AEMaaCS and AEM 6.5",
    "Index Health Score with 14 best-practice checks",
    "Static heuristic performance and cost estimation",
    "Query Explain plan cost and index selection analyzer",
    "Existing .content.xml index diffing against query requirements",
    "Export to .content.xml, RepoInit, OSGi ui.apps package, and JSON",
    "100% Client-Side Privacy: zero backend data transfer"
  ],
  author: {
    "@type": "Person",
    name: "Khalil Ganiga",
    url: "https://khalilganiga.in"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
