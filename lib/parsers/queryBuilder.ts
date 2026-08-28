import { QueryModel, emptyModel, getProp, inferTypeFromName, inferTypeFromValue } from "../types";
import { pushOp, applyValueType } from "./shared";

const QB_PREDICATES = new Set([
  "property", "daterange", "relativedaterange", "rangeproperty", "fulltext",
  "nodename", "type", "path", "group", "orderby", "tagid", "tag", "tagsearch",
  "boolproperty", "language", "memberof", "haspermission", "savedquery",
  "similar", "excludepaths", "contentfragment", "mainasset", "notexpired"
]);

const stripNum = (s: string) => s.replace(/^\d+_/, "");

interface PredicateInstance {
  type: string;
  self?: string;
  attrs: Record<string, string>;
  id: string;
}

interface GroupNode {
  path: string;
  or: boolean;
  predicates: Record<string, PredicateInstance>;
  subgroups: Record<string, GroupNode>;
}

function getOrCreateGroup(root: GroupNode, groupPath: string): GroupNode {
  if (!groupPath) return root;
  const parts = groupPath.split(".");
  let current = root;
  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}.${part}` : part;
    if (!current.subgroups[part]) {
      current.subgroups[part] = {
        path: currentPath,
        or: false,
        predicates: {},
        subgroups: {}
      };
    }
    current = current.subgroups[part];
  }
  return current;
}

function getUnionBranches(g: GroupNode): number {
  const subgroupBranches = Object.values(g.subgroups).map(getUnionBranches);
  const predicateCount = Object.keys(g.predicates).length;
  
  if (g.or) {
    const subgroupSum = subgroupBranches.reduce((sum, b) => sum + b, 0);
    return predicateCount + subgroupSum;
  } else {
    if (subgroupBranches.length === 0) return 1;
    return subgroupBranches.reduce((prod, b) => prod * b, 1);
  }
}

function processGroup(g: GroupNode, m: QueryModel) {
  for (const pred of Object.values(g.predicates)) {
    const a = pred.attrs;
    switch (pred.type) {
      case "type":
        if (pred.self) m.nodeType = pred.self;
        break;
      case "path":
        if (pred.self) m.paths.push(pred.self);
        if (a["flat"] === "true" || a["exact"] === "true")
          m.notes.push("path.flat/exact — evaluated as direct-child/exact path restriction.");
        if (a["self"] === "true")
          m.notes.push("path.self=true — query matches the path node itself as well as descendants.");
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
        const allVals: string[] = [];
        if (pred.self) {
          allVals.push(pred.self);
        }
        for (const [k, v] of Object.entries(a)) {
          const normK = k.split(".").map(stripNum).join(".").toLowerCase();
          if (normK === "value") {
            allVals.push(v);
          }
        }
        const uniqueVals = [...new Set(allVals)];
        const op = (a["operation"] || "equals").toLowerCase();
        if (op === "equals") pushOp(p, uniqueVals.length > 1 ? "in" : "=");
        else if (op === "unequals") pushOp(p, "!=");
        else if (op === "like") {
          pushOp(p, "like");
          m.notes.push(`property.operation=like on ${p.name} — translates to jcr:like (scan within index).`);
          if (uniqueVals[0]?.startsWith("%")) m.leadingWildcards++;
        }
        else if (op === "exists") {
          if ((uniqueVals[0] ?? "true") === "false") { p.nullCheck = true; pushOp(p, "not"); }
          else { p.notNullCheck = true; pushOp(p, "exists"); }
        } else if (op === "not") { p.nullCheck = true; pushOp(p, "not"); }
        
        const byName = inferTypeFromName(p.name);
        if (byName) applyValueType(p, byName);
        else if (uniqueVals[0]) applyValueType(p, inferTypeFromValue(uniqueVals[0]));
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
        if (pred.type === "relativedaterange") {
          m.notes.push(`relativedaterange dynamic offset on ${p.name} resolved at execution time; indexed as a range query on a Date property.`);
        }
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
        
        const tagVal = pred.self ?? a["id"] ?? a["tagid"];
        if (tagVal && typeof tagVal === "string" && tagVal.includes(":")) {
          const ns = tagVal.split(":")[0];
          m.notes.push(`tagid namespace '${ns}' detected. Ensure tag namespaces are mapped in cq:tags.`);
        }
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

  for (const sub of Object.values(g.subgroups)) {
    processGroup(sub, m);
  }
}

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

  const rootGroup: GroupNode = {
    path: "",
    or: false,
    predicates: {},
    subgroups: {}
  };

  for (const [key, val] of Object.entries(entries)) {
    const segs = key.split(".");
    
    // 1. Check if it's a group parameter via "p"
    const pIndex = segs.findIndex(s => stripNum(s).toLowerCase() === "p");
    if (pIndex >= 0) {
      const groupPath = segs.slice(0, pIndex).join(".");
      const param = segs.slice(pIndex + 1).map(stripNum).join(".").toLowerCase();
      
      const g = getOrCreateGroup(rootGroup, groupPath);
      if (param === "or" && val === "true") {
        g.or = true;
      }
      continue;
    }

    // 2. Check if it's a predicate
    let predIndex = -1;
    let ptype = "";
    for (let i = 0; i < segs.length; i++) {
      const s = stripNum(segs[i]).toLowerCase();
      if (QB_PREDICATES.has(s) && s !== "group") {
        predIndex = i;
        ptype = s;
        break;
      }
    }

    if (predIndex >= 0) {
      const groupPath = segs.slice(0, predIndex).join(".");
      const predId = segs.slice(0, predIndex + 1).join(".");
      const attr = segs.slice(predIndex + 1).join(".");
      
      const g = getOrCreateGroup(rootGroup, groupPath);
      if (!g.predicates[predId]) {
        g.predicates[predId] = {
          type: ptype,
          attrs: {},
          id: predId
        };
      }
      const pred = g.predicates[predId];
      if (attr === "") {
        pred.self = val;
      } else {
        pred.attrs[attr] = val;
      }
    } else {
      // global or unrecognized parameter
      const last = stripNum(segs[segs.length - 1]).toLowerCase();
      if (segs[0] === "p") { /* ignore p.limit, p.offset, etc. */ }
      else if (last === "group") { /* bare group definition, e.g. group.group = ... */ }
      else {
        m.notes.push(`Unrecognized parameter '${key}' — ignored.`);
      }
    }
  }

  // Traverse hierarchy to populate model properties
  processGroup(rootGroup, m);

  // Compute total logical union branches
  m.orCount = getUnionBranches(rootGroup) - 1;

  return m;
}
