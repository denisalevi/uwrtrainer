"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import {
  MOVEMENTS,
  MOVEMENT_LEVELS,
  PROGRAM_EQUIPMENT,
  WEIGHTED_LAYOUTS,
  type MovementKey,
  type ProgramEquipment,
  type SlotMode,
  type WeightedLayout,
} from "@/lib/constants";
import {
  estimateOneRepMax,
  trainingMaxFromOneRepMax,
  defaultFullState,
  decideAdjustment,
  nextTrainingMax,
  nextBodyweight,
  incrementFor,
  waveWeek,
  catalogEntry,
  defaultExerciseId,
  CUSTOM_EXERCISE_ID,
  suggestedMinutes,
  type ProgramState,
  type MovementState,
  type DayPlan,
} from "@/lib/strength";

// ───────────────────────────────────────────────────────────────── helpers ──

function clampMinutes(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 45;
  return Math.max(15, Math.min(180, n));
}

const EQUIPMENT_SET = PROGRAM_EQUIPMENT as readonly string[];

/**
 * Parse the per-day config the wizard/settings send as a JSON string: each day is just a name,
 * an equipment flag, and a session length (what each day *contains* is derived, not stored).
 * Tolerant of legacy/garbage shapes; always returns 1–4 days.
 */
function parseDays(raw: unknown): DayPlan[] {
  let arr: unknown = [];
  try {
    arr = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    arr = [];
  }
  const days: DayPlan[] = Array.isArray(arr)
    ? arr.slice(0, 4).map((d, i) => {
        const o = (d ?? {}) as Record<string, unknown>;
        const equipment = (EQUIPMENT_SET.includes(String(o.equipment))
          ? o.equipment
          : "WEIGHTS") as ProgramEquipment;
        return {
          id: typeof o.id === "string" && o.id ? o.id : `d${i}_${Math.random().toString(36).slice(2, 8)}`,
          name: String(o.name ?? `Day ${i + 1}`).slice(0, 40),
          equipment,
          minutes: clampMinutes(o.minutes),
        };
      })
    : [];
  return days.length ? days : [{ id: "d0", name: "Training", equipment: "WEIGHTS", minutes: suggestedMinutes(2) }];
}

/** Read & validate the single-weighted-day layout choice (defaults to ROTATE). */
function readLayout(formData: FormData): WeightedLayout {
  const v = String(formData.get("weightedLayout") ?? "");
  return (WEIGHTED_LAYOUTS as readonly string[]).includes(v) ? (v as WeightedLayout) : "ROTATE";
}

/** Read & validate the top-level equipment choice from the form (defaults to WEIGHTS). */
function readEquipment(formData: FormData): ProgramEquipment {
  const v = String(formData.get("equipment") ?? "");
  return (PROGRAM_EQUIPMENT as readonly string[]).includes(v) ? (v as ProgramEquipment) : "WEIGHTS";
}

/**
 * Validate the chosen exercise id for a movement's weighted-day or bodyweight-day slot. Any
 * catalog exercise for the movement is allowed in either slot (a weighted day may hold a
 * bodyweight lift, e.g. pull-ups for the row), or "custom".
 */
function readExerciseId(formData: FormData, m: MovementKey, slot: SlotMode): string {
  const field = slot === "WEIGHTED" ? `wex_${m}` : `bex_${m}`;
  const v = String(formData.get(field) ?? "");
  if (v === CUSTOM_EXERCISE_ID) return CUSTOM_EXERCISE_ID;
  return catalogEntry(m, v) ? v : defaultExerciseId(m, slot);
}

/** Read per-movement state: maxima (weighted + bodyweight) and the chosen exercise variants. */
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

    // Chosen exercise variants (weighted + bodyweight) and any custom names.
    cur.weightedExerciseId = readExerciseId(formData, m, "WEIGHTED");
    cur.bodyweightExerciseId = readExerciseId(formData, m, "BODYWEIGHT");
    const wCustom = String(formData.get(`wcustom_${m}`) ?? "").slice(0, 60);
    const bCustom = String(formData.get(`bcustom_${m}`) ?? "").slice(0, 60);
    if (cur.weightedExerciseId === CUSTOM_EXERCISE_ID && wCustom) cur.weightedCustom = wCustom;
    if (cur.bodyweightExerciseId === CUSTOM_EXERCISE_ID && bCustom) cur.bodyweightCustom = bCustom;

    // The bodyweight rep ladder starts at the chosen variation's rung.
    const bwEntry = catalogEntry(m, cur.bodyweightExerciseId);
    if (bwEntry) {
      const idx = MOVEMENT_LEVELS[m].indexOf(bwEntry.labelKey);
      if (idx >= 0) cur.levelIndex = idx;
    }
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
  const equipment = readEquipment(formData);
  const weightedLayout = readLayout(formData);
  const days = parseDays(formData.get("days"));
  const state = readMaxima(formData, tmPct, rounding);
  const notes = String(formData.get("notes") ?? "").slice(0, 1000).trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.strengthProgram.updateMany({
      where: { userId: user.id, active: true },
      data: { active: false },
    });
    await tx.strengthProgram.create({
      data: {
        userId: user.id,
        mode: "CUSTOM",
        equipment,
        weightedLayout,
        notes,
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
  const equipment = readEquipment(formData);
  const weightedLayout = readLayout(formData);
  const days = parseDays(formData.get("days"));
  const state = readMaxima(formData, tmPct, rounding);
  const notes = String(formData.get("notes") ?? "").slice(0, 1000).trim() || null;

  await prisma.strengthProgram.update({
    where: { id: program.id },
    data: {
      equipment,
      weightedLayout,
      notes,
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
