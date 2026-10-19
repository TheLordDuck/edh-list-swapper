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
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 pt-8 pb-20 flex flex-col gap-8">
        {/* Cabecera + subida */}
        <header className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-line">
          <div className="flex items-center gap-3.5">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect x="5" y="8" width="18" height="25" rx="3" stroke="#D9B25F" strokeWidth="2" transform="rotate(-10 14 20)" />
              <rect x="17" y="7" width="18" height="25" rx="3" stroke="#EDEAE2" strokeWidth="2" transform="rotate(8 26 20)" />
            </svg>
            <div>
              <h1 className="font-display font-bold text-[28px] sm:text-[32px] leading-tight tracking-tight">
                EDH List Swapper
              </h1>
              <p className="mt-1 text-sm text-muted">
                Qué sacar y qué meter para pasar de un mazo a otro.
              </p>
            </div>
          </div>
          <label
            className={`relative inline-flex items-center gap-2.5 min-h-11 px-[18px] border border-dashed border-[#4a4b55] rounded-[10px] text-sm font-semibold focus-within:outline-2 focus-within:outline-gold focus-within:outline-offset-2 ${uploading ? "opacity-50 cursor-wait" : "cursor-pointer hover:border-gold"}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4" />
              <path d="m6 10 6-6 6 6" />
              <path d="M4 20h16" />
            </svg>
            {uploading ? "Subiendo..." : "Subir decklist (.txt)"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              onChange={handleFileChange}
              disabled={uploading}
              className="absolute w-px h-px opacity-0 overflow-hidden"
            />
          </label>
        </header>

        {/* Mazos guardados */}
        <section aria-labelledby="lib-title" className="flex flex-col gap-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="lib-title" className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
              Mazos guardados
            </h2>
            {!decksLoading && (
              <span className="font-mono text-xs text-muted">
                {deckNames.length} listas
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {decksLoading ? (
              <>
                <div className="h-10 w-40 rounded-full bg-line animate-pulse" />
                <div className="h-10 w-28 rounded-full bg-line animate-pulse" />
                <div className="h-10 w-44 rounded-full bg-line animate-pulse" />
              </>
            ) : deckNames.length === 0 ? (
              <span className="text-sm text-muted">
                Todavía no has subido ningún mazo.
              </span>
            ) : (
              deckNames.map((name) => {
                const tag =
                  name === currentDeck
                    ? "ACTUAL"
                    : name === targetDeck
                      ? "OBJETIVO"
                      : "";
                const border =
                  tag === "OBJETIVO"
                    ? "border-gold"
                    : tag === "ACTUAL"
                      ? "border-[#5a5b66]"
                      : "border-line";
                return (
                  <div
                    key={name}
                    className={`inline-flex items-center gap-1 pl-3.5 pr-1 min-h-10 bg-surface border ${border} rounded-full text-sm`}
                  >
                    <span>{name}</span>
                    {tag && (
                      <span className="font-mono text-[11px] text-muted ml-1">
                        {tag}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteDeck(name)}
                      aria-label={`Borrar ${name}`}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-full text-muted hover:text-out hover:bg-line"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Selector de comparación */}
        <section
          aria-labelledby="cmp-title"
          className="bg-surface border border-line rounded-2xl p-4 sm:p-6 flex flex-col gap-5"
        >
          <h2 id="cmp-title" className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Comparar
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <DeckSelect
              id="currentDeckSelect"
              label="Mazo actual · el que tienes montado"
              value={currentDeck}
              onChange={setCurrentDeck}
              options={deckNames.filter((name) => name !== targetDeck)}
              disabled={decksLoading}
              highlight={false}
            />
            <button
              type="button"
              onClick={handleSwap}
              aria-label="Intercambiar actual y objetivo"
              title="Intercambiar"
              className="self-center sm:self-auto w-14 h-14 sm:h-[72px] shrink-0 inline-flex items-center justify-center border border-line-strong rounded-xl text-gold hover:border-gold rotate-90 sm:rotate-0"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 4 3 8l4 4" />
                <path d="M3 8h14" />
                <path d="m17 20 4-4-4-4" />
                <path d="M21 16H7" />
              </svg>
            </button>
            <DeckSelect
              id="targetDeckSelect"
              label="Mazo objetivo · al que te quieres pasar"
              value={targetDeck}
              onChange={setTargetDeck}
              options={deckNames.filter((name) => name !== currentDeck)}
              disabled={decksLoading}
              highlight
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleCompare}
              disabled={comparing}
              className="min-h-12 px-7 bg-gold hover:bg-gold-light disabled:opacity-50 text-[#16130c] rounded-xl text-[15px] font-bold"
            >
              Comparar mazos
            </button>
            <span className="text-sm text-muted" role="status">
              {status}
            </span>
          </div>
        </section>

        {/* Resultados */}
        {comparing && <ResultsSkeleton />}

        {!comparing && diffResult && (
          <section aria-label="Resultado" className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
              <div className="flex items-baseline gap-2">
                <span className="font-display font-bold text-[44px] leading-none text-out">
                  {sumQty(diffResult.out)}
                </span>
                <span className="font-semibold">salen</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display font-bold text-[44px] leading-none text-in">
                  {sumQty(diffResult.into)}
                </span>
                <span className="font-semibold">entran</span>
              </div>
              {totals && totals.current !== totals.target && (
                <div className="inline-flex items-center gap-2.5 px-3.5 py-2.5 bg-[#2a2213] border border-[#6b5527] rounded-[10px] text-gold-light text-[13px]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                    <path d="M12 3 2 21h20L12 3z" />
                    <path d="M12 10v5" />
                    <path d="M12 18h.01" />
                  </svg>
                  Los totales no cuadran ({totals.current} vs {totals.target}):
                  salen y entran no van a ser iguales.
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ResultColumn
                title="Salen"
                subtitle={`de ${currentDeck}`}
                items={diffResult.out}
                sign="−"
                color="out"
                images={images}
              />
              <ResultColumn
                title="Entran"
                subtitle={`de ${targetDeck}`}
                items={diffResult.into}
                sign="+"
                color="in"
                images={images}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function sumQty(items: DiffItem[]): number {
  return items.reduce((n, item) => n + item.qty, 0);
}

function DeckSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
  highlight,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled: boolean;
  highlight: boolean;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold text-muted">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          suppressHydrationWarning
          className={`appearance-none w-full min-h-[72px] pl-[18px] pr-12 bg-background border rounded-xl font-display text-[22px] font-medium text-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 ${highlight ? "border-gold" : "border-line-strong"}`}
        >
          <option value="">— elegir —</option>
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A3A3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  const skeletonCard = (i: number) => (
    <div
      key={i}
      className="rounded-[10px] overflow-hidden border border-line bg-surface animate-pulse"
    >
      <div className="w-full aspect-[5/7] bg-[#22232a]" />
      <div className="px-2.5 py-2.5">
        <div className="h-2.5 bg-line rounded w-4/5" />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-7">
        <div className="h-11 w-24 rounded bg-line animate-pulse" />
        <div className="h-11 w-28 rounded bg-line animate-pulse" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((col) => (
          <div key={col} className="flex flex-col gap-3.5">
            <div className="h-9 rounded bg-line animate-pulse" />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3.5">
              {Array.from({ length: 6 }).map((_, i) => skeletonCard(i))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultColumn({
  title,
  subtitle,
  items,
  sign,
  color,
  images,
}: {
  title: string;
  subtitle: string;
  items: DiffItem[];
  sign: string;
  color: "out" | "in";
  images: Record<string, string | null>;
}) {
  const isOut = color === "out";
  const accent = isOut ? "text-out" : "text-in";
  const rule = isOut ? "border-out" : "border-in";
  const qtyBg = isOut ? "bg-out text-[#1a0e06]" : "bg-in text-[#06121d]";

  return (
    <div className="min-w-0 flex flex-col gap-3.5">
      <div className={`flex items-center gap-2.5 pb-2.5 border-b-2 ${rule}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className={accent}>
          <path d={isOut ? "M5 12h14" : "M5 12h14M12 5v14"} />
        </svg>
        <h3 className="text-lg font-bold">{title}</h3>
        <span className="text-[13px] text-muted truncate">{subtitle}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-muted py-5">
          {isOut ? "Nada que quitar." : "Nada que añadir."}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3.5">
          {items.map((item) => {
            const img = images[item.name];
            return (
              <article
                key={item.name}
                className="relative rounded-[10px] overflow-hidden bg-surface border border-line-strong"
              >
                <span
                  className={`absolute top-2 right-2 z-10 px-[7px] py-0.5 rounded-md font-mono text-xs font-bold ${qtyBg}`}
                >
                  {sign}
                  {item.qty}
                </span>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img}
                    alt={item.name}
                    loading="lazy"
                    className="w-full aspect-[5/7] object-cover bg-black"
                  />
                ) : (
                  <div className="w-full aspect-[5/7] bg-[#22232a] flex items-center justify-center p-3 text-center font-display text-[15px]">
                    {item.name}
                  </div>
                )}
                <div className="px-2.5 py-2 text-xs leading-tight font-medium">
                  {item.name}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
