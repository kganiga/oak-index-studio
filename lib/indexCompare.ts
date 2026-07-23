import { IndexDiffBucket, IndexDiffCategory, IndexDiffFinding, IndexDiffReport, QueryModel } from "./types";

function isNode(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface PropDef {
  key: string;
  label: string;
  pd: Record<string, unknown>;
}

function collectPropertyDefs(rule: unknown): PropDef[] {
  const out: PropDef[] = [];
  if (!isNode(rule)) return out;
  const props = rule.properties;
  if (!isNode(props)) return out;
  for (const [key, pd] of Object.entries(props)) {
    if (key === "jcr:primaryType" || !isNode(pd)) continue;
    const label = typeof pd.name === "string" ? pd.name : typeof pd.function === "string" ? pd.function : key;
    out.push({ key, label, pd });
  }
  return out;
}

function pathArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/**
 * Diffs a pasted existing Oak index definition against the "ideal" definition
 * this app would generate for the current SQL2 query, plus the parsed query
 * model itself. Read-only — never modifies the pasted XML, only reports on it.
 */
export function compareIndexToQuery(
  pastedDef: Record<string, unknown>,
  idealDef: Record<string, unknown>,
  model: QueryModel
): IndexDiffReport {
  const findings: IndexDiffFinding[] = [];
  const push = (category: IndexDiffCategory, bucket: IndexDiffBucket, target: string, detail: string, suggestedFix: string) =>
    findings.push({ category, bucket, target, detail, suggestedFix });

  // missing node types
  const pastedRules = isNode(pastedDef.indexRules) ? pastedDef.indexRules : {};
  const pastedTypeKeys = Object.keys(pastedRules).filter((k) => k !== "jcr:primaryType");
  let pastedRule = pastedRules[model.nodeType];
  if (!isNode(pastedRule)) {
    push(
      "missing-node-type",
      "Missing",
      model.nodeType,
      `The query targets [${model.nodeType}], but the pasted index has no indexRules entry for it${pastedTypeKeys.length ? ` (it only defines: ${pastedTypeKeys.join(", ")})` : ""}.`,
      `Add an indexRules/${model.nodeType} node to the pasted index, or confirm this index isn't meant to serve this query.`
    );
    // Still compare properties against the sole existing rule, if there is exactly one — likely the intended (mistyped) rule.
    if (pastedTypeKeys.length === 1) pastedRule = pastedRules[pastedTypeKeys[0]];
  }

  const idealRules = isNode(idealDef.indexRules) ? idealDef.indexRules : {};
  const idealRule = idealRules[model.nodeType];

  const idealProps = collectPropertyDefs(idealRule);
  const pastedProps = collectPropertyDefs(pastedRule);
  const pastedByLabel = new Map(pastedProps.map((p) => [p.label, p]));
  const idealByLabel = new Map(idealProps.map((p) => [p.label, p]));

  // missing properties / missing relative properties / incorrect property types / missing ordered fields
  for (const ip of idealProps) {
    const pp = pastedByLabel.get(ip.label);
    if (!pp) {
      const isRelative = ip.label.includes("/");
      push(
        isRelative ? "missing-relative-property" : "missing-property",
        "Missing",
        ip.label,
        `The query needs ${ip.label}, but the pasted index has no definition for it.`,
        isRelative
          ? `Add a property definition with name="${ip.label}" — relative properties need their own explicit definition; they aren't covered by a same-named top-level property.`
          : `Add a property definition for ${ip.label} (propertyIndex=true${ip.pd.ordered ? ", ordered=true" : ""}${ip.pd.type && ip.pd.type !== "String" ? `, type=${ip.pd.type}` : ""}).`
      );
      continue;
    }

    const idealType = (ip.pd.type as string) || "String";
    const pastedType = (pp.pd.type as string) || "String";
    if (idealType !== pastedType) {
      push(
        "incorrect-property-type",
        "Incorrect",
        ip.label,
        `${ip.label} is type=${pastedType} in the pasted index, but the query implies type=${idealType}.`,
        `Set type=${idealType} on ${ip.label} — a mismatched type makes range comparisons and ordering evaluate incorrectly (e.g. string-ordered dates sort lexicographically, not chronologically).`
      );
    }

    if (ip.pd.ordered === true && pp.pd.ordered !== true) {
      push(
        "missing-ordered",
        "Incorrect",
        ip.label,
        `${ip.label} needs ordered=true (the query range-filters and/or sorts on it), but the pasted index doesn't have it set.`,
        `Add ordered=true to ${ip.label} — without it, Oak can't seek for range comparisons or pre-sort results on this property.`
      );
    }
  }

  // unused properties
  for (const pp of pastedProps) {
    if (!idealByLabel.has(pp.label)) {
      push(
        "unused-property",
        "Extra",
        pp.label,
        `The pasted index defines ${pp.label}, but this query doesn't reference it.`,
        `Remove ${pp.label} if nothing else needs it — every unused property definition adds index size and reindex cost without benefit to this query.`
      );
    }
  }

  // wrong includedPaths
  const idealPaths = pathArray(idealDef.includedPaths);
  const pastedPaths = pathArray(pastedDef.includedPaths);
  if (!sameSet(idealPaths, pastedPaths)) {
    push(
      "wrong-included-paths",
      "Incorrect",
      "includedPaths",
      `Pasted index has includedPaths=${JSON.stringify(pastedPaths)}, but the query's path restriction implies ${JSON.stringify(idealPaths)}.`,
      idealPaths.length
        ? `Set includedPaths=${JSON.stringify(idealPaths)} so the index is scoped to what the query actually restricts to.`
        : "The query has no path restriction to validate includedPaths against — add one to the query, or confirm this index intentionally covers a broader scope than this query alone."
    );
  }

  // wrong queryPaths
  const idealQueryPaths = pathArray(idealDef.queryPaths);
  const pastedQueryPaths = pathArray(pastedDef.queryPaths);
  if (!sameSet(idealQueryPaths, pastedQueryPaths)) {
    push(
      "wrong-query-paths",
      "Incorrect",
      "queryPaths",
      `Pasted index has queryPaths=${JSON.stringify(pastedQueryPaths)}, but ${idealQueryPaths.length ? `expected ${JSON.stringify(idealQueryPaths)}` : "the query implies none"}.`,
      idealQueryPaths.length
        ? `Set queryPaths=${JSON.stringify(idealQueryPaths)} to match includedPaths — a mismatch risks Oak considering this index for the wrong queries.`
        : "queryPaths should generally mirror includedPaths; without a path restriction on the query there's nothing to validate it against."
    );
  }

  return { findings };
}
