/**
 * Regression tests for UNION/UNION ALL support: each branch is a fully
 * independent SELECT statement (possibly a different node type, different
 * WHERE, different path restriction) — not correlated the way JOIN selectors
 * are. generate() must produce a separate indexRules entry per distinct node
 * type across all branches, and merge includedPaths across all of them.
 */
import { parseSQL2, parseSQL2Selectors, parseSQL2UnionBranches, parseExplain } from "../lib/analyze";
import { generate } from "../lib/generate";
import { assertEqual, assertTrue, suite, test } from "./harness";

function generateUnion(q: string, target: "cloud" | "65" = "cloud") {
  const [model, ...extra] = parseSQL2UnionBranches(q);
  const selectorModel = parseSQL2Selectors(q);
  return generate(model, parseExplain(""), target, selectorModel, extra);
}

function indexRuleKeys(indexDef: Record<string, unknown>): string[] {
  const rules = indexDef.indexRules as Record<string, unknown>;
  return Object.keys(rules).filter((k) => k !== "jcr:primaryType");
}

suite("splitSQL2Union / parseSQL2UnionBranches", () => {
  test("splits on UNION ALL into independent branch texts", () => {
    const branches = parseSQL2UnionBranches(
      `SELECT * FROM [cq:Page] AS p WHERE p.[a] = 'x' UNION ALL SELECT * FROM [dam:Asset] AS a WHERE a.[b] = 'y'`
    );
    assertEqual(branches.length, 2);
    assertEqual(branches[0].nodeType, "cq:Page");
    assertEqual(branches[1].nodeType, "dam:Asset");
  });
  test("splits on plain UNION (without ALL) too", () => {
    const branches = parseSQL2UnionBranches(
      `SELECT * FROM [cq:Page] AS p WHERE p.[a] = 'x' UNION SELECT * FROM [dam:Asset] AS a WHERE a.[b] = 'y'`
    );
    assertEqual(branches.length, 2);
  });
  test("a non-union query returns a single-element array — same result as parseSQL2 directly", () => {
    const branches = parseSQL2UnionBranches(`SELECT * FROM [cq:Page] AS p WHERE p.[a] = 'x'`);
    assertEqual(branches.length, 1);
    assertEqual(branches[0].nodeType, "cq:Page");
  });
  test("the word 'union' inside a quoted string value does not cause a false split", () => {
    const branches = parseSQL2UnionBranches(`SELECT * FROM [cq:Page] AS p WHERE p.[title] = 'credit union'`);
    assertEqual(branches.length, 1);
  });
});

suite("generate() — UNION branches produce separate indexRules", () => {
  test("the exact reported example: cq:Page and dam:Asset each get their own rule", () => {
    const q = `SELECT * FROM [cq:Page] AS p WHERE p.[jcr:content/status] = 'active'
      UNION ALL
      SELECT * FROM [dam:Asset] AS a WHERE a.[jcr:content/metadata/cq:tags] = 'wknd:brand'`;
    const result = generateUnion(q);
    assertEqual(indexRuleKeys(result.indexDef).sort(), ["cq:Page", "dam:Asset"]);

    const rules = result.indexDef.indexRules as any;
    const pageProps = Object.values(rules["cq:Page"].properties).filter((v: any) => v.name) as any[];
    const assetProps = Object.values(rules["dam:Asset"].properties).filter((v: any) => v.name) as any[];
    assertTrue(pageProps.some((p) => p.name === "jcr:content/status"), "cq:Page owns its branch's property");
    assertTrue(assetProps.some((p) => p.name === "jcr:content/metadata/cq:tags"), "dam:Asset owns its branch's property");
    assertTrue(!pageProps.some((p) => p.name === "jcr:content/metadata/cq:tags"), "cq:Page must not contain dam:Asset's property");
  });

  test("includedPaths merges across branches with different path restrictions", () => {
    const q = `SELECT * FROM [cq:Page] AS p WHERE ISDESCENDANTNODE(p, '/content/wknd') AND p.[status] = 'active'
      UNION ALL
      SELECT * FROM [dam:Asset] AS a WHERE ISDESCENDANTNODE(a, '/content/dam') AND a.[status] = 'active'`;
    const result = generateUnion(q);
    assertEqual((result.indexDef.includedPaths as string[]).sort(), ["/content/dam", "/content/wknd"]);
  });

  test("two branches with the SAME node type merge their properties instead of one overwriting the other", () => {
    const q = `SELECT * FROM [cq:Page] AS p WHERE p.[status] = 'active'
      UNION ALL
      SELECT * FROM [cq:Page] AS p2 WHERE p2.[status] IS NOT NULL`;
    const result = generateUnion(q);
    assertEqual(indexRuleKeys(result.indexDef), ["cq:Page"]);
    const rules = result.indexDef.indexRules as any;
    const statusDef = rules["cq:Page"].properties.status;
    assertTrue(statusDef.propertyIndex === true, "propertyIndex from branch 1 kept");
    assertTrue(statusDef.notNullCheckEnabled === true, "notNullCheckEnabled from branch 2 merged in, not lost");
  });

  test("a warning explains the shared includedPaths/async caveat, labeled as UNION not JOIN", () => {
    const q = `SELECT * FROM [cq:Page] AS p WHERE p.[a] = 'x' UNION ALL SELECT * FROM [dam:Asset] AS a WHERE a.[b] = 'y'`;
    const result = generateUnion(q);
    assertTrue(result.warnings.some((w) => /Multi-branch UNION/.test(w)), "UNION-labeled warning present");
  });

  test("JOIN-only queries (no UNION) are completely unaffected — warning still says 'Multi-selector JOIN'", () => {
    const q = `SELECT * FROM [cq:Page] AS p INNER JOIN [dam:Asset] AS a ON ISCHILDNODE(a, p) WHERE p.[a] = 'x' AND a.[b] = 'y'`;
    const model = parseSQL2(q);
    const selectorModel = parseSQL2Selectors(q);
    const result = generate(model, parseExplain(""), "cloud", selectorModel);
    assertTrue(result.warnings.some((w) => /^Multi-selector JOIN:/.test(w)), "unchanged JOIN-only wording");
  });

  test("a query with no UNION at all is byte-for-byte unaffected by the new optional parameter", () => {
    const q = `SELECT * FROM [cq:Page] AS p WHERE p.[status] = 'active'`;
    const [model, ...extra] = parseSQL2UnionBranches(q);
    assertEqual(extra.length, 0);
    const result = generate(model, parseExplain(""), "cloud", null, extra);
    assertEqual(indexRuleKeys(result.indexDef), ["cq:Page"]);
    assertTrue(!result.warnings.some((w) => /Multi-branch|Multi-selector/.test(w)), "no multi-anything warning for a single query");
  });
});
