import {
  AnalysisResult,
  IndexDiffReport,
  PerformanceEstimate,
  QualityIssue,
  SelectorPropertyWarning,
  SQL2SelectorModel
} from "./types";
import { IndexHealthReport } from "./indexHealth";

export interface ReportInput {
  querySource: string;
  query: string;
  target: string;
  result: AnalysisResult;
  contentXml: string;
  indexHealth: IndexHealthReport | null;
  performanceEstimate: PerformanceEstimate | null;
  qualityIssues: QualityIssue[];
  selectorModel: SQL2SelectorModel | null;
  selectorPropertyWarnings: SelectorPropertyWarning[];
  indexDiffReport: IndexDiffReport | null;
  generatedAt: Date;
}

function mdList(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : "_none_";
}

/** Builds a readable Markdown report from already-computed analysis results — never re-derives anything. */
export function buildMarkdownReport(r: ReportInput): string {
  const lines: string[] = [];
  lines.push(`# Oak Index Studio Report`);
  lines.push(`Generated: ${r.generatedAt.toISOString()}  \nQuery source: ${r.querySource}  \nTarget: ${r.target === "cloud" ? "AEMaaCS" : "AEM 6.5"}  \nIndex name: \`${r.result.indexName}\``);
  lines.push(`\n## Query\n\`\`\`\n${r.query}\n\`\`\``);

  lines.push(`\n## Warnings\n${mdList(r.result.warnings)}`);
  lines.push(`\n## Suggestions\n${mdList(r.result.suggestions)}`);
  lines.push(`\n## Query cost score (heuristic, 0-100)\nBefore new index: ${r.result.scoreBefore}/100  \nAfter new index: ${r.result.scoreAfter}/100`);

  if (r.indexHealth) {
    lines.push(`\n## Index Health\nScore: ${r.indexHealth.score}/100 — ${r.indexHealth.category}\n`);
    lines.push(r.indexHealth.checks.map((c) => `- **${c.dimension}** (${c.target}) ${c.deduction > 0 ? `-${c.deduction}` : "✓"}: ${c.reasoning}`).join("\n"));
  }

  if (r.performanceEstimate) {
    const pe = r.performanceEstimate;
    lines.push(`\n## Performance Estimate (heuristic — not a measurement)\nComplexity: ${pe.complexity} (${pe.complexityScore}/100)  \nEstimated cost: ~${pe.estimatedCostRange.low}–${pe.estimatedCostRange.high} heuristic units  \nConfidence: ${pe.confidence}/100 — ${pe.confidenceReasoning}\n`);
    lines.push(pe.factors.map((f) => `- **${f.name}** [${f.impact}]: ${f.estimate}\n  - Assumption: ${f.assumption}`).join("\n"));
    lines.push(`\nAssumptions:\n${mdList(pe.assumptions)}`);
    lines.push(`\n> ${pe.disclaimer}`);
  }

  if (r.qualityIssues.length) {
    lines.push(`\n## Query Quality Issues`);
    lines.push(r.qualityIssues.map((q) => `- **${q.problem}** (impact: ${q.performanceImpact})\n  - Why: ${q.why}\n  - Recommended rewrite: ${q.recommendedRewrite}`).join("\n"));
  }

  if (r.selectorModel && r.selectorModel.selectors.length) {
    lines.push(`\n## SQL2 Selectors`);
    for (const s of r.selectorModel.selectors) {
      lines.push(`- **${s.alias}** (${s.nodeType}): ${s.properties.length ? s.properties.join(", ") : "no queried properties"}`);
    }
    for (const j of r.selectorModel.joins) {
      lines.push(`- Join (${j.type}): ${j.condition || "(no ON condition)"}`);
    }
  }

  if (r.selectorPropertyWarnings.length) {
    lines.push(`\n## Selector/Property Ownership Warnings`);
    lines.push(r.selectorPropertyWarnings.map((w) => `- **${w.property}** belongs to selector \`${w.owningSelector}\` (${w.owningNodeType}), not the generated index's \`${w.generatedIndexNodeType}\`. ${w.recommendation}`).join("\n"));
  }

  if (r.indexDiffReport && r.indexDiffReport.findings.length) {
    lines.push(`\n## Existing Index Comparison`);
    for (const bucket of ["Missing", "Extra", "Incorrect"] as const) {
      const items = r.indexDiffReport.findings.filter((f) => f.bucket === bucket);
      if (!items.length) continue;
      lines.push(`\n### ${bucket}`);
      lines.push(items.map((f) => `- **${f.target}** (${f.category}): ${f.detail}\n  - Suggested fix: ${f.suggestedFix}`).join("\n"));
    }
  }

  lines.push(`\n## Generated .content.xml\n\`\`\`xml\n${r.contentXml}\n\`\`\``);

  return lines.join("\n");
}

/** Wraps the markdown report content in a minimal, self-contained HTML document (no external resources). */
export function buildHtmlReport(r: ReportInput): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const section = (title: string, bodyHtml: string) => `<section><h2>${esc(title)}</h2>${bodyHtml}</section>`;
  const ul = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "<p class=\"muted\">none</p>");

  const parts: string[] = [];
  parts.push(section("Warnings", ul(r.result.warnings)));
  parts.push(section("Suggestions", ul(r.result.suggestions)));
  parts.push(section("Query cost score (heuristic, 0-100)", `<p>Before new index: <b>${r.result.scoreBefore}/100</b><br/>After new index: <b>${r.result.scoreAfter}/100</b></p>`));

  if (r.indexHealth) {
    parts.push(section(
      `Index Health — ${r.indexHealth.score}/100 (${r.indexHealth.category})`,
      `<ul>${r.indexHealth.checks.map((c) => `<li><b>${esc(c.dimension)}</b> (${esc(c.target)}) ${c.deduction > 0 ? `-${c.deduction}` : "✓"}: ${esc(c.reasoning)}</li>`).join("")}</ul>`
    ));
  }

  if (r.performanceEstimate) {
    const pe = r.performanceEstimate;
    parts.push(section(
      `Performance Estimate (heuristic) — ${pe.complexity}`,
      `<p>Complexity score: ${pe.complexityScore}/100 · Estimated cost: ~${pe.estimatedCostRange.low}–${pe.estimatedCostRange.high} heuristic units · Confidence: ${pe.confidence}/100</p>` +
      `<p class="muted">${esc(pe.confidenceReasoning)}</p>` +
      `<ul>${pe.factors.map((f) => `<li><b>${esc(f.name)}</b> [${f.impact}]: ${esc(f.estimate)}<br/><span class="muted">Assumption: ${esc(f.assumption)}</span></li>`).join("")}</ul>` +
      `<p class="muted"><b>Disclaimer:</b> ${esc(pe.disclaimer)}</p>`
    ));
  }

  if (r.qualityIssues.length) {
    parts.push(section(
      "Query Quality Issues",
      `<ul>${r.qualityIssues.map((q) => `<li><b>${esc(q.problem)}</b> (${q.performanceImpact})<br/>${esc(q.why)}<br/><span class="muted">Recommended: ${esc(q.recommendedRewrite)}</span></li>`).join("")}</ul>`
    ));
  }

  if (r.selectorPropertyWarnings.length) {
    parts.push(section(
      "Selector/Property Ownership Warnings",
      `<ul>${r.selectorPropertyWarnings.map((w) => `<li><b>${esc(w.property)}</b> belongs to selector <code>${esc(w.owningSelector)}</code>, not <code>${esc(w.generatedIndexNodeType)}</code>. ${esc(w.recommendation)}</li>`).join("")}</ul>`
    ));
  }

  if (r.indexDiffReport && r.indexDiffReport.findings.length) {
    const buckets = (["Missing", "Extra", "Incorrect"] as const)
      .map((bucket) => {
        const items = r.indexDiffReport!.findings.filter((f) => f.bucket === bucket);
        if (!items.length) return "";
        return `<h3>${bucket}</h3><ul>${items.map((f) => `<li><b>${esc(f.target)}</b>: ${esc(f.detail)}<br/><span class="muted">Fix: ${esc(f.suggestedFix)}</span></li>`).join("")}</ul>`;
      })
      .join("");
    parts.push(section("Existing Index Comparison", buckets));
  }

  parts.push(section("Generated .content.xml", `<pre>${esc(r.contentXml)}</pre>`));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Oak Index Studio Report — ${esc(r.result.indexName)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1.5rem; color: #1b2126; background: #f7f8fa; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #dde1e5; padding-bottom: 0.25rem; } h3 { font-size: 0.95rem; margin-top: 1rem; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  pre { background: #fff; border: 1px solid #dde1e5; padding: 0.75rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
  .muted { color: #5b6570; font-size: 0.9rem; }
  .meta { color: #5b6570; font-size: 0.9rem; }
  ul { padding-left: 1.25rem; } li { margin-bottom: 0.5rem; }
</style>
</head>
<body>
  <h1>Oak Index Studio Report</h1>
  <p class="meta">Generated ${esc(r.generatedAt.toISOString())} · Query source: ${esc(r.querySource)} · Target: ${r.target === "cloud" ? "AEMaaCS" : "AEM 6.5"} · Index: <code>${esc(r.result.indexName)}</code></p>
  <pre>${esc(r.query)}</pre>
  ${parts.join("\n")}
</body>
</html>`;
}

/** Aggregates only the actionable recommendation/fix strings across every analysis panel. */
export function buildRecommendationsText(r: ReportInput): string {
  const lines: string[] = [`Recommendations — ${r.result.indexName}`, ""];

  if (r.result.suggestions.length) {
    lines.push("From index generation:");
    lines.push(...r.result.suggestions.map((s) => `- ${s}`));
    lines.push("");
  }
  if (r.qualityIssues.length) {
    lines.push("From query quality analysis:");
    lines.push(...r.qualityIssues.map((q) => `- ${q.problem} → ${q.recommendedRewrite}`));
    lines.push("");
  }
  if (r.selectorPropertyWarnings.length) {
    lines.push("From selector/property ownership check:");
    lines.push(...r.selectorPropertyWarnings.map((w) => `- ${w.property} → ${w.recommendation}`));
    lines.push("");
  }
  if (r.indexDiffReport && r.indexDiffReport.findings.length) {
    lines.push("From existing-index comparison:");
    lines.push(...r.indexDiffReport.findings.map((f) => `- [${f.bucket}] ${f.target} → ${f.suggestedFix}`));
    lines.push("");
  }
  if (r.indexHealth) {
    const deducted = r.indexHealth.checks.filter((c) => c.deduction > 0);
    if (deducted.length) {
      lines.push("From index health check:");
      lines.push(...deducted.map((c) => `- ${c.dimension} (${c.target}) → ${c.reasoning}`));
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}
