const NS: Record<string, string> = {
  jcr: "http://www.jcp.org/jcr/1.0",
  nt: "http://www.jcp.org/jcr/nt/1.0",
  oak: "http://jackrabbit.apache.org/oak/ns/1.0",
  cq: "http://www.day.com/jcr/cq/1.0",
  dam: "http://www.day.com/dam/1.0",
  sling: "http://sling.apache.org/jcr/sling/1.0",
  rep: "internal",
  mix: "http://www.jcp.org/jcr/mix/1.0",
  granite: "http://www.adobe.com/jcr/granite/1.0"
};

function isNode(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function attrValue(v: unknown): string {
  if (typeof v === "boolean") return `{Boolean}${v}`;
  if (typeof v === "number") return `{Long}${v}`;
  if (Array.isArray(v)) return `[${v.map(String).join(",")}]`;
  return xmlEscape(String(v));
}

export function toJson(indexName: string, def: Record<string, unknown>): string {
  return JSON.stringify({ [`/oak:index/${indexName}`]: def }, null, 2);
}

export function toContentXml(def: Record<string, unknown>): string {
  const nsDecls = Object.entries(NS)
    .map(([p, u]) => `xmlns:${p}="${u}"`)
    .join("\n          ");

  function renderNode(name: string | null, node: Record<string, unknown>, indent: string): string {
    const attrs: string[] = [];
    const children: string[] = [];
    const pt = node["jcr:primaryType"];
    if (pt) attrs.push(`jcr:primaryType="${attrValue(pt)}"`);
    for (const [k, v] of Object.entries(node)) {
      if (k === "jcr:primaryType") continue;
      if (isNode(v)) children.push(renderNode(k, v, indent + "    "));
      else attrs.push(`${k}="${attrValue(v)}"`);
    }
    const attrStr = attrs.map((a) => `\n${indent}    ${a}`).join("");
    if (name === null) {
      const inner = children.length ? children.join("\n") + "\n" : "";
      return `<jcr:root ${nsDecls}${attrStr}>\n${inner}</jcr:root>`;
    }
    if (!children.length) return `${indent}<${name}${attrStr}/>`;
    return `${indent}<${name}${attrStr}>\n${children.join("\n")}\n${indent}</${name}>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n` + renderNode(null, def, "");
}

export function toRepoInit(indexName: string, def: Record<string, unknown>): string {
  const lines: string[] = [
    "# RepoInit script — requires Sling repoinit 1.1.36+ for typed values.",
    "# On AEMaaCS prefer deploying the .content.xml via ui.apps; repoinit shown for completeness.",
    ""
  ];
  function walk(path: string, node: Record<string, unknown>) {
    const pt = (node["jcr:primaryType"] as string) || "nt:unstructured";
    lines.push(`create path ${path}(${pt})`);
    const scalars = Object.entries(node).filter(([k, v]) => k !== "jcr:primaryType" && !isNode(v));
    if (scalars.length) {
      lines.push(`set properties on ${path}`);
      for (const [k, v] of scalars) {
        if (typeof v === "boolean") lines.push(`    set ${k}{Boolean} to ${v}`);
        else if (typeof v === "number") lines.push(`    set ${k}{Long} to ${v}`);
        else if (Array.isArray(v)) lines.push(`    set ${k} to ${v.map((x) => `"${x}"`).join(", ")}`);
        else lines.push(`    set ${k} to "${String(v)}"`);
      }
      lines.push("end");
    }
    for (const [k, v] of Object.entries(node)) if (isNode(v)) walk(`${path}/${k}`, v);
  }
  walk(`/oak:index/${indexName}`, def);
  return lines.join("\n");
}

export function toNodeTree(indexName: string, def: Record<string, unknown>): string {
  const lines: string[] = [`/oak:index/${indexName}`];
  function walk(node: Record<string, unknown>, prefix: string) {
    const entries = Object.entries(node);
    const scalars = entries.filter(([, v]) => !isNode(v));
    const nodes = entries.filter(([, v]) => isNode(v));
    scalars.forEach(([k, v], i) => {
      const last = i === scalars.length - 1 && nodes.length === 0;
      const val = Array.isArray(v) ? `[${v.join(", ")}]` : String(v);
      lines.push(`${prefix}${last ? "└─" : "├─"} ${k} = ${val}`);
    });
    nodes.forEach(([k, v], i) => {
      const last = i === nodes.length - 1;
      lines.push(`${prefix}${last ? "└─" : "├─"} + ${k}`);
      walk(v as Record<string, unknown>, prefix + (last ? "   " : "│  "));
    });
  }
  walk(def, "");
  return lines.join("\n");
}

export function toPackage(indexName: string, contentXml: string): string {
  return [
    "ui.apps/",
    "└─ src/main/content/",
    "   ├─ META-INF/vault/filter.xml",
    "   └─ jcr_root/_oak_index/" + indexName + "/.content.xml",
    "",
    "Note: on disk the folder is `_oak_index` — FileVault escapes the `oak:` namespace.",
    "",
    "──────── META-INF/vault/filter.xml ────────",
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<workspaceFilter version="1.0">`,
    `    <filter root="/oak:index/${indexName}"/>`,
    `</workspaceFilter>`,
    "",
    `──────── jcr_root/_oak_index/${indexName}/.content.xml ────────`,
    contentXml
  ].join("\n");
}
