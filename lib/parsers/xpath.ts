import { QueryModel, emptyModel, getProp, inferTypeFromName, inferTypeFromValue } from "../types";
import { pushOp, applyValueType, stripQuoted } from "./shared";

export function parseXPath(qRaw: string): QueryModel {
  const m = emptyModel("XPath");
  const q = qRaw.replace(/\s+/g, " ").trim();
  if (!q) return m;

  const head = q.match(
    /^\/jcr:root(\/[^\s[\]()]*?)?\/\/(?:element\s*\(\s*[^,)]*(?:,\s*([\w:]+))?\s*\)|\*)/i
  );
  if (head) {
    if (head[1]) m.paths.push(head[1]);
    if (head[2]) m.nodeType = head[2];
  } else {
    m.parseErrors.push("Could not parse /jcr:root...//element(*, type) head — check syntax.");
  }

  let work = q;
  for (const r of q.matchAll(
    /jcr:contains\s*\(\s*([^,]+?)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/gi
  )) {
    const target = r[1].trim();
    if (target === ".") {
      m.nodeScopeFulltext = true;
      m.fulltextTerm = r[2];
    } else if (target.startsWith("@")) {
      const p = getProp(m, target);
      p.analyzed = true;
      pushOp(p, "contains");
    } else {
      // relative node, e.g. jcr:contains(jcr:content, '...')
      m.nodeScopeFulltext = true;
      m.fulltextTerm = r[2];
      m.notes.push(`Full-text scoped to relative node '${target}' — covered via aggregates.`);
    }
  }
  work = work.replace(/jcr:contains\s*\([^)]*\)/gi, " __FT__ ");

  for (const r of work.matchAll(
    /jcr:like\s*\(\s*@?([\w:\-./@]+)\s*,\s*'([^']*)'\s*\)/gi
  )) {
    const p = getProp(m, r[1]);
    pushOp(p, "like");
    if (r[2].startsWith("%")) m.leadingWildcards++;
  }
  work = work.replace(/jcr:like\s*\([^)]*\)/gi, " __LIKE__ ");

  for (const r of work.matchAll(/rep:facet\s*\(\s*@?([\w:\-./]+)\s*\)/gi)) {
    const p = getProp(m, r[1]);
    p.facet = true;
    pushOp(p, "facet");
  }

  for (const r of work.matchAll(
    /\bfn:name\s*\(\s*\)\s*=\s*'([^']*)'/gi
  )) {
    m.indexNodeName = true;
    m.notes.push("fn:name() restriction — indexNodeName=true required.");
  }

  const cmpRe =
    /(@?[\w:\-.]+(?:\/@[\w:\-.]+)*)\s*(>=|<=|!=|=|>|<)\s*(xs:dateTime\('([^']*)'\)|'((?:[^'\\]|\\.)*)'|true\(\)|false\(\)|-?\d+(?:\.\d+)?)/g;
  for (const r of work.matchAll(cmpRe)) {
    const rawName = r[1];
    if (!rawName.includes("@")) continue; // property refs in XPath predicates carry @
    const p = getProp(m, rawName);
    if (r[4] !== undefined) p.type = "Date";
    else if (r[5] !== undefined) {
      const byName = inferTypeFromName(p.name);
      applyValueType(p, byName ?? inferTypeFromValue(r[5]));
    } else applyValueType(p, inferTypeFromValue(r[3].replace(/\(\)/, "")));
    const op = r[2];
    if (op === "=") pushOp(p, "=");
    else if (op === "!=") pushOp(p, "!=");
    else {
      pushOp(p, "range");
      p.ordered = true;
    }
  }

  const ob = q.match(/\border\s+by\s+(.+)$/i);
  if (ob) {
    for (const part of ob[1].split(",")) {
      const desc = /descending/i.test(part);
      const pm = part.match(/@([\w:\-./@]+)/);
      if (pm) m.orderBy.push({ name: pm[1].replace(/\/@/g, "/"), desc });
      else if (/jcr:score/i.test(part)) m.notes.push("order by jcr:score — relevance sort.");
    }
  }

  m.orCount = (stripQuoted(work).match(/\bor\b/gi) || []).length;
  return m;
}
