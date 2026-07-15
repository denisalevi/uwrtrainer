"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  login,
  signup,
  listClaimableMembers,
  resendVerification,
  type AuthState,
} from "@/app/actions/auth";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Button, Input, Label } from "@/components/ui";

export function AuthForm({
  mode,
  requireCode = false,
  resetAvailable = false,
}: {
  mode: "login" | "signup";
  requireCode?: boolean;
  resetAvailable?: boolean;
}) {
  const { t } = useT();
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, undefined);
  // Separate action for the "resend verification link" button shown when login is
  // blocked by an unverified email (submits the same form's email field).
  const [resendState, resendAction, resendPending] = useActionState<AuthState, FormData>(
    resendVerification,
    undefined,
  );
  const [code, setCode] = useState("");
  const [claimables, setClaimables] = useState<{ id: string; name: string }[]>([]);

  // Roster claim: fetch unclaimed members of the team the entered code belongs to
  // (or of the default team when signup is open). Debounced on code typing.
  useEffect(() => {
    if (mode !== "signup") return;
    let cancelled = false;
    const handle = setTimeout(() => {
      listClaimableMembers(code || undefined)
        .then((members) => {
          if (!cancelled) setClaimables(members);
        })
        .catch(() => {
          if (!cancelled) setClaimables([]);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [mode, code]);

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
        {mode === "login" && resetAvailable && (
          <p className="mt-1 text-right text-xs">
            <Link href="/forgot-password" className="text-teal-700 hover:underline">
              {t("auth.forgotPassword")}
            </Link>
          </p>
        )}
      </div>

      {mode === "signup" && requireCode && (
        <div>
          <Label htmlFor="code">{t("auth.inviteCode")}</Label>
          <Input
            id="code"
            name="code"
            autoComplete="off"
            placeholder={t("auth.inviteCodePlaceholder")}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      )}

      {mode === "signup" && claimables.length > 0 && (
        <fieldset className="space-y-1 rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">{t("auth.claimPrompt")}</legend>
          {claimables.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm text-slate-800">
              <input type="radio" name="claimMemberId" value={m.id} />
              {m.name}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input type="radio" name="claimMemberId" value="" defaultChecked />
            {t("auth.claimNone")}
          </label>
        </fieldset>
      )}

      {state?.error && (
        <div className="space-y-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{t(state.error as DictKey)}</p>
          {state.unverifiedEmail && (
            <Button
              type="submit"
              variant="secondary"
              formAction={resendAction}
              disabled={resendPending}
              className="w-full"
            >
              {resendPending ? t("common.loading") : t("auth.resendButton")}
            </Button>
          )}
        </div>
      )}
      {(resendState?.info || resendState?.error) && (
        <p
          className={
            resendState.error
              ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
              : "rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800"
          }
        >
          {t((resendState.error ?? resendState.info) as DictKey)}
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
