"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import {
  EQUIPMENT_LEVELS,
  MOVEMENT_LEVELS,
  type MovementKey,
  type StrengthMode,
} from "@/lib/constants";
import {
  modeForEquipment,
  programMovements,
  estimateOneRepMax,
  trainingMaxFromOneRepMax,
  defaultStartState,
  decideAdjustment,
  nextTrainingMax,
  nextBodyweight,
  incrementFor,
  waveWeek,
  type ProgramState,
  type MovementState,
} from "@/lib/strength";

const CreateSchema = z.object({
  equipment: z.enum(EQUIPMENT_LEVELS),
  daysPerWeek: z.coerce.number().int().min(1).max(4),
  minutesPerSession: z.coerce.number().int().min(15).max(180),
  trainingMaxPct: z.coerce.number().min(0.7).max(1).optional(),
  rounding: z.coerce.number().min(0.5).max(5).optional(),
});

export async function createStrengthProgram(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid program setup");
  const d = parsed.data;

  const mode = modeForEquipment(d.equipment);
  const rounding = d.rounding ?? 2.5;
  const tmPct = d.trainingMaxPct ?? 0.9;

  // Build per-movement starting state from optional inputs, else sensible defaults.
  const state: ProgramState = defaultStartState(mode);
  for (const m of programMovements(mode)) {
    if (mode === "WEIGHTED") {
      const weight = Number(formData.get(`weight_${m}`) ?? 0);
      const reps = Number(formData.get(`reps_${m}`) ?? 0);
      if (weight > 0 && reps > 0) {
        const orm = estimateOneRepMax(weight, reps);
        state[m] = { trainingMax: trainingMaxFromOneRepMax(orm, tmPct, rounding) };
      }
    } else {
      const repMax = Number(formData.get(`repmax_${m}`) ?? 0);
      const levelIndex = Number(formData.get(`level_${m}`) ?? NaN);
      const cur = state[m] ?? {};
      state[m] = {
        repMax: repMax > 0 ? Math.min(repMax, 50) : cur.repMax,
        levelIndex: Number.isFinite(levelIndex)
          ? clampLevel(m, levelIndex)
          : cur.levelIndex,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.strengthProgram.updateMany({
      where: { userId: user.id, active: true },
      data: { active: false },
    });
    await tx.strengthProgram.create({
      data: {
        userId: user.id,
        mode,
        equipment: d.equipment,
        daysPerWeek: d.daysPerWeek,
        minutesPerSession: d.minutesPerSession,
        trainingMaxPct: tmPct,
        rounding,
        movements: JSON.stringify(state),
      },
    });
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
 * Close out a 4-week cycle. We read how the week-3 AMRAP (test) set went for each
 * movement, apply the adjustment rule (increase / hold / reduce), advance the cycle, and
 * reset to week 1. Empty/blank inputs default to a successful test (increase).
 */
export async function finishStrengthCycle(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const programId = String(formData.get("programId") ?? "");

  const program = await prisma.strengthProgram.findFirst({
    where: { id: programId, userId: user.id },
  });
  if (!program) throw new Error("Program not found");

  const mode = program.mode as StrengthMode;
  const state: ProgramState = JSON.parse(program.movements);
  const week3 = waveWeek(3);
  const prescribed = week3.sets[week3.sets.length - 1].reps; // top-set target on the test week

  let anyHold = false;
  for (const m of programMovements(mode)) {
    const raw = formData.get(`amrap_${m}`);
    const amrap = raw == null || String(raw).trim() === "" ? prescribed : Number(raw);
    const adjustment = decideAdjustment(amrap, prescribed, program.consecutiveHolds);
    if (adjustment !== "INCREASE") anyHold = true;

    const cur: MovementState = state[m] ?? {};
    if (mode === "WEIGHTED") {
      state[m] = {
        trainingMax: nextTrainingMax(cur.trainingMax ?? 0, adjustment, {
          increment: incrementFor(m),
          rounding: program.rounding,
        }),
      };
    } else {
      const levels = MOVEMENT_LEVELS[m];
      state[m] = nextBodyweight(
        { repMax: cur.repMax ?? 5, levelIndex: cur.levelIndex ?? 0 },
        adjustment,
        { mode, levelCount: levels.length, graduateAt: 15, resetReps: 5 },
      );
    }
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

function clampLevel(movement: MovementKey, i: number): number {
  const max = MOVEMENT_LEVELS[movement].length - 1;
  return Math.max(0, Math.min(max, Math.round(i)));
}
