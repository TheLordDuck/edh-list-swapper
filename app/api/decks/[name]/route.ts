// src/app/api/decks/[name]/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const DECKS_DIR = path.join(process.cwd(), "data", "decks");

function sanitizeName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 100);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const safeName = sanitizeName(name);

  try {
    const content = await fs.readFile(path.join(DECKS_DIR, `${safeName}.txt`), "utf-8");
    return NextResponse.json({ name: safeName, content });
  } catch {
    return NextResponse.json({ error: "Mazo no encontrado" }, { status: 404 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const safeName = sanitizeName(name);

  try {
    await fs.unlink(path.join(DECKS_DIR, `${safeName}.txt`));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo borrar el mazo" }, { status: 404 });
  }
}
