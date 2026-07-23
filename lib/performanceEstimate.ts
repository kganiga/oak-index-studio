import { ComplexityLevel, PerformanceEstimate, PerformanceFactor, PropRestriction, QueryModel, SQL2SelectorModel } from "./types";

const ENUM_NAME = /(status|type|template|resourcetype|state|tag|category|lang|language|mode)/i;

type CardinalityBucket = "very-low" | "low" | "medium" | "high" | "unknown";

interface CardinalityGuess {
  bucket: CardinalityBucket;
  label: string;
  assumption: string;
}

function guessCardinality(p: PropRestriction): CardinalityGuess {
  if (p.type === "Boolean") {
    return { bucket: "very-low", label: "very low (2 values)", assumption: `${p.name} is Boolean — assumed exactly 2 distinct values, so an equality match is expected to hit roughly half the node type's population.` };
  }
  if (p.type === "Date") {
    return { bucket: "high", label: "high (near-continuous)", assumption: `${p.name} is a Date — assumed near-continuous distinct values, so exact-value equality is expected to be highly selective (range comparisons are assessed separately).` };
  }
  if (ENUM_NAME.test(p.name)) {
    return { bucket: "low", label: "low (~10-50 values assumed)", assumption: `${p.name}'s name suggests an enum-like field (status/type/template/tag/...) — assumed roughly 10-50 distinct values, not measured.` };
  }
  return { bucket: "unknown", label: "unknown (default: medium, 100s-1000s assumed)", assumption: `${p.name}'s cardinality can't be inferred from its name or type — defaulted to a medium assumption (100s-1000s of distinct values). This is a guess, not a measurement.` };
}

function selectivityFromOpsAndCardinality(p: PropRestriction, card: CardinalityGuess): "poor" | "moderate" | "good" {
  if (p.ops.includes("like") || p.ops.includes("contains")) return "moderate"; // depends entirely on term/prefix rarity, unknowable here
  if (p.nullCheck || p.ops.includes("not")) return "poor"; // "IS NULL" typically matches a large, unpredictable fraction
  if (p.ops.includes("range")) return "moderate";
  if (p.ops.includes("=") || p.ops.includes("!=")) {
    if (card.bucket === "very-low") return "poor";
    if (card.bucket === "low") return "moderate";
    return "good";
  }
  return "moderate";
}

function pushFactor(factors: PerformanceFactor[], name: string, estimate: string, impact: "low" | "medium" | "high", assumption: string) {
  factors.push({ name, estimate, impact, assumption });
}

/**
 * Estimates query complexity/cost from the parsed query model alone — no
 * repository access, no real index statistics, no Oak cost() values. Every
 * number here is a relative heuristic for comparing queries against each
 * other, not a prediction of real execution time or Oak's actual cost.
 */
export function estimatePerformance(model: QueryModel, selectorModel?: SQL2SelectorModel | null): PerformanceEstimate {
  const factors: PerformanceFactor[] = [];
  const assumptions: string[] = [
    "This estimator has no access to the real repository, its content, or Oak's actual index statistics — every number below is a relative heuristic for comparing queries, not a prediction of real query time.",
    "Property cardinality (how many distinct values a property has) is guessed from its name and declared type, never measured against real data.",
    "Range predicate width (how much of the value space a >, <, or BETWEEN-style condition actually covers) can't be determined from the query text alone.",
    "Join cost assumes Oak's documented per-selector-independent-then-merge execution model; the real cost depends on each selector's actual result-set size, which is unknown here."
  ];

  const props = Object.values(model.props);
  let score = 0;

  /* ---------- 1. index selectivity + 5. property cardinality assumptions ---------- */
  if (!props.length && !model.nodeScopeFulltext && !model.indexNodeName) {
    pushFactor(
      factors,
      "Index selectivity",
      "None — no property, fulltext, or nodename restriction at all.",
      "high",
      `The query only restricts by node type (${model.nodeType})${model.paths.length ? " and path" : ""} — every matching node is a candidate, so selectivity is assumed to be effectively 0%.`
    );
    assumptions.push("No predicates were found to assess cardinality for.");
  } else {
    const cardinalityGuesses = props.map((p) => ({ p, card: guessCardinality(p) }));
    for (const { p, card } of cardinalityGuesses) assumptions.push(card.assumption);

    const perPropSelectivity = props.map((p) => selectivityFromOpsAndCardinality(p, guessCardinality(p)));
    const best = perPropSelectivity.includes("good") ? "good" : perPropSelectivity.includes("moderate") ? "moderate" : "poor";
    pushFactor(
      factors,
      "Index selectivity",
      props.length
        ? `Best-case selectivity across ${props.length} propert${props.length > 1 ? "ies" : "y"}: ${best}. Oak evaluates ANDed conditions by intersecting, so the single most selective predicate dominates.`
        : model.nodeScopeFulltext
          ? "Fulltext-only — selectivity depends entirely on how rare the search term is in the corpus, which is unknown here."
          : "No property predicates besides nodename restriction.",
      best === "good" ? "low" : best === "moderate" ? "medium" : "high",
      "Selectivity is derived only from operator type (=, range, LIKE, IS NULL, ...) combined with the guessed cardinality above — never from actual value distribution."
    );

    pushFactor(
      factors,
      "Property cardinality assumptions",
      cardinalityGuesses.length
        ? cardinalityGuesses.map(({ p, card }) => `${p.name}: ${card.label}`).join("; ")
        : "No properties to assess.",
      cardinalityGuesses.some(({ card }) => card.bucket === "unknown" || card.bucket === "very-low") ? "medium" : "low",
      "Cardinality is guessed from property name and declared type only (Boolean → 2 values, Date → near-continuous, enum-like names → ~10-50 values, everything else defaults to an unverified 'medium' guess)."
    );

    if (perPropSelectivity.includes("poor") && best !== "poor") {
      score += 5; // at least one weak predicate present alongside a strong one — minor risk if planner picks the weak one
    }
    if (best === "poor") score += 20;
    else if (best === "moderate") score += 10;
  }

  /* ---------- 2. range predicate impact ---------- */
  const rangeProps = props.filter((p) => p.ops.includes("range"));
  if (!rangeProps.length) {
    pushFactor(factors, "Range predicate impact", "No range comparisons — no interval-width uncertainty.", "low", "N/A — no >, <, >=, <=, BETWEEN, or daterange predicates found.");
  } else {
    const impact = rangeProps.length >= 2 ? "high" : "medium";
    pushFactor(
      factors,
      "Range predicate impact",
      `${rangeProps.length} range predicate(s) on ${rangeProps.map((p) => p.name).join(", ")}. Cost scales with how much of the value space each interval covers.`,
      impact,
      "This parser can't tell a tightly-bounded range (e.g. a single day) from a wide-open one (e.g. 'after 2020') from the query text — assumed 'moderate, unknown width' for every range predicate found."
    );
    score += rangeProps.length >= 2 ? 20 : 10;
  }

  /* ---------- 3. join cost ---------- */
  if (!model.join) {
    pushFactor(factors, "Join cost", "No JOIN — zero join cost.", "low", "N/A — single-selector query.");
  } else {
    const selectorCount = selectorModel?.selectors.length ?? 2;
    const cartesianRisk = !!selectorModel?.joins.some((j) => {
      const refsBoth = j.condition && new RegExp(`\\b${j.left}\\b`).test(j.condition) && new RegExp(`\\b${j.right}\\b`).test(j.condition);
      return !refsBoth;
    });
    const impact = cartesianRisk ? "high" : selectorCount > 2 ? "high" : "medium";
    pushFactor(
      factors,
      "Join cost",
      cartesianRisk
        ? `${selectorCount} selectors, and at least one JOIN has no condition tying it to the other side — assumed cost scales with the PRODUCT of both selectors' result sizes, not the sum.`
        : `${selectorCount} selectors joined. Oak evaluates each independently against its own index, then merges in memory — assumed cost scales at least linearly with the smaller selector's result size, likely worse.`,
      impact,
      "Assumes Oak's documented join execution model (per-selector evaluation + in-memory merge); the real cost depends on each selector's actual matching row count, which this tool can't know."
    );
    score += cartesianRisk ? 35 : selectorCount > 2 ? 30 : 20;
  }

  /* ---------- 4. sorting cost ---------- */
  if (!model.orderBy.length) {
    pushFactor(factors, "Sorting cost", "No ORDER BY — zero sort cost.", "low", "N/A — query doesn't request an ordering.");
  } else {
    const n = model.orderBy.length;
    const impact = n >= 3 ? "high" : n >= 2 ? "medium" : "low";
    pushFactor(
      factors,
      "Sorting cost",
      `ORDER BY on ${n} propert${n > 1 ? "ies" : "y"}. A single ordered property can be pre-sorted by lucene cheaply; multiple properties typically fall back to an in-memory sort of the full result set.`,
      impact,
      "Assumes the generated index defines ordered=true on the sorted properties (as this app's own generator does) — if it doesn't, sorting cost is worse than estimated here."
    );
    score += n >= 3 ? 15 : n >= 2 ? 8 : 3;
  }

  /* ---------- 6. path restriction effectiveness ---------- */
  if (!model.paths.length) {
    pushFactor(
      factors,
      "Path restriction effectiveness",
      "No path restriction — 0% narrowing; the query spans the entire repository for this dimension.",
      "high",
      "N/A — no ISDESCENDANTNODE / ISCHILDNODE / path= found."
    );
    score += 25;
  } else if (model.paths.some((p) => p === "/" || p === "/content")) {
    pushFactor(
      factors,
      "Path restriction effectiveness",
      `Very broad path (${model.paths.join(", ")}) — assumed to narrow the repository only modestly.`,
      "medium",
      "Heuristic: '/' and '/content' are assumed to cover a large fraction of the repository. This tool has no real content-tree size or shape to check against."
    );
    score += 12;
  } else {
    const depth = Math.max(...model.paths.map((p) => p.split("/").filter(Boolean).length));
    pushFactor(
      factors,
      "Path restriction effectiveness",
      `Scoped path(s) (${model.paths.join(", ")}, depth ${depth}). Deeper paths are assumed to narrow the candidate set more.`,
      depth >= 3 ? "low" : "medium",
      "Heuristic only: path depth is used as a rough proxy for 'how much of the repository this excludes' — this tool has no actual knowledge of how content is distributed under that path."
    );
    score += depth >= 3 ? 2 : 6;
  }

  /* ---------- extra contributors not already counted above ---------- */
  if (model.leadingWildcards > 0) score += Math.min(30, model.leadingWildcards * 15);
  if (model.orCount >= 1) score += Math.min(20, (model.orCount + 1) * 6);
  if (model.unsupportedFns.length) score += Math.min(15, model.unsupportedFns.length * 8);

  score = Math.max(0, Math.min(100, score));
  const complexity: ComplexityLevel = score <= 35 ? "Low" : score <= 70 ? "Medium" : "High";

  const costLow = Math.round(5 + score * 0.3);
  const costHigh = Math.round(15 + score * 0.9);

  /* ---------- confidence ---------- */
  let confidence = 70;
  const confidenceNotes: string[] = [];
  if (!model.paths.length) { confidence -= 15; confidenceNotes.push("no path restriction to anchor the path-effectiveness estimate"); }
  const unknownCardCount = props.filter((p) => guessCardinality(p).bucket === "unknown").length;
  if (unknownCardCount) { confidence -= Math.min(20, unknownCardCount * 5); confidenceNotes.push(`${unknownCardCount} propert${unknownCardCount > 1 ? "ies" : "y"} with unverifiable cardinality`); }
  if (model.join) { confidence -= 10; confidenceNotes.push("a JOIN, whose real cost depends on data this tool doesn't have"); }
  if (model.nodeScopeFulltext) { confidence -= 10; confidenceNotes.push("fulltext search, whose cost depends on term frequency in the corpus"); }
  if (rangeProps.length) { confidence -= Math.min(15, rangeProps.length * 5); confidenceNotes.push(`${rangeProps.length} range predicate(s) of unknown width`); }
  confidence = Math.max(10, Math.min(75, confidence));

  const confidenceReasoning = confidenceNotes.length
    ? `Reduced from a 70-point ceiling (this tool never claims high confidence) for: ${confidenceNotes.join("; ")}.`
    : "At the 70-point ceiling this tool allows — no additional unknowns (join, fulltext, unresolvable cardinality, or ranges) were found, but this is still a heuristic estimate, not a measurement.";

  return {
    complexity,
    complexityScore: score,
    estimatedCostRange: { low: costLow, high: costHigh },
    confidence,
    confidenceReasoning,
    factors,
    assumptions,
    disclaimer: "All figures on this page are heuristic estimates derived from the query's shape alone — they are not, and are not intended to approximate, Oak's real cost() values. Always verify with an actual Explain Query against the target repository before drawing conclusions."
  };
}
