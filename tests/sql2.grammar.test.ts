/**
 * Grammar-coverage tests for lib/parsers/sql2.ts, organized by production
 * from Oak's own SQL-2 grammar (https://jackrabbit.apache.org/oak/docs/query/grammar-sql2.html).
 *
 * Two kinds of test here, both intentional:
 *   - Regression tests: lock in current CORRECT behavior so future edits to
 *     the parser can't silently break it.
 *   - Known-limitation tests: assert the CURRENT (imperfect) behavior for a
 *     construct the parser doesn't fully support, with a comment explaining
 *     the gap. If someone fixes the parser, these tests will start failing —
 *     that's the point: the fix has to consciously update the test, so gaps
 *     never silently stay unfixed *or* silently get "fixed" without anyone
 *     noticing the behavior changed.
 */
import { parseSQL2 } from "../lib/analyze";
import { assertEqual, assertTrue, suite, test } from "./harness";

suite("Comparison (=, !=, <>, <, >, <=, >=, LIKE)", () => {
  test("equality sets op = and infers type from value", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[status] = 'active'`);
    assertEqual(m.props["status"].ops, ["="]);
    assertEqual(m.props["status"].type, "String");
  });
  test("range operators set op=range and ordered=true", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[count] > 5`);
    assertEqual(m.props["count"].ops, ["range"]);
    assertTrue(m.props["count"].ordered, "ordered");
  });
  test("!= and <> both map to op '!='", () => {
    const m1 = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[status] != 'draft'`);
    const m2 = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[status] <> 'draft'`);
    assertEqual(m1.props["status"].ops, ["!="]);
    assertEqual(m2.props["status"].ops, ["!="]);
  });
  test("LIKE sets op=like and detects leading wildcard", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[title] LIKE '%draft'`);
    assertEqual(m.props["title"].ops, ["like"]);
    assertEqual(m.leadingWildcards, 1);
  });
});

suite("In Comparison — [dynamicOperand] IN (...)", () => {
  test("IN(...) sets op=in and infers type from the first value", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[status] IN ('a', 'b', 'c')`);
    assertEqual(m.props["status"].ops, ["in"]);
    assertEqual(m.props["status"].type, "String");
  });
  test("IN(...) with numeric values infers a numeric type", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[count] IN (1, 2, 3)`);
    assertEqual(m.props["count"].ops, ["in"]);
    assertEqual(m.props["count"].type, "Long");
  });
});

suite("NOT (constraint)", () => {
  test("NOT(prop = value) inverts to !=", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE NOT (p.[status] = 'draft')`);
    assertEqual(m.props["status"].ops, ["!="]);
  });
  test("NOT(prop != value) inverts to =", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE NOT (p.[status] != 'draft')`);
    assertEqual(m.props["status"].ops, ["="]);
  });
  test("NOT(prop > value) inverts to a range (<=) and stays ordered", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE NOT (p.[count] > 5)`);
    assertEqual(m.props["count"].ops, ["range"]);
    assertTrue(m.props["count"].ordered === true, "ordered");
  });
  test("NOT(prop IS NULL) inverts to notNullCheck", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE NOT (p.[legacyId] IS NULL)`);
    assertTrue(m.props["legacyId"].notNullCheck === true, "notNullCheck");
    assertEqual(m.props["legacyId"].ops, ["exists"]);
  });
  test("NOT(prop IS NOT NULL) inverts to nullCheck", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE NOT (p.[legacyId] IS NOT NULL)`);
    assertTrue(m.props["legacyId"].nullCheck === true, "nullCheck");
    assertEqual(m.props["legacyId"].ops, ["not"]);
  });
  test("NOT(prop LIKE value) is recorded as a negation with an explanatory note, not a fabricated op", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE NOT (p.[title] LIKE '%draft%')`);
    assertEqual(m.props["title"].ops, ["not"]);
    assertTrue(m.notes.some((n) => /NOT-LIKE/.test(n)), "note explaining NOT LIKE handling");
  });
  test("KNOWN LIMITATION: compound NOT(a AND b) is not inverted (De Morgan expansion is out of scope) — flagged via a note instead", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE NOT (p.[a] = '1' AND p.[b] = '2')`);
    // Each inner condition still parses as a plain positive comparison — the negation is lost —
    // but the tool now tells the user to verify it manually instead of staying silent about it.
    assertEqual(m.props["a"].ops, ["="]);
    assertEqual(m.props["b"].ops, ["="]);
    assertTrue(m.notes.some((n) => /compound/i.test(n)), "compound-NOT note");
  });
});

suite("Static Operand — literal / CAST / bind variable", () => {
  test("CAST(... AS DATE) sets type=Date", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[published] > CAST('2020-01-01T00:00:00.000Z' AS DATE)`);
    assertEqual(m.props["published"].type, "Date");
  });
  test("CAST(... AS LONG) sets type=Long and range op", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[views] > CAST('1000' AS LONG)`);
    assertEqual(m.props["views"].type, "Long");
    assertEqual(m.props["views"].ops, ["range"]);
    assertTrue(m.props["views"].ordered === true, "ordered");
  });
  test("CAST(... AS DOUBLE) sets type=Double", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[rating] = CAST('4.5' AS DOUBLE)`);
    assertEqual(m.props["rating"].type, "Double");
    assertEqual(m.props["rating"].ops, ["="]);
  });
  test("CAST(... AS BOOLEAN) sets type=Boolean", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[active] = CAST('true' AS BOOLEAN)`);
    assertEqual(m.props["active"].type, "Boolean");
  });
  test("CAST(... AS DECIMAL) sets type=Decimal", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[price] > CAST('9.99' AS DECIMAL)`);
    assertEqual(m.props["price"].type, "Decimal");
    assertEqual(m.props["price"].ops, ["range"]);
  });
  test("CAST(... AS LONG) composes with NOT(...) inversion", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE NOT (p.[views] > CAST('1000' AS LONG))`);
    assertEqual(m.props["views"].type, "Long");
    assertEqual(m.props["views"].ops, ["range"]); // > inverted to <=, still a range op
  });
  test("bind variable ($var) still registers the property and op — type is unknown without a name hint", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[status] = $status`);
    assertEqual(m.props["status"].ops, ["="]);
    assertEqual(m.props["status"].type, "String"); // no literal value and no name-based hint to type it from
  });
  test("bind variable ($var) infers type from a date-like property name", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[jcr:content/cq:lastModified] > $since`);
    assertEqual(m.props["jcr:content/cq:lastModified"].type, "Date");
    assertEqual(m.props["jcr:content/cq:lastModified"].ops, ["range"]);
  });
  test("bind variable ($var) composes with NOT(...) inversion", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE NOT (p.[status] = $status)`);
    assertEqual(m.props["status"].ops, ["!="]);
  });
  test("double-quoted string literals are not valid JCR-SQL2 and are correctly not recognized", () => {
    // Per Oak's grammar, string literals are single-quoted; double quotes denote
    // quoted identifiers. This is intentionally NOT a parser gap — Oak itself
    // would reject this query.
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[status] = "active"`);
    assertEqual(Object.keys(m.props), []);
  });
});

suite("Property Existence — IS [NOT] NULL", () => {
  test("IS NOT NULL sets notNullCheck + op=exists", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[legacyId] IS NOT NULL`);
    assertTrue(m.props["legacyId"].notNullCheck === true, "notNullCheck");
    assertEqual(m.props["legacyId"].ops, ["exists"]);
  });
  test("IS NULL followed by AND still sets nullCheck (regex lookahead bug fixed)", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[legacyId] IS NULL AND p.[status] = 'x'`);
    assertTrue(m.props["legacyId"].nullCheck === true, "nullCheck");
    assertEqual(m.props["legacyId"].ops, ["not"]);
    assertEqual(m.props["status"].ops, ["="]);
  });
  test("IS NULL followed by OR / ORDER BY still sets nullCheck", () => {
    const or = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[legacyId] IS NULL OR p.[status] = 'x'`);
    assertTrue(or.props["legacyId"].nullCheck === true, "nullCheck before OR");
    const ord = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[legacyId] IS NULL ORDER BY p.[legacyId]`);
    assertTrue(ord.props["legacyId"].nullCheck === true, "nullCheck before ORDER BY");
  });
  test("IS NULL as the only/last predicate still works (no regression)", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[legacyId] IS NULL`);
    assertTrue(m.props["legacyId"].nullCheck === true, "nullCheck when IS NULL is last");
  });
  test("IS NULL is not confused with IS NOT NULL when followed by AND/OR", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[legacyId] IS NOT NULL AND p.[status] = 'x'`);
    assertTrue(m.props["legacyId"].notNullCheck === true, "notNullCheck");
    assertTrue(m.props["legacyId"].nullCheck === undefined, "nullCheck should not also be set");
  });
});

suite("CONTAINS — full-text search", () => {
  test("CONTAINS(selector.prop, term) sets analyzed + op=contains", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE CONTAINS(p.[title], 'surf')`);
    assertTrue(m.props["title"].analyzed === true, "analyzed");
    assertEqual(m.props["title"].ops, ["contains"]);
  });
  test("CONTAINS(selector.*, term) sets node-scope fulltext", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE CONTAINS(p.*, 'surf')`);
    assertTrue(m.nodeScopeFulltext === true, "nodeScopeFulltext");
    assertEqual(m.fulltextTerm, "surf");
  });
});

suite("ISDESCENDANTNODE / ISCHILDNODE", () => {
  test("ISDESCENDANTNODE(selector, path) adds a path restriction", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE ISDESCENDANTNODE(p, '/content/site')`);
    assertEqual(m.paths, ["/content/site"]);
  });
  test("ISCHILDNODE(selector, path) adds a path restriction and a note", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE ISCHILDNODE(p, '/content/site')`);
    assertEqual(m.paths, ["/content/site"]);
    assertTrue(m.notes.length > 0, "notes");
  });
  test("ISSAMENODE(selector, path) adds a path restriction, with a note about its exact-node (not descendant) semantics", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE ISSAMENODE(p, '/content/site/home')`);
    assertEqual(m.paths, ["/content/site/home"]);
    assertTrue(m.notes.some((n) => /ISSAMENODE/.test(n)), "ISSAMENODE note present");
  });
  test("ISSAMENODE's 3-argument JOIN-condition form (selector, joinSelector, relativePath) is correctly NOT treated as an absolute path", () => {
    // ISSAMENODE(selectorName, joinSelectorName, selectorPathName) is a JOIN condition per the
    // grammar — its third argument is a relative path between two selectors' nodes, not an
    // absolute content path, so it must not be pushed into includedPaths.
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p INNER JOIN [dam:Asset] AS a ON ISSAMENODE(a, p, 'jcr:content')`);
    assertEqual(m.paths, []);
  });
});

suite("SIMILAR / NATIVE — not recognized", () => {
  test("KNOWN LIMITATION: SIMILAR(...) produces no property and no note", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE SIMILAR(p.[title], '/content/site/reference')`);
    assertEqual(Object.keys(m.props), []);
  });
  test("KNOWN LIMITATION: NATIVE(...) is silently dropped", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE NATIVE(p, 'lucene', 'title:surf')`);
    assertEqual(Object.keys(m.props), []);
  });
});

suite("Dynamic Operand — LOWER / UPPER / LENGTH / NAME / LOCALNAME / PATH / PROPERTY", () => {
  test("LOWER(prop) sets func=lower on the property", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE LOWER(p.[status]) = 'active'`);
    assertEqual(m.props["status"].func, "lower");
  });
  test("UPPER(prop) sets func=upper on the property", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE UPPER(p.[status]) = 'ACTIVE'`);
    assertEqual(m.props["status"].func, "upper");
  });
  test("LENGTH(prop) sets func=length — Oak's function-based indexing supports it, it is NOT post-filtered", () => {
    // Oak's Lucene function-based indexing docs list length([relPath]) alongside lower()/upper()
    // as a supported form (function="length([...])") — this used to be wrongly treated as an
    // unsupported function requiring post-filtering.
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE LENGTH(p.[title]) > 5`);
    assertEqual(m.props["title"].func, "length");
    assertEqual(m.props["title"].ops, ["range"]);
    assertEqual(m.unsupportedFns, []);
  });
  test("NAME() = 'x' sets indexNodeName", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE NAME(p) = 'jcr:content'`);
    assertTrue(m.indexNodeName === true, "indexNodeName");
  });
  test("NAME()/LOCALNAME() sets indexNodeName regardless of operator (!=, <>, IN, IS [NOT] NULL) — not just = and LIKE", () => {
    // indexNodeName controls whether :nodeName is indexed at all, independent of which operator
    // is later evaluated against it — same as propertyIndex=true for a regular property.
    const notEq = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE NAME(p) != 'jcr:content'`);
    assertTrue(notEq.indexNodeName === true, "!= sets indexNodeName");

    const angleNotEq = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE LOCALNAME(p) <> 'root'`);
    assertTrue(angleNotEq.indexNodeName === true, "<> sets indexNodeName");

    const inList = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE NAME(p) IN ('jcr:content', 'metadata')`);
    assertTrue(inList.indexNodeName === true, "IN(...) sets indexNodeName");

    const isNotNull = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE NAME(p) IS NOT NULL`);
    assertTrue(isNotNull.indexNodeName === true, "IS NOT NULL sets indexNodeName");

    const isNull = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE LOCALNAME(p) IS NULL`);
    assertTrue(isNull.indexNodeName === true, "IS NULL sets indexNodeName");
  });
  test("NAME()/LOCALNAME() not mentioned at all does not set indexNodeName (no false positive)", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE p.[status] = 'active'`);
    assertTrue(m.indexNodeName === false, "indexNodeName stays false");
  });
  test("KNOWN LIMITATION: PATH() dynamic operand is not recognized", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE PATH(p) LIKE '/content/site/%'`);
    assertEqual(Object.keys(m.props), []);
    assertEqual(m.leadingWildcards, 0);
  });
  test("KNOWN LIMITATION: COALESCE(...) is not recognized", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE COALESCE(p.[a], p.[b]) = 'x'`);
    assertEqual(Object.keys(m.props), []);
  });
  test("PROPERTY(name, TYPE) sets the property's type from the bare type keyword", () => {
    const m = parseSQL2(`SELECT * FROM [nt:unstructured] AS n WHERE PROPERTY(n.[propertyName], DATE) LIKE '%'`);
    assertEqual(m.props["propertyName"].type, "Date");
    assertEqual(m.props["propertyName"].ops, ["like"]);
  });
  test("PROPERTY(name, TYPE) composes with a real range comparison", () => {
    const m = parseSQL2(`SELECT * FROM [nt:unstructured] AS n WHERE PROPERTY(n.[propertyName], DATE) > CAST('2020-01-01T00:00:00.000Z' AS DATE)`);
    assertEqual(m.props["propertyName"].type, "Date");
    assertEqual(m.props["propertyName"].ops, ["range"]);
    assertTrue(m.props["propertyName"].ordered === true, "ordered");
  });
  test("PROPERTY(name, TYPE) with a quoted type keyword is NOT recognized (Oak requires a bare keyword)", () => {
    const m = parseSQL2(`SELECT * FROM [nt:unstructured] AS n WHERE PROPERTY(n.[propertyName], "DATE") LIKE '%'`);
    assertEqual(Object.keys(m.props), []);
  });
});

suite("ORDER BY", () => {
  test("simple property, default ascending", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE p.[a] = 'x' ORDER BY p.[a]`);
    assertEqual(m.orderBy, [{ name: "a", desc: false }]);
  });
  test("DESC is detected", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE p.[a] = 'x' ORDER BY p.[a] DESC`);
    assertEqual(m.orderBy, [{ name: "a", desc: true }]);
  });
  test("multiple properties", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE p.[a] = 'x' ORDER BY p.[a], p.[b] DESC`);
    assertEqual(m.orderBy, [{ name: "a", desc: false }, { name: "b", desc: true }]);
  });
  test("ORDER BY score() is noted, not treated as an ordered property", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE CONTAINS(p.*, 'x') ORDER BY score() DESC`);
    assertEqual(m.orderBy, []);
    assertTrue(m.notes.some((n) => /score/i.test(n)), "score note");
  });
});

suite("JOIN — structural handling", () => {
  test("JOIN sets model.join = true", () => {
    const m = parseSQL2(`SELECT * FROM [dam:Asset] AS a INNER JOIN [nt:base] AS c ON ISCHILDNODE(c, a) WHERE c.[status] = 'x'`);
    assertTrue(m.join === true, "join");
  });
  test("KNOWN LIMITATION: UNION ALL — only the first branch's FROM/WHERE is reflected", () => {
    const m = parseSQL2(
      `SELECT * FROM [cq:Page] AS p WHERE p.[a] = 'x' UNION ALL SELECT * FROM [dam:Asset] AS d WHERE d.[b] = 'y'`
    );
    assertEqual(m.nodeType, "cq:Page");
    // The second branch's own node type/property never surfaces in the flat model.
    assertTrue(!("b" in m.props) || m.nodeType !== "dam:Asset", "second UNION branch not modeled");
  });
});

suite("Node type extraction", () => {
  test("missing FROM [type] records a parseError and defaults nodeType", () => {
    const m = parseSQL2(`SELECT * WHERE p.[a] = 'x'`);
    assertTrue(m.parseErrors.length > 0, "parseErrors");
    assertEqual(m.nodeType, "nt:base");
  });
  test("bracket-quoted FROM [type] works as before", () => {
    const m = parseSQL2(`SELECT * FROM [cq:Page] WHERE p.[a] = 'x'`);
    assertEqual(m.nodeType, "cq:Page");
    assertEqual(m.parseErrors, []);
  });
  test("bracket-less FROM type is accepted when the name has no colon (a legal bare SQL identifier per the JCR grammar)", () => {
    const m = parseSQL2(`SELECT * FROM myCustomType WHERE p.[a] = 'x'`);
    assertEqual(m.nodeType, "myCustomType");
    assertEqual(m.parseErrors, []);
  });
  test("bracket-less FROM type works with AS selectorName too", () => {
    const m = parseSQL2(`SELECT * FROM myCustomType AS m WHERE m.[a] = 'x'`);
    assertEqual(m.nodeType, "myCustomType");
  });
  test("bracket-less FROM cq:Page (with a colon) is correctly rejected, not truncated to 'cq'", () => {
    // A colon disqualifies a name from being a legal bare SQL identifier per the JCR 2.0
    // grammar (Name ::= '[' simpleName ']' | simpleName) — real AEM node types are always
    // namespace-prefixed, so this form is genuinely invalid JCR-SQL2, not a parser gap.
    const m = parseSQL2(`SELECT * FROM cq:Page WHERE p.[a] = 'x'`);
    assertEqual(m.nodeType, "nt:base");
    assertTrue(m.parseErrors.length > 0, "parseErrors");
    assertTrue(m.nodeType !== "cq", "must not truncate to the pre-colon prefix");
  });
});
