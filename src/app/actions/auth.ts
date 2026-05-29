"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { DEFAULT_LOCALE } from "@/lib/constants";

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
});

/** Whether self-signup is gated by an invite code (REGISTRATION_CODE set). */
export async function signupRequiresCode(): Promise<boolean> {
  return !!process.env.REGISTRATION_CODE?.trim();
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
  if (!user) return { error: "auth.invalidCredentials" };

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
  });
  if (!parsed.success) return { error: "auth.genericError" };

  const { name, email, password, code } = parsed.data;

  // Invite-code gate: when REGISTRATION_CODE is set, every signup needs it
  // (including the first/admin account, so the public URL can't be claimed).
  const requiredCode = process.env.REGISTRATION_CODE?.trim();
  if (requiredCode && code?.trim() !== requiredCode) {
    return { error: "auth.badCode" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "auth.emailTaken" };

  // First ever user becomes ADMIN; everyone else is a PLAYER.
  const userCount = await prisma.user.count();
  const role = userCount === 0 ? "ADMIN" : "PLAYER";

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role, locale: DEFAULT_LOCALE },
  });

  await createSession({ userId: user.id, role: user.role });
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
