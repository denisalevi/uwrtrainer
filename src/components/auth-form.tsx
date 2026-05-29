"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, signup, type AuthState } from "@/app/actions/auth";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Button, Input, Label } from "@/components/ui";

export function AuthForm({
  mode,
  requireCode = false,
}: {
  mode: "login" | "signup";
  requireCode?: boolean;
}) {
  const { t } = useT();
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {mode === "signup" && (
        <div>
          <Label htmlFor="name">{t("auth.name")}</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
      )}
      <div>
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
        {mode === "signup" && <p className="mt-1 text-xs text-slate-500">{t("auth.passwordHint")}</p>}
      </div>

      {mode === "signup" && requireCode && (
        <div>
          <Label htmlFor="code">{t("auth.inviteCode")}</Label>
          <Input id="code" name="code" autoComplete="off" placeholder={t("auth.inviteCodePlaceholder")} required />
        </div>
      )}

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(state.error as DictKey)}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("common.loading") : t(mode === "login" ? "auth.loginButton" : "auth.signupButton")}
      </Button>

      <p className="text-center text-sm text-slate-600">
        <Link href={mode === "login" ? "/signup" : "/login"} className="text-teal-700 hover:underline">
          {t(mode === "login" ? "auth.noAccount" : "auth.haveAccount")}
        </Link>
      </p>
    </form>
  );
}
