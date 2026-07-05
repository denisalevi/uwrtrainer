import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { startOfWeek, addDays } from "../src/lib/dates";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

const LEADERBOARDS = [
  { metric: "ADHERENCE_POINTS", title: "Plan adherence points", enabled: true, visibility: "EVERYONE", sortOrder: 0 },
  { metric: "RUGBY_PRACTICES", title: "Rugby practices attended", enabled: true, visibility: "EVERYONE", sortOrder: 1 },
  { metric: "PRIMARY_PRACTICES", title: "Mandatory practices attended", enabled: false, visibility: "TRAINERS_ONLY", sortOrder: 2 },
  { metric: "STREAK", title: "Best streak", enabled: false, visibility: "TRAINERS_ONLY", sortOrder: 3 },
];

async function ensureLeaderboards() {
  for (const lb of LEADERBOARDS) {
    const existing = await prisma.leaderboard.findUnique({ where: { metric: lb.metric } });
    if (!existing) await prisma.leaderboard.create({ data: lb });
  }
}

async function ensureSetting(key: string, value: string) {
  const existing = await prisma.setting.findUnique({ where: { key } });
  if (!existing) await prisma.setting.create({ data: { key, value } });
}

async function seedDemo() {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log("Users already exist — skipping demo data.");
    return;
  }
  console.log("Seeding demo data…");
  const hash = await bcrypt.hash("password123", 10);

  // Default team (normally created by the multi_team_roster migration; idempotent here).
  await prisma.team.upsert({
    where: { id: "team-default" },
    update: {},
    create: { id: "team-default", name: "My Team" },
  });
  const inTeam = {
    activeTeamId: "team-default",
    memberships: { create: { teamId: "team-default" } },
  };

  const nando = await prisma.user.create({
    data: { name: "Nando", email: "nando@example.com", passwordHash: hash, role: "ADMIN", locale: "en", ...inTeam },
  });
  const linus = await prisma.user.create({
    data: { name: "Linus", email: "linus@example.com", passwordHash: hash, role: "PLAYER", locale: "en",
      availabilityNote: "Once a week each: run, gym, rugby.", ...inTeam },
  });
  const denis = await prisma.user.create({
    data: { name: "Denis", email: "denis@example.com", passwordHash: hash, role: "PLAYER", locale: "de",
      availabilityNote: "Motivated — 1-2 sessions/day.", ...inTeam },
  });
  const mia = await prisma.user.create({
    data: { name: "Mia", email: "mia@example.com", passwordHash: hash, role: "PLAYER", locale: "en", ...inTeam },
  });

  // Team practice schedule.
  const primary = await prisma.practiceSlot.create({
    data: { label: "Tuesday pool", dayOfWeek: 2, time: "19:00", tier: "PRIMARY" },
  });
  const secondary = await prisma.practiceSlot.create({
    data: { label: "Thursday pool", dayOfWeek: 4, time: "19:00", tier: "SECONDARY" },
  });
  await prisma.practiceSlot.create({
    data: { label: "Sunday open water", dayOfWeek: 0, time: "10:00", tier: "OPTIONAL" },
  });

  // Plans.
  await prisma.plan.create({
    data: {
      userId: linus.id, createdById: nando.id,
      items: {
        create: [
          { category: "RUGBY", practiceSlotId: primary.id, targetPerWeek: 1, note: "Mandatory practice" },
          { category: "CARDIO", targetPerWeek: 1, targetDurationMin: 30, note: "Easy run" },
          { category: "STRENGTH", targetPerWeek: 1, note: "Full body" },
        ],
      },
    },
  });
  await prisma.plan.create({
    data: {
      userId: denis.id, createdById: nando.id,
      items: {
        create: [
          { category: "RUGBY", practiceSlotId: primary.id, targetPerWeek: 1 },
          { category: "RUGBY", practiceSlotId: secondary.id, targetPerWeek: 1 },
          { category: "CARDIO", targetPerWeek: 3, targetDurationMin: 45 },
          { category: "STRENGTH", targetPerWeek: 3, note: "5-3-1" },
          { category: "MOBILITY", targetPerWeek: 2 },
        ],
      },
    },
  });
  await prisma.plan.create({
    data: {
      userId: mia.id,
      items: { create: [{ category: "RUGBY", practiceSlotId: primary.id, targetPerWeek: 1 }] },
    },
  });

  // Some logs in the current week.
  const ws = startOfWeek(new Date());
  const d = (n: number) => addDays(ws, n);
  await prisma.sessionLog.createMany({
    data: [
      // Linus: hits everything (100%).
      { userId: linus.id, date: d(1), category: "RUGBY", status: "DONE", practiceSlotId: primary.id, durationMin: 90 },
      { userId: linus.id, date: d(3), category: "CARDIO", status: "DONE", durationMin: 30, details: JSON.stringify({ zone: "Z2" }) },
      { userId: linus.id, date: d(5), category: "STRENGTH", status: "DONE", details: JSON.stringify({ lift: "SQUAT", sets: 3, reps: 5, weight: 90 }) },
      // Denis: most of a big plan.
      { userId: denis.id, date: d(1), category: "RUGBY", status: "DONE", practiceSlotId: primary.id, durationMin: 90 },
      { userId: denis.id, date: d(3), category: "RUGBY", status: "DONE", practiceSlotId: secondary.id, durationMin: 90 },
      { userId: denis.id, date: d(0), category: "CARDIO", status: "DONE", durationMin: 45, details: JSON.stringify({ zone: "Z3" }) },
      { userId: denis.id, date: d(2), category: "CARDIO", status: "DONE", durationMin: 45, details: JSON.stringify({ zone: "Z2" }) },
      { userId: denis.id, date: d(1), category: "STRENGTH", status: "DONE", details: JSON.stringify({ lift: "BENCH", sets: 3, reps: 5, weight: 70 }) },
      { userId: denis.id, date: d(3), category: "STRENGTH", status: "DONE", details: JSON.stringify({ lift: "DEADLIFT", sets: 1, reps: 5, weight: 140 }) },
      { userId: denis.id, date: d(5), category: "STRENGTH", status: "DONE", details: JSON.stringify({ lift: "PRESS", sets: 3, reps: 5, weight: 50 }) },
      { userId: denis.id, date: d(4), category: "MOBILITY", status: "DONE", durationMin: 20 },
      // Mia: missed the mandatory practice, with a reason.
      { userId: mia.id, date: d(1), category: "RUGBY", status: "MISSED", practiceSlotId: primary.id, missReason: "Away for work" },
    ],
  });

  console.log("Demo users created. Login with password: password123");
  console.log("  nando@example.com (admin/trainer), linus@example.com, denis@example.com, mia@example.com");
}

async function main() {
  await ensureLeaderboards();
  await ensureSetting("teamName", "UWR Team");
  await seedDemo();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
