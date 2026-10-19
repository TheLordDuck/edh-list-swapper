// src/app/dashboard/compare-decks/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppHeader from "./components/AppHeader";
import {
  type CardEntry,
  fetchDeckContent,
  frontFace,
  normalizeKey,
  parseList,
  totalCards,
} from "./lib/deck-list";

type DiffItem = { name: string; qty: number };
type ScryfallCard = {
  name: string;
  image_uris?: { normal?: string };
  card_faces?: { image_uris?: { normal?: string } }[];
};

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
  // Scryfall solo resuelve cartas partidas / de dos caras por su primera cara
  // ("Wear", no "Wear/Tear" ni "Wear // Tear"), y responde con el nombre completo.
  const byKey: Record<string, string | null> = {};
  const queries = [...new Set(names.map(frontFace))];
  for (let i = 0; i < queries.length; i += 75) {
    const chunk = queries.slice(i, i + 75);
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
      });
      const json = await res.json();
      (json.data || []).forEach((card: ScryfallCard) => {
        byKey[normalizeKey(card.name)] = getCardImage(card);
      });
    } catch {
      // sin imagen para este bloque
    }
  }
  const images: Record<string, string | null> = {};
  names.forEach((n) => {
    images[n] = byKey[normalizeKey(n)] ?? null;
  });
  return images;
}

export default function CompareDecksPage() {
  const [deckNames, setDeckNames] = useState<string[]>([]);
  const [decksLoading, setDecksLoading] = useState(true);

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

  useEffect(() => {
    let ignore = false;

    async function loadInitialDecks() {
      try {
        const res = await fetch("/api/decks");
        const json = await res.json();
        if (ignore) return;
        const names: string[] = json.decks || [];
        setDeckNames(names);

        // Preselección desde /mazos (?actual=... / ?objetivo=...)
        const params = new URLSearchParams(window.location.search);
        const actual = params.get("actual");
        const objetivo = params.get("objetivo");
        if (actual && names.includes(actual)) setCurrentDeck(actual);
        if (objetivo && names.includes(objetivo) && objetivo !== actual) {
          setTargetDeck(objetivo);
        }
      } finally {
        if (!ignore) setDecksLoading(false);
      }
    }

    loadInitialDecks();

    return () => {
      ignore = true;
    };
  }, []);

  function handleSwap() {
    setCurrentDeck(targetDeck);
    setTargetDeck(currentDeck);
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
        <AppHeader subtitle="Qué sacar y qué meter para pasar de un mazo a otro." />

        {!decksLoading && deckNames.length < 2 && (
          <p className="rounded-xl border border-dashed border-line-strong px-5 py-6 text-center text-sm text-muted">
            Necesitas al menos dos listas para comparar.{" "}
            <Link href="/mazos" className="font-semibold text-gold hover:text-gold-light">
              Sube tus decklists en Mis listas
            </Link>
            .
          </p>
        )}

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
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt={item.name}
                      loading="lazy"
                      className="w-full aspect-[5/7] object-cover bg-black"
                    />
                    <div className="px-2.5 py-2 text-xs leading-tight font-medium">
                      {item.name}
                    </div>
                  </>
                ) : (
                  <div className="w-full aspect-[5/7] bg-[#22232a] flex flex-col items-center justify-center gap-2 p-3 text-center">
                    <span className="font-display text-[15px]">{item.name}</span>
                    <span className="text-[11px] text-muted">Sin imagen en Scryfall</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
