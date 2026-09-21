# EDH List Swapper

A small Next.js tool for Commander (EDH) players who keep swapping cards between decks. Upload two decklists as `.txt` files, pick which one is your **current** build and which is the **target** you want to switch to, and get a side-by-side diff — cards to take out, cards to put in, with Scryfall art for each — instead of comparing two text files by eye.

## Features

- **Upload & store decklists** as plain `.txt` files (one line per card: `<qty> <card name>`)
- **Pick current vs. target** deck and swap them with one click
- **Diff view** showing exactly what comes **out** and what goes **in**, with quantities
- **Card images** pulled from the [Scryfall API](https://scryfall.com/docs/api) for every card in the diff
- Warns you if the two decklists don't add up to the same total card count
- Delete saved decklists you no longer need

## How it works

Decklists are plain text, one card per line:

```
1 Sol Ring
1 Arcane Signet
10 Forest
```

Lines are matched by normalized card name (accents/curly quotes/whitespace are ignored), so the diff is based on name + quantity, not exact text. Uploaded lists are stored as `.txt` files under `data/decks/` on the server.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React 19
- TypeScript
- Tailwind CSS 4
- Filesystem-backed API routes (`app/api/decks`) for storing/reading/deleting decklists
- [Scryfall](https://scryfall.com/docs/api) `cards/collection` endpoint for card images

## Getting started

Install dependencies and run the dev server (this project uses [pnpm](https://pnpm.io)):

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and upload a couple of `.txt` decklists to try it out.

## Available scripts

| Command      | Description                       |
| ------------ | ---------------------------------- |
| `pnpm dev`   | Start the development server       |
| `pnpm build` | Build the app for production       |
| `pnpm start` | Run the production build           |
| `pnpm lint`  | Run ESLint                         |

## Project structure

```
app/
  page.tsx              # Main UI: upload, deck picker, diff results
  api/decks/            # REST-ish API for listing/uploading decklists
  api/decks/[name]/     # Read/delete a single decklist
data/decks/             # Uploaded .txt decklists (gitignored)
```

## Notes

- Uploaded decklists are stored on disk (`data/decks/*.txt`), which are excluded from git — they won't persist across deployments unless the hosting platform provides persistent storage.
- The app builds with `output: "standalone"` in `next.config.ts`, which suits container-based deployments (e.g. Railway/Nixpacks).
