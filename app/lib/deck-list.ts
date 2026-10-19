export type CardEntry = { name: string; qty: number };

export function normalizeKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[‘’ʼ]/g, "'") // comillas curvas -> recta
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseList(text: string): Map<string, CardEntry> {
  const map = new Map<string, CardEntry>();
  text.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) return;
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) return;
    const qty = parseInt(match[1], 10);
    const name = match[2].trim();
    const key = normalizeKey(name);
    const existing = map.get(key);
    map.set(key, {
      name: existing?.name ?? name,
      qty: (existing?.qty ?? 0) + qty,
    });
  });
  return map;
}

export function totalCards(map: Map<string, CardEntry>): number {
  let total = 0;
  map.forEach((entry) => (total += entry.qty));
  return total;
}

export async function fetchDeckContent(name: string): Promise<string> {
  const res = await fetch(`/api/decks/${encodeURIComponent(name)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "No se pudo leer el mazo");
  return json.content as string;
}
