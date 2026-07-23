import { QueryModel, emptyModel, getProp, inferTypeFromName, inferTypeFromValue } from "../types";
import { pushOp, applyValueType } from "./shared";

const QB_PREDICATES = new Set([
  "property", "daterange", "relativedaterange", "rangeproperty", "fulltext",
  "nodename", "type", "path", "group", "orderby", "tagid", "tag", "tagsearch",
  "boolproperty", "language", "memberof", "haspermission", "savedquery",
  "similar", "excludepaths", "contentfragment", "mainasset", "notexpired"
]);

const stripNum = (s: string) => s.replace(/^\d+_/, "");

export function parseQueryBuilder(qRaw: string): QueryModel {
  const m = emptyModel("QueryBuilder");
  const entries: Record<string, string> = {};
  for (const lineRaw of qRaw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) {
      m.parseErrors.push(`Ignored line (no '='): ${line}`);
      continue;
    }
    entries[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!Object.keys(entries).length) return m;

  // Group entries by predicate id (full dotted prefix ending at a predicate name).
  interface Pred { type: string; self?: string; attrs: Record<string, string>; id: string }
  const preds: Record<string, Pred> = {};

  for (const [key, val] of Object.entries(entries)) {
    const segs = key.split(".");
    let idEnd = -1;
    let ptype = "";
    // Find the FIRST non-group segment that is a predicate name — so
    // 'daterange.property' groups as daterange with attr 'property',
    // while 'group.1_property.value' still groups as property.
    for (let i = 0; i < segs.length; i++) {
      const s = stripNum(segs[i]).toLowerCase();
      if (QB_PREDICATES.has(s) && s !== "group") {
        idEnd = i;
        ptype = s;
        break;
      }
    }
    if (idEnd < 0) {
      // group-level or global params
      const last = stripNum(segs[segs.length - 1]).toLowerCase();
      const prev = segs.length > 1 ? stripNum(segs[segs.length - 2]).toLowerCase() : "";
      if (last === "or" && prev === "p" && val === "true") m.orCount++;
      else if (segs[0] === "p") { /* p.limit, p.hits, p.offset, p.guessTotal — ignore */ }
      else if (stripNum(segs[segs.length - 1]).toLowerCase() === "group") { /* bare group */ }
      else m.notes.push(`Unrecognized predicate '${key}' — ignored.`);
      continue;
    }
    const id = segs.slice(0, idEnd + 1).join(".");
    const attr = segs.slice(idEnd + 1).map(stripNum).join(".").toLowerCase();
    if (!preds[id]) preds[id] = { type: ptype, attrs: {}, id };
    if (attr === "") preds[id].self = val;
    else preds[id].attrs[attr] = val;
  }

  for (const pred of Object.values(preds)) {
    const a = pred.attrs;
    switch (pred.type) {
      case "type":
        if (pred.self) m.nodeType = pred.self;
        break;
      case "path":
        if (pred.self) m.paths.push(pred.self);
        if (a["flat"] === "true" || a["exact"] === "true")
          m.notes.push("path.flat/exact — evaluated as direct-child/exact path restriction.");
        break;
      case "excludepaths":
        if (pred.self) {
          m.excludePaths.push(pred.self);
          m.notes.push("excludepaths is a post-filter (regex) — it cannot be pushed into the index.");
        }
        break;
      case "property": {
        const name = pred.self ?? a["property"];
        if (!name) { m.parseErrors.push(`property predicate '${pred.id}' has no property name.`); break; }
        const p = getProp(m, name);
        // Collect .value AND all .N_value entries from the raw key set —
        // numeric-stripped attrs collide in the attrs map, so read raw.
        const allVals = [
          ...new Set(
            Object.entries(entries)
              .filter(([k]) => k.startsWith(pred.id + ".") && /(^|\.)(\d+_)?value$/.test(k))
              .map(([, v]) => v)
          )
        ];
        const op = (a["operation"] || "equals").toLowerCase();
        if (op === "equals") pushOp(p, allVals.length > 1 ? "in" : "=");
        else if (op === "unequals") pushOp(p, "!=");
        else if (op === "like") { pushOp(p, "like"); m.notes.push(`property.operation=like on ${p.name} — translates to jcr:like (scan within index).`); }
        else if (op === "exists") {
          if ((allVals[0] ?? "true") === "false") { p.nullCheck = true; pushOp(p, "not"); }
          else { p.notNullCheck = true; pushOp(p, "exists"); }
        } else if (op === "not") { p.nullCheck = true; pushOp(p, "not"); }
        if (allVals.length > 1) m.orCount += allVals.length - 1;
        const byName = inferTypeFromName(p.name);
        if (byName) applyValueType(p, byName);
        else if (allVals[0]) applyValueType(p, inferTypeFromValue(allVals[0]));
        if (a["depth"]) m.notes.push(`property.depth on ${p.name} — matches descendants of result node; verify relative path coverage.`);
        break;
      }
      case "boolproperty": {
        const p = getProp(m, pred.self ?? "");
        p.type = "Boolean";
        pushOp(p, "=");
        break;
      }
      case "daterange":
      case "relativedaterange": {
        const name = a["property"];
        if (!name) { m.parseErrors.push(`${pred.type} '${pred.id}' missing .property.`); break; }
        const p = getProp(m, name);
        p.type = "Date";
        p.ordered = true;
        pushOp(p, "range");
        break;
      }
      case "rangeproperty": {
        const name = a["property"];
        if (!name) { m.parseErrors.push(`rangeproperty '${pred.id}' missing .property.`); break; }
        const p = getProp(m, name);
        p.ordered = true;
        pushOp(p, "range");
        const bound = a["lowerbound"] ?? a["upperbound"];
        if (bound) applyValueType(p, inferTypeFromValue(bound));
        break;
      }
      case "fulltext": {
        const rel = a["relpath"];
        if (rel && rel.startsWith("@")) {
          const p = getProp(m, rel);
          p.analyzed = true;
          pushOp(p, "contains");
        } else {
          m.nodeScopeFulltext = true;
          m.fulltextTerm = pred.self;
          if (rel) m.notes.push(`fulltext.relPath=${rel} — relative-node full-text, covered via aggregates.`);
        }
        break;
      }
      case "nodename":
        m.indexNodeName = true;
        if (pred.self && /^[%*]/.test(pred.self)) m.leadingWildcards++;
        break;
      case "orderby": {
        const v = pred.self ?? "";
        const desc = (a["sort"] || "").toLowerCase() === "desc";
        if (v === "path" ) m.notes.push("orderby=path — sorted by path, no property index involvement.");
        else if (v === "nodename") { m.indexNodeName = true; m.orderBy.push({ name: ":nodeName", desc }); }
        else if (v) m.orderBy.push({ name: v.replace(/^@/, ""), desc });
        if (a["case"] === "ignore") m.notes.push("orderby.case=ignore — case-insensitive sort happens post-index; expect in-memory sort cost.");
        break;
      }
      case "tagid":
      case "tag":
      case "tagsearch": {
        const p = getProp(m, a["property"] ?? "jcr:content/cq:tags");
        p.multi = true;
        pushOp(p, "=");
        m.notes.push(`${pred.type} predicate — cq:tags is multi-valued; multi-value properties are indexed per value automatically.`);
        break;
      }
      case "language": {
        const p = getProp(m, "jcr:language");
        pushOp(p, "=");
        break;
      }
      case "contentfragment": {
        const p = getProp(m, "jcr:content/contentFragment");
        p.type = "Boolean";
        pushOp(p, "=");
        break;
      }
      case "mainasset":
        m.notes.push("mainasset predicate filters subassets in memory — no index contribution.");
        break;
      case "notexpired": {
        const name = a["property"] ?? "jcr:content/onTime";
        const p = getProp(m, name);
        p.type = "Date";
        p.ordered = true;
        pushOp(p, "range");
        break;
      }
      case "memberof":
      case "haspermission":
        m.notes.push(`${pred.type} is an access-control post-filter — evaluated after index lookup, cannot be indexed.`);
        break;
      case "savedquery":
        m.notes.push("savedquery expands another stored query — paste the expanded query for accurate analysis.");
        break;
      case "similar":
        m.nodeScopeFulltext = true;
        m.notes.push("similar predicate uses MoreLikeThis on the full-text index.");
        break;
    }
  }

  return m;
}
