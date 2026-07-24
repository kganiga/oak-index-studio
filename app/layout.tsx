import type { Metadata } from "next";
import "./globals.css";

const TITLE = "Oak Index Studio — AEM Query Analysis & Oak Lucene Index Generator";
const DESCRIPTION =
  "Paste an AEM SQL2, XPath, or Query Builder query and get a production-shaped Oak lucene index definition, " +
  "an index health score, a heuristic performance estimate, query-quality checks, and best-practice guidance " +
  "for AEMaaCS and AEM 6.5.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Oak index", "AEM Oak index", "Jackrabbit Oak", "lucene index", "JCR-SQL2", "SQL2 query",
    "AEM query builder", "Oak query performance", "AEMaaCS index", "AEM 6.5 index", "Explain Query"
  ],
  robots: { index: true, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Oak Index Studio"
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
