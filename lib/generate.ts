import { AnalysisResult, ExplainInfo, PropRestriction, QueryModel, Reason, SQL2SelectorModel, getProp } from "./types";
import { buildSuggestions, buildWarnings, scoreQuery, Target } from "./validate";

export type { Target };

function camelName(nodeType: string): string {
  const parts = nodeType.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts
    .map((p, i) => (i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}

export function sanitizeDefNodeName(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const out = parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
  return out || "prop";
}

/** Builds the `properties` node-def entries for one rule's property subset. Pure per call — used once per node type/selector. */
function buildRuleProperties(props: PropRestriction[], reasons: Reason[], warnings: string[]): Record<string, Record<string, unknown>> {
  const ruleProps: Record<string, Record<string, unknown>> = {};
  const usedDefNames = new Set<string>();

  for (const p of props) {
    let defName = sanitizeDefNodeName(p.name);
    while (usedDefNames.has(defName)) defName += "X";
    usedDefNames.add(defName);
    const pd: Record<string, unknown> = { "jcr:primaryType": "nt:unstructured" };

    if (p.func) {
      pd.function = `${p.func}([${p.name}])`;
      reasons.push({ target: p.name, attribute: `function=${pd.function}`, why: `Query wraps the property in ${p.func.toUpperCase()}() — a function-based definition indexes the transformed value so the condition stays index-resolvable (Oak 1.6+).` });
    } else {
      pd.name = p.name;
    }

    const wantsPropertyIndex =
      p.ops.some((o) => ["=", "!=", "in", "range", "like", "exists", "not", "order"].includes(o)) || p.ordered;
    if (wantsPropertyIndex) {
      pd.propertyIndex = true;
      reasons.push({ target: p.name, attribute: "propertyIndex=true", why: `Query filters on this property (${p.ops.filter(o=>o!=="order").join(", ") || "sort only"}) — without propertyIndex the value is not stored for lookup and the condition would be post-filtered.` });
    }
    if (p.ordered) {
      pd.ordered = true;
      reasons.push({ target: p.name, attribute: "ordered=true", why: p.ops.includes("range") ? "Range comparison (>, <, BETWEEN, daterange) needs ordered storage to seek instead of scanning all values." : "ORDER BY on this property — ordered=true lets lucene return results pre-sorted; otherwise Oak sorts the full result set in memory." });
    }
    if (p.analyzed) {
      pd.analyzed = true;
      reasons.push({ target: p.name, attribute: "analyzed=true", why: "CONTAINS()/fulltext targets this property — tokenized (analyzed) storage is required for full-text matching." });
    }
    if (p.type !== "String") {
      pd.type = p.type;
      reasons.push({ target: p.name, attribute: `type=${p.type}`, why: `Value/format in the query implies ${p.type}; typed storage makes range comparison and ordering correct (string-ordered dates/numbers sort wrongly).` });
    }
    if (p.facet) {
      pd.facets = true;
      pd.propertyIndex = pd.propertyIndex ?? true;
      reasons.push({ target: p.name, attribute: "facets=true", why: "rep:facet() requested on this property — doc values for facet counting." });
    }
    if (p.notNullCheck) {
      pd.notNullCheckEnabled = true;
      reasons.push({ target: p.name, attribute: "notNullCheckEnabled=true", why: "IS NOT NULL / exists restriction — indexes property existence." });
    }
    if (p.nullCheck) {
      pd.nullCheckEnabled = true;
      warnings.push(`nullCheckEnabled on ${p.name}: 'IS NULL' indexing stores an entry for every node of the rule that lacks the property — use sparingly, it can dominate index size.`);
      reasons.push({ target: p.name, attribute: "nullCheckEnabled=true", why: "IS NULL / operation=not restriction — indexes property absence." });
    }
    // multi-value: lucene indexes each value of a multi-valued property automatically; no 'multi' flag exists.
    if (p.multi) {
      reasons.push({ target: p.name, attribute: "(multi-valued)", why: "Multi-valued property (e.g. cq:tags): lucene indexes every value automatically — no extra flag needed. A 'multi=true' setting does not exist in Oak lucene definitions." });
    }
    ruleProps[defName] = pd;
  }
  return ruleProps;
}

interface SelectorGroup {
  nodeType: string;
  alias: string;
  props: PropRestriction[];
}

/**
 * Splits the flat, cross-selector property list by which JOIN selector each
 * property actually belongs to, using the already-computed SQL2SelectorModel.
 * Oak evaluates indexRules strictly per node type, so a property queried on
 * a joined selector (e.g. dam:Asset) cannot live under the primary
 * selector's rule (e.g. cq:Page) — it needs its own rule entirely.
 * Single-selector queries (or non-SQL2 sources without a selector model)
 * fall through unchanged: one group holding every property, exactly as
 * before this function existed.
 */
function splitPropsBySelector(
  model: QueryModel,
  props: PropRestriction[],
  selectorModel: SQL2SelectorModel | null | undefined,
  warnings: string[]
): { primary: SelectorGroup; extras: SelectorGroup[] } {
  if (!selectorModel || selectorModel.selectors.length < 2) {
    return { primary: { nodeType: model.nodeType, alias: "", props }, extras: [] };
  }

  const claimed = new Set<string>();
  const groups: SelectorGroup[] = selectorModel.selectors.map((s) => {
    const groupProps = props.filter((p) => s.properties.includes(p.name));
    groupProps.forEach((p) => claimed.add(p.name));
    return { nodeType: s.nodeType, alias: s.alias, props: groupProps };
  });

  const unclaimed = props.filter((p) => !claimed.has(p.name));
  if (unclaimed.length) {
    warnings.push(
      `${unclaimed.map((p) => p.name).join(", ")}: could not resolve which JOIN selector this propert${unclaimed.length > 1 ? "ies belong" : "y belongs"} to — indexed under ${model.nodeType} as a fallback; verify this is correct.`
    );
    groups[0].props = [...groups[0].props, ...unclaimed];
  }

  return { primary: groups[0], extras: groups.slice(1) };
}

export function generate(model: QueryModel, explain: ExplainInfo, target: Target, selectorModel?: SQL2SelectorModel | null): AnalysisResult {
  const reasons: Reason[] = [];
  const suggestions: string[] = [];

  // Fold ORDER BY into property model
  for (const ob of model.orderBy) {
    if (ob.name === ":nodeName") continue;
    const p = getProp(model, ob.name);
    p.ordered = true;
    if (!p.ops.includes("order")) p.ops.push("order");
  }

  const props = Object.values(model.props);
  const base = model.nodeType === "nt:base" ? "custom" : camelName(model.nodeType);
  const indexName = `${base}Lucene${target === "cloud" ? "-custom-1" : ""}`;

  /* ---------- warnings ---------- */
  const warnings = buildWarnings(model, explain, props);
  if (explain.provided && explain.usedIndex) {
    suggestions.push(
      `Explain shows Oak currently selects /oak:index/${explain.usedIndex}. Before deploying a new index, check whether extending ${explain.usedIndex} with the missing property definitions below is cheaper — fewer indexes means less write amplification on every commit.`
    );
  }

  /* ---------- index definition ---------- */
  const def: Record<string, unknown> = {
    "jcr:primaryType": "oak:QueryIndexDefinition",
    type: "lucene",
    compatVersion: 2,
    async: target === "cloud" ? ["async", "nrt"] : ["async"],
  };
  reasons.push({ target: "index root", attribute: "type=lucene / compatVersion=2", why: "Lucene compat 2 is the only index type supporting the combination of property, ordered, analyzed and facet definitions in one index; required on AEMaaCS." });
  reasons.push({ target: "index root", attribute: `async=${JSON.stringify(def.async)}`, why: target === "cloud" ? "Async + NRT: near-real-time updates between async cycles, standard for AEMaaCS." : "Asynchronous indexing keeps commits fast; add 'nrt' only if sub-5s visibility is required." });

  if (model.paths.length) {
    def.includedPaths = [...new Set(model.paths)];
    def.queryPaths = def.includedPaths;
    def.evaluatePathRestrictions = true;
    reasons.push({ target: "index root", attribute: `includedPaths=${JSON.stringify(def.includedPaths)}`, why: "Only content under the query's path restriction is indexed — smaller index, faster reindex." });
    reasons.push({ target: "index root", attribute: "evaluatePathRestrictions=true", why: "Stores :ancestors so ISDESCENDANTNODE / path= is evaluated inside lucene instead of post-filtering every hit." });
    reasons.push({ target: "index root", attribute: "queryPaths", why: "Tells the query engine this index only answers queries under these paths — prevents wrong index selection for unrelated queries." });
  } else if (props.length || model.nodeScopeFulltext) {
    def.evaluatePathRestrictions = true;
    reasons.push({ target: "index root", attribute: "evaluatePathRestrictions=true", why: "Kept on even without includedPaths so future path-restricted variants of this query still evaluate paths in the index." });
  }

  /* ---------- properties, split by JOIN selector when there is more than one ---------- */
  const { primary, extras } = splitPropsBySelector(model, props, selectorModel, warnings);

  const ruleProps = buildRuleProperties(primary.props, reasons, warnings);

  if (model.nodeScopeFulltext && !primary.props.some((p) => p.analyzed)) {
    ruleProps["allText"] = {
      "jcr:primaryType": "nt:unstructured",
      name: "^[^\\/]*$",
      isRegexp: true,
      analyzed: true,
      nodeScopeIndex: true
    };
    reasons.push({ target: "* (all properties)", attribute: "nodeScopeIndex=true (regex def)", why: "Node-scope CONTAINS(., ...) — every string property of the node must feed the node's full-text field. Regex definition covers all direct properties." });
    warnings.push("Node-scope fulltext with a regex property definition indexes every property — expect a larger index. If you know which properties actually need to be searchable, replace the regex with explicit analyzed definitions.");
  }
  if (model.nodeScopeFulltext) {
    for (const p of primary.props.filter((x) => x.analyzed)) {
      const dn = Object.keys(ruleProps).find((k) => ruleProps[k].name === p.name || ruleProps[k].function);
      if (dn) ruleProps[dn].nodeScopeIndex = true;
    }
  }

  const rule: Record<string, unknown> = { "jcr:primaryType": "nt:unstructured" };
  if (model.indexNodeName) {
    rule.indexNodeName = true;
    reasons.push({ target: model.nodeType, attribute: "indexNodeName=true", why: "NAME()/LOCALNAME()/nodename predicate — node names are indexed as :nodeName so name restrictions resolve in the index." });
  }
  rule.properties = { "jcr:primaryType": "nt:unstructured", ...ruleProps };

  const indexRules: Record<string, unknown> = { "jcr:primaryType": "nt:unstructured", [model.nodeType]: rule };
  reasons.push({ target: "index root", attribute: `indexRules/${model.nodeType}`, why: `Rule scoped to ${model.nodeType} — only nodes of this type (and subtypes) are indexed, keeping the index minimal.` });

  for (const extra of extras) {
    if (!extra.props.length) continue;
    const extraRuleProps = buildRuleProperties(extra.props, reasons, warnings);
    indexRules[extra.nodeType] = {
      "jcr:primaryType": "nt:unstructured",
      properties: { "jcr:primaryType": "nt:unstructured", ...extraRuleProps }
    };
    reasons.push({
      target: "index root",
      attribute: `indexRules/${extra.nodeType}`,
      why: `Rule scoped to ${extra.nodeType} (JOIN selector '${extra.alias}') — Oak evaluates index rules strictly by a candidate node's own type, so properties queried on this selector must live under their own rule; they would never match under ${model.nodeType}.`
    });
  }
  def.indexRules = indexRules;

  if (extras.some((e) => e.props.length)) {
    const coveredTypes = [model.nodeType, ...extras.filter((e) => e.props.length).map((e) => e.nodeType)];
    warnings.push(
      `Multi-selector JOIN: this index now covers ${coveredTypes.length} node types in one definition (${coveredTypes.join(", ")}). includedPaths/queryPaths/async apply to the WHOLE index, not per node type — if these selectors actually need different path scoping or async settings, use separate index definitions per node type instead.`
    );
  }

  if (model.nodeScopeFulltext && (model.nodeType === "cq:Page" || model.nodeType === "dam:Asset" || model.nodeType === "cq:PageContent")) {
    def.aggregates = {
      "jcr:primaryType": "nt:unstructured",
      [model.nodeType]: {
        "jcr:primaryType": "nt:unstructured",
        include0: { "jcr:primaryType": "nt:unstructured", path: "jcr:content" },
        include1: { "jcr:primaryType": "nt:unstructured", path: "jcr:content/*" }
      }
    };
    reasons.push({ target: model.nodeType, attribute: "aggregates jcr:content(/*)", why: "Full-text on a page/asset must match text living in jcr:content descendants — aggregation folds descendant text into the parent's full-text document." });
  } else if (model.nodeScopeFulltext) {
    suggestions.push("Missing aggregates? If searchable text lives in descendant nodes (e.g. jcr:content/root/...), add aggregate includes for those relative paths — node-scope fulltext only sees the node's own properties otherwise.");
  }
  if (model.nodeType === "dam:Asset" && model.nodeScopeFulltext) {
    suggestions.push("dam:Asset + fulltext: if binaries (PDF/Word) must be searchable, add a tika config node; on AEMaaCS extend damAssetLucene instead of a parallel asset fulltext index.");
  }
  if (model.nodeType === "cq:Page" || model.nodeType === "dam:Asset") {
    const ootbName = model.nodeType === "cq:Page" ? "cqPageLucene" : "damAssetLucene";
    suggestions.push(
      `${model.nodeType} already has a substantial OOTB Lucene index (/oak:index/${ootbName}). Before deploying this generated definition as a wholly separate index, check whether your project already has a ${ootbName}-custom-N copy and add these property definitions there instead — two independent indexes covering the same node type roughly doubles write-time indexing overhead for every ${model.nodeType} change. Never edit /oak:index/${ootbName} itself (product updates can overwrite it) — a -custom-N copy, which is exactly the naming this tool already generates on AEMaaCS, is the correct way to extend it.`
    );
  }

  /* ---------- suggestions ---------- */
  suggestions.push(...buildSuggestions(target, indexName, model));
  for (const e of model.parseErrors) warnings.push("Parser: " + e);

  /* ---------- scores ---------- */
  const { before, after } = scoreQuery(model, explain, props);

  return {
    model,
    explain,
    indexName,
    indexDef: def,
    reasons,
    warnings,
    suggestions,
    scoreBefore: before,
    scoreAfter: after
  };
}
