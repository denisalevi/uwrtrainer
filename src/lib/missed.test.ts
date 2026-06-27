import { describe, it, expect, vi, beforeEach } from "vitest";

// `missed.ts` imports "server-only" (throws outside a server component) and the real Prisma
// client. Stub both before importing the module under test.
vi.mock("server-only", () => ({}));

// An in-memory fake of the tiny slice of the Prisma API `missed.ts` touches. Each test seeds
// `db.logs` / `db.planItems` / `db.plans` and the created/updated/deleted rows are reflected back
// so idempotency + freeze can be asserted.
type Log = {
  id: string;
  userId: string;
  date: Date;
  category: string;
  status: string;
  auto: boolean;
  practiceSlotId: string | null;
  details: string | null;
};

const db: {
  logs: Log[];
  plans: { userId: string; validFrom: Date; validTo: Date | null; items: any[] }[];
  planItems: { category: string; practiceSlotId: string | null; userId: string }[];
  setting: Record<string, string>;
  seq: number;
} = { logs: [], plans: [], planItems: [], setting: {}, seq: 0 };

function within(d: Date, gte?: Date, lt?: Date) {
  if (gte && d < gte) return false;
  if (lt && d >= lt) return false;
  return true;
}

vi.mock("@/lib/db", () => ({
  prisma: {
    planItem: {
      findMany: async ({ where }: any) =>
        db.planItems
          .filter((p) => p.category === where.category && p.practiceSlotId === where.practiceSlotId)
          .map((p) => ({ plan: { userId: p.userId } })),
    },
    plan: {
      findMany: async ({ where, select }: any) => {
        const rows = db.plans.filter((p) => p.validTo === null || true);
        return rows.map((p) => (select?.userId ? { userId: p.userId } : p));
      },
      findFirst: async ({ where }: any) =>
        db.plans.find((p) => p.userId === where.userId) ?? null,
    },
    sessionLog: {
      findMany: async ({ where }: any) =>
        db.logs.filter((l) => {
          if (where.userId && l.userId !== where.userId) return false;
          if (where.category && l.category !== where.category) return false;
          if (where.status && l.status !== where.status) return false;
          if (where.practiceSlotId && l.practiceSlotId !== where.practiceSlotId) return false;
          if (where.date && !within(l.date, where.date.gte, where.date.lt)) return false;
          return true;
        }),
      create: async ({ data }: any) => {
        const row = { id: `gen${db.seq++}`, ...data, details: data.details ?? null };
        db.logs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.logs.find((l) => l.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      deleteMany: async ({ where }: any) => {
        const ids = new Set(where.id.in);
        db.logs = db.logs.filter((l) => !ids.has(l.id));
        return { count: ids.size };
      },
    },
    setting: {
      findUnique: async ({ where }: any) =>
        where.key in db.setting ? { key: where.key, value: db.setting[where.key] } : null,
      upsert: async ({ where, create, update }: any) => {
        db.setting[where.key] = (update?.value ?? create.value) as string;
        return db.setting[where.key];
      },
    },
    $transaction: async (ops: any[]) => Promise.all(ops),
  },
}));

const { reconcileWeekForUser, isWeekReconciled, isoWeekKey, RECONCILE_GRACE_DAYS } = await import(
  "./missed"
);

// A known Monday week start.
const WEEK = new Date(2026, 4, 4); // Mon 2026-05-04
function dayInWeek(offset: number) {
  const d = new Date(WEEK);
  d.setDate(d.getDate() + offset);
  d.setHours(10, 0, 0, 0);
  return d;
}

function seedPlan(userId: string, items: any[]) {
  db.plans.push({ userId, validFrom: new Date(2026, 0, 1), validTo: null, items });
}

function addLog(l: Partial<Log>) {
  db.logs.push({
    id: `seed${db.seq++}`,
    userId: "u1",
    date: dayInWeek(2),
    category: "STRENGTH",
    status: "DONE",
    auto: false,
    practiceSlotId: null,
    details: null,
    ...l,
  });
}

function summaries() {
  return db.logs.filter((l) => l.status === "MISSED" && l.auto && !l.practiceSlotId);
}

beforeEach(() => {
  db.logs = [];
  db.plans = [];
  db.planItems = [];
  db.setting = {};
  db.seq = 0;
});

describe("isoWeekKey", () => {
  it("returns the ISO week for a Monday", () => {
    expect(isoWeekKey(WEEK)).toBe("2026-W19");
  });
});

describe("isWeekReconciled", () => {
  it("false within the grace window, true after weekEnd + grace", () => {
    const weekEnd = new Date(WEEK);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const justAfter = new Date(weekEnd);
    justAfter.setDate(justAfter.getDate() + RECONCILE_GRACE_DAYS - 1);
    const past = new Date(weekEnd);
    past.setDate(past.getDate() + RECONCILE_GRACE_DAYS + 1);
    expect(isWeekReconciled(WEEK, justAfter)).toBe(false);
    expect(isWeekReconciled(WEEK, past)).toBe(true);
  });
});

describe("reconcileWeekForUser — count shortfall", () => {
  it("creates one summary row per under-met non-rugby category with frozen target", async () => {
    seedPlan("u1", [
      { category: "STRENGTH", practiceSlotId: null, targetPerWeek: 3, note: null },
      { category: "CARDIO", practiceSlotId: null, targetPerWeek: 2, note: null },
    ]);
    addLog({ category: "STRENGTH", status: "DONE" }); // 1 of 3 strength
    // 0 of 2 cardio
    await reconcileWeekForUser(WEEK, "u1");
    const s = summaries();
    expect(s).toHaveLength(2);
    const strength = s.find((r) => r.category === "STRENGTH")!;
    expect(JSON.parse(strength.details!)).toEqual({ missed: 2, target: 3 });
    const cardio = s.find((r) => r.category === "CARDIO")!;
    expect(JSON.parse(cardio.details!)).toEqual({ missed: 2, target: 2 });
  });

  it("is idempotent — re-running keeps a single row per category", async () => {
    seedPlan("u1", [{ category: "CARDIO", practiceSlotId: null, targetPerWeek: 2, note: null }]);
    await reconcileWeekForUser(WEEK, "u1");
    await reconcileWeekForUser(WEEK, "u1");
    expect(summaries()).toHaveLength(1);
  });
});

describe("reconcileWeekForUser — rugby remainder (two buckets, no double-count)", () => {
  it("rugby short subtracts ticked-practice misses and does NOT collapse them", async () => {
    // Weekly rugby target 3. One DONE rugby, one ticked-practice auto-MISSED (bucket 1).
    seedPlan("u1", [{ category: "RUGBY", practiceSlotId: null, targetPerWeek: 3, note: null }]);
    addLog({ category: "RUGBY", status: "DONE", practiceSlotId: "slotA" });
    addLog({ category: "RUGBY", status: "MISSED", auto: true, practiceSlotId: "slotB" });

    await reconcileWeekForUser(WEEK, "u1");

    // remainder = max(0, 3 - 1 done - 1 ticked-miss) = 1
    const s = summaries();
    expect(s).toHaveLength(1);
    expect(JSON.parse(s[0].details!)).toEqual({ missed: 1, target: 3 });

    // The ticked-practice bucket-1 row is UNTOUCHED (not collapsed/deleted).
    const ticked = db.logs.filter(
      (l) => l.status === "MISSED" && l.auto && l.practiceSlotId === "slotB",
    );
    expect(ticked).toHaveLength(1);
  });

  it("no summary when done + ticked misses already cover the target", async () => {
    seedPlan("u1", [{ category: "RUGBY", practiceSlotId: null, targetPerWeek: 2, note: null }]);
    addLog({ category: "RUGBY", status: "DONE", practiceSlotId: "slotA" });
    addLog({ category: "RUGBY", status: "MISSED", auto: true, practiceSlotId: "slotB" });
    await reconcileWeekForUser(WEEK, "u1");
    expect(summaries()).toHaveLength(0);
  });
});

describe("reconcileWeekForUser — freeze + self-heal", () => {
  it("uses the STORED target on recompute, ignoring a later plan change", async () => {
    seedPlan("u1", [{ category: "CARDIO", practiceSlotId: null, targetPerWeek: 3, note: null }]);
    await reconcileWeekForUser(WEEK, "u1"); // missed 3 of 3
    expect(JSON.parse(summaries()[0].details!)).toEqual({ missed: 3, target: 3 });

    // Player later changes commitment to 5/week — closed week must NOT change its target.
    db.plans[0].items[0].targetPerWeek = 5;
    await reconcileWeekForUser(WEEK, "u1");
    expect(JSON.parse(summaries()[0].details!)).toEqual({ missed: 3, target: 3 });
  });

  it("late DONE logging shrinks the frozen-week missed count and can clear the row", async () => {
    seedPlan("u1", [{ category: "CARDIO", practiceSlotId: null, targetPerWeek: 2, note: null }]);
    await reconcileWeekForUser(WEEK, "u1"); // missed 2 of 2
    addLog({ category: "CARDIO", status: "DONE" });
    await reconcileWeekForUser(WEEK, "u1");
    expect(JSON.parse(summaries()[0].details!)).toEqual({ missed: 1, target: 2 });

    addLog({ category: "CARDIO", status: "DONE" }); // now 2 of 2 → shortfall 0
    await reconcileWeekForUser(WEEK, "u1");
    expect(summaries()).toHaveLength(0);
  });
});
