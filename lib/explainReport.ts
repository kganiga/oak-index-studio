import { ExplainCostReport, ExplainExplanation, ExplainImprovement, QueryModel } from "./types";

const HIGH_COST_THRESHOLD = 50;

/**
 * Turns a parsed Explain cost report into a readable explanation: why Oak
 * picked the chosen index, why the others were rejected, and — grounded in
 * the currently parsed query's own predicates/order-by/paths — a checklist
 * of likely causes worth checking on the higher-cost candidates. This is
 * heuristic: Explain's cost output alone doesn't reveal a candidate's actual
 * index definition, so improvements are framed as "things to check," not
 * certainties.
 */
export function buildExplainExplanation(report: ExplainCostReport, model: QueryModel | null): ExplainExplanation {
  const { chosen, rejected } = report;

  const whyChosen = chosen
    ? `Oak's query optimizer asks every candidate index to estimate its cost for this query, then picks the cheapest plan. [${chosen.name}] estimated the lowest cost (${chosen.cost}), so Oak selected it.`
    : "No candidate indexes were parsed from the Explain output — nothing to explain yet.";

  const whyRejected = rejected.map((c) => {
    const delta = chosen ? c.cost - chosen.cost : 0;
    return {
      index: c.name,
      cost: c.cost,
      reason: `[${c.name}] estimated cost ${c.cost}${chosen ? ` (+${delta.toFixed(1)} vs. the chosen index)` : ""} — a higher cost means Oak expects to touch more nodes to answer the same query. Common causes: a broader includedPaths/path restriction, no propertyIndex/ordered/analyzed definition matching this query's predicates, or a node type rule that isn't scoped tightly enough.`
    };
  });

  const potentialImprovements: ExplainImprovement[] = [];

  if (model) {
    const orderedNames = model.orderBy.filter((o) => o.name !== ":nodeName").map((o) => o.name);
    if (orderedNames.length) {
      potentialImprovements.push({
        category: "missing-ordered",
        detail: `This query orders by ${orderedNames.join(", ")}. If a rejected candidate's index rule doesn't have ordered=true on ${orderedNames.length > 1 ? "these properties" : "this property"}, Oak falls back to sorting the full result set in memory — check each candidate's definition for ordered=true.`
      });
    }

    const filterProps = Object.values(model.props).filter((p) =>
      p.ops.some((o) => ["=", "!=", "in", "range", "like", "exists", "not"].includes(o))
    );
    if (filterProps.length) {
      potentialImprovements.push({
        category: "missing-property",
        detail: `This query filters on ${filterProps.map((p) => p.name).join(", ")}. If a rejected candidate's index rule has no propertyIndex definition for ${filterProps.length > 1 ? "one or more of these" : "this property"}, that condition is post-filtered in memory instead of seeked — check each candidate for a matching property definition.`
      });
    }

    if (model.paths.length) {
      potentialImprovements.push({
        category: "wrong-path",
        detail: `This query is scoped to ${model.paths.join(", ")}. A candidate whose includedPaths is broader (e.g. '/' or '/content') or doesn't cover this path at all will cost more, or won't be a valid match — check each candidate's includedPaths against ${model.paths.join(", ")}.`
      });
    } else {
      potentialImprovements.push({
        category: "wrong-path",
        detail: "This query has no path restriction, so every candidate index effectively covers the whole repository for this dimension — adding one (e.g. ISDESCENDANTNODE) would let Oak (and this report) tell candidates apart by includedPaths."
      });
    }
  }

  if (chosen && chosen.cost > HIGH_COST_THRESHOLD) {
    potentialImprovements.push({
      category: "cost-too-high",
      detail: `Even the chosen index's cost (${chosen.cost}) is high. Oak still expects to touch a large number of nodes — consider a tighter path restriction, a more specific node type, or verifying the query's most selective predicate actually has a matching property definition.`
    });
  }

  return { whyChosen, whyRejected, potentialImprovements };
}
