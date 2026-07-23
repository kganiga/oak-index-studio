function decodeAttrValue(v: string): unknown {
  const typed = v.match(/^\{(\w+)\}([\s\S]*)$/);
  if (typed) {
    const [, type, raw] = typed;
    if (type === "Boolean") return raw === "true";
    if (type === "Long" || type === "Double") {
      const n = Number(raw);
      return Number.isNaN(n) ? raw : n;
    }
    return raw;
  }
  if (/^\[.*\]$/.test(v)) {
    const inner = v.slice(1, -1);
    return inner.length ? inner.split(",").map((s) => s.trim()) : [];
  }
  return v;
}

function elementToNode(el: Element): Record<string, unknown> {
  const node: Record<string, unknown> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) continue;
    node[attr.name] = decodeAttrValue(attr.value);
  }
  for (const child of Array.from(el.children)) {
    node[child.nodeName] = elementToNode(child);
  }
  return node;
}

/**
 * Parses a pasted .content.xml (the FileVault system-view XML this app's own
 * toContentXml() produces) back into the same Record<string, unknown> def
 * shape used throughout the app, so it can be diffed against a freshly
 * generated "ideal" definition. Browser-only (uses DOMParser) — callers must
 * guard against calling this during server rendering with non-empty input.
 */
export function parseIndexXml(xmlText: string): { def: Record<string, unknown> | null; error: string | null } {
  const text = xmlText.trim();
  if (!text) return { def: null, error: null };
  if (typeof DOMParser === "undefined") {
    return { def: null, error: "XML parsing is only available in the browser." };
  }

  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    return { def: null, error: "Could not parse XML — check it's well-formed .content.xml (e.g. missing closing tag or quote)." };
  }
  const root = doc.documentElement;
  if (!root) {
    return { def: null, error: "No root element found." };
  }
  return { def: elementToNode(root), error: null };
}
