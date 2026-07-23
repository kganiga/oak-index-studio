export interface ShareState {
  tab: string;
  inputs: Record<string, string>;
  target: string;
}

/** Encodes app state into a URL-safe, unicode-safe base64 string for a shareable link (in the URL hash, never sent to a server). */
export function encodeShareState(state: ShareState): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShareState(encoded: string): ShareState | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as ShareState;
  } catch {
    return null;
  }
}
