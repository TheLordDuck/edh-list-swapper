// src/app/dashboard/compare-decks/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type DiffItem = { name: string; qty: number };
type ScryfallCard = {
  name: string;
  image_uris?: { normal?: string };
  card_faces?: { image_uris?: { normal?: string } }[];
};

function normalizeKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u02BC]/g, "'") // comillas curvas -> recta
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type CardEntry = { name: string; qty: number };

function parseList(text: string): Map<string, CardEntry> {
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

function totalCards(map: Map<string, CardEntry>): number {
  let total = 0;
  map.forEach((entry) => (total += entry.qty));
  return total;
}

function diffDecks(
  current: Map<string, CardEntry>,
  target: Map<string, CardEntry>,
) {
  const out: DiffItem[] = [];
  current.forEach((entry, key) => {
    const targetEntry = target.get(key);
    const targetQty = targetEntry?.qty ?? 0;
    if (targetQty < entry.qty) {
      out.push({ name: entry.name, qty: entry.qty - targetQty });
    }
  });

  const into: DiffItem[] = [];
  target.forEach((entry, key) => {
    const currentEntry = current.get(key);
    const currentQty = currentEntry?.qty ?? 0;
    if (currentQty < entry.qty) {
      into.push({ name: entry.name, qty: entry.qty - currentQty });
    }
  });

  out.sort((x, y) => x.name.localeCompare(y.name));
  into.sort((x, y) => x.name.localeCompare(y.name));
  return { out, into };
}

function getCardImage(card: ScryfallCard): string | null {
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris!.normal!;
  }
  return null;
}

async function fetchImages(
  names: string[],
): Promise<Record<string, string | null>> {
  const cache: Record<string, string | null> = {};
  for (let i = 0; i < names.length; i += 75) {
    const chunk = names.slice(i, i + 75);
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
      });
      const json = await res.json();
      (json.data || []).forEach((card: ScryfallCard) => {
        cache[card.name] = getCardImage(card);
      });
    } catch {
      chunk.forEach((n) => {
        cache[n] = null;
      });
    }
  }
  names.forEach((n) => {
    if (!(n in cache)) {
      const found = Object.keys(cache).find(
        (k) => k.toLowerCase() === n.toLowerCase(),
      );
      cache[n] = found ? cache[found] : null;
    }
  });
  return cache;
}

export default function CompareDecksPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deckNames, setDeckNames] = useState<string[]>([]);
  const [decksLoading, setDecksLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [currentDeck, setCurrentDeck] = useState("");
  const [targetDeck, setTargetDeck] = useState("");
  const [status, setStatus] = useState("");
  const [comparing, setComparing] = useState(false);
  const [diffResult, setDiffResult] = useState<{
    out: DiffItem[];
    into: DiffItem[];
  } | null>(null);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [totals, setTotals] = useState<{
    current: number;
    target: number;
  } | null>(null);

  async function refreshDecks() {
    const res = await fetch("/api/decks");
    const json = await res.json();
    setDeckNames(json.decks || []);
  }

  useEffect(() => {
    let ignore = false;

    async function loadInitialDecks() {
      try {
        const res = await fetch("/api/decks");
        const json = await res.json();
        if (!ignore) setDeckNames(json.decks || []);
      } finally {
        if (!ignore) setDecksLoading(false);
      }
    }

    loadInitialDecks();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus(`Subiendo ${file.name}...`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/decks", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al subir el mazo");
      setStatus(`Mazo "${json.name}" guardado.`);
      await refreshDecks();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error al subir el mazo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteDeck(name: string) {
    await fetch(`/api/decks/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (currentDeck === name) setCurrentDeck("");
    if (targetDeck === name) setTargetDeck("");
    await refreshDecks();
  }

  function handleSwap() {
    setCurrentDeck(targetDeck);
    setTargetDeck(currentDeck);
  }

  async function fetchDeckContent(name: string): Promise<string> {
    const res = await fetch(`/api/decks/${encodeURIComponent(name)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "No se pudo leer el mazo");
    return json.content as string;
  }

  async function handleCompare() {
    if (!currentDeck || !targetDeck) {
      setStatus("Elige los dos mazos.");
      return;
    }

    setComparing(true);
    setDiffResult(null);
    setStatus("Cargando mazos...");

    try {
      const [currentContent, targetContent] = await Promise.all([
        fetchDeckContent(currentDeck),
        fetchDeckContent(targetDeck),
      ]);

      const a = parseList(currentContent);
      const b = parseList(targetContent);
      const { out, into } = diffDecks(a, b);
      const allNames = [...out, ...into].map((i) => i.name);

      setTotals({ current: totalCards(a), target: totalCards(b) });

      setStatus(`Buscando imágenes en Scryfall (${allNames.length} cartas)...`);
      const fetchedImages = await fetchImages(allNames);

      setImages(fetchedImages);
      setDiffResult({ out, into });
      setStatus(`Comparado: ${out.length} fuera, ${into.length} dentro.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error al comparar");
    } finally {
      setComparing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f14] text-[#f0eef7] p-6">
      {/* Subida de mazos */}
      <div className="bg-[#1a1a22] border border-[#2c2c38] rounded-lg p-4 mb-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#8c8a9c] mb-3">
          Mazos guardados
        </h2>

        <div className="flex items-center gap-3 mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            onChange={handleFileChange}
            disabled={uploading}
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#8a6fe8] file:text-white file:px-4 file:py-2 file:text-sm file:font-semibold file:cursor-pointer hover:file:brightness-110 disabled:opacity-50"
          />
          {uploading && (
            <span className="text-sm text-[#8c8a9c]">Subiendo...</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {decksLoading ? (
            <>
              <div className="h-6 w-28 rounded-full bg-[#2c2c38] animate-pulse" />
              <div className="h-6 w-20 rounded-full bg-[#2c2c38] animate-pulse" />
              <div className="h-6 w-32 rounded-full bg-[#2c2c38] animate-pulse" />
            </>
          ) : deckNames.length === 0 ? (
            <span className="text-xs text-[#8c8a9c]">
              Todavía no has subido ningún mazo.
            </span>
          ) : (
            deckNames.map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 bg-[#0f0f14] border border-[#2c2c38] rounded-full pl-3 pr-2 py-1 text-xs"
              >
                <span>{name}</span>
                <button
                  onClick={() => handleDeleteDeck(name)}
                  className="text-[#8c8a9c] hover:text-[#ff4d6d] px-1"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Selector de comparación */}
      <div className="bg-[#1a1a22] border border-[#2c2c38] rounded-lg p-4 mb-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#8c8a9c] mb-3">
          Comparar
        </h2>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <label
              htmlFor="currentDeckSelect"
              className="block text-xs font-semibold uppercase tracking-wide text-[#8c8a9c] mb-1.5"
            >
              Mazo actual (configurado)
            </label>
            <select
              id="currentDeckSelect"
              aria-label="Mazo actual"
              value={currentDeck}
              onChange={(e) => setCurrentDeck(e.target.value)}
              disabled={decksLoading}
              suppressHydrationWarning
              className="w-full bg-[#0f0f14] border border-[#2c2c38] rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">— elegir —</option>
              {deckNames
                .filter((name) => name !== targetDeck)
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </div>
          <button
            onClick={handleSwap}
            title="Intercambiar"
            className="bg-transparent border border-[#2c2c38] text-[#8c8a9c] rounded-lg px-3 h-[38px]"
          >
            ⇄
          </button>
          <div>
            <label
              htmlFor="targetDeckSelect"
              className="block text-xs font-semibold uppercase tracking-wide text-[#8c8a9c] mb-1.5"
            >
              Mazo objetivo (al que quiero pasarme)
            </label>
            <select
              id="targetDeckSelect"
              aria-label="Mazo objetivo"
              value={targetDeck}
              onChange={(e) => setTargetDeck(e.target.value)}
              disabled={decksLoading}
              suppressHydrationWarning
              className="w-full bg-[#0f0f14] border border-[#2c2c38] rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">— elegir —</option>
              {deckNames
                .filter((name) => name !== currentDeck)
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleCompare}
            disabled={comparing}
            className="bg-[#8a6fe8] hover:brightness-110 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-semibold"
          >
            Comparar
          </button>
          <span className="text-sm text-[#8c8a9c]">{status}</span>
        </div>
      </div>

      {/* Resultados */}
      {comparing && <ResultsSkeleton />}

      {!comparing && diffResult && (
        <>
          {totals && (
            <div className="flex items-center gap-4 text-xs text-[#8c8a9c] mb-2">
              <span>Actual: {totals.current} cartas</span>
              <span>Objetivo: {totals.target} cartas</span>
              {totals.current !== totals.target && (
                <span className="text-[#ffb454] font-semibold">
                  ⚠ Los mazos no tienen el mismo total de cartas — el número de
                  fuera y dentro no va a cuadrar.
                </span>
              )}
            </div>
          )}
          <div className="flex gap-6 text-sm mb-4">
            <div className="text-[#ff4d6d] font-semibold">
              {diffResult.out.length} fuera
            </div>
            <div className="text-[#2ee07a] font-semibold">
              {diffResult.into.length} dentro
            </div>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <ResultColumn
              title="Salen"
              items={diffResult.out}
              sign="-"
              color="red"
              images={images}
            />
            <ResultColumn
              title="Entran"
              items={diffResult.into}
              sign="+"
              color="green"
              images={images}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  const skeletonCard = (i: number) => (
    <div
      key={i}
      className="rounded-lg overflow-hidden border-2 border-[#2c2c38] bg-[#1a1a22] animate-pulse"
    >
      <div className="w-full aspect-[5/7] bg-[#23232e]" />
      <div className="px-2 py-2">
        <div className="h-2.5 bg-[#2c2c38] rounded w-4/5" />
      </div>
    </div>
  );

  return (
    <>
      <div className="flex gap-6 mb-4">
        <div className="h-4 w-16 rounded bg-[#2c2c38] animate-pulse" />
        <div className="h-4 w-20 rounded bg-[#2c2c38] animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div>
          <div className="h-4 w-12 rounded bg-[#2c2c38] animate-pulse mb-3" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {Array.from({ length: 6 }).map((_, i) => skeletonCard(i))}
          </div>
        </div>
        <div>
          <div className="h-4 w-14 rounded bg-[#2c2c38] animate-pulse mb-3" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {Array.from({ length: 6 }).map((_, i) => skeletonCard(i))}
          </div>
        </div>
      </div>
    </>
  );
}

function ResultColumn({
  title,
  items,
  sign,
  color,
  images,
}: {
  title: string;
  items: DiffItem[];
  sign: string;
  color: "red" | "green";
  images: Record<string, string | null>;
}) {
  const isRed = color === "red";
  const titleColor = isRed ? "text-[#ff4d6d]" : "text-[#2ee07a]";
  const cardBorder = isRed ? "border-[#ff4d6d]" : "border-[#2ee07a]";
  const cardBg = isRed ? "bg-[#ff4d6d26]" : "bg-[#2ee07a26]";
  const qtyBg = isRed ? "bg-[#ff4d6d]" : "bg-[#2ee07a]";
  const glow = isRed
    ? "shadow-[0_0_0_1px_rgba(255,77,109,0.25)]"
    : "shadow-[0_0_0_1px_rgba(46,224,122,0.25)]";

  return (
    <div>
      <h2 className={`text-sm font-bold mb-3 ${titleColor}`}>{title}</h2>
      {items.length === 0 ? (
        <div className="text-sm text-[#8c8a9c] py-5">
          {isRed ? "Nada que quitar." : "Nada que añadir."}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {items.map((item) => {
            const img = images[item.name];
            return (
              <div
                key={item.name}
                className={`relative rounded-lg overflow-hidden border-2 ${cardBorder} ${cardBg} ${glow}`}
              >
                <span
                  className={`absolute top-1.5 right-1.5 text-xs font-extrabold text-black px-1.5 py-0.5 rounded ${qtyBg}`}
                >
                  {sign}
                  {item.qty}
                </span>
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img}
                    alt={item.name}
                    loading="lazy"
                    className="w-full aspect-[5/7] object-cover bg-black"
                  />
                )}
                <div
                  className={`px-2 py-1.5 text-[11px] leading-tight font-medium ${img ? "" : "pt-3.5"}`}
                >
                  {item.name}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
