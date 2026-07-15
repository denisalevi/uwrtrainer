"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { DEFAULT_LOCALE, DEFAULT_TEAM_ID } from "@/lib/constants";
import { appUrl, mailEnabled, sendAuthLink } from "@/lib/mail";
import { consumeAuthToken, issueAuthToken, mailCooldownOver } from "@/lib/auth-token-store";

export type AuthState =
  | {
      error?: string;
      /** i18n key of a success/notice message (e.g. "reset link sent"). */
      info?: string;
      /** Set when login failed because the email isn't verified yet — enables the resend UI. */
      unverifiedEmail?: string;
    }
  | undefined;

/** Issue a fresh verification token and email its link (throws on SMTP failure). */
async function sendVerificationLink(user: {
  id: string;
  email: string;
  name: string;
  locale: string;
}): Promise<void> {
  const raw = await issueAuthToken(user.id, "VERIFY_EMAIL");
  await sendAuthLink("verify", user, `${appUrl()}/verify?token=${raw}`);
}

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

  // Verification gate — only while mail is configured, so an instance without SMTP
  // (or one that disabled it again) never locks anyone out.
  if (mailEnabled() && !user.emailVerifiedAt && user.email) {
    return { error: "auth.emailNotVerified", unverifiedEmail: user.email };
  }

  await createSession({ userId: user.id, role: user.role, sv: user.sessionVersion });
  redirect("/dashboard");
}

export async function signup(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    code: formData.get("code") || undefined,
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
  // With mail configured, accounts start unverified and login is blocked until the
  // emailed link is clicked. Without mail, behave exactly as before (auto-verified).
  const emailVerifiedAt = mailEnabled() ? null : new Date();

  let user: { id: string; role: string; name: string; locale: string; sessionVersion: number };

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
    user = await prisma.user.update({
      where: { id: member.id },
      data: { email, passwordHash, emailVerifiedAt, locale: DEFAULT_LOCALE, activeTeamId: team.id },
    });
  } else {
    // First ever user becomes ADMIN; everyone else is a PLAYER.
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? "ADMIN" : "PLAYER";

    user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        emailVerifiedAt,
        role,
        locale: DEFAULT_LOCALE,
        activeTeamId: team.id,
        memberships: { create: { teamId: team.id } },
      },
    });
  }

  if (emailVerifiedAt) {
    // Mail off — log straight in, pre-feature behaviour.
    await createSession({ userId: user.id, role: user.role, sv: user.sessionVersion });
    redirect("/dashboard");
  }

  try {
    await sendVerificationLink({ id: user.id, email, name: user.name, locale: user.locale });
  } catch (err) {
    console.error("verification mail failed", err);
    // Account exists but unverified; the check-email page offers a resend.
    redirect(`/check-email?email=${encodeURIComponent(email)}&sendfail=1`);
  }
  redirect(`/check-email?email=${encodeURIComponent(email)}`);
}

/**
 * Re-send the verification link (from the login error or the check-email page).
 * Deliberately quiet about whether the account exists; the per-user cooldown in
 * the token store brakes abuse (server actions are public endpoints).
 */
export async function resendVerification(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!mailEnabled()) return { error: "auth.genericError" };
  const parsed = z.string().email().trim().toLowerCase().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "auth.genericError" };

  const user = await prisma.user.findUnique({ where: { email: parsed.data } });
  if (user && user.passwordHash && !user.emailVerifiedAt && user.email) {
    if (!(await mailCooldownOver(user.id, "VERIFY_EMAIL"))) {
      return { error: "auth.mailCooldown" };
    }
    try {
      await sendVerificationLink({ id: user.id, email: user.email, name: user.name, locale: user.locale });
    } catch (err) {
      console.error("verification mail failed", err);
      return { error: "auth.mailSendFailed" };
    }
  }
  return { info: "auth.verificationSent" };
}

const ForgotSchema = z.object({ email: z.string().email().trim().toLowerCase() });

/**
 * "Forgot password" — always answers with the same notice so account existence
 * can't be probed. Only emails users who actually have credentials.
 */
export async function requestPasswordReset(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!mailEnabled()) return { error: "auth.resetUnavailable" };
  const parsed = ForgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "auth.genericError" };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user?.passwordHash && user.email && (await mailCooldownOver(user.id, "RESET_PASSWORD"))) {
    try {
      const raw = await issueAuthToken(user.id, "RESET_PASSWORD");
      await sendAuthLink(
        "reset",
        { email: user.email, name: user.name, locale: user.locale },
        `${appUrl()}/reset-password?token=${raw}`,
      );
    } catch (err) {
      console.error("reset mail failed", err);
      return { error: "auth.mailSendFailed" };
    }
  }
  return { info: "auth.resetRequested" };
}

const ResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

/**
 * Set a new password from an emailed reset link. Consuming the token proves inbox
 * access, so it also verifies the email; bumping sessionVersion revokes every
 * session issued before the reset.
 */
export async function resetPassword(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = ResetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "auth.passwordHint" };

  const userId = await consumeAuthToken(parsed.data.token, "RESET_PASSWORD");
  if (!userId) return { error: "auth.resetLinkInvalid" };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      sessionVersion: { increment: 1 },
      emailVerifiedAt: user?.emailVerifiedAt ?? new Date(),
    },
  });
  return { info: "auth.resetDone" };
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
