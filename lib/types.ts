export type OakPropType = "String" | "Date" | "Long" | "Double" | "Decimal" | "Boolean" | "Binary";

export interface PropRestriction {
  name: string;              // relative property path, e.g. jcr:content/cq:template
  ops: string[];             // '=', '!=', 'range', 'like', 'contains', 'order', 'in', 'exists', 'not'
  type: OakPropType;
  ordered: boolean;
  analyzed: boolean;
  facet: boolean;
  multi: boolean;
  func?: "lower" | "upper" | "length";
  nullCheck?: boolean;
  notNullCheck?: boolean;
}

export interface QueryModel {
  source: "SQL2" | "XPath" | "QueryBuilder";
  nodeType: string;
  paths: string[];
  excludePaths: string[];
  props: Record<string, PropRestriction>;
  nodeScopeFulltext: boolean;
  fulltextTerm?: string;
  indexNodeName: boolean;
  orderBy: { name: string; desc: boolean }[];
  orCount: number;
  join: boolean;
  leadingWildcards: number;
  unsupportedFns: string[];
  notes: string[];
  parseErrors: string[];
}

export interface ExplainInfo {
  provided: boolean;
  traversal: boolean;
  usedIndex?: string;
}

export interface Reason {
  target: string;     // e.g. "jcr:content/cq:template" or "index root"
  attribute: string;  // e.g. "ordered=true"
  why: string;
}

export interface AnalysisResult {
  model: QueryModel;
  explain: ExplainInfo;
  indexName: string;
  indexDef: Record<string, unknown>;
  reasons: Reason[];
  warnings: string[];
  suggestions: string[];
  scoreBefore: number;
  scoreAfter: number;
}

export function emptyModel(source: QueryModel["source"]): QueryModel {
  return {
    source,
    nodeType: "nt:base",
    paths: [],
    excludePaths: [],
    props: {},
    nodeScopeFulltext: false,
    indexNodeName: false,
    orderBy: [],
    orCount: 0,
    join: false,
    leadingWildcards: 0,
    unsupportedFns: [],
    notes: [],
    parseErrors: []
  };
}

export function getProp(m: QueryModel, rawName: string): PropRestriction {
  const name = rawName.replace(/^@/, "").replace(/\[|\]/g, "").replace(/\/@/g, "/");
  if (!m.props[name]) {
    m.props[name] = {
      name,
      ops: [],
      type: "String",
      ordered: false,
      analyzed: false,
      facet: false,
      multi: false
    };
  }
  return m.props[name];
}

const DATE_NAME = /(date|lastmodified|lastreplicated|jcr:created|cq:lastmodified|ontime|offtime|expir|publish)/i;

export function inferTypeFromName(name: string): OakPropType | null {
  return DATE_NAME.test(name) ? "Date" : null;
}

export function inferTypeFromValue(v: string): OakPropType {
  if (/^(true|false)$/i.test(v)) return "Boolean";
  if (/^-?\d+$/.test(v)) return "Long";
  if (/^-?\d+\.\d+$/.test(v)) return "Double";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return "Date";
  return "String";
}

/* ---------------------------------------------------- SQL2 selector model */
/**
 * Per-selector breakdown of a SQL2 query (FROM/JOIN sources, join conditions,
 * path restrictions, predicates, functions), as opposed to QueryModel's flat
 * cross-selector view used for index generation.
 */
export interface SQL2JoinInfo {
  type: string;    // "INNER" | "LEFT OUTER" | "RIGHT OUTER" | "JOIN" | ...
  left: string;     // alias of the selector already in scope
  right: string;    // alias of the selector being joined in
  condition: string; // raw ON condition text, e.g. "ISCHILDNODE(content, asset)"
}

export interface SQL2SelectorInfo {
  alias: string;
  nodeType: string;
  paths: string[];
  properties: string[];
  predicates: string[];
  functions: string[];
}

export interface SQL2SelectorModel {
  selectors: SQL2SelectorInfo[];
  joins: SQL2JoinInfo[];
  orderBy: { selector?: string; name: string; desc: boolean }[];
  groupBy: string[];
  parseErrors: string[];
}

/**
 * Flags a queried property that the flat QueryModel (used for index generation)
 * attributes to the wrong node type — the property is actually owned by a
 * different selector than the one the generated index rule targets.
 */
export interface SelectorPropertyWarning {
  property: string;
  owningSelector: string;
  owningNodeType: string;
  generatedIndexNodeType: string;
  viaChildJoin: boolean; // owner is reached from the target selector via an ISCHILDNODE join
  recommendation: string;
}

/* ------------------------------------------------------- query quality */
export type PerformanceImpact = "low" | "medium" | "high";

export type QualityIssueCategory =
  | "like-wildcard-both"
  | "lower-function"
  | "upper-function"
  | "length-function"
  | "negation"
  | "not-equals"
  | "angle-not-equals"
  | "or-branches"
  | "large-in"
  | "unsupported-function"
  | "leading-wildcard"
  | "join"
  | "cartesian-join"
  | "large-order-by"
  | "missing-path";

/** One detected query-quality issue — analysis only, never used to rewrite the query. */
export interface QualityIssue {
  category: QualityIssueCategory;
  problem: string;
  why: string;
  recommendedRewrite: string;
  performanceImpact: PerformanceImpact;
}

/* --------------------------------------------------- explain cost report */
/**
 * Parsed candidate-index cost breakdown from Oak Explain output, e.g.
 * "[damAssetLucene] cost=23" / "[customLucene] cost=91" — distinct from the
 * lighter-weight ExplainInfo (traversal / single selected-index detection).
 */
export interface ExplainIndexCandidate {
  name: string;
  cost: number;
  raw: string;
}

export interface ExplainCostReport {
  candidates: ExplainIndexCandidate[];
  chosen: ExplainIndexCandidate | null;
  rejected: ExplainIndexCandidate[];
  parseErrors: string[];
}

export interface ExplainRejectionReason {
  index: string;
  cost: number;
  reason: string;
}

export type ExplainImprovementCategory = "missing-ordered" | "missing-property" | "wrong-path" | "cost-too-high";

export interface ExplainImprovement {
  category: ExplainImprovementCategory;
  detail: string;
}

export interface ExplainExplanation {
  whyChosen: string;
  whyRejected: ExplainRejectionReason[];
  potentialImprovements: ExplainImprovement[];
}

/* --------------------------------------------- existing-index XML compare */
export type IndexDiffBucket = "Missing" | "Extra" | "Incorrect";

export type IndexDiffCategory =
  | "unused-property"
  | "missing-property"
  | "incorrect-property-type"
  | "missing-ordered"
  | "wrong-included-paths"
  | "wrong-query-paths"
  | "missing-node-type"
  | "missing-relative-property";

/** One difference between a pasted existing index and what the SQL2 query actually needs. Never used to rewrite the pasted XML. */
export interface IndexDiffFinding {
  category: IndexDiffCategory;
  bucket: IndexDiffBucket;
  target: string;
  detail: string;
  suggestedFix: string;
}

export interface IndexDiffReport {
  findings: IndexDiffFinding[];
}

/* ------------------------------------------------- performance estimator */
export type ComplexityLevel = "Low" | "Medium" | "High";

/** One estimated cost factor. Always heuristic — never a measurement. */
export interface PerformanceFactor {
  name: string;
  estimate: string;
  impact: "low" | "medium" | "high";
  assumption: string;
}

export interface PerformanceEstimate {
  complexity: ComplexityLevel;
  complexityScore: number; // 0-100 heuristic scale, not an Oak value
  estimatedCostRange: { low: number; high: number }; // arbitrary heuristic units — NOT Oak's real cost()
  confidence: number; // 0-100, capped well below 100 by design — this tool never measures the real repository
  confidenceReasoning: string;
  factors: PerformanceFactor[];
  assumptions: string[];
  disclaimer: string;
}
