// Week/period helpers. Weeks are Monday-based. A small single-timezone team is
// assumed, so we use the server's local time consistently.

export type Period = "week" | "month" | "year";

export function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  date.setDate(date.getDate() - diff);
  return date;
}

export function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

/** [start, end) range for the period containing `now`. */
export function periodRange(period: Period, now: Date = new Date()): { start: Date; end: Date } {
  if (period === "week") {
    const start = startOfWeek(now);
    return { start, end: addWeeks(start, 1) };
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start, end };
}

/** Monday starts for each week overlapping [start, end). */
export function weekStartsInRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  let cur = startOfWeek(start);
  while (cur < end) {
    out.push(new Date(cur));
    cur = addWeeks(cur, 1);
  }
  return out;
}
