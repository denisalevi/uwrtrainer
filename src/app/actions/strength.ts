"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { selfHealCountWeek } from "@/lib/missed";
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
  advanceStateAfterSession,
  deloadNowState,
  setMovementWeekState,
  catalogEntry,
  defaultExerciseId,
  CUSTOM_EXERCISE_ID,
  normWeek,
  suggestedMinutes,
  type ProgramState,
  type MovementState,
  type DayPlan,
  type LoggedExercise,
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
        // Optional explicit lift assignment (custom layout). Present (even empty) ⇒ this day is
        // custom; keep only valid movement keys, deduped, in order. Absent ⇒ auto-layout.
        let movements: MovementKey[] | undefined;
        if (Array.isArray(o.movements)) {
          const seen = new Set<string>();
          movements = (o.movements as unknown[]).filter(
            (m): m is MovementKey =>
              typeof m === "string" && (MOVEMENTS as readonly string[]).includes(m) && !seen.has(m) && (seen.add(m), true),
          );
        }
        return {
          id: typeof o.id === "string" && o.id ? o.id : `d${i}_${Math.random().toString(36).slice(2, 8)}`,
          name: String(o.name ?? `Day ${i + 1}`).slice(0, 40),
          equipment,
          minutes: clampMinutes(o.minutes),
          ...(movements ? { movements } : {}),
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
    // Two ways to set the weighted training max: estimate it from a weight × clean-reps set (the
    // recommended first-cycle path, whose inputs we persist so the form can show them again), or
    // type a training max in directly. The form blocks supplying both; if both still arrive the
    // estimate wins. A direct entry clears any previously-stored estimate inputs.
    const weight = Number(formData.get(`weight_${m}`) ?? 0);
    const reps = Number(formData.get(`reps_${m}`) ?? 0);
    if (weight > 0 && reps > 0) {
      cur.trainingMax = trainingMaxFromOneRepMax(estimateOneRepMax(weight, reps), tmPct, rounding);
      cur.estWeight = weight;
      cur.estReps = reps;
    } else {
      const tm = Number(formData.get(`tm_${m}`));
      if (Number.isFinite(tm) && tm >= 0) cur.trainingMax = tm;
      cur.estWeight = undefined;
      cur.estReps = undefined;
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

// NOTE: the old global setStrengthWeek / setStrengthCycle / finishStrengthCycle actions were
// removed — progression is now per-movement and automatic (see finishStrengthWorkout +
// deloadMovement + setMovementWeek below). The manual "active week" and "finish cycle" UI is gone.

type StrengthWorkoutInput = {
  logId?: string;
  date: string;
  durationMin?: number;
  details: string; // JSON: { kind:"strengthWorkout", ... }
};

/**
 * Validate a strength-workout payload (shared by save + finish). The details must actually be a
 * strength-workout document (this action family must not be usable to overwrite a session with
 * arbitrary JSON), and the date must parse and not be in the future (whole-day granularity).
 * Returns the parsed date, the details string, and the parsed details object.
 */
function validateStrengthInput(input: StrengthWorkoutInput): {
  date: Date;
  details: string;
  parsed: Record<string, unknown>;
} {
  if (typeof input.details !== "string" || input.details.length > 20000) throw new Error("Invalid workout");
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.details);
  } catch {
    throw new Error("Invalid workout");
  }
  if (!parsed || typeof parsed !== "object" || (parsed as { kind?: unknown }).kind !== "strengthWorkout") {
    throw new Error("Invalid workout");
  }
  const date = new Date(input.date);
  if (typeof input.date !== "string" || Number.isNaN(date.getTime())) throw new Error("Invalid date");
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  if (date > todayEnd) throw new Error("Date cannot be in the future");
  return { date, details: input.details, parsed: parsed as Record<string, unknown> };
}

function normDuration(v: number | undefined): number | null {
  return v && v > 0 ? Math.min(v, 1000) : null;
}

/**
 * Auto-save a whole strength workout (one logged session holding every exercise/set you did
 * that day). Called repeatedly while you type (debounced on the client). Creates the
 * SessionLog on first save and updates it thereafter — pass back the returned id.
 *
 * Autosave NEVER advances progression — that only happens on the explicit "Done" (see
 * finishStrengthWorkout), so an abandoned draft doesn't step your waves.
 */
export async function saveStrengthWorkout(input: StrengthWorkoutInput): Promise<{ id: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  const { date, details } = validateStrengthInput(input);
  const data = { date, durationMin: normDuration(input.durationMin), details };

  if (input.logId) {
    const existing = await prisma.sessionLog.findUnique({
      where: { id: input.logId },
      select: { userId: true, date: true, category: true, status: true, auto: true },
    });
    if (!existing || existing.userId !== user.id) throw new Error("Not authorized");
    // Only a real logged strength workout may be overwritten — never another category, a MISSED
    // row, or a system-owned auto row.
    if (existing.category !== "STRENGTH" || existing.status !== "DONE" || existing.auto) {
      throw new Error("Not a strength workout");
    }
    await prisma.sessionLog.update({ where: { id: input.logId }, data });
    // Self-heal BOTH weeks: the edit may have moved the session out of an already-reconciled week.
    await selfHealCountWeek(user.id, existing.date);
    if (data.date.getTime() !== existing.date.getTime()) {
      await selfHealCountWeek(user.id, data.date);
    }
    revalidatePath("/dashboard");
    return { id: input.logId };
  }

  const created = await prisma.sessionLog.create({
    data: { userId: user.id, category: "STRENGTH", status: "DONE", ...data },
  });
  await selfHealCountWeek(user.id, data.date);
  revalidatePath("/dashboard");
  return { id: created.id };
}

/**
 * Advance each logged lift's own wave, once, from the session the athlete just finished. For every
 * exercise marked done that carries a movement + the week it was logged at, step that lift's
 * per-movement progression (see advanceAfterSession) — reading the AMRAP reps straight from the
 * logged week-3 test set. A single rotating weighted day also nudges the program's session pointer
 * so the training pair alternates. Idempotency is guaranteed by the caller's progressionApplied
 * guard, so this is only ever run once per session.
 */
async function applyProgression(userId: string, logDate: Date, details: Record<string, unknown>): Promise<void> {
  const program = await prisma.strengthProgram.findFirst({
    where: { userId, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (!program) return;

  let state: ProgramState;
  try {
    state = JSON.parse(program.movements);
  } catch {
    return;
  }
  const days = parseDays(program.days);
  const dayId = typeof details.dayId === "string" ? details.dayId : "";
  const day = days.find((d) => d.id === dayId);
  const dayEquipment: ProgramEquipment = day?.equipment ?? "WEIGHTS";
  const dateISO = logDate.toISOString().slice(0, 10);
  const exercises = Array.isArray(details.exercises) ? (details.exercises as LoggedExercise[]) : [];

  const { state: nextState, advanced } = advanceStateAfterSession(state, exercises, {
    rounding: program.rounding,
    fallbackCycle: program.cycle,
    dayEquipment,
    date: dateISO,
  });
  if (advanced.length === 0) return;

  // A single rotating weighted day picks its training pair by the program-week parity — advance it
  // so the next session trains the other pair. (Multi-day / all-in-one layouts don't rotate.)
  const weightedDays = days.filter((d) => d.equipment === "WEIGHTS").length;
  const layout: WeightedLayout = (WEIGHTED_LAYOUTS as readonly string[]).includes(program.weightedLayout)
    ? (program.weightedLayout as WeightedLayout)
    : "ROTATE";
  const rotating = weightedDays === 1 && layout === "ROTATE";

  await prisma.strengthProgram.update({
    where: { id: program.id },
    data: {
      movements: JSON.stringify(nextState),
      ...(rotating ? { week: program.week + 1 } : {}),
    },
  });
}

/**
 * The explicit "Done" for a strength session: save it (like saveStrengthWorkout) AND advance each
 * logged lift's own wave — exactly once. The progressionApplied flag on the row guards against
 * double-advancing if a finished session is re-finished or edited later.
 */
export async function finishStrengthWorkout(input: StrengthWorkoutInput): Promise<{ id: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  const { date, details, parsed } = validateStrengthInput(input);
  const data = { date, durationMin: normDuration(input.durationMin), details };

  let logId = input.logId;
  let alreadyApplied = false;

  if (logId) {
    const existing = await prisma.sessionLog.findUnique({
      where: { id: logId },
      select: { userId: true, date: true, category: true, status: true, auto: true, progressionApplied: true },
    });
    if (!existing || existing.userId !== user.id) throw new Error("Not authorized");
    if (existing.category !== "STRENGTH" || existing.status !== "DONE" || existing.auto) {
      throw new Error("Not a strength workout");
    }
    alreadyApplied = existing.progressionApplied;
    await prisma.sessionLog.update({ where: { id: logId }, data: { ...data, progressionApplied: true } });
    await selfHealCountWeek(user.id, existing.date);
    if (date.getTime() !== existing.date.getTime()) await selfHealCountWeek(user.id, date);
  } else {
    const created = await prisma.sessionLog.create({
      data: { userId: user.id, category: "STRENGTH", status: "DONE", progressionApplied: true, ...data },
    });
    logId = created.id;
    await selfHealCountWeek(user.id, date);
  }

  if (!alreadyApplied) await applyProgression(user.id, date, parsed);

  revalidatePath("/dashboard");
  revalidatePath("/strength");
  return { id: logId };
}

// ─────────────────────────────────── Per-movement manual controls ──

/** Load the caller's own program (throws if missing / not theirs). */
async function requireOwnProgram(userId: string, programId: string) {
  const program = await prisma.strengthProgram.findFirst({ where: { id: programId, userId } });
  if (!program) throw new Error("Program not found");
  return program;
}

const MovementWeekSchema = z.object({
  programId: z.string(),
  movement: z.string(),
  week: z.coerce.number().int().min(1).max(4),
});

/**
 * Manual week control for ONE lift (shown behind a warning). Weeks 1–3 set the wave position
 * directly, clearing any pending test/deload so the trajectory continues cleanly from there.
 * Week 4 IS the deload: it arms a "deload now" — the next session is the deload and completing it
 * restarts the SAME cycle at week 1 with no training-max bump (a re-sync / back-off). Merging the
 * two means "deload" is simply week 4 in the same selector, not a separate control.
 */
export async function setMovementWeek(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = MovementWeekSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid week");
  if (!(MOVEMENTS as readonly string[]).includes(parsed.data.movement)) throw new Error("Invalid movement");
  const m = parsed.data.movement as MovementKey;
  const week = normWeek(parsed.data.week);
  const program = await requireOwnProgram(user!.id, parsed.data.programId);
  const state: ProgramState = JSON.parse(program.movements);
  state[m] =
    week === 4
      ? deloadNowState(state[m] ?? {}, program.cycle)
      : setMovementWeekState(state[m] ?? {}, week, program.cycle);
  await prisma.strengthProgram.update({ where: { id: program.id }, data: { movements: JSON.stringify(state) } });
  revalidatePath("/strength");
}
