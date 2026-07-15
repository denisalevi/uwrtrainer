"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  requestPasswordReset,
  resendVerification,
  resetPassword,
  type AuthState,
} from "@/app/actions/auth";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Button, Input, Label } from "@/components/ui";

function StateNotice({ state }: { state: AuthState }) {
  const { t } = useT();
  if (!state?.error && !state?.info) return null;
  return (
    <p
      className={
        state.error
          ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          : "rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800"
      }
    >
      {t((state.error ?? state.info) as DictKey)}
    </p>
  );
}

function BackToLogin() {
  const { t } = useT();
  return (
    <p className="text-center text-sm text-slate-600">
      <Link href="/login" className="text-teal-700 hover:underline">
        {t("auth.goToLogin")}
      </Link>
    </p>
  );
}

/** "Forgot password" — asks for the email, always answers with the same notice. */
export function ForgotPasswordForm() {
  const { t } = useT();
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    undefined,
  );
  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-slate-600">{t("auth.forgotBody")}</p>
      <div>
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <StateNotice state={state} />
      {!state?.info && (
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t("common.loading") : t("auth.forgotButton")}
        </Button>
      )}
      <BackToLogin />
    </form>
  );
}

/** Set a new password from an emailed reset link (token travels as a hidden field). */
export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    resetPassword,
    undefined,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {!state?.info && (
        <div>
          <Label htmlFor="password">{t("auth.newPassword")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
          <p className="mt-1 text-xs text-slate-500">{t("auth.passwordHint")}</p>
        </div>
      )}
      <StateNotice state={state} />
      {!state?.info && (
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t("common.loading") : t("auth.resetButton")}
        </Button>
      )}
      <BackToLogin />
    </form>
  );
}

/** Resend the verification link (check-email page). */
export function ResendVerificationForm({ email }: { email: string }) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    resendVerification,
    undefined,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <StateNotice state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="w-full">
        {pending ? t("common.loading") : t("auth.resendButton")}
      </Button>
      <BackToLogin />
    </form>
  );
}
