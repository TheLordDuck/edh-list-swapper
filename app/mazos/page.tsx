"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppHeader from "../components/AppHeader";
import {
  type CardEntry,
  fetchDeckContent,
  parseList,
  totalCards,
} from "../lib/deck-list";

type DeckDetail = {
  content: string;
  total: number;
  cards: CardEntry[];
};

const EDH_SIZE = 100;

async function loadDeck(name: string): Promise<DeckDetail> {
  const content = await fetchDeckContent(name);
  const map = parseList(content);
  const cards = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { content, total: totalCards(map), cards };
}

export default function ManageDecksPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deckNames, setDeckNames] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, DeckDetail>>({});
  const [decksLoading, setDecksLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function refreshDecks(selectName?: string) {
    const res = await fetch("/api/decks");
    const json = await res.json();
    const names: string[] = json.decks || [];
    const loaded = await Promise.all(
      names.map(async (name) => {
        try {
          return [name, await loadDeck(name)] as const;
        } catch {
          return null;
        }
      }),
    );
    const next: Record<string, DeckDetail> = {};
    loaded.forEach((entry) => {
      if (entry) next[entry[0]] = entry[1];
    });
    setDeckNames(names);
    setDetails(next);
    setSelected((prev) => {
      if (selectName && names.includes(selectName)) return selectName;
      if (names.includes(prev)) return prev;
      return names[0] ?? "";
    });
  }

  useEffect(() => {
    let ignore = false;

    async function loadInitialDecks() {
      try {
        const res = await fetch("/api/decks");
        const json = await res.json();
        const names: string[] = json.decks || [];
        const loaded = await Promise.all(
          names.map(async (name) => {
            try {
              return [name, await loadDeck(name)] as const;
            } catch {
              return null;
            }
          }),
        );
        if (ignore) return;
        const next: Record<string, DeckDetail> = {};
        loaded.forEach((entry) => {
          if (entry) next[entry[0]] = entry[1];
        });
        setDeckNames(names);
        setDetails(next);
        setSelected(names[0] ?? "");
      } finally {
        if (!ignore) setDecksLoading(false);
      }
    }

    loadInitialDecks();

    return () => {
      ignore = true;
    };
  }, []);

  async function uploadFiles(files: File[]) {
    const txtFiles = files.filter((f) => f.name.toLowerCase().endsWith(".txt"));
    if (txtFiles.length === 0) {
      setStatus("Solo se aceptan archivos .txt.");
      return;
    }

    setUploading(true);
    let lastName = "";
    let saved = 0;

    try {
      for (const file of txtFiles) {
        setStatus(`Subiendo ${file.name}...`);
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/decks", { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Error al subir el mazo");
        lastName = json.name;
        saved++;
      }
      setStatus(
        saved === 1 ? `Mazo "${lastName}" guardado.` : `${saved} mazos guardados.`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error al subir el mazo");
    } finally {
      await refreshDecks(lastName || undefined);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(name: string) {
    await fetch(`/api/decks/${encodeURIComponent(name)}`, { method: "DELETE" });
    setConfirmDelete(false);
    setStatus(`Mazo "${name}" borrado.`);
    const index = deckNames.indexOf(name);
    const neighbour = deckNames[index + 1] ?? deckNames[index - 1];
    await refreshDecks(neighbour);
  }

  function handleDownload(name: string) {
    const detail = details[name];
    if (!detail) return;
    const url = URL.createObjectURL(
      new Blob([detail.content], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function selectDeck(name: string) {
    setSelected(name);
    setConfirmDelete(false);
  }

  const current = selected ? details[selected] : undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 pt-8 pb-20 flex flex-col gap-8">
        <AppHeader subtitle="Sube, revisa y ordena tus decklists." />

        {/* Subida */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!uploading) uploadFiles([...e.dataTransfer.files]);
          }}
          className={`relative flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 px-6 py-8 border-2 border-dashed rounded-2xl text-center sm:text-left focus-within:outline-2 focus-within:outline-gold focus-within:outline-offset-2 ${dragging ? "border-gold bg-[#2a2213]" : "border-line-strong bg-surface hover:border-gold"} ${uploading ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D9B25F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4" />
            <path d="m6 10 6-6 6 6" />
            <path d="M4 20h16" />
          </svg>
          <span className="flex flex-col">
            <span className="font-semibold">
              {uploading ? "Subiendo..." : "Arrastra tus decklists aquí o haz clic para elegirlas"}
            </span>
            <span className="text-sm text-muted">
              Archivos <span className="font-mono">.txt</span>, una carta por línea (
              <span className="font-mono">1 Sol Ring</span>). Puedes subir varios a la vez.
            </span>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            multiple
            disabled={uploading}
            onChange={(e) => uploadFiles([...(e.target.files ?? [])])}
            className="absolute w-px h-px opacity-0 overflow-hidden"
          />
        </label>
        {status && (
          <p role="status" className="-mt-4 text-sm text-muted">
            {status}
          </p>
        )}

        <div className="flex flex-col gap-4">
          {/* Selector de lista */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="deckPicker" className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
                Mis listas
              </label>
              {!decksLoading && (
                <span className="font-mono text-xs text-muted">{deckNames.length} listas</span>
              )}
            </div>
            {decksLoading ? (
              <div className="h-[72px] rounded-xl bg-surface border border-line animate-pulse" />
            ) : deckNames.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong px-5 py-8 text-center text-sm text-muted">
                Todavía no has subido ningún mazo.
              </p>
            ) : (
              <div className="relative">
                <select
                  id="deckPicker"
                  value={selected}
                  onChange={(e) => selectDeck(e.target.value)}
                  className="appearance-none w-full min-h-[72px] pl-[18px] pr-12 bg-surface border border-gold rounded-xl font-display text-[22px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2"
                >
                  {deckNames.map((name) => {
                    const detail = details[name];
                    return (
                      <option key={name} value={name}>
                        {detail ? `${name} — ${detail.total} cartas` : name}
                      </option>
                    );
                  })}
                </select>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A3A3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            )}
          </div>

          {/* Detalle */}
          <section
            aria-label="Detalle del mazo"
            className="bg-surface border border-line rounded-2xl p-4 sm:p-6 flex flex-col gap-5 min-h-[320px]"
          >
            {!selected || !current ? (
              <p className="m-auto text-sm text-muted">
                {decksLoading ? "Cargando..." : "Elige un mazo para ver su lista."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-[28px] leading-tight break-words">
                      {selected}
                    </h2>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {current.total} cartas · {current.cards.length} distintas
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/?actual=${encodeURIComponent(selected)}`}
                      className="inline-flex items-center min-h-10 px-4 rounded-lg border border-line-strong text-[13px] font-semibold hover:border-foreground"
                    >
                      Usar como actual
                    </Link>
                    <Link
                      href={`/?objetivo=${encodeURIComponent(selected)}`}
                      className="inline-flex items-center min-h-10 px-4 rounded-lg bg-gold hover:bg-gold-light text-[#16130c] text-[13px] font-bold"
                    >
                      Usar como objetivo
                    </Link>
                  </div>
                </div>

                {current.total !== EDH_SIZE && (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[#2a2213] border border-[#6b5527] rounded-[10px] text-gold-light text-[13px]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                      <path d="M12 3 2 21h20L12 3z" />
                      <path d="M12 10v5" />
                      <path d="M12 18h.01" />
                    </svg>
                    Esta lista tiene {current.total} cartas; un mazo de Commander lleva {EDH_SIZE}.
                  </div>
                )}

                <ul className="columns-1 sm:columns-2 xl:columns-3 gap-6 text-sm">
                  {current.cards.map((card) => (
                    <li key={card.name} className="flex gap-3 py-1 break-inside-avoid border-b border-line">
                      <span className="w-6 shrink-0 text-right font-mono text-muted">{card.qty}</span>
                      <span className="min-w-0">{card.name}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-2 pt-4 mt-auto border-t border-line">
                  <button
                    type="button"
                    onClick={() => handleDownload(selected)}
                    className="inline-flex items-center gap-2 min-h-10 px-4 rounded-lg border border-line-strong text-[13px] font-semibold text-muted hover:text-foreground"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 4v12" />
                      <path d="m6 10 6 6 6-6" />
                      <path d="M4 20h16" />
                    </svg>
                    Descargar .txt
                  </button>
                  {confirmDelete ? (
                    <>
                      <span className="text-[13px] text-muted ml-auto">¿Borrar “{selected}”?</span>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="min-h-10 px-4 rounded-lg border border-line-strong text-[13px] font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(selected)}
                        className="min-h-10 px-4 rounded-lg bg-out text-[#1a0e06] text-[13px] font-bold"
                      >
                        Sí, borrar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="ml-auto inline-flex items-center gap-2 min-h-10 px-4 rounded-lg text-[13px] font-semibold text-muted hover:text-out hover:bg-line"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 7h16" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M6 7l1 13h10l1-13" />
                        <path d="M9 7V4h6v3" />
                      </svg>
                      Borrar
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
