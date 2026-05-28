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
});

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
  });
  if (!parsed.success) return { error: "auth.genericError" };

  const { name, email, password } = parsed.data;

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
