import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT, type ServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { addDays } from "@/lib/dates";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import { StrengthWorkoutView } from "@/components/strength-workout-view";

type FeedLog = {
  id: string;
  userId: string;
  userName: string;
  date: Date;
  category: string;
  status: string;
  auto: boolean;
  durationMin: number | null;
  missReason: string | null;
  practiceSlotId: string | null;
  practiceLabel: string | null;
  details: string | null;
};

/** yyyy-mm-dd in local time, used as the day-group key. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function noteFromDetails(details: string | null): string | null {
  if (!details) return null;
  try {
    const d = JSON.parse(details) as { note?: string; zone?: string };
    return d.note ?? d.zone ?? null;
  } catch {
    return null;
  }
}

export default async function FeedPage() {
  await requireUser();
  const { t } = await getServerT();

  // Last 7 days by the DONE/MISSED `date` field (not createdAt).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = addDays(today, -6);
  const end = addDays(today, 1); // exclusive upper bound = tomorrow midnight

  const rows = await prisma.sessionLog.findMany({
    // The feed is "what people DID" — exclude auto-generated MISSED rows entirely.
    // (The in-week per-practice missed-rugby "add yourself" affordance lives on the
    // dashboard / profile, not here.)
    where: {
      date: { gte: start, lt: end },
      NOT: { status: "MISSED", auto: true },
    },
    orderBy: { date: "desc" },
    include: {
      user: { select: { name: true } },
      practiceSlot: { select: { label: true } },
    },
  });

  const logs: FeedLog[] = rows.map((l) => ({
    id: l.id,
    userId: l.userId,
    userName: l.user.name,
    date: l.date,
    category: l.category,
    status: l.status,
    auto: l.auto,
    durationMin: l.durationMin,
    missReason: l.missReason,
    practiceSlotId: l.practiceSlotId,
    practiceLabel: l.practiceSlot?.label ?? null,
    details: l.details,
  }));

  // Group by day (most recent first).
  const byDay = new Map<string, FeedLog[]>();
  for (const l of logs) {
    const k = dayKey(l.date);
    const arr = byDay.get(k) ?? [];
    arr.push(l);
    byDay.set(k, arr);
  }
  const dayKeys = Array.from(byDay.keys()).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">{t("feed.title")}</h1>
          <p className="text-sm text-slate-500">{t("feed.subtitle")}</p>
        </div>
        <Link href="/attendance">
          <Button size="sm">🏉 {t("attendance.recordButton")}</Button>
        </Link>
      </header>

      {dayKeys.length === 0 ? (
        <p className="text-sm text-slate-500">{t("feed.empty")}</p>
      ) : (
        dayKeys.map((k) => (
          <DaySection key={k} t={t} label={dayLabel(t, k, today)} logs={byDay.get(k)!} />
        ))
      )}
    </div>
  );
}

function dayLabel(t: ServerT, key: string, today: Date): string {
  const todayKey = dayKey(today);
  const yesterdayKey = dayKey(addDays(today, -1));
  if (key === todayKey) return t("feed.today");
  if (key === yesterdayKey) return t("feed.yesterday");
  // key is yyyy-mm-dd local; reconstruct a Date for weekday + locale formatting.
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${t(`day.${date.getDay()}` as DictKey)} · ${date.toLocaleDateString()}`;
}

async function DaySection({
  t,
  label,
  logs,
}: {
  t: ServerT;
  label: string;
  logs: FeedLog[];
}) {
  // Aggregate rugby attendance by practice slot (DONE only → "{n} went to {label}").
  const rugbyDone = logs.filter(
    (l) => l.category === "RUGBY" && l.status === "DONE" && l.practiceSlotId,
  );
  const rugbyBySlot = new Map<string, FeedLog[]>();
  for (const l of rugbyDone) {
    const arr = rugbyBySlot.get(l.practiceSlotId!) ?? [];
    arr.push(l);
    rugbyBySlot.set(l.practiceSlotId!, arr);
  }

  // Everything else is listed per person (non-rugby, plus rugby MISSED / non-slot rugby).
  const others = logs.filter(
    (l) => !(l.category === "RUGBY" && l.status === "DONE" && l.practiceSlotId),
  );

  return (
    <section className="space-y-2">
      <SectionTitle>{label}</SectionTitle>
      <Card>
        <ul className="divide-y divide-slate-100">
          {Array.from(rugbyBySlot.entries()).map(([slotId, attendees]) => (
            <li key={`rugby-${slotId}`} className="text-sm">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 active:bg-slate-50">
                  <span className="font-medium text-slate-800">
                    🏉{" "}
                    {t("feed.wentToPractice", {
                      n: attendees.length,
                      label: attendees[0].practiceLabel ?? t("cat.RUGBY"),
                    })}
                  </span>
                  <span className="text-slate-400 group-open:rotate-90">›</span>
                </summary>
                <div className="px-4 pb-3 text-slate-600">
                  <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">
                    {t("feed.attendees")}
                  </p>
                  <p>{attendees.map((a) => a.userName).join(", ")}</p>
                </div>
              </details>
            </li>
          ))}

          {others.map((l) => (
            <FeedItem key={l.id} t={t} log={l} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

async function FeedItem({ t, log }: { t: ServerT; log: FeedLog }) {
  const missed = log.status === "MISSED";
  const isStrength = log.category === "STRENGTH" && log.status === "DONE";
  const title =
    log.practiceLabel ??
    (log.category === "OTHER" && noteFromDetails(log.details)
      ? noteFromDetails(log.details)!
      : t(`cat.${log.category}` as DictKey));
  const extra = noteFromDetails(log.details);

  // A missed auto rugby practice links to attendance so the person can add themselves.
  const rugbyMissedHref =
    missed && log.category === "RUGBY" && log.practiceSlotId
      ? `/attendance?slot=${log.practiceSlotId}&date=${dayKey(log.date)}`
      : null;

  const inner = (
    <>
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-800">
          {log.userName} · {title}
        </span>
        <span className="mt-0.5 block text-slate-400">
          {log.durationMin ? `${log.durationMin} ${t("common.minutes")}` : ""}
          {extra && log.category !== "OTHER" ? `${log.durationMin ? " · " : ""}${extra}` : ""}
          {log.missReason ? ` · ${log.missReason}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {log.auto && <Badge tone="amber">{t("missed.autoBadge")}</Badge>}
        <Badge tone={missed ? "red" : "green"}>
          {t(missed ? "log.missed" : "log.done")}
        </Badge>
      </span>
    </>
  );

  if (rugbyMissedHref) {
    return (
      <li className="text-sm">
        <Link
          href={rugbyMissedHref}
          className="flex items-center justify-between gap-2 px-4 py-3 active:bg-slate-50"
        >
          {inner}
        </Link>
      </li>
    );
  }

  if (isStrength) {
    return (
      <li className="text-sm">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 active:bg-slate-50">
            {inner}
          </summary>
          <div className="px-4 pb-3">
            <StrengthWorkoutView details={log.details} />
          </div>
        </details>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 px-4 py-3 text-sm">{inner}</li>
  );
}
