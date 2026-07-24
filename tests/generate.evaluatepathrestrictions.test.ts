/**
 * Regression test for Issue 13: evaluatePathRestrictions=true was being set
 * on the index root whenever the query had any property at all, even with
 * zero path restrictions (no ISDESCENDANTNODE/ISCHILDNODE/path predicate).
 * Per Oak Lucene docs, the flag only helps when path restrictions exist to
 * evaluate, and it costs a slight index-size increase — so it must only be
 * set when model.paths (merged with any UNION branch paths) is non-empty.
 */
import { parseSQL2, parseExplain } from "../lib/analyze";
import { generate } from "../lib/generate";
import { assertEqual, assertTrue, suite, test } from "./harness";

function generateFor(q: string, target: "cloud" | "65" = "cloud") {
  const model = parseSQL2(q);
  return generate(model, parseExplain(""), target);
}

suite("generate() — evaluatePathRestrictions only set when the query has a path restriction", () => {
  test("a query with no path restriction at all does not set evaluatePathRestrictions", () => {
    const result = generateFor(`SELECT * FROM [cq:Page] AS p WHERE p.[status] = 'active'`);
    assertTrue(result.indexDef.evaluatePathRestrictions !== true, "flag should not be set without any path restriction");
    assertTrue(result.indexDef.includedPaths === undefined, "no includedPaths either");
  });

  test("a query with ISDESCENDANTNODE still sets evaluatePathRestrictions alongside includedPaths", () => {
    const result = generateFor(`SELECT * FROM [cq:Page] AS p WHERE ISDESCENDANTNODE(p, '/content/wknd') AND p.[status] = 'active'`);
    assertEqual(result.indexDef.evaluatePathRestrictions, true);
    assertEqual(result.indexDef.includedPaths, ["/content/wknd"]);
  });

  test("no reasons entry for evaluatePathRestrictions is emitted when there is no path restriction", () => {
    const result = generateFor(`SELECT * FROM [cq:Page] AS p WHERE p.[status] = 'active'`);
    assertTrue(!result.reasons.some((r) => r.attribute === "evaluatePathRestrictions=true"), "no misleading reason entry");
  });
});
