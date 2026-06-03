"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { EQUIPMENT_TOOLS, MOVEMENTS, MOVEMENT_LEVELS, type MovementKey } from "@/lib/constants";
import {
  estimateOneRepMax,
  trainingMaxFromOneRepMax,
  defaultFullState,
  decideAdjustment,
  nextTrainingMax,
  nextBodyweight,
  incrementFor,
  waveWeek,
  type ProgramState,
  type MovementState,
  type DayConfig,
} from "@/lib/strength";

// ───────────────────────────────────────────────────────────────── helpers ──

function clampLevel(movement: MovementKey, i: number): number {
  const max = MOVEMENT_LEVELS[movement].length - 1;
  return Math.max(0, Math.min(max, Math.round(i)));
}

function clampMinutes(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 45;
  return Math.max(15, Math.min(180, n));
}

/** Parse the per-day config the wizard/settings send as a JSON string. Always ≥ 1 day. */
function parseDays(raw: unknown): DayConfig[] {
  let arr: unknown = [];
  try {
    arr = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    arr = [];
  }
  const tools = EQUIPMENT_TOOLS as readonly string[];
  const days: DayConfig[] = Array.isArray(arr)
    ? arr.slice(0, 7).map((d, i) => {
        const o = (d ?? {}) as Record<string, unknown>;
        return {
          id: typeof o.id === "string" && o.id ? o.id : `d${i}_${Math.random().toString(36).slice(2, 8)}`,
          name: String(o.name ?? `Day ${i + 1}`).slice(0, 40),
          tools: Array.isArray(o.tools) ? (o.tools as unknown[]).map(String).filter((t) => tools.includes(t)) : [],
          minutes: clampMinutes(o.minutes),
        };
      })
    : [];
  return days.length ? days : [{ id: "d0", name: "Training", tools: [], minutes: 45 }];
}

/** Read per-movement starting maxima (both weighted + bodyweight) from the form. */
function readMaxima(formData: FormData, tmPct: number, rounding: number): ProgramState {
  const state = defaultFullState();
  for (const m of MOVEMENTS) {
    const cur: MovementState = state[m] ?? {};
    const weight = Number(formData.get(`weight_${m}`) ?? 0);
    const reps = Number(formData.get(`reps_${m}`) ?? 0);
    if (weight > 0 && reps > 0) {
      cur.trainingMax = trainingMaxFromOneRepMax(estimateOneRepMax(weight, reps), tmPct, rounding);
    } else {
      const tm = Number(formData.get(`tm_${m}`));
      if (Number.isFinite(tm) && tm >= 0) cur.trainingMax = tm;
    }
    const repMax = Number(formData.get(`repmax_${m}`));
    if (Number.isFinite(repMax) && repMax > 0) cur.repMax = Math.min(repMax, 50);
    const level = Number(formData.get(`level_${m}`));
    if (Number.isFinite(level)) cur.levelIndex = clampLevel(m, level);
    state[m] = cur;
  }
  return state;
}

// ───────────────────────────────────────────────────────────────── actions ──

export async function createStrengthProgram(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rounding = Number(formData.get("rounding")) || 2.5;
  const tmPct = Number(formData.get("trainingMaxPct")) || 0.9;
  const days = parseDays(formData.get("days"));
  const state = readMaxima(formData, tmPct, rounding);

  await prisma.$transaction(async (tx) => {
    await tx.strengthProgram.updateMany({
      where: { userId: user.id, active: true },
      data: { active: false },
    });
    await tx.strengthProgram.create({
      data: {
        userId: user.id,
        mode: "CUSTOM",
        equipment: "CUSTOM",
        daysPerWeek: days.length,
        minutesPerSession: days[0]?.minutes ?? 45,
        trainingMaxPct: tmPct,
        rounding,
        movements: JSON.stringify(state),
        days: JSON.stringify(days),
      },
    });
  });

  revalidatePath("/strength");
  redirect("/strength");
}

/** Edit everything from setup — the days (tools/time) and the per-movement maxima. */
export async function updateStrengthSettings(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const programId = String(formData.get("programId") ?? "");

  const program = await prisma.strengthProgram.findFirst({
    where: { id: programId, userId: user.id },
  });
  if (!program) throw new Error("Program not found");

  const rounding = Number(formData.get("rounding")) || program.rounding;
  const tmPct = Number(formData.get("trainingMaxPct")) || program.trainingMaxPct;
  const days = parseDays(formData.get("days"));
  const state = readMaxima(formData, tmPct, rounding);

  await prisma.strengthProgram.update({
    where: { id: program.id },
    data: {
      daysPerWeek: days.length,
      minutesPerSession: days[0]?.minutes ?? program.minutesPerSession,
      trainingMaxPct: tmPct,
      rounding,
      movements: JSON.stringify(state),
      days: JSON.stringify(days),
    },
  });
  revalidatePath("/strength");
  redirect("/strength");
}

/** Full reset: deactivate the program so the setup wizard shows again. */
export async function resetStrengthProgram(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const programId = String(formData.get("programId") ?? "");
  await prisma.strengthProgram.updateMany({
    where: { id: programId, userId: user.id },
    data: { active: false },
  });
  revalidatePath("/strength");
  redirect("/strength");
}

const WeekSchema = z.object({ programId: z.string(), week: z.coerce.number().int().min(1).max(4) });

export async function setStrengthWeek(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = WeekSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid week");
  await prisma.strengthProgram.updateMany({
    where: { id: parsed.data.programId, userId: user.id },
    data: { week: parsed.data.week },
  });
  revalidatePath("/strength");
}

/**
 * Close out a 4-week cycle: apply the adjustment rule (increase / hold / reduce) to every
 * movement's maxima (both the weighted training max and the bodyweight rep/level), advance
 * the cycle, reset to week 1. Blank inputs default to a successful test (increase).
 */
export async function finishStrengthCycle(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const programId = String(formData.get("programId") ?? "");

  const program = await prisma.strengthProgram.findFirst({
    where: { id: programId, userId: user.id },
  });
  if (!program) throw new Error("Program not found");

  const state: ProgramState = JSON.parse(program.movements);
  const week3 = waveWeek(3);
  const prescribed = week3.sets[week3.sets.length - 1].reps;

  let anyHold = false;
  for (const m of MOVEMENTS) {
    const raw = formData.get(`amrap_${m}`);
    const amrap = raw == null || String(raw).trim() === "" ? prescribed : Number(raw);
    const adjustment = decideAdjustment(amrap, prescribed, program.consecutiveHolds);
    if (adjustment !== "INCREASE") anyHold = true;

    const cur: MovementState = state[m] ?? {};
    const bw = nextBodyweight(
      { repMax: cur.repMax ?? 5, levelIndex: cur.levelIndex ?? 0 },
      adjustment,
      { mode: "LEVELS", levelCount: MOVEMENT_LEVELS[m].length, graduateAt: 15, resetReps: 5 },
    );
    state[m] = {
      trainingMax: nextTrainingMax(cur.trainingMax ?? 0, adjustment, {
        increment: incrementFor(m),
        rounding: program.rounding,
      }),
      repMax: bw.repMax,
      levelIndex: bw.levelIndex,
    };
  }

  await prisma.strengthProgram.update({
    where: { id: program.id },
    data: {
      movements: JSON.stringify(state),
      cycle: program.cycle + 1,
      week: 1,
      consecutiveHolds: anyHold ? program.consecutiveHolds + 1 : 0,
    },
  });
  revalidatePath("/strength");
  redirect("/strength");
}

/**
 * Auto-save a whole strength workout (one logged session holding every exercise/set you did
 * that day). Called repeatedly while you type (debounced on the client). Creates the
 * SessionLog on first save and updates it thereafter — pass back the returned id.
 */
export async function saveStrengthWorkout(input: {
  logId?: string;
  date: string;
  durationMin?: number;
  details: string; // JSON: { kind:"strengthWorkout", ... }
}): Promise<{ id: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (typeof input.details !== "string" || input.details.length > 20000) {
    throw new Error("Invalid workout");
  }

  const data = {
    date: new Date(input.date),
    durationMin: input.durationMin && input.durationMin > 0 ? Math.min(input.durationMin, 1000) : null,
    details: input.details,
  };

  if (input.logId) {
    const existing = await prisma.sessionLog.findUnique({
      where: { id: input.logId },
      select: { userId: true },
    });
    if (!existing || existing.userId !== user.id) throw new Error("Not authorized");
    await prisma.sessionLog.update({ where: { id: input.logId }, data });
    revalidatePath("/dashboard");
    return { id: input.logId };
  }

  const created = await prisma.sessionLog.create({
    data: { userId: user.id, category: "STRENGTH", status: "DONE", ...data },
  });
  revalidatePath("/dashboard");
  return { id: created.id };
}
