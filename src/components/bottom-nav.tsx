"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { cn } from "@/components/ui";

type Item = { href: string; labelKey: DictKey; icon: string };

const PLAYER_ITEMS: Item[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "🏠" },
  { href: "/log", labelKey: "nav.log", icon: "➕" },
  { href: "/plan", labelKey: "nav.plan", icon: "📋" },
  { href: "/leaderboards", labelKey: "nav.leaderboards", icon: "🏆" },
  { href: "/settings", labelKey: "nav.settings", icon: "⚙️" },
];

const TEAM_ITEM: Item = { href: "/team", labelKey: "nav.team", icon: "👥" };

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useT();
  // The team area is readable by every member (read-only for non-trainers), so
  // the Team tab is shown to everyone. Keep it before Settings.
  const items = [...PLAYER_ITEMS.slice(0, 4), TEAM_ITEM, PLAYER_ITEMS[4]];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-slate-200 bg-white/95 backdrop-blur bottom-safe">
      <ul className="flex">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                  active ? "text-teal-700" : "text-slate-500",
                )}
              >
                <span className={cn("text-lg leading-none", active && "scale-110")}>{item.icon}</span>
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
