export interface HistoryEntry {
  id: string;
  savedAt: number;
  label: string;
  tab: string;
  inputs: Record<string, string>;
  target: string;
}

const STORAGE_KEY = "oak-index-studio:history";
const MAX_ENTRIES = 25;

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadHistory(): HistoryEntry[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(entries: HistoryEntry[]) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full or unavailable — silently skip, this is a convenience feature only
  }
}

export function saveHistoryEntry(entry: Omit<HistoryEntry, "id" | "savedAt">): HistoryEntry[] {
  const full: HistoryEntry = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, savedAt: Date.now() };
  const entries = [full, ...loadHistory()].slice(0, MAX_ENTRIES);
  persist(entries);
  return entries;
}

export function deleteHistoryEntry(id: string): HistoryEntry[] {
  const entries = loadHistory().filter((e) => e.id !== id);
  persist(entries);
  return entries;
}
