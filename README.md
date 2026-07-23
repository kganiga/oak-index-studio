# Oak Index Studio

Paste an AEM query (SQL2, XPath, or Query Builder) and get a production-shaped
Oak lucene index definition with reasoning for every attribute — plus a full
suite of analysis around it: an index health score, a heuristic performance
estimate (complexity, cost range, confidence, with every assumption spelled
out), query-quality checks (LIKE/wildcards, negation, joins, cartesian risk,
large IN()/ORDER BY, and more), a per-selector breakdown for JOINs, and
selector-ownership warnings when a property belongs to the wrong node type.

Paste an existing `.content.xml` to diff it against what the query actually
needs (missing/extra/incorrect properties, wrong paths, suggested fixes), or
paste Explain output to see why Oak picked one index over another. Every
finding is cross-referenced against a built-in knowledge base of Oak/AEM best
practices, common mistakes, and Cloud-vs-AMS-specific guidance.

Also: Markdown/HTML report export, copyable recommendations, a shareable URL
that round-trips the full session, local history with side-by-side
comparison, light/dark themes, and keyboard shortcuts. Targets AEMaaCS and
AEM 6.5.

## Run

Requirements: Node.js 18.17+ (20/22 recommended).

    npm install
    npm run dev

Open http://localhost:3000. Production build: `npm run build && npm start`.

## How to use

1. Pick a tab (SQL2 / XPath / QueryBuilder) and paste your query — analysis
   is live, no button.
2. Optionally paste `explain` output in the Explain tab; it refines the
   analysis of the query in the other tabs (traversal detection, currently
   selected index).
3. Toggle AEMaaCS / AEM 6.5 in the header — affects index naming
   (`-custom-1` suffix), async mode (nrt), and deployment advice.
4. Right panel: JSON, .content.xml, RepoInit, node tree, and ui.apps
   package layout. Copy or download.

## Honest limits (read this)

- **Static analysis.** The tool sees the query, not your repository. Real
  Oak cost estimation uses index statistics and node counts — the
  performance scores here are heuristics. Always verify with Explain Query
  after deploying.
- **Type inference is best-effort.** A query cannot prove a property is
  multi-valued or Date-typed; inference uses literals and naming
  conventions. Review `type=` before deploying.
- **"Extend existing index" needs input it doesn't have.** Without your
  current index definitions, the tool can only suggest extension when
  Explain output names the currently selected index.
- **Parsers are regex-based**, not a full grammar. They cover the common
  90% of AEM queries; exotic constructs land in parser notes/warnings
  instead of silently producing a wrong index.
- Joins, leading-wildcard LIKE, and LENGTH() cannot be fixed by any index;
  the tool tells you why instead of pretending.
