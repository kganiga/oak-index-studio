import {
  OakPropType,
  QueryModel,
  emptyModel,
  getProp,
  inferTypeFromName,
  inferTypeFromValue,
  SQL2JoinInfo,
  SQL2SelectorInfo,
  SQL2SelectorModel
} from "../types";
import { pushOp, applyValueType, stripQuoted } from "./shared";

const OP_INVERT: Record<string, string> = { "=": "!=", "!=": "=", ">": "<=", "<": ">=", ">=": "<", "<=": ">" };

// Shared by CAST(literal AS TYPE) and PROPERTY(name, TYPE) — both are Oak's bare-keyword type
// tags (Oak SQL-2 grammar: STRING | BINARY | DATE | LONG | DOUBLE | DECIMAL | BOOLEAN | NAME |
// PATH | REFERENCE | WEAKREFERENCE | URI). NAME/PATH/REFERENCE/WEAKREFERENCE/URI have no
// equivalent in this app's OakPropType and are left unmapped (falls through to default String).
const CAST_TYPE_MAP: Record<string, OakPropType> = {
  string: "String", date: "Date", long: "Long", double: "Double", decimal: "Decimal", boolean: "Boolean", binary: "Binary"
};

/**
 * Applies one comparison's type inference + op to a property. Shared between
 * the main comparison scan and the NOT(single comparison) inversion handler
 * so the two can never drift out of sync on how a value maps to a type.
 * invert=true flips the operator (used for NOT(...)); LIKE has no invertible
 * op in this model, so an inverted LIKE is recorded as a generic negation
 * with an explanatory note instead of a fabricated "not like" op.
 */
function applyComparison(
  m: QueryModel,
  name: string,
  opRaw: string,
  castType: string | undefined,
  quotedVal: string | undefined,
  rawVal: string,
  invert: boolean
) {
  const p = getProp(m, name);
  if (castType !== undefined) {
    const mapped = CAST_TYPE_MAP[castType.toLowerCase()];
    if (mapped) p.type = mapped;
  } else if (quotedVal !== undefined) {
    const byName = inferTypeFromName(name);
    if (byName) applyValueType(p, byName);
    else applyValueType(p, inferTypeFromValue(quotedVal) === "Date" ? "Date" : "String");
  } else if (rawVal.startsWith("$")) {
    // Bind variable — no literal value to infer from; only a name-based guess is possible.
    const byName = inferTypeFromName(name);
    if (byName) applyValueType(p, byName);
  } else {
    applyValueType(p, inferTypeFromValue(rawVal));
  }

  const normOp = opRaw.toLowerCase() === "<>" ? "!=" : opRaw.toLowerCase();
  if (invert && normOp === "like") {
    pushOp(p, "not");
    m.notes.push(`NOT (${name} LIKE ...) — negated LIKE isn't specially indexed; propertyIndex is added but exact NOT-LIKE semantics aren't optimized.`);
    return;
  }
  const finalOp = invert ? OP_INVERT[normOp] ?? normOp : normOp;
  if (finalOp === "like") {
    pushOp(p, "like");
    if (quotedVal?.startsWith("%")) m.leadingWildcards++;
  } else if (finalOp === "=") {
    pushOp(p, "=");
  } else if (finalOp === "!=") {
    pushOp(p, "!=");
  } else {
    pushOp(p, "range");
    p.ordered = true;
  }
}

export function parseSQL2(qRaw: string): QueryModel {
  const m = emptyModel("SQL2");
  const q = qRaw.replace(/\s+/g, " ").trim();
  if (!q) return m;

  // Per the JCR 2.0 grammar (Name ::= '[' quotedName ']' | '[' simpleName ']' | simpleName),
  // a bracket-less FROM is only valid when the node type is "a legal SQL identifier" — which
  // excludes ':'. Every real AEM/Oak node type is namespace-prefixed (cq:Page, dam:Asset, ...)
  // and therefore REQUIRES brackets; only a colon-free custom type name may skip them. Matched
  // as one colon-inclusive token first (not two alternatives) so a name like "cq:Page" can't
  // backtrack into a truncated partial match ("cq") the way a bare `[A-Za-z_]\w*` would.
  const bracketNt = q.match(/\bfrom\s+\[([^\]]+)\]/i);
  const bareNt = q.match(/\bfrom\s+([A-Za-z_][\w:]*)/i);
  if (bracketNt) {
    m.nodeType = bracketNt[1];
  } else if (bareNt && !bareNt[1].includes(":")) {
    m.nodeType = bareNt[1];
  } else {
    m.parseErrors.push("No FROM [nodetype] clause found — assuming nt:base.");
  }

  if (/\bjoin\b/i.test(q)) m.join = true;

  for (const r of q.matchAll(
    /isdescendantnode\s*\(\s*(?:[\w$]+\s*,\s*)?['[]([^'\]]+)['\]]\s*\)/gi
  )) {
    m.paths.push(r[1].trim());
  }
  for (const r of q.matchAll(
    /ischildnode\s*\(\s*(?:[\w$]+\s*,\s*)?['[]([^'\]]+)['\]]\s*\)/gi
  )) {
    m.paths.push(r[1].trim());
    m.notes.push(`ISCHILDNODE(${r[1]}) — treated as path restriction on ${r[1]}.`);
  }
  for (const r of q.matchAll(
    /issamenode\s*\(\s*(?:[\w$]+\s*,\s*)?['[]([^'\]]+)['\]]\s*\)/gi
  )) {
    m.paths.push(r[1].trim());
    m.notes.push(`ISSAMENODE(${r[1]}) — matches only the exact node at this path (not descendants); treated as an includedPaths restriction for indexing purposes.`);
  }

  // Full-text
  let work = q;
  for (const r of q.matchAll(
    /contains\s*\(\s*([^,]+?)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/gi
  )) {
    const target = r[1].trim().replace(/^[\w$]+\./, "");
    if (target === "*" || target === "." || target.endsWith(".*")) {
      m.nodeScopeFulltext = true;
      m.fulltextTerm = r[2];
    } else {
      const p = getProp(m, target);
      p.analyzed = true;
      pushOp(p, "contains");
    }
  }
  work = work.replace(/contains\s*\([^)]*\)/gi, " __FT__ ");

  // rep:facet(...)
  for (const r of q.matchAll(/rep:facet\s*\(\s*\[?([\w:\-./]+)\]?\s*\)/gi)) {
    const p = getProp(m, r[1]);
    p.facet = true;
    pushOp(p, "facet");
  }
  if (/rep:suggest|rep:spellcheck/i.test(q)) {
    m.notes.push("rep:suggest / rep:spellcheck detected — suggest/spellcheck config added.");
  }

  // NAME()/LOCALNAME() restrictions — indexNodeName=true controls whether :nodeName is indexed
  // at all, independent of which comparison operator is later evaluated against it (same as
  // propertyIndex=true for a regular property); it previously only fired for = and LIKE.
  for (const r of work.matchAll(
    /\b(?:fn:)?(name|localname)\s*\(\s*[\w$.]*\s*\)\s*(?:(?:=|!=|<>|like)\s*'[^']*'|in\s*\([^)]*\)|is\s+(?:not\s+)?null\b)/gi
  )) {
    m.indexNodeName = true;
    m.notes.push(`${r[1].toUpperCase()}() restriction — indexNodeName=true required.`);
  }
  work = work.replace(/\b(?:fn:)?(name|localname)\s*\(\s*[\w$.]*\s*\)/gi, " __NODENAME__ ");

  // LOWER()/UPPER()/LENGTH() -> function-based property definition. Oak's Lucene function-based
  // indexing documents length([relPath]) alongside lower(...)/upper(...) as a supported function
  // (see docs/query/lucene.html#function-based-indexing) — LENGTH() is NOT post-filtered, it's
  // indexed the same way case-folding functions are.
  for (const r of work.matchAll(
    /\b(lower|upper|length)\s*\(\s*(?:[\w$]+\.)?\[?([\w:\-./]+)\]?\s*\)/gi
  )) {
    const p = getProp(m, r[2]);
    p.func = r[1].toLowerCase() as "lower" | "upper" | "length";
  }
  work = work.replace(/\b(lower|upper|length)\s*\(\s*((?:[\w$]+\.)?\[?[\w:\-./]+\]?)\s*\)/gi, "$2");

  // PROPERTY(name, TYPE) — Oak's typed dynamic operand (Oak SQL-2 grammar); TYPE is a bare
  // keyword, not a quoted string. Named-property form only — PROPERTY(*, TYPE) is not handled.
  for (const r of work.matchAll(
    /\bproperty\s*\(\s*(?:[\w$]+\.)?\[?([\w:\-./]+)\]?\s*,\s*(\w+)\s*\)/gi
  )) {
    const p = getProp(m, r[1]);
    const mapped = CAST_TYPE_MAP[r[2].toLowerCase()];
    if (mapped) p.type = mapped;
  }
  work = work.replace(/\bproperty\s*\(\s*((?:[\w$]+\.)?\[?[\w:\-./]+\]?)\s*,\s*\w+\s*\)/gi, "$1");

  // NOT ( prop IS NOT NULL )  ==  prop IS NULL   —  must run before the plain IS [NOT] NULL scan
  // below, or the wrapped "prop IS NOT NULL" text would also be matched there as a false positive.
  for (const r of work.matchAll(/\bnot\s*\(\s*(?:[\w$]+\.)?\[?([\w:\-./]+)\]?\s+is\s+not\s+null\s*\)/gi)) {
    const p = getProp(m, r[1]);
    p.nullCheck = true;
    pushOp(p, "not");
  }
  work = work.replace(/\bnot\s*\(\s*(?:[\w$]+\.)?\[?[\w:\-./]+\]?\s+is\s+not\s+null\s*\)/gi, " __NOTWRAP__ ");

  // NOT ( prop IS NULL )  ==  prop IS NOT NULL
  for (const r of work.matchAll(/\bnot\s*\(\s*(?:[\w$]+\.)?\[?([\w:\-./]+)\]?\s+is\s+null\s*\)/gi)) {
    const p = getProp(m, r[1]);
    p.notNullCheck = true;
    pushOp(p, "exists");
  }
  work = work.replace(/\bnot\s*\(\s*(?:[\w$]+\.)?\[?[\w:\-./]+\]?\s+is\s+null\s*\)/gi, " __NOTWRAP__ ");

  // IS [NOT] NULL
  for (const r of work.matchAll(/(?:[\w$]+\.)?\[?([\w:\-./]+)\]?\s+is\s+not\s+null\b/gi)) {
    const p = getProp(m, r[1]);
    p.notNullCheck = true;
    pushOp(p, "exists");
  }
  // \b after "null" (not the old (?!\s*\w) lookahead) guards only against "null" being a prefix
  // of a longer word (e.g. a hypothetical "nullish") — it does NOT block a trailing AND/OR/ORDER,
  // unlike the previous lookahead, which incorrectly treated any following word as disqualifying.
  for (const r of work.matchAll(/(?:[\w$]+\.)?\[?([\w:\-./]+)\]?\s+is\s+null\b/gi)) {
    const p = getProp(m, r[1]);
    p.nullCheck = true;
    pushOp(p, "not");
  }

  // NOT ( single comparison ) — inverts the operator (= <-> !=, > <-> <=, etc.). Only a single
  // simple comparison inside NOT(...) is recognized; NOT wrapping a compound AND/OR condition
  // would require De Morgan expansion, which is out of scope for this regex-based parser (flagged
  // via a note below instead of silently mishandled).
  // CAST(...) accepts any bare type keyword now (LONG, DOUBLE, DECIMAL, BOOLEAN, DATE, ...), not
  // just DATE — group order: 1=name, 2=op, 3=whole value, 4=cast literal, 5=cast TYPE, 6=quoted value.
  const notCmpValueAlt = "cast\\s*\\(\\s*'([^']*)'\\s+as\\s+(\\w+)\\s*\\)|'((?:[^'\\\\]|\\\\.)*)'|true|false|-?\\d+(?:\\.\\d+)?|\\$[\\w]+";
  const notCmpRe = new RegExp(
    `\\bnot\\s*\\(\\s*(?:[\\w$]+\\.)?\\[?([\\w:\\-./]+)\\]?\\s*(>=|<=|<>|!=|=|>|<|\\blike\\b)\\s*(${notCmpValueAlt})\\s*\\)`,
    "gi"
  );
  for (const r of work.matchAll(notCmpRe)) {
    const name = r[1];
    if (/^__/.test(name)) continue;
    applyComparison(m, name, r[2], r[5], r[6], r[3], true);
  }
  work = work.replace(notCmpRe, " __NOTWRAP__ ");

  // Remaining unhandled NOT(...) — a compound condition we can't safely invert automatically.
  if (/\bnot\s*\(/i.test(work)) {
    m.notes.push("NOT (...) with a compound (AND/OR) condition detected — only single-condition NOT(...) is automatically inverted; verify this predicate's indexing manually.");
  }

  // IN ( ... )
  for (const r of work.matchAll(/(?:[\w$]+\.)?\[?([\w:\-./]+)\]?\s+in\s*\(\s*([^)]*)\)/gi)) {
    const name = r[1];
    if (/^__/.test(name) || /^(select|where|and|or|not|from|order|by|null|true|false)$/i.test(name)) continue;
    const p = getProp(m, name);
    pushOp(p, "in");
    const firstVal = r[2].split(",")[0]?.trim().replace(/^'|'$/g, "");
    if (firstVal) {
      const byName = inferTypeFromName(name);
      if (byName) applyValueType(p, byName);
      else applyValueType(p, inferTypeFromValue(firstVal));
    }
  }
  work = work.replace(/(?:[\w$]+\.)?\[?[\w:\-./]+\]?\s+in\s*\(\s*[^)]*\)/gi, " __IN__ ");

  // Comparisons — CAST(... AS TYPE) accepts any bare Oak type keyword, not just DATE. Group
  // order: 1=name, 2=op, 3=whole value, 4=cast literal, 5=cast TYPE, 6=quoted value.
  const cmpRe =
    /(?:[\w$]+\.)?\[?([\w:\-./]+)\]?\s*(>=|<=|<>|!=|=|>|<|\blike\b)\s*(cast\s*\(\s*'([^']*)'\s+as\s+(\w+)\s*\)|'((?:[^'\\]|\\.)*)'|true|false|-?\d+(?:\.\d+)?|\$[\w]+)/gi;
  for (const r of work.matchAll(cmpRe)) {
    const name = r[1];
    if (/^__/.test(name) || /^(select|where|and|or|not|from|order|by|null|true|false)$/i.test(name)) continue;
    applyComparison(m, name, r[2], r[5], r[6], r[3], false);
  }

  // ORDER BY
  const ob = q.match(/\border\s+by\s+(.+)$/i);
  if (ob) {
    for (const part of ob[1].split(",")) {
      const desc = /\bdesc/i.test(part);
      const cleaned = part
        .replace(/\b(asc|desc)\b/gi, "")
        .replace(/[\w$]+\.\[/g, "[")   // strip selector alias before bracket
        .replace(/^[\w$]+\./, "")       // strip selector alias before bare name
        .trim();
      if (/score\s*\(/i.test(cleaned)) {
        m.notes.push("ORDER BY score() — relevance sort, no ordered property needed.");
        continue;
      }
      const pm = cleaned.match(/\[([^\]]+)\]/) || cleaned.match(/([\w:\-./]+)/);
      if (pm && pm[1]) m.orderBy.push({ name: pm[1], desc });
    }
  }

  m.orCount = (stripQuoted(work).match(/\bor\b/gi) || []).length;
  return m;
}

/* ------------------------------------------------------- SQL2 selectors */

const SELECTOR_RESERVED = /^(where|order|group|inner|left|right|join|on|from)$/i;

function deriveAlias(nodeType: string): string {
  const last = nodeType.split(":").pop() || nodeType;
  return last.charAt(0).toLowerCase() + last.slice(1);
}

function findSelector(selectors: SQL2SelectorInfo[], alias?: string): SQL2SelectorInfo | undefined {
  if (alias) return selectors.find((s) => s.alias === alias);
  return selectors.length === 1 ? selectors[0] : undefined;
}

/**
 * Builds a per-selector breakdown of a SQL2 query: every FROM/JOIN source
 * with its alias, node type, join condition, path restrictions, predicates
 * and functions — as opposed to parseSQL2's flat, index-generation-oriented
 * QueryModel. Purely additive; does not affect parseSQL2 or QueryModel.
 */
export function parseSQL2Selectors(qRaw: string): SQL2SelectorModel {
  const selectors: SQL2SelectorInfo[] = [];
  const joins: SQL2JoinInfo[] = [];
  const orderBy: SQL2SelectorModel["orderBy"] = [];
  const groupBy: string[] = [];
  const parseErrors: string[] = [];

  const q = qRaw.replace(/\s+/g, " ").trim();
  if (!q) return { selectors, joins, orderBy, groupBy, parseErrors };

  // FROM [type] AS alias, and (INNER|LEFT OUTER|RIGHT OUTER) JOIN [type] AS alias ON <condition>
  const selRe =
    /\b(from|(?:(inner|left\s+outer|right\s+outer|left|right)\s+)?join)\s+\[([^\]]+)\]\s*(?:as\s+)?([\w$]+)?\s*(?:on\s+(.+?))?(?=\s+(?:from\b|(?:(?:inner|left\s+outer|right\s+outer|left|right)\s+)?join\s*\[)|\s+where\b|\s+order\s+by\b|\s+group\s+by\b|$)/gi;

  let prevAlias: string | undefined;
  for (const r of q.matchAll(selRe)) {
    const isJoin = /join/i.test(r[1]) && !/^from$/i.test(r[1]);
    const nodeType = r[3];
    let alias: string | undefined = r[4];
    if (alias && SELECTOR_RESERVED.test(alias)) alias = undefined;
    alias = alias || deriveAlias(nodeType);
    const condition = r[5]?.trim();

    if (selectors.some((s) => s.alias === alias)) {
      parseErrors.push(`Duplicate selector alias '${alias}' — check the query.`);
    }
    selectors.push({ alias, nodeType, paths: [], properties: [], predicates: [], functions: [] });

    if (isJoin) {
      if (!condition) parseErrors.push(`JOIN on selector '${alias}' has no ON condition — check the query.`);
      joins.push({
        type: r[2] ? r[2].toUpperCase().replace(/\s+/g, " ") : "JOIN",
        left: prevAlias || "",
        right: alias,
        condition: condition || ""
      });
    }
    prevAlias = alias;
  }

  if (!selectors.length) {
    parseErrors.push("No FROM [nodetype] clause found — cannot build a selector model.");
    return { selectors, joins, orderBy, groupBy, parseErrors };
  }

  // WHERE clause: path restrictions, predicates, functions — scoped to the owning selector.
  const whereMatch = q.match(/\bwhere\s+(.+?)(?:\s+order\s+by\s+|\s+group\s+by\s+|$)/i);
  const whereText = whereMatch ? whereMatch[1] : "";

  if (whereText) {
    for (const r of whereText.matchAll(
      /is(?:descendant|child|same)node\s*\(\s*(?:([\w$]+)\s*,\s*)?['[]([^'\]]+)['\]]\s*\)/gi
    )) {
      const sel = findSelector(selectors, r[1]);
      if (sel) sel.paths.push(r[2].trim());
      else parseErrors.push(`Path restriction '${r[0]}' has no resolvable selector alias — qualify it in a multi-selector query.`);
    }

    const predRe =
      /(?:([\w$]+)\.)?\[?([\w:\-./]+)\]?\s*(>=|<=|<>|!=|=|>|<|\blike\b)\s*(cast\s*\([^)]*\)|'(?:[^'\\]|\\.)*'|true|false|-?\d+(?:\.\d+)?)/gi;
    for (const r of whereText.matchAll(predRe)) {
      const name = r[2];
      if (/^(select|where|and|or|not|from|order|by|group|null|true|false|on|join)$/i.test(name)) continue;
      const sel = findSelector(selectors, r[1]);
      if (sel) {
        if (!sel.properties.includes(name)) sel.properties.push(name);
        sel.predicates.push(r[0].trim());
      } else {
        parseErrors.push(`Predicate '${r[0].trim()}' has no resolvable selector alias — qualify it in a multi-selector query.`);
      }
    }

    for (const r of whereText.matchAll(/(?:([\w$]+)\.)?\[?([\w:\-./]+)\]?\s+is\s+(?:not\s+)?null/gi)) {
      const name = r[2];
      const sel = findSelector(selectors, r[1]);
      if (sel) {
        if (!sel.properties.includes(name)) sel.properties.push(name);
        sel.predicates.push(r[0].trim());
      } else {
        parseErrors.push(`Predicate '${r[0].trim()}' has no resolvable selector alias — qualify it in a multi-selector query.`);
      }
    }

    for (const r of whereText.matchAll(/contains\s*\(\s*([^,]+?)\s*,\s*'(?:[^'\\]|\\.)*'\s*\)/gi)) {
      const target = r[1].trim();
      const aliasMatch = target.match(/^([\w$]+)\./);
      const sel = findSelector(selectors, aliasMatch?.[1]);
      if (sel) sel.predicates.push(r[0].trim());
      else parseErrors.push(`CONTAINS predicate '${r[0].trim()}' has no resolvable selector alias.`);
    }

    for (const r of whereText.matchAll(/\b(lower|upper|name|localname|length|score)\s*\(\s*([^)]*)\s*\)/gi)) {
      const arg = r[2].trim();
      const aliasMatch = arg.match(/^([\w$]+)(?:\.|$)/);
      const sel = findSelector(selectors, aliasMatch?.[1]);
      if (sel) sel.functions.push(r[0].trim());
    }
  }

  // ORDER BY, qualified (alias.prop) or bare (single-selector queries only).
  const ob = q.match(/\border\s+by\s+(.+?)(?:\s+group\s+by\s+|$)/i);
  if (ob) {
    for (const part of ob[1].split(",")) {
      const desc = /\bdesc\b/i.test(part);
      const cleaned = part.replace(/\b(asc|desc)\b/gi, "").trim();
      if (/score\s*\(/i.test(cleaned)) continue;
      const qualified = cleaned.match(/^([\w$]+)\.\[?([\w:\-./]+)\]?/);
      if (qualified) {
        orderBy.push({ selector: qualified[1], name: qualified[2], desc });
      } else {
        const pm = cleaned.match(/\[([^\]]+)\]/) || cleaned.match(/([\w:\-./]+)/);
        if (pm && pm[1]) orderBy.push({ name: pm[1], desc });
      }
    }
  }

  // GROUP BY is not part of the JCR-SQL2 grammar; parsed defensively for visibility, flagged as invalid.
  const gb = q.match(/\bgroup\s+by\s+(.+)$/i);
  if (gb) {
    for (const part of gb[1].split(",")) {
      const cleaned = part.trim().replace(/^[\w$]+\./, "");
      if (cleaned) groupBy.push(cleaned);
    }
    parseErrors.push("GROUP BY is not part of the JCR-SQL2 grammar — Oak will reject this query; grouping captured for reference only.");
  }

  return { selectors, joins, orderBy, groupBy, parseErrors };
}
