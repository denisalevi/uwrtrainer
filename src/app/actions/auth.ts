"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { DEFAULT_LOCALE, DEFAULT_TEAM_ID } from "@/lib/constants";

export type AuthState = { error?: string } | undefined;

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const SignupSchema = z.object({
  name: z.string().min(2).max(80).trim(),
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8).max(200),
  code: z.string().optional(),
  claimMemberId: z.string().optional(),
});

/**
 * The effective registration code of a team. The default team falls back to the env
 * REGISTRATION_CODE while its own code is unset (pre-multi-team behaviour preserved).
 */
function effectiveCode(team: { id: string; registrationCode: string | null }): string | null {
  const own = team.registrationCode?.trim();
  if (own) return own;
  if (team.id === DEFAULT_TEAM_ID) return process.env.REGISTRATION_CODE?.trim() || null;
  return null;
}

/**
 * Resolve which team a signup/join code refers to. Empty code matches the default team
 * only if that team is open (no effective code).
 */
async function teamForCode(code: string | undefined): Promise<{ id: string } | null> {
  const teams = await prisma.team.findMany({
    select: { id: true, registrationCode: true },
    orderBy: { createdAt: "asc" },
  });
  const trimmed = code?.trim() || "";
  if (trimmed) {
    return teams.find((t) => effectiveCode(t) === trimmed) ?? null;
  }
  const def = teams.find((t) => t.id === DEFAULT_TEAM_ID) ?? teams[0];
  if (def && !effectiveCode(def)) return { id: def.id };
  return null;
}

/** Whether self-signup is gated by an invite code (default team has an effective code). */
export async function signupRequiresCode(): Promise<boolean> {
  const def = await prisma.team.findUnique({
    where: { id: DEFAULT_TEAM_ID },
    select: { id: true, registrationCode: true },
  });
  if (!def) return !!process.env.REGISTRATION_CODE?.trim();
  return !!effectiveCode(def);
}

/**
 * Unclaimed roster members (no credentials yet) of the team matching `code` — shown on the
 * signup form so a new user can claim their existing history. Returns [] for a bad code.
 * Public by design (like signup itself): exposes only names, and only behind the team's code.
 */
export async function listClaimableMembers(
  code: string | undefined,
): Promise<{ id: string; name: string }[]> {
  const team = await teamForCode(code);
  if (!team) return [];
  return prisma.user.findMany({
    where: { passwordHash: null, memberships: { some: { teamId: team.id } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "auth.invalidCredentials" };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  // Account-less roster members (passwordHash null) cannot log in.
  if (!user?.passwordHash) return { error: "auth.invalidCredentials" };

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return { error: "auth.invalidCredentials" };

  await createSession({ userId: user.id, role: user.role });
  redirect("/dashboard");
}

export async function signup(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    code: formData.get("code"),
    claimMemberId: formData.get("claimMemberId") || undefined,
  });
  if (!parsed.success) return { error: "auth.genericError" };

  const { name, email, password, code, claimMemberId } = parsed.data;

  // Bootstrap: a brand-new instance may not have the default team yet (pre-migration DBs do).
  const teamCount = await prisma.team.count();
  if (teamCount === 0) {
    await prisma.team.create({ data: { id: DEFAULT_TEAM_ID, name: "My Team" } });
  }

  // Team gate: the code (or its absence) must resolve to a team.
  const team = await teamForCode(code);
  if (!team) return { error: "auth.badCode" };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "auth.emailTaken" };

  const passwordHash = await bcrypt.hash(password, 10);

  // Claim flow: attach credentials to an existing account-less roster member of this team,
  // keeping all their history. Only rows without a passwordHash can ever be claimed.
  if (claimMemberId) {
    const member = await prisma.user.findUnique({
      where: { id: claimMemberId },
      include: { memberships: { select: { teamId: true } } },
    });
    if (
      !member ||
      member.passwordHash !== null ||
      !member.memberships.some((m) => m.teamId === team.id)
    ) {
      return { error: "auth.claimInvalid" };
    }
    const user = await prisma.user.update({
      where: { id: member.id },
      data: { email, passwordHash, locale: DEFAULT_LOCALE, activeTeamId: team.id },
    });
    await createSession({ userId: user.id, role: user.role });
    redirect("/dashboard");
  }

  // First ever user becomes ADMIN; everyone else is a PLAYER.
  const userCount = await prisma.user.count();
  const role = userCount === 0 ? "ADMIN" : "PLAYER";

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      locale: DEFAULT_LOCALE,
      activeTeamId: team.id,
      memberships: { create: { teamId: team.id } },
    },
  });

  await createSession({ userId: user.id, role: user.role });
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
