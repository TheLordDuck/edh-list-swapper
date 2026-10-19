"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Comparar" },
  { href: "/mazos", label: "Mis listas" },
];

export default function AppHeader({ subtitle }: { subtitle: string }) {
  const pathname = usePathname();

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-line">
      <div className="flex items-center gap-3.5">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <rect x="5" y="8" width="18" height="25" rx="3" stroke="#D9B25F" strokeWidth="2" transform="rotate(-10 14 20)" />
          <rect x="17" y="7" width="18" height="25" rx="3" stroke="#EDEAE2" strokeWidth="2" transform="rotate(8 26 20)" />
        </svg>
        <div>
          <Link href="/" className="font-display font-bold text-[28px] sm:text-[32px] leading-tight tracking-tight">
            EDH List Swapper
          </Link>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      <nav aria-label="Principal" className="flex gap-1 p-1 bg-surface border border-line rounded-xl">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center min-h-10 px-4 rounded-lg text-sm font-semibold ${active ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
