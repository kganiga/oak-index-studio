"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle, CheckCircle2, Copy, Download, FileCode2, Lightbulb, TreePine,
  Sun, Moon, Share2, History as HistoryIcon, Save, Columns2, Keyboard, FileDown, ClipboardList, X, Trash2, FileText, BookOpen
} from "lucide-react";
import { parseSQL2, parseXPath, parseQueryBuilder, parseExplain, parseSQL2Selectors, parseExplainCosts } from "@/lib/analyze";
import { generate, Target } from "@/lib/generate";
import { toJson, toContentXml, toRepoInit, toNodeTree, toPackage } from "@/lib/output";
import { SAMPLES } from "@/lib/samples";
import { buildSelectorPropertyWarnings } from "@/lib/validate";
import { analyzeQueryQuality } from "@/lib/quality";
import { buildExplainExplanation } from "@/lib/explainReport";
import { evaluateIndexHealth } from "@/lib/indexHealth";
import { parseIndexXml } from "@/lib/xmlParse";
import { compareIndexToQuery } from "@/lib/indexCompare";
import { estimatePerformance } from "@/lib/performanceEstimate";
import { buildHtmlReport, buildMarkdownReport, buildRecommendationsText, ReportInput } from "@/lib/report";
import { decodeShareState, encodeShareState } from "@/lib/shareUrl";
import { deleteHistoryEntry, HistoryEntry, loadHistory, saveHistoryEntry } from "@/lib/history";
import { findKnowledge, KnowledgeEntry } from "@/lib/knowledge";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type InputTab = "SQL2" | "XPath" | "QueryBuilder" | "Explain" | "ExistingXML";
type OutTab = "JSON" | ".content.xml" | "RepoInit" | "Node tree" | "Package";

const INPUT_TABS: InputTab[] = ["SQL2", "XPath", "QueryBuilder", "Explain", "ExistingXML"];
const OUT_TABS: OutTab[] = ["JSON", ".content.xml", "RepoInit", "Node tree", "Package"];

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "1–5", desc: "Switch input tab (SQL2 / XPath / QueryBuilder / Explain / ExistingXML)" },
  { keys: "[ / ]", desc: "Cycle output tab" },
  { keys: "Ctrl/Cmd+Shift+C", desc: "Copy full analysis (Markdown)" },
  { keys: "Ctrl/Cmd+Shift+R", desc: "Copy recommendations" },
  { keys: "Ctrl/Cmd+Shift+X", desc: "Copy generated .content.xml" },
  { keys: "Ctrl/Cmd+Shift+M", desc: "Export Markdown report" },
  { keys: "Ctrl/Cmd+Shift+E", desc: "Export HTML report" },
  { keys: "Ctrl/Cmd+Shift+S", desc: "Save current analysis to history" },
  { keys: "Ctrl/Cmd+Shift+L", desc: "Toggle light / dark theme" },
  { keys: "?", desc: "Toggle this shortcuts panel" }
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable || el.closest(".monaco-editor") !== null;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Re-runs only existing, already-reviewed analysis functions against a saved snapshot — no new analysis logic. */
function analyzeSnapshot(entry: HistoryEntry) {
  const inputs = entry.inputs;
  const tab = entry.tab as InputTab;
  const querySource: InputTab = (tab === "Explain" || tab === "ExistingXML")
    ? (inputs.SQL2 ? "SQL2" : inputs.XPath ? "XPath" : "QueryBuilder")
    : tab;
  const q = querySource === "SQL2" ? inputs.SQL2 : querySource === "XPath" ? inputs.XPath : inputs.QueryBuilder;
  if (!q || !q.trim()) return null;
  const model =
    querySource === "SQL2" ? parseSQL2(q) :
    querySource === "XPath" ? parseXPath(q) :
    parseQueryBuilder(q);
  const result = generate(model, parseExplain(inputs.Explain || ""), (entry.target as Target) || "cloud");
  const health = evaluateIndexHealth(result.indexDef);
  const selectorModel = querySource === "SQL2" ? parseSQL2Selectors(q) : null;
  const perf = estimatePerformance(result.model, selectorModel);
  return { querySource, result, health, perf };
}

function ComparisonView({ a, b, onClose }: { a: HistoryEntry; b: HistoryEntry; onClose: () => void }) {
  const ra = useMemo(() => analyzeSnapshot(a), [a]);
  const rb = useMemo(() => analyzeSnapshot(b), [b]);

  const row = (label: string, va: string, vb: string) => (
    <tr className="border-b border-line/50">
      <td className="py-1.5 pr-3 text-dim">{label}</td>
      <td className="py-1.5 pr-3 font-mono text-fg">{va}</td>
      <td className="py-1.5 font-mono text-fg">{vb}</td>
    </tr>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">/comparison</p>
          <button onClick={onClose} className="rounded p-1 text-dim hover:bg-panel2 hover:text-fg"><X className="h-4 w-4" /></button>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="text-dim">
            <tr className="border-b border-line">
              <th className="py-1 pr-3 font-normal">metric</th>
              <th className="py-1 pr-3 font-normal">{a.label}</th>
              <th className="py-1 font-normal">{b.label}</th>
            </tr>
          </thead>
          <tbody>
            {row("Node type", ra?.result.model.nodeType ?? "—", rb?.result.model.nodeType ?? "—")}
            {row("Index name", ra?.result.indexName ?? "—", rb?.result.indexName ?? "—")}
            {row("Health score", ra ? `${ra.health.score}/100 (${ra.health.category})` : "—", rb ? `${rb.health.score}/100 (${rb.health.category})` : "—")}
            {row("Complexity", ra ? `${ra.perf.complexity} (${ra.perf.complexityScore}/100)` : "—", rb ? `${rb.perf.complexity} (${rb.perf.complexityScore}/100)` : "—")}
            {row("Est. cost (heuristic)", ra ? `~${ra.perf.estimatedCostRange.low}–${ra.perf.estimatedCostRange.high}` : "—", rb ? `~${rb.perf.estimatedCostRange.low}–${rb.perf.estimatedCostRange.high}` : "—")}
            {row("Confidence", ra ? `${ra.perf.confidence}/100` : "—", rb ? `${rb.perf.confidence}/100` : "—")}
            {row("Warnings", ra ? String(ra.result.warnings.length) : "—", rb ? String(rb.result.warnings.length) : "—")}
            {row("Query score before → after", ra ? `${ra.result.scoreBefore} → ${ra.result.scoreAfter}` : "—", rb ? `${rb.result.scoreBefore} → ${rb.result.scoreAfter}` : "—")}
          </tbody>
        </table>
        <p className="mt-3 text-[10px] text-dim">Both snapshots re-analyzed live from their saved query text using the same analyzer — nothing here is stored pre-computed.</p>
      </div>
    </div>
  );
}

const editorOpts = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  padding: { top: 10 }
};

function TabButton({ label, active, onClick, nowrap }: { label: string; active: boolean; onClick: () => void; nowrap?: boolean }) {
  return (
    <button onClick={onClick}
      className={`${nowrap ? "whitespace-nowrap " : ""}px-3 py-2 text-xs font-mono border-b-2 ${active ? "border-oak text-oak" : "border-transparent text-dim hover:text-fg"}`}>
      {label}
    </button>
  );
}

function ScoreBar({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 text-xs text-dim">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: accent }} />
      </div>
      <span className="w-14 text-right font-mono text-sm" style={{ color: accent }}>{value}/100</span>
    </div>
  );
}

function KnowledgeCard({ entry }: { entry: KnowledgeEntry }) {
  return (
    <div className="mt-1.5 rounded border border-oak/30 bg-panel2 p-2 text-[11px]">
      <p className="mb-1 flex items-center gap-1.5 font-mono text-oak">
        <BookOpen className="h-3 w-3 shrink-0" />
        {entry.topic}
      </p>
      <p className="text-dim">Best practice</p>
      <p className="text-fg">{entry.bestPractice}</p>
      <p className="mt-1 text-dim">Explanation</p>
      <p className="text-fg">{entry.explanation}</p>
      <p className="mt-1 text-dim">Reference</p>
      <p className="text-dim">{entry.reference}</p>
      <p className="mt-1 text-dim">Example</p>
      <p className="font-mono text-mint">{entry.example}</p>
      <p className="mt-1 text-dim">Recommendation</p>
      <p className="text-oak">{entry.recommendation}</p>
    </div>
  );
}

/** Looks up and renders every knowledge-base entry relevant to a finding's category key. Renders nothing if none match. */
function KnowledgeList({ categoryKey, platform }: { categoryKey: string; platform: Target }) {
  const entries = findKnowledge(categoryKey, platform);
  if (!entries.length) return null;
  return <>{entries.map((e) => <KnowledgeCard key={e.id} entry={e} />)}</>;
}

export default function Page() {
  const [tab, setTab] = useState<InputTab>("SQL2");
  const [inputs, setInputs] = useState<Record<InputTab, string>>({
    SQL2: SAMPLES.SQL2, XPath: "", QueryBuilder: "", Explain: "", ExistingXML: ""
  });
  const [outTab, setOutTab] = useState<OutTab>(".content.xml");
  const [target, setTarget] = useState<Target>("cloud");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  };

  // Restore theme + history + shared URL state on mount (client-only).
  useEffect(() => {
    const savedTheme = document.documentElement.getAttribute("data-theme");
    setTheme(savedTheme === "light" ? "light" : "dark");
    setHistory(loadHistory());

    const hash = window.location.hash;
    if (hash.startsWith("#s=")) {
      const decoded = decodeShareState(hash.slice(3));
      if (decoded) {
        setInputs((s) => ({ ...s, ...decoded.inputs }));
        if (INPUT_TABS.includes(decoded.tab as InputTab)) setTab(decoded.tab as InputTab);
        if (decoded.target === "cloud" || decoded.target === "65") setTarget(decoded.target as Target);
        flash("Loaded shared analysis from URL");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try { window.localStorage.setItem("oak-index-analyzer:theme", next); } catch { /* storage unavailable — theme just won't persist */ }
  };

  const activeQuery = (tab === "Explain" || tab === "ExistingXML") ? (inputs.SQL2 || inputs.XPath || inputs.QueryBuilder) : inputs[tab];
  const querySource: InputTab = (tab === "Explain" || tab === "ExistingXML")
    ? (inputs.SQL2 ? "SQL2" : inputs.XPath ? "XPath" : "QueryBuilder")
    : tab;

  const selectorModel = useMemo(() => {
    if (querySource !== "SQL2" || !inputs.SQL2.trim()) return null;
    return parseSQL2Selectors(inputs.SQL2);
  }, [querySource, inputs.SQL2]);

  const result = useMemo(() => {
    const q = querySource === "SQL2" ? inputs.SQL2 : querySource === "XPath" ? inputs.XPath : inputs.QueryBuilder;
    if (!q.trim()) return null;
    const model =
      querySource === "SQL2" ? parseSQL2(q) :
      querySource === "XPath" ? parseXPath(q) :
      parseQueryBuilder(q);
    return generate(model, parseExplain(inputs.Explain), target, selectorModel);
  }, [inputs, querySource, target, selectorModel]);

  const selectorPropertyWarnings = useMemo(() => {
    if (!result || !selectorModel) return [];
    return buildSelectorPropertyWarnings(result.model, selectorModel, result.indexDef);
  }, [result, selectorModel]);

  const qualityIssues = useMemo(() => {
    if (!result) return [];
    const q = querySource === "SQL2" ? inputs.SQL2 : querySource === "XPath" ? inputs.XPath : inputs.QueryBuilder;
    return analyzeQueryQuality(result.model, q, selectorModel);
  }, [result, selectorModel, querySource, inputs]);

  const explainCostReport = useMemo(() => parseExplainCosts(inputs.Explain), [inputs.Explain]);

  const explainExplanation = useMemo(() => {
    if (!explainCostReport.candidates.length) return null;
    return buildExplainExplanation(explainCostReport, result?.model ?? null);
  }, [explainCostReport, result]);

  const indexHealth = useMemo(() => {
    if (!result) return null;
    return evaluateIndexHealth(result.indexDef);
  }, [result]);

  const parsedExistingXml = useMemo(() => parseIndexXml(inputs.ExistingXML), [inputs.ExistingXML]);

  const indexDiffReport = useMemo(() => {
    if (!parsedExistingXml.def || !result || result.model.source !== "SQL2") return null;
    return compareIndexToQuery(parsedExistingXml.def, result.indexDef, result.model);
  }, [parsedExistingXml, result]);

  const performanceEstimate = useMemo(() => {
    if (!result) return null;
    return estimatePerformance(result.model, selectorModel);
  }, [result, selectorModel]);

  const outputs = useMemo(() => {
    if (!result) return null;
    const xml = toContentXml(result.indexDef);
    return {
      "JSON": toJson(result.indexName, result.indexDef),
      ".content.xml": xml,
      "RepoInit": toRepoInit(result.indexName, result.indexDef),
      "Node tree": toNodeTree(result.indexName, result.indexDef),
      "Package": toPackage(result.indexName, xml)
    } as Record<OutTab, string>;
  }, [result]);

  const writeClipboard = async (text: string, successMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(successMsg);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        flash(successMsg);
        return true;
      } catch {
        flash("Copy failed — clipboard access is blocked in this browser/context");
        return false;
      }
    }
  };

  const copy = async () => {
    if (!outputs) return;
    const ok = await writeClipboard(outputs[outTab], "Copied");
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1200); }
  };
  const download = () => {
    if (!outputs || !result) return;
    const ext = outTab === "JSON" ? "json" : outTab === ".content.xml" ? "xml" : "txt";
    const blob = new Blob([outputs[outTab]], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${result.indexName}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const reportInput: ReportInput | null = useMemo(() => {
    if (!result || !outputs) return null;
    return {
      querySource,
      query: activeQuery,
      target: target === "cloud" ? "cloud" : "65",
      result,
      contentXml: outputs[".content.xml"],
      indexHealth,
      performanceEstimate,
      qualityIssues,
      selectorModel,
      selectorPropertyWarnings,
      indexDiffReport,
      generatedAt: new Date()
    };
  }, [result, outputs, querySource, activeQuery, target, indexHealth, performanceEstimate, qualityIssues, selectorModel, selectorPropertyWarnings, indexDiffReport]);

  const downloadText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportMarkdown = () => {
    if (!reportInput) return;
    downloadText(buildMarkdownReport(reportInput), `${reportInput.result.indexName}.report.md`);
    flash("Markdown report downloaded");
  };
  const exportHtml = () => {
    if (!reportInput) return;
    downloadText(buildHtmlReport(reportInput), `${reportInput.result.indexName}.report.html`);
    flash("HTML report downloaded");
  };
  const copyAnalysis = async () => {
    if (!reportInput) return;
    await writeClipboard(buildMarkdownReport(reportInput), "Analysis copied");
  };
  const copyRecommendations = async () => {
    if (!reportInput) return;
    await writeClipboard(buildRecommendationsText(reportInput), "Recommendations copied");
  };
  const copyXml = async () => {
    if (!outputs) return;
    await writeClipboard(outputs[".content.xml"], "XML copied");
  };

  const copyShareLink = async () => {
    const encoded = encodeShareState({ tab, inputs, target });
    const url = `${window.location.origin}${window.location.pathname}#s=${encoded}`;
    await writeClipboard(url, "Shareable link copied");
  };

  const saveToHistory = () => {
    const q = activeQuery.trim();
    if (!q) return;
    const label = `${querySource} — ${q.slice(0, 40).replace(/\s+/g, " ")}${q.length > 40 ? "…" : ""}`;
    const updated = saveHistoryEntry({ label, tab, inputs, target });
    setHistory(updated);
    flash("Saved to history");
  };
  const loadHistoryEntryInto = (entry: HistoryEntry) => {
    setInputs((s) => ({ ...s, ...entry.inputs }));
    if (INPUT_TABS.includes(entry.tab as InputTab)) setTab(entry.tab as InputTab);
    if (entry.target === "cloud" || entry.target === "65") setTarget(entry.target as Target);
    setHistoryOpen(false);
    flash("Loaded from history");
  };
  const removeHistoryEntry = (id: string) => {
    setHistory(deleteHistoryEntry(id));
    setCompareIds((s) => s.filter((x) => x !== id));
  };
  const toggleCompareSelect = (id: string) => {
    setCompareIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id]));
  };

  // Keyboard shortcuts — ignored while typing in the editor or a text field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setShortcutsOpen((s) => !s);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === "c") { e.preventDefault(); copyAnalysis(); return; }
        if (k === "r") { e.preventDefault(); copyRecommendations(); return; }
        if (k === "x") { e.preventDefault(); copyXml(); return; }
        if (k === "m") { e.preventDefault(); exportMarkdown(); return; }
        if (k === "e") { e.preventDefault(); exportHtml(); return; }
        if (k === "s") { e.preventDefault(); saveToHistory(); return; }
        if (k === "l") { e.preventDefault(); toggleTheme(); return; }
      }
      if (isTypingTarget(e.target)) return;
      if (/^[1-5]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (INPUT_TABS[idx]) setTab(INPUT_TABS[idx]);
      } else if (e.key === "[" || e.key === "]") {
        const idx = OUT_TABS.indexOf(outTab);
        const next = e.key === "[" ? (idx - 1 + OUT_TABS.length) % OUT_TABS.length : (idx + 1) % OUT_TABS.length;
        setOutTab(OUT_TABS[next]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportInput, outputs, outTab, tab, inputs, target, theme]);

  const props = result ? Object.values(result.model.props) : [];

  return (
    <main className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-5 py-3">
        <div className="flex items-center gap-3">
          <TreePine className="h-5 w-5 text-oak" />
          <div>
            <h1 className="text-sm font-semibold tracking-wide">Oak Index Studio</h1>
            <p className="eyebrow">/oak:index — query → lucene definition</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button onClick={saveToHistory} disabled={!result} title="Save to history (Ctrl/Cmd+Shift+S)"
            className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak disabled:opacity-30">
            <Save className="h-4 w-4" />
          </button>

          <div className="relative">
            <button onClick={() => setHistoryOpen((s) => !s)} title="History / saved analyses"
              className={`rounded p-1.5 hover:bg-panel2 hover:text-oak ${historyOpen ? "bg-panel2 text-oak" : "text-dim"}`}>
              <HistoryIcon className="h-4 w-4" />
            </button>
            {historyOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded border border-line bg-panel p-2 shadow-xl">
                <div className="mb-1 flex items-center justify-between">
                  <p className="eyebrow">/history</p>
                  <button onClick={() => setHistoryOpen(false)} className="rounded p-1 text-dim hover:text-fg"><X className="h-3.5 w-3.5" /></button>
                </div>
                {!history.length ? (
                  <p className="p-2 text-xs text-dim">No saved analyses yet — click the save icon to add the current one.</p>
                ) : (
                  <ul className="max-h-80 space-y-1 overflow-y-auto">
                    {history.map((h) => (
                      <li key={h.id} className="rounded border border-line/50 p-1.5 text-xs">
                        <div className="flex items-start gap-1.5">
                          <input type="checkbox" className="mt-1" checked={compareIds.includes(h.id)}
                            onChange={() => toggleCompareSelect(h.id)} title="Select for comparison" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-fg">{h.label}</p>
                            <p className="text-[10px] text-dim">{formatTimestamp(h.savedAt)}</p>
                          </div>
                        </div>
                        <div className="mt-1 flex items-center gap-2 pl-5">
                          <button onClick={() => loadHistoryEntryInto(h)} className="text-mint hover:underline">load</button>
                          <button onClick={() => removeHistoryEntry(h.id)} title="Delete" className="flex items-center gap-1 text-danger hover:underline">
                            <Trash2 className="h-3 w-3" /> delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <button onClick={() => setComparing(true)} disabled={compareIds.length !== 2} title="Compare two selected history entries"
            className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak disabled:opacity-30">
            <Columns2 className="h-4 w-4" />
          </button>

          <span className="mx-1 h-4 w-px bg-line" />

          <button onClick={exportMarkdown} disabled={!reportInput} title="Export Markdown report (Ctrl/Cmd+Shift+M)"
            className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak disabled:opacity-30">
            <FileDown className="h-4 w-4" />
          </button>
          <button onClick={exportHtml} disabled={!reportInput} title="Export HTML report (Ctrl/Cmd+Shift+E)"
            className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak disabled:opacity-30">
            <FileText className="h-4 w-4" />
          </button>
          <button onClick={copyAnalysis} disabled={!reportInput} title="Copy full analysis (Ctrl/Cmd+Shift+C)"
            className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak disabled:opacity-30">
            <ClipboardList className="h-4 w-4" />
          </button>
          <button onClick={copyRecommendations} disabled={!reportInput} title="Copy recommendations (Ctrl/Cmd+Shift+R)"
            className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak disabled:opacity-30">
            <Lightbulb className="h-4 w-4" />
          </button>

          <span className="mx-1 h-4 w-px bg-line" />

          <button onClick={copyShareLink} title="Copy shareable link">
            <Share2 className="h-4 w-4" />
          </button>
          <button onClick={toggleTheme} title="Toggle light/dark theme (Ctrl/Cmd+Shift+L)"
            className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={() => setShortcutsOpen((s) => !s)} title="Keyboard shortcuts (?)"
            className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak">
            <Keyboard className="h-4 w-4" />
          </button>

          <span className="mx-1 h-4 w-px bg-line" />
          <span className="text-dim">Target</span>
          {(["cloud", "65"] as Target[]).map((t) => (
            <button key={t} onClick={() => setTarget(t)}
              className={`rounded px-2.5 py-1 font-mono ${target === t ? "bg-oak text-ink" : "bg-panel2 text-dim hover:text-fg"}`}>
              {t === "cloud" ? "AEMaaCS" : "AEM 6.5"}
            </button>
          ))}
        </div>
      </header>

      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShortcutsOpen(false)}>
          <div className="w-full max-w-md rounded border border-line bg-panel p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="eyebrow">/keyboard-shortcuts</p>
              <button onClick={() => setShortcutsOpen(false)} className="rounded p-1 text-dim hover:text-fg"><X className="h-4 w-4" /></button>
            </div>
            <ul className="space-y-1.5 text-xs">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-oak">{s.keys}</span>
                  <span className="text-right text-dim">{s.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {comparing && compareIds.length === 2 && history.find((h) => h.id === compareIds[0]) && history.find((h) => h.id === compareIds[1]) && (
        <ComparisonView
          a={history.find((h) => h.id === compareIds[0])!}
          b={history.find((h) => h.id === compareIds[1])!}
          onClose={() => setComparing(false)}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded bg-panel2 px-3 py-1.5 text-xs text-fg shadow-xl border border-line">
          {toast}
        </div>
      )}

      {/* Three columns */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-line lg:grid-cols-[1fr_1fr_1.2fr]">
        {/* Left: input */}
        <section className="flex min-h-0 flex-col bg-ink">
          <div className="flex items-center justify-between border-b border-line px-3">
            <div className="flex">
              {INPUT_TABS.map((t) => (
                <TabButton key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
              ))}
            </div>
            <button onClick={() => setInputs((s) => ({ ...s, [tab]: SAMPLES[tab] ?? "" }))}
              className="text-[11px] text-dim hover:text-oak">load sample</button>
          </div>
          <div className="min-h-0 flex-1">
            <Monaco
              theme="vs-dark"
              language={tab === "SQL2" ? "sql" : tab === "ExistingXML" ? "xml" : "plaintext"}
              value={inputs[tab]}
              options={editorOpts}
              onChange={(v) => setInputs((s) => ({ ...s, [tab]: v ?? "" }))}
            />
          </div>
          {tab === "Explain" && (
            <p className="border-t border-line px-3 py-2 text-[11px] text-dim">
              Explain output refines the analysis of the query in the other tabs — it is not analyzed alone.
            </p>
          )}
          {tab === "ExistingXML" && (
            <p className="border-t border-line px-3 py-2 text-[11px] text-dim">
              Paste an existing .content.xml here to compare it against the SQL2 query — it is not analyzed alone and never rewritten.
            </p>
          )}
        </section>

        {/* Center: analysis */}
        <section className="flex min-h-0 flex-col overflow-y-auto bg-ink p-4">
          <p className="eyebrow mb-3">/analysis</p>
          {!result ? (
            <p className="text-sm text-dim">Paste a query on the left. Analysis runs live.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-line bg-panel p-3">
                  <p className="text-[11px] text-dim">Node type</p>
                  <p className="font-mono text-oak">{result.model.nodeType}</p>
                </div>
                <div className="rounded border border-line bg-panel p-3">
                  <p className="text-[11px] text-dim">Path restriction</p>
                  <p className="font-mono">{result.model.paths.join(", ") || <span className="text-danger">none</span>}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                {result.model.nodeScopeFulltext && <span className="rounded bg-panel2 px-2 py-0.5 text-mint">fulltext(node scope)</span>}
                {result.model.indexNodeName && <span className="rounded bg-panel2 px-2 py-0.5 text-mint">nodename</span>}
                {result.model.join && <span className="rounded bg-panel2 px-2 py-0.5 text-danger">JOIN</span>}
                {result.model.orCount > 0 && <span className="rounded bg-panel2 px-2 py-0.5 text-warn">OR ×{result.model.orCount}</span>}
                {result.model.orderBy.map((o) => (
                  <span key={o.name} className="rounded bg-panel2 px-2 py-0.5">order: {o.name} {o.desc ? "↓" : "↑"}</span>
                ))}
              </div>

              {indexHealth && (
                <div>
                  <p className="eyebrow mb-1">/analysis/health</p>
                  <div className="rounded border border-line bg-panel p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-dim">Overall score</p>
                        <p className="font-mono text-2xl text-oak">{indexHealth.score}<span className="text-sm text-dim">/100</span></p>
                      </div>
                      <span
                        className={`rounded px-2.5 py-1 text-xs font-mono ${
                          indexHealth.category === "Excellent" ? "bg-mint/20 text-mint" :
                          indexHealth.category === "Good" ? "bg-oak/20 text-oak" :
                          indexHealth.category === "Needs improvement" ? "bg-warn/20 text-warn" :
                          "bg-danger/20 text-danger"
                        }`}
                      >
                        {indexHealth.category}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-1.5 border-t border-line pt-2">
                      {indexHealth.checks.map((c, i) => (
                        <li key={i} className="text-xs">
                          <span className="font-mono text-oak">{c.dimension}</span>{" "}
                          <span className="font-mono text-dim">({c.target})</span>{" "}
                          <span className={`font-mono ${c.deduction > 0 ? "text-danger" : "text-mint"}`}>
                            {c.deduction > 0 ? `-${c.deduction}` : "✓"}
                          </span>
                          <p className="mt-0.5 text-dim">{c.reasoning}</p>
                          {c.deduction > 0 && <KnowledgeList categoryKey={c.dimension} platform={target} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {performanceEstimate && (
                <div>
                  <p className="eyebrow mb-1">/analysis/performance-estimate</p>
                  <div className="rounded border border-line bg-panel p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <p className="text-[11px] text-dim">Estimated complexity</p>
                        <p className={`font-mono text-lg ${
                          performanceEstimate.complexity === "Low" ? "text-mint" :
                          performanceEstimate.complexity === "Medium" ? "text-warn" : "text-danger"
                        }`}>
                          {performanceEstimate.complexity}
                          <span className="ml-1 text-xs text-dim">({performanceEstimate.complexityScore}/100 heuristic)</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-dim">Estimated Oak cost (heuristic units)</p>
                        <p className="font-mono text-fg">~{performanceEstimate.estimatedCostRange.low}–{performanceEstimate.estimatedCostRange.high}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-dim">Confidence</p>
                        <p className="font-mono text-fg">{performanceEstimate.confidence}/100</p>
                      </div>
                    </div>
                    <p className="mt-2 text-dim">{performanceEstimate.confidenceReasoning}</p>

                    <ul className="mt-3 space-y-1.5 border-t border-line pt-2">
                      {performanceEstimate.factors.map((f, i) => (
                        <li key={i}>
                          <span className="font-mono text-oak">{f.name}</span>{" "}
                          <span className={`font-mono ${f.impact === "high" ? "text-danger" : f.impact === "medium" ? "text-warn" : "text-mint"}`}>
                            [{f.impact}]
                          </span>
                          <p className="mt-0.5 text-fg">{f.estimate}</p>
                          <p className="mt-0.5 text-dim">Assumption: {f.assumption}</p>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 border-t border-line pt-2">
                      <p className="mb-1 text-[11px] text-dim">Assumptions behind this estimate</p>
                      <ul className="list-disc space-y-1 pl-4 text-dim">
                        {performanceEstimate.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>

                    <p className="mt-3 border-t border-line pt-2 text-[11px] text-warn">{performanceEstimate.disclaimer}</p>
                  </div>
                </div>
              )}

              {props.length > 0 && (
                <div>
                  <p className="eyebrow mb-1">/analysis/properties</p>
                  <table className="w-full text-left text-xs">
                    <thead className="text-dim">
                      <tr className="border-b border-line">
                        <th className="py-1 pr-2 font-normal">property</th>
                        <th className="py-1 pr-2 font-normal">ops</th>
                        <th className="py-1 pr-2 font-normal">type</th>
                        <th className="py-1 font-normal">flags</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {props.map((p) => (
                        <tr key={p.name} className="border-b border-line/50 align-top">
                          <td className="py-1.5 pr-2 text-fg">{p.func ? `${p.func}(${p.name})` : p.name}</td>
                          <td className="py-1.5 pr-2 text-dim">{p.ops.join(",")}</td>
                          <td className="py-1.5 pr-2 text-oak">{p.type}</td>
                          <td className="py-1.5 text-mint">
                            {[p.ordered && "ordered", p.analyzed && "analyzed", p.facet && "facet",
                              p.multi && "multi", p.nullCheck && "null", p.notNullCheck && "notNull"]
                              .filter(Boolean).join(" ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <p className="eyebrow mb-1">/analysis/reasoning</p>
                <ul className="space-y-1.5">
                  {result.reasons.map((r, i) => (
                    <li key={i} className="rounded border border-line bg-panel p-2 text-xs">
                      <span className="font-mono text-oak">{r.target}</span>{" "}
                      <span className="font-mono text-mint">{r.attribute}</span>
                      <p className="mt-0.5 text-dim">{r.why}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {selectorModel && selectorModel.selectors.length > 0 && (
                <div>
                  <p className="eyebrow mb-1">/analysis/selectors</p>
                  <div className="space-y-2">
                    {selectorModel.selectors.map((s) => (
                      <div key={s.alias} className="rounded border border-line bg-panel p-2 text-xs">
                        <p className="text-[11px] text-dim">Selector</p>
                        <p className="font-mono text-oak">{s.alias}</p>
                        <p className="mt-1 text-[11px] text-dim">Type</p>
                        <p className="font-mono">{s.nodeType}</p>
                        {s.paths.length > 0 && (
                          <>
                            <p className="mt-1 text-[11px] text-dim">Path restriction</p>
                            <p className="font-mono">{s.paths.join(", ")}</p>
                          </>
                        )}
                      </div>
                    ))}

                    {selectorModel.joins.map((j, i) => (
                      <div key={i} className="rounded border border-line bg-panel p-2 text-xs">
                        <p className="text-[11px] text-dim">Join ({j.type})</p>
                        <p className="font-mono text-mint">{j.condition || "(no ON condition)"}</p>
                      </div>
                    ))}

                    <div className="rounded border border-line bg-panel p-2 text-xs">
                      <p className="mb-1 text-[11px] text-dim">Properties</p>
                      {selectorModel.selectors.map((s) => (
                        <div key={s.alias} className="mt-1 first:mt-0">
                          <p className="font-mono text-oak">{s.alias}</p>
                          {s.properties.length > 0 ? (
                            <ul className="font-mono text-dim">
                              {s.properties.map((p) => <li key={p}>{p}</li>)}
                            </ul>
                          ) : (
                            <p className="text-dim">(no queried properties)</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {selectorModel.orderBy.length > 0 && (
                      <div className="rounded border border-line bg-panel p-2 text-xs">
                        <p className="mb-1 text-[11px] text-dim">Order by</p>
                        {selectorModel.orderBy.map((o, i) => (
                          <p key={i} className="font-mono">
                            {o.selector ? `${o.selector}.` : ""}{o.name} {o.desc ? "↓" : "↑"}
                          </p>
                        ))}
                      </div>
                    )}

                    {selectorModel.groupBy.length > 0 && (
                      <div className="rounded border border-line bg-panel p-2 text-xs">
                        <p className="mb-1 text-[11px] text-dim">Grouping</p>
                        <p className="font-mono">{selectorModel.groupBy.join(", ")}</p>
                      </div>
                    )}

                    {selectorModel.parseErrors.length > 0 && (
                      <ul className="space-y-1">
                        {selectorModel.parseErrors.map((e, i) => (
                          <li key={i} className="flex gap-1.5 text-[11px] text-danger">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{e}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {selectorPropertyWarnings.length > 0 && (
                <div>
                  <p className="eyebrow mb-1">/analysis/selector-warnings</p>
                  <ul className="space-y-1.5">
                    {selectorPropertyWarnings.map((w, i) => (
                      <li key={i} className="rounded border border-danger/50 bg-panel p-2 text-xs">
                        <p className="flex items-center gap-1.5 font-mono text-danger">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          WARNING
                        </p>
                        <p className="mt-1.5 text-[11px] text-dim">Property</p>
                        <p className="font-mono text-oak">{w.property}</p>
                        <p className="mt-1 text-[11px] text-dim">belongs to selector</p>
                        <p className="font-mono">{w.owningSelector}</p>
                        <p className="mt-1 text-[11px] text-dim">Current generated index</p>
                        <p className="font-mono">{w.generatedIndexNodeType}</p>
                        <p className="mt-1 text-[11px] text-dim">Recommended</p>
                        <p className="text-dim">{w.recommendation}</p>
                        <KnowledgeList categoryKey="selector-ownership" platform={target} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {qualityIssues.length > 0 && (
                <div>
                  <p className="eyebrow mb-1">/analysis/quality</p>
                  <ul className="space-y-1.5">
                    {qualityIssues.map((iss, i) => (
                      <li key={i} className="rounded border border-line bg-panel p-2 text-xs">
                        <p className="text-[11px] text-dim">Problem</p>
                        <p className="font-mono text-fg">{iss.problem}</p>
                        <p className="mt-1 text-[11px] text-dim">Why it hurts Oak</p>
                        <p className="text-dim">{iss.why}</p>
                        <p className="mt-1 text-[11px] text-dim">Recommended rewrite</p>
                        <p className="text-mint">{iss.recommendedRewrite}</p>
                        <p className="mt-1 text-[11px] text-dim">Performance impact</p>
                        <p className={`font-mono ${iss.performanceImpact === "high" ? "text-danger" : iss.performanceImpact === "medium" ? "text-warn" : "text-mint"}`}>
                          {iss.performanceImpact}
                        </p>
                        <KnowledgeList categoryKey={iss.category} platform={target} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {explainExplanation && (
                <div>
                  <p className="eyebrow mb-1">/analysis/explain</p>
                  <div className="space-y-2">
                    <div className="rounded border border-line bg-panel p-2 text-xs">
                      <p className="mb-1 text-[11px] text-dim">Candidate indexes</p>
                      <table className="w-full text-left font-mono">
                        <tbody>
                          {explainCostReport.candidates.map((c) => (
                            <tr key={c.name} className="border-b border-line/50 last:border-0">
                              <td className="py-1 pr-2">{c.name}</td>
                              <td className="py-1 pr-2 text-dim">cost={c.cost}</td>
                              <td className={`py-1 ${c.name === explainCostReport.chosen?.name ? "text-mint" : "text-danger"}`}>
                                {c.name === explainCostReport.chosen?.name ? "chosen" : "rejected"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="rounded border border-line bg-panel p-2 text-xs">
                      <p className="mb-1 text-[11px] text-dim">Why Oak selected this index</p>
                      <p className="text-fg">{explainExplanation.whyChosen}</p>
                    </div>

                    {explainExplanation.whyRejected.length > 0 && (
                      <div className="rounded border border-line bg-panel p-2 text-xs">
                        <p className="mb-1 text-[11px] text-dim">Why others were rejected</p>
                        <ul className="space-y-1.5">
                          {explainExplanation.whyRejected.map((r, i) => (
                            <li key={i}>
                              <span className="font-mono text-oak">{r.index}</span>{" "}
                              <span className="text-dim">{r.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {explainExplanation.potentialImprovements.length > 0 && (
                      <div className="rounded border border-line bg-panel p-2 text-xs">
                        <p className="mb-1 text-[11px] text-dim">Potential improvements</p>
                        <ul className="space-y-1.5">
                          {explainExplanation.potentialImprovements.map((imp, i) => (
                            <li key={i}>
                              <span className="font-mono text-warn">{imp.category}</span>{" "}
                              <span className="text-dim">{imp.detail}</span>
                              <KnowledgeList categoryKey={imp.category} platform={target} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {parsedExistingXml.error && (
                <div>
                  <p className="eyebrow mb-1">/analysis/xml-compare</p>
                  <p className="flex items-center gap-1.5 rounded border border-danger/50 bg-panel p-2 text-xs text-danger">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {parsedExistingXml.error}
                  </p>
                </div>
              )}

              {parsedExistingXml.def && !indexDiffReport && result && result.model.source !== "SQL2" && (
                <div>
                  <p className="eyebrow mb-1">/analysis/xml-compare</p>
                  <p className="rounded border border-line bg-panel p-2 text-xs text-dim">
                    Existing-index comparison currently supports SQL2 queries only — switch the input tab to SQL2 to compare.
                  </p>
                </div>
              )}

              {indexDiffReport && (
                <div>
                  <p className="eyebrow mb-1">/analysis/xml-compare</p>
                  {indexDiffReport.findings.length === 0 ? (
                    <p className="rounded border border-line bg-panel p-2 text-xs text-mint">
                      No differences found — the pasted index matches what this query needs.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {(["Missing", "Extra", "Incorrect"] as const).map((bucket) => {
                        const items = indexDiffReport.findings.filter((f) => f.bucket === bucket);
                        if (!items.length) return null;
                        return (
                          <div key={bucket} className="rounded border border-line bg-panel p-2 text-xs">
                            <p className={`mb-1 font-mono ${bucket === "Missing" ? "text-warn" : bucket === "Extra" ? "text-oak" : "text-danger"}`}>
                              {bucket} ({items.length})
                            </p>
                            <ul className="space-y-1.5">
                              {items.map((f, i) => (
                                <li key={i} className="border-t border-line/50 pt-1.5 first:border-0 first:pt-0">
                                  <p className="font-mono text-fg">{f.target} <span className="text-dim">({f.category})</span></p>
                                  <p className="mt-0.5 text-dim">{f.detail}</p>
                                  <p className="mt-0.5 text-mint">Suggested fix: {f.suggestedFix}</p>
                                  <KnowledgeList categoryKey={f.category} platform={target} />
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right: generated index */}
        <section className="flex min-h-0 flex-col bg-ink">
          <div className="flex items-center justify-between border-b border-line px-3">
            <div className="flex overflow-x-auto">
              {OUT_TABS.map((t) => (
                <TabButton key={t} label={t} active={outTab === t} onClick={() => setOutTab(t)} nowrap />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={copyXml} title="Copy XML (Ctrl/Cmd+Shift+X)" disabled={!outputs}
                className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak disabled:opacity-30">
                <FileCode2 className="h-4 w-4" />
              </button>
              <button onClick={copy} title="Copy current tab" className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak">
                {copied ? <CheckCircle2 className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
              </button>
              <button onClick={download} title="Download" className="rounded p-1.5 text-dim hover:bg-panel2 hover:text-oak">
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
          {result && (
            <p className="border-b border-line px-3 py-1.5 font-mono text-xs text-dim">
              <FileCode2 className="mr-1 inline h-3.5 w-3.5 text-oak" />
              /oak:index/<span className="text-oak">{result.indexName}</span>
            </p>
          )}
          <div className="min-h-0 flex-1">
            <Monaco
              theme="vs-dark"
              language={outTab === "JSON" ? "json" : outTab === ".content.xml" ? "xml" : "plaintext"}
              value={outputs ? outputs[outTab] : "// waiting for a query"}
              options={{ ...editorOpts, readOnly: true }}
            />
          </div>
        </section>
      </div>

      {/* Bottom: warnings / suggestions / score */}
      <footer className="grid max-h-56 grid-cols-1 gap-px overflow-hidden border-t border-line bg-line lg:grid-cols-[1fr_1fr_360px]">
        <div className="overflow-y-auto bg-panel p-3">
          <p className="eyebrow mb-2">/warnings</p>
          {!result?.warnings.length ? (
            <p className="text-xs text-dim">No warnings.</p>
          ) : (
            <ul className="space-y-1.5">
              {result.warnings.map((w, i) => (
                <li key={i} className="flex gap-2 text-xs text-fg">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="overflow-y-auto bg-panel p-3">
          <p className="eyebrow mb-2">/suggestions</p>
          <ul className="space-y-1.5">
            {result?.suggestions.map((s, i) => (
              <li key={i} className="flex gap-2 text-xs text-fg">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-oak" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-center gap-3 bg-panel p-4">
          <p className="eyebrow">/performance</p>
          <ScoreBar label="Query today (no new index)" value={result?.scoreBefore ?? 0} accent="rgb(var(--color-danger))" />
          <ScoreBar label="With generated index" value={result?.scoreAfter ?? 0} accent="rgb(var(--color-mint))" />
          <p className="text-[10px] leading-snug text-dim">
            Heuristic estimate from static analysis. Real cost depends on repository size and index statistics — verify with Explain Query after deployment.
          </p>
        </div>
      </footer>
    </main>
  );
}
