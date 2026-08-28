import { parseQueryBuilder } from "../lib/analyze";
import { assertDeepIncludes, assertEqual, assertTrue, suite, test } from "./harness";

suite("QueryBuilder Parser - Basic Predicates", () => {
  test("parses flat path, type and orderby", () => {
    const q = `type=cq:Page
path=/content/wknd
orderby=@jcr:content/cq:lastModified
orderby.sort=desc
p.limit=20`;
    const m = parseQueryBuilder(q);
    assertEqual(m.nodeType, "cq:Page");
    assertEqual(m.paths, ["/content/wknd"]);
    assertEqual(m.orderBy, [{ name: "jcr:content/cq:lastModified", desc: true }]);
    assertEqual(m.orCount, 0);
  });

  test("parses path.self=true", () => {
    const q = `type=cq:Page
path=/content/wknd
path.self=true`;
    const m = parseQueryBuilder(q);
    assertEqual(m.paths, ["/content/wknd"]);
    assertTrue(m.notes.some(n => /path\.self=true/.test(n)), "notes should mention path.self");
  });
});

suite("QueryBuilder Parser - Date and Relative Ranges", () => {
  test("parses daterange", () => {
    const q = `type=cq:Page
daterange.property=jcr:content/cq:lastModified
daterange.lowerBound=2025-01-01`;
    const m = parseQueryBuilder(q);
    assertTrue("jcr:content/cq:lastModified" in m.props, "should have lastModified prop");
    assertEqual(m.props["jcr:content/cq:lastModified"].type, "Date");
    assertTrue(m.props["jcr:content/cq:lastModified"].ordered, "should be ordered");
    assertDeepIncludes(m.props["jcr:content/cq:lastModified"].ops, "range");
  });

  test("parses relativedaterange", () => {
    const q = `type=cq:Page
relativedaterange.property=jcr:content/cq:lastModified
relativedaterange.lowerBound=-1d`;
    const m = parseQueryBuilder(q);
    assertTrue("jcr:content/cq:lastModified" in m.props, "should have lastModified prop");
    assertEqual(m.props["jcr:content/cq:lastModified"].type, "Date");
    assertTrue(m.notes.some(n => /relativedaterange/.test(n)), "notes should mention relativedaterange");
  });
});

suite("QueryBuilder Parser - Tag Predicates", () => {
  test("parses tagid and checks namespace", () => {
    const q = `type=cq:Page
tagid=wknd:activity/surfing
tagid.property=jcr:content/cq:tags`;
    const m = parseQueryBuilder(q);
    assertTrue("jcr:content/cq:tags" in m.props, "should have tags prop");
    assertTrue(m.props["jcr:content/cq:tags"].multi, "cq:tags should be multi-valued");
    assertTrue(m.notes.some(n => /tagid namespace 'wknd'/.test(n)), "should detect tag namespace wknd");
  });
});

suite("QueryBuilder Parser - Nested Groups & logic", () => {
  test("parses simple OR group", () => {
    const q = `group.p.or=true
group.1_property=jcr:title
group.1_property.value=Surfing
group.2_property=jcr:description
group.2_property.value=Ocean`;
    const m = parseQueryBuilder(q);
    assertTrue("jcr:title" in m.props, "should have title prop");
    assertTrue("jcr:description" in m.props, "should have description prop");
    assertEqual(m.orCount, 1); // 2 direct predicates ORed = 2 union branches -> orCount = 1
  });

  test("parses multiple values for single property", () => {
    const q = `property=jcr:content/cq:template
property.1_value=/conf/wknd/template1
property.2_value=/conf/wknd/template2`;
    const m = parseQueryBuilder(q);
    assertTrue("jcr:content/cq:template" in m.props, "should have template prop");
    assertDeepIncludes(m.props["jcr:content/cq:template"].ops, "in");
  });

  test("parses nested groups AND of ORs", () => {
    const q = `group.1_group.p.or=true
group.1_group.1_property=jcr:title
group.1_group.1_property.value=Surfing
group.1_group.2_property=jcr:description
group.1_group.2_property.value=Ocean
group.2_group.p.or=true
group.2_group.1_property=jcr:content/cq:template
group.2_group.1_property.value=t1
group.2_group.2_property=jcr:content/cq:template
group.2_group.2_property.value=t2`;
    const m = parseQueryBuilder(q);
    // (A OR B) AND (C OR D) => 2 * 2 = 4 union branches -> orCount = 3
    assertEqual(m.orCount, 3);
  });
});
