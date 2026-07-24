/**
 * Regression test for Issue 11: NOT (prop LIKE '%pattern%') was forcing
 * propertyIndex=true via the bare "not" op, even though Oak's propertyIndex
 * only accelerates equality/ordering/"is not null" — it cannot bound a
 * negated wildcard scan (confirmed against Oak Lucene docs). The fix must
 * NOT regress the legitimate NOT(prop IS NOT NULL) case, which shares the
 * same "not" op but is paired with nullCheck=true and genuinely benefits
 * from nullCheckEnabled/propertyIndex.
 */
import { parseSQL2, parseExplain } from "../lib/analyze";
import { generate } from "../lib/generate";
import { assertTrue, suite, test } from "./harness";

function generateFor(q: string, target: "cloud" | "65" = "cloud") {
  const model = parseSQL2(q);
  return generate(model, parseExplain(""), target);
}

function propDef(result: ReturnType<typeof generateFor>, nodeType: string, propName: string) {
  const rules = result.indexDef.indexRules as any;
  const props = Object.values(rules[nodeType].properties).filter((v: any) => v.name) as any[];
  return props.find((p) => p.name === propName);
}

suite("generate() — NOT (prop LIKE ...) no longer forces propertyIndex=true", () => {
  test("negated LIKE alone does not set propertyIndex", () => {
    const result = generateFor(`SELECT * FROM [cq:Page] AS p WHERE NOT (p.[title] LIKE '%draft%')`);
    const pd = propDef(result, "cq:Page", "title");
    assertTrue(pd?.propertyIndex !== true, "propertyIndex should not be set for negated LIKE alone");
  });

  test("NOT(prop IS NOT NULL) (nullCheck-paired 'not') still sets nullCheckEnabled and propertyIndex as before", () => {
    const result = generateFor(`SELECT * FROM [cq:Page] AS p WHERE NOT (p.[legacyId] IS NOT NULL)`);
    const pd = propDef(result, "cq:Page", "legacyId");
    assertTrue(pd?.nullCheckEnabled === true, "nullCheckEnabled set");
    assertTrue(pd?.propertyIndex === true, "propertyIndex still set for the nullCheck-derived not");
  });

  test("a property with BOTH negated LIKE and a real equality condition still gets propertyIndex from the equality", () => {
    const result = generateFor(
      `SELECT * FROM [cq:Page] AS p WHERE NOT (p.[title] LIKE '%draft%') AND p.[title] = 'Home'`
    );
    const pd = propDef(result, "cq:Page", "title");
    assertTrue(pd?.propertyIndex === true, "propertyIndex set because of the '=' condition, not the negated LIKE");
  });
});
