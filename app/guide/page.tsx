import type { Metadata } from "next";
import Link from "next/link";
import { TreePine, ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck, Cpu, BookOpen, ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "AEM Oak Lucene Index Generator Guide & Best Practices",
  description:
    "Learn how Oak Index Studio parses AEM SQL2, XPath, and Query Builder queries to generate production-shaped Oak Lucene index definitions with rule-based reasoning for AEMaaCS and AEM 6.5.",
  alternates: {
    canonical: "/guide"
  },
  openGraph: {
    title: "AEM Oak Lucene Index Generator Guide — Oak Index Studio",
    description:
      "Why OakUtils is gone, how Oak Index Studio replaces it, and how deterministic rule-based indexing beats generic AI for AEM query optimization.",
    url: "https://oak-index-studio.netlify.app/guide",
    type: "article"
  }
};

const ARTICLE_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "Oak Index Studio: A Free Tool for Generating AEM Oak Lucene Indexes from Queries",
  description:
    "An in-depth guide on how Oak Index Studio replaces OakUtils to generate production-shaped Oak Lucene indexes from AEM SQL2, XPath, and Query Builder queries.",
  author: {
    "@type": "Person",
    name: "Khalil Ganiga",
    url: "https://khalilganiga.in"
  },
  publisher: {
    "@type": "Organization",
    name: "Oak Index Studio",
    url: "https://oak-index-studio.netlify.app"
  },
  datePublished: "2026-07-24",
  dateModified: "2026-09-11",
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://oak-index-studio.netlify.app/guide"
  }
};

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-ink text-fg selection:bg-oak/30 selection:text-oak">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_STRUCTURED_DATA) }}
      />

      {/* Navigation Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-panel/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-fg hover:text-oak">
            <TreePine className="h-5 w-5 text-oak" />
            <span>Oak Index Studio</span>
          </Link>
          <span className="text-dim">/</span>
          <span className="font-mono text-xs text-dim">guide</span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded border border-line bg-panel2 px-3 py-1.5 text-fg transition hover:border-oak hover:text-oak"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Studio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <article className="space-y-10">
          {/* Article Header */}
          <header className="space-y-4 border-b border-line pb-8">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-dim">
              <span className="rounded bg-panel2 px-2.5 py-1 text-oak">AEM &amp; Oak Optimization</span>
              <span>•</span>
              <time dateTime="2026-07-24">July 24, 2026</time>
              <span>•</span>
              <span>By Khalil Ganiga</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-fg md:text-4xl">
              Oak Index Studio: A Modern Tool for Generating AEM Oak Lucene Indexes
            </h1>
            <p className="text-lg leading-relaxed text-dim">
              OakUtils used to be the go-to tool for generating Oak Lucene indexes from AEM queries. It&apos;s no longer
              available, so Oak Index Studio was built to replace and surpass it — attaching deterministic, documentation-backed
              reasoning to every single attribute instead of opaque output.
            </p>
          </header>

          {/* Intro callout */}
          <div className="rounded-lg border border-line bg-panel p-5 text-sm leading-relaxed">
            <p>
              If you have spent real time in Adobe Experience Manager (AEM) performance tuning, you have likely encountered
              this scenario: you write an intuitive SQL2 or Query Builder query, test it locally on a light repository, and watch it
              fail in production with a <code>QueryTraversalException</code> because no index supports the property you filter on.
            </p>
            <p className="mt-3">
              Understanding Apache Jackrabbit Oak&apos;s Lucene indexing rules is notoriously nuanced. Questions like whether{" "}
              <code>ordered=true</code> needs <code>propertyIndex=true</code>, how <code>evaluatePathRestrictions</code> works, or
              how Cloud Manager treats index definition updates require consulting multiple dense docs. Oak Index Studio automates
              that entire process.
            </p>
          </div>

          {/* Section: What Oak Index Studio Does */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-fg">What Oak Index Studio Actually Does</h2>
            <p className="leading-relaxed text-dim">
              <Link href="/" className="font-medium text-oak underline decoration-oak/40 underline-offset-4 hover:decoration-oak">
                Oak Index Studio
              </Link>{" "}
              takes an AEM query in SQL2, XPath, or Query Builder syntax and produces a production-shaped Oak Lucene index definition.
              Every generated attribute includes transparent, line-by-line reasoning:
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded border border-line bg-panel p-4">
                <div className="flex items-center gap-2 font-mono text-xs font-semibold text-mint">
                  <CheckCircle2 className="h-4 w-4" />
                  Query-Quality Analysis
                </div>
                <p className="mt-2 text-xs leading-relaxed text-dim">
                  Flags conditions that no index can fix — such as leading-wildcard <code>LIKE &apos;%term&apos;</code> or Cartesian joins — and suggests actionable query rewrites.
                </p>
              </div>

              <div className="rounded border border-line bg-panel p-4">
                <div className="flex items-center gap-2 font-mono text-xs font-semibold text-oak">
                  <Cpu className="h-4 w-4" />
                  Index Health Score
                </div>
                <p className="mt-2 text-xs leading-relaxed text-dim">
                  Validates the index against 14 distinct rules (path scoping, <code>compatVersion</code>, async mode, null checks, node scope) and explains deductions.
                </p>
              </div>

              <div className="rounded border border-line bg-panel p-4">
                <div className="flex items-center gap-2 font-mono text-xs font-semibold text-warn">
                  <BookOpen className="h-4 w-4" />
                  Explain-Plan Cost Reader
                </div>
                <p className="mt-2 text-xs leading-relaxed text-dim">
                  Paste Oak&apos;s <code>explain</code> output to understand candidate index costs, why Oak picked a specific index, and why alternatives were rejected.
                </p>
              </div>

              <div className="rounded border border-line bg-panel p-4">
                <div className="flex items-center gap-2 font-mono text-xs font-semibold text-fg">
                  <ShieldCheck className="h-4 w-4" />
                  Existing Index Diffing
                </div>
                <p className="mt-2 text-xs leading-relaxed text-dim">
                  Paste your existing <code>.content.xml</code> to compare it against what your query actually requires, identifying missing, extra, or misconfigured properties.
                </p>
              </div>
            </div>
          </section>

          {/* Privacy section */}
          <section className="rounded-lg border border-mint/30 bg-mint/5 p-5 text-sm">
            <h2 className="flex items-center gap-2 font-semibold text-mint">
              <ShieldCheck className="h-5 w-5" />
              100% Client-Side Privacy Guarantee
            </h2>
            <p className="mt-2 leading-relaxed text-dim">
              Oak Index Studio has <strong>no backend server, no database, no analytics tracking, and no cookies</strong>.
              All parsing, AST analysis, scoring, and index generation occur entirely inside your browser tab.
              Your repository paths, property names, and query structures never leave your workstation.
            </p>
          </section>

          {/* Section: Why not LLMs */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-fg">Why Deterministic Rules Beat Generic AI Assistants</h2>
            <p className="leading-relaxed text-dim">
              Developers frequently prompt general-purpose LLMs (ChatGPT, Claude, Copilot) to write Oak index definitions.
              While plausible at first glance, generic models frequently fail subtle Oak constraints:
            </p>
            <ul className="space-y-2 text-sm text-dim">
              <li className="flex gap-2">
                <span className="font-mono text-danger">✗</span>
                <span>
                  <strong>Negated LIKE clauses:</strong> Generic LLMs often assign <code>propertyIndex=true</code> to a negated pattern (<code>NOT(prop LIKE &apos;...&apos;)</code>), unaware that Oak cannot bound an exclusion scan via an index.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-danger">✗</span>
                <span>
                  <strong>Superfluous path flags:</strong> Suggesting <code>evaluatePathRestrictions=true</code> on queries without path bounds bloats index doc-values unnecessarily.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-danger">✗</span>
                <span>
                  <strong>Sorting vs Filtering:</strong> Mistakenly requiring <code>propertyIndex=true</code> whenever <code>ordered=true</code> is set, even for sort-only properties where doc-values alone suffice.
                </span>
              </li>
            </ul>
            <p className="leading-relaxed text-dim">
              Oak Index Studio executes a deterministic, unit-tested engine mapped directly to the official Apache Jackrabbit Oak specifications.
              The same query yields the same mathematically verified index every single run.
            </p>
          </section>

          {/* Section: AEMaaCS vs AEM 6.5 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-fg">AEM as a Cloud Service (AEMaaCS) vs AEM 6.5</h2>
            <p className="leading-relaxed text-dim">
              Indexing mechanisms differ between on-premise AEM 6.5 and Cloud Service. Oak Index Studio handles these differences automatically:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-dim">
                    <th className="py-2 pr-4 font-semibold">Aspect</th>
                    <th className="py-2 pr-4 font-semibold text-oak">AEM as a Cloud Service</th>
                    <th className="py-2 font-semibold">AEM 6.5 / On-Premise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40 text-dim">
                  <tr>
                    <td className="py-2.5 pr-4 font-mono font-medium text-fg">Index Naming</td>
                    <td className="py-2.5 pr-4 font-mono text-mint">&lt;name&gt;-custom-&lt;version&gt; (e.g. cqPageLucene-custom-1)</td>
                    <td className="py-2.5 font-mono">Custom unique name under /oak:index</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono font-medium text-fg">Reindex Flag</td>
                    <td className="py-2.5 pr-4">Never set reindex=true; Cloud Manager manages builds</td>
                    <td className="py-2.5">Set reindex=true on deployment if restructuring</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono font-medium text-fg">Async Property</td>
                    <td className="py-2.5 pr-4 font-mono text-mint">[&quot;async&quot;, &quot;nrt&quot;]</td>
                    <td className="py-2.5 font-mono">&quot;async&quot;</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono font-medium text-fg">Package Target</td>
                    <td className="py-2.5 pr-4 font-mono">ui.apps: /oak:index</td>
                    <td className="py-2.5 font-mono">ui.apps: /oak:index</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section: Limitations */}
          <section className="space-y-4 rounded-lg border border-line bg-panel p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
              <AlertTriangle className="h-5 w-5 text-warn" />
              Transparent Limitations &amp; Best Practices
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-dim">
              <li>
                <strong>Static Analysis:</strong> Oak Index Studio examines query syntax. It cannot inspect live repository node counts or index statistics. Always run <code>Explain Query</code> in production or staging.
              </li>
              <li>
                <strong>Type Inference:</strong> Property types are inferred from literal formats and naming conventions. Review <code>type=</code> before merging to source control.
              </li>
              <li>
                <strong>OOTB Index Extensions:</strong> Whenever querying <code>cq:Page</code> or <code>dam:Asset</code>, extend existing OOTB indexes (e.g. <code>cqPageLucene-custom-N</code>) instead of introducing redundant indexes that double write-amplification.
              </li>
            </ul>
          </section>

          {/* Call to action */}
          <div className="flex flex-col items-center justify-between gap-4 rounded-lg border border-oak/30 bg-panel2 p-6 sm:flex-row">
            <div>
              <h3 className="font-semibold text-fg">Ready to optimize your AEM queries?</h3>
              <p className="text-xs text-dim">Paste any SQL2, XPath, or Query Builder query into Oak Index Studio.</p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded bg-oak px-4 py-2 font-mono text-xs font-semibold text-ink transition hover:opacity-90"
            >
              Open Studio Tool
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </article>
      </main>

      <footer className="border-t border-line bg-panel px-6 py-6 text-center text-xs text-dim">
        <p>
          Oak Index Studio is an independent community open-source tool, MIT licensed, not affiliated with or endorsed by Adobe.
        </p>
      </footer>
    </div>
  );
}
