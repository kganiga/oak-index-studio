/**
 * Regression tests for generate() correctly splitting properties across
 * indexRules by JOIN selector, instead of dumping every queried property
 * under the primary selector's node type regardless of which selector it
 * actually came from (Oak evaluates indexRules strictly per node type, so a
 * property that doesn't belong to that type is dead weight there and leaves
 * the real owning selector unindexed).
 */
import { parseSQL2, parseSQL2Selectors, parseExplain } from "../lib/analyze";
import { generate } from "../lib/generate";
import { assertEqual, assertTrue, suite, test } from "./harness";

function indexRuleKeys(indexDef: Record<string, unknown>): string[] {
  const rules = indexDef.indexRules as Record<string, unknown>;
  return Object.keys(rules).filter((k) => k !== "jcr:primaryType");
}

suite("generate() — multi-selector JOIN property attribution", () => {
  test("two-selector JOIN produces separate indexRules per node type, not one merged rule", () => {
    const q = `SELECT * FROM [cq:Page] AS p
      INNER JOIN [dam:Asset] AS a ON ISCHILDNODE(a, p)
      WHERE p.[jcr:content/cq:template] = '/conf/wknd/template'
      AND a.[jcr:content/metadata/dam:scene7File] IS NOT NULL`;
    const model = parseSQL2(q);
    const selectorModel = parseSQL2Selectors(q);
    const result = generate(model, parseExplain(""), "cloud", selectorModel);

    assertEqual(indexRuleKeys(result.indexDef).sort(), ["cq:Page", "dam:Asset"]);

    const rules = result.indexDef.indexRules as any;
    const pageProps = Object.keys(rules["cq:Page"].properties).filter((k) => k !== "jcr:primaryType");
    const assetProps = Object.keys(rules["dam:Asset"].properties).filter((k) => k !== "jcr:primaryType");

    assertTrue(pageProps.length === 1, "cq:Page rule has exactly its own property");
    assertTrue(rules["cq:Page"].properties[pageProps[0]].name === "jcr:content/cq:template", "cq:Page owns cq:template");
    assertTrue(assetProps.length === 1, "dam:Asset rule has exactly its own property");
    assertTrue(rules["dam:Asset"].properties[assetProps[0]].name === "jcr:content/metadata/dam:scene7File", "dam:Asset owns scene7File");

    // The bug: dam:scene7File must NOT also appear under cq:Page.
    const pageHasAssetProp = Object.values(rules["cq:Page"].properties).some(
      (pd: any) => pd.name === "jcr:content/metadata/dam:scene7File"
    );
    assertTrue(!pageHasAssetProp, "cq:Page rule must not contain the dam:Asset selector's property");
  });

  test("secondary selector's property keeps its own ops/type/flags (notNullCheckEnabled, ordered, etc.)", () => {
    const q = `SELECT * FROM [cq:Page] AS p
      INNER JOIN [dam:Asset] AS a ON ISCHILDNODE(a, p)
      WHERE p.[status] = 'active'
      AND a.[jcr:content/metadata/jcr:lastModified] > CAST('2020-01-01T00:00:00.000Z' AS DATE)`;
    const model = parseSQL2(q);
    const selectorModel = parseSQL2Selectors(q);
    const result = generate(model, parseExplain(""), "cloud", selectorModel);
    const rules = result.indexDef.indexRules as any;
    const assetProps = Object.values(rules["dam:Asset"].properties).filter((v: any) => v["jcr:primaryType"] && v.name) as any[];
    const dateProp = assetProps.find((p) => p.name === "jcr:content/metadata/jcr:lastModified");
    assertTrue(dateProp !== undefined, "date property present under dam:Asset");
    assertEqual(dateProp.type, "Date");
    assertTrue(dateProp.ordered === true, "ordered carried through to the secondary selector's rule");
  });

  test("a reasons entry explains each secondary indexRules addition", () => {
    const q = `SELECT * FROM [cq:Page] AS p
      INNER JOIN [dam:Asset] AS a ON ISCHILDNODE(a, p)
      WHERE p.[a] = 'x' AND a.[b] = 'y'`;
    const model = parseSQL2(q);
    const selectorModel = parseSQL2Selectors(q);
    const result = generate(model, parseExplain(""), "cloud", selectorModel);
    assertTrue(
      result.reasons.some((r) => r.attribute === "indexRules/dam:Asset" && /JOIN selector/.test(r.why)),
      "reasons explain the dam:Asset rule"
    );
  });

  test("a warning flags the shared includedPaths/async caveat when multiple node types are covered", () => {
    const q = `SELECT * FROM [cq:Page] AS p
      INNER JOIN [dam:Asset] AS a ON ISCHILDNODE(a, p)
      WHERE p.[a] = 'x' AND a.[b] = 'y'`;
    const model = parseSQL2(q);
    const selectorModel = parseSQL2Selectors(q);
    const result = generate(model, parseExplain(""), "cloud", selectorModel);
    assertTrue(result.warnings.some((w) => /Multi-selector JOIN/.test(w)), "multi-selector caveat warning present");
  });

  test("single-selector queries are completely unaffected (no selectorModel needed)", () => {
    const q = `SELECT * FROM [cq:Page] AS p WHERE p.[status] = 'active' ORDER BY p.[jcr:content/cq:lastModified]`;
    const model = parseSQL2(q);
    const withoutSelectorModel = generate(model, parseExplain(""), "cloud");
    const rules = withoutSelectorModel.indexDef.indexRules as any;
    assertEqual(indexRuleKeys(withoutSelectorModel.indexDef), ["cq:Page"]);
    assertTrue(!withoutSelectorModel.warnings.some((w) => /Multi-selector JOIN/.test(w)), "no multi-selector warning for a single selector");
  });

  test("unresolved/ambiguous property ownership falls back to the primary selector with a warning, not silently dropped", () => {
    // A bare, unqualified property in a multi-selector query has no resolvable owner in the
    // selector model — generate() must still index it somewhere (falls back to primary) and
    // say so, rather than silently losing it.
    const q = `SELECT * FROM [cq:Page] AS p
      INNER JOIN [dam:Asset] AS a ON ISCHILDNODE(a, p)
      WHERE a.[b] = 'y' AND unqualifiedProp = 'z'`;
    const model = parseSQL2(q);
    const selectorModel = parseSQL2Selectors(q);
    const result = generate(model, parseExplain(""), "cloud", selectorModel);
    const rules = result.indexDef.indexRules as any;
    const pageHasFallback = Object.values(rules["cq:Page"].properties).some((pd: any) => pd.name === "unqualifiedProp");
    assertTrue(pageHasFallback, "unresolved property falls back under the primary selector's rule");
    assertTrue(result.warnings.some((w) => /could not resolve which JOIN selector/.test(w)), "fallback is explained in warnings");
  });
});
