/**
 * Regression test for Issue 12: evaluateIndexHealth was deducting 6 points
 * per property for ordered=true without propertyIndex=true, but Oak's
 * doc-values sorting works from ordered=true alone — propertyIndex is only
 * needed if the property is ALSO filtered in WHERE (which generate() always
 * pairs with propertyIndex anyway, so this scenario is a legitimate,
 * deduction-free configuration, not a mistake to flag).
 */
import { evaluateIndexHealth } from "../lib/indexHealth";
import { assertEqual, assertTrue, suite, test } from "./harness";

function defWithProp(pd: Record<string, unknown>): Record<string, unknown> {
  return {
    indexRules: {
      "cq:Page": {
        properties: {
          prop: { "jcr:primaryType": "nt:unstructured", name: "sortOnly", ...pd },
        },
      },
    },
  };
}

suite("evaluateIndexHealth() — ordered=true without propertyIndex is not penalized", () => {
  test("ordered=true alone (sort-only property, no propertyIndex) gets zero deduction", () => {
    const health = evaluateIndexHealth(defWithProp({ ordered: true }));
    const check = health.checks.find((c) => c.dimension === "ordered");
    assertTrue(check !== undefined, "ordered check present");
    assertEqual(check!.deduction, 0);
    assertTrue(/sufficient for ORDER BY/.test(check!.reasoning), "reasoning explains ordered alone is fine");
  });

  test("ordered=true with propertyIndex=true also still gets zero deduction", () => {
    const health = evaluateIndexHealth(defWithProp({ ordered: true, propertyIndex: true }));
    const check = health.checks.find((c) => c.dimension === "ordered");
    assertEqual(check!.deduction, 0);
  });

  test("no ordered properties at all reports the no-op reasoning, still zero deduction", () => {
    const health = evaluateIndexHealth(defWithProp({ propertyIndex: true }));
    const check = health.checks.find((c) => c.dimension === "ordered");
    assertEqual(check!.deduction, 0);
    assertTrue(/No ordered properties/.test(check!.reasoning));
  });
});
