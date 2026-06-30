// src/app/api/decks/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const DECKS_DIR = path.join(process.cwd(), "data", "decks");

async function ensureDir() {
  await fs.mkdir(DECKS_DIR, { recursive: true });
}

function sanitizeName(raw: string): string {
  return raw
    .replace(/\.txt$/i, "")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .slice(0, 100);
}

export async function GET() {
  await ensureDir();
  const files = await fs.readdir(DECKS_DIR);
  const decks = files
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.replace(/\.txt$/, ""))
    .sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ decks });
}

export async function POST(request: NextRequest) {
  await ensureDir();

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No se ha recibido ningún archivo" }, { status: 400 });
  }

  const name = sanitizeName(file.name);
  if (!name) {
    return NextResponse.json({ error: "Nombre de archivo inválido" }, { status: 400 });
  }

  const content = await file.text();
  await fs.writeFile(path.join(DECKS_DIR, `${name}.txt`), content, "utf-8");

  return NextResponse.json({ name });
}
