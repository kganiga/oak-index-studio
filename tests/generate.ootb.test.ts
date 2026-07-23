/**
 * Regression tests for the OOTB-index-overlap suggestion: cq:Page and
 * dam:Asset both ship with substantial OOTB Lucene indexes (cqPageLucene,
 * damAssetLucene) in stock AEM, so generate() should nudge users toward
 * extending a project -custom-N copy of the real OOTB index instead of
 * deploying this generated definition as a wholly separate one — worded so
 * it never suggests directly editing the OOTB node itself, and consistent
 * with (not contradicting) this tool's own -custom-N naming convention.
 */
import { parseSQL2, parseExplain } from "../lib/analyze";
import { generate } from "../lib/generate";
import { assertTrue, suite, test } from "./harness";

function generateFor(nodeType: string, target: "cloud" | "65" = "cloud") {
  const model = parseSQL2(`SELECT * FROM [${nodeType}] AS n WHERE n.[status] = 'active'`);
  return generate(model, parseExplain(""), target);
}

suite("generate() — OOTB index overlap suggestion (cq:Page / dam:Asset)", () => {
  test("cq:Page queries get the OOTB-overlap suggestion, naming cqPageLucene", () => {
    const result = generateFor("cq:Page");
    const s = result.suggestions.find((x) => /OOTB/.test(x));
    assertTrue(s !== undefined, "suggestion present");
    assertTrue(s!.includes("cqPageLucene"), "names cqPageLucene");
    assertTrue(s!.includes("cqPageLucene-custom-N"), "recommends a -custom-N copy");
  });

  test("dam:Asset queries get the OOTB-overlap suggestion, naming damAssetLucene", () => {
    const result = generateFor("dam:Asset");
    const s = result.suggestions.find((x) => /OOTB/.test(x));
    assertTrue(s !== undefined, "suggestion present");
    assertTrue(s!.includes("damAssetLucene"), "names damAssetLucene");
  });

  test("the suggestion never tells the user to edit the OOTB index directly", () => {
    const result = generateFor("cq:Page");
    const s = result.suggestions.find((x) => /OOTB/.test(x))!;
    assertTrue(/Never edit \/oak:index\/cqPageLucene itself/.test(s), "explicitly warns against editing the OOTB node");
  });

  test("other node types (no known OOTB index) do not get this suggestion", () => {
    const result = generateFor("nt:unstructured");
    assertTrue(!result.suggestions.some((x) => /OOTB/.test(x)), "no OOTB suggestion for an unrelated node type");
  });

  test("fires on both AEMaaCS and AEM 6.5 targets — the write-amplification concern isn't cloud-specific", () => {
    const cloud = generateFor("dam:Asset", "cloud");
    const ams = generateFor("dam:Asset", "65");
    assertTrue(cloud.suggestions.some((x) => /OOTB/.test(x)), "fires on cloud");
    assertTrue(ams.suggestions.some((x) => /OOTB/.test(x)), "fires on AEM 6.5");
  });
});
