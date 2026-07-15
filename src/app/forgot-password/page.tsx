import { AuthShell } from "@/components/auth-screen";
import { ForgotPasswordForm } from "@/components/auth-mail-forms";
import { getServerT } from "@/lib/i18n/server";
import { mailEnabled } from "@/lib/mail";

export default async function ForgotPasswordPage() {
  const { t } = await getServerT();
  return (
    <AuthShell title={t("auth.forgotTitle")} subtitle={t("app.tagline")}>
      {mailEnabled() ? (
        <ForgotPasswordForm />
      ) : (
        <p className="text-sm text-slate-600">{t("auth.resetUnavailable")}</p>
      )}
    </AuthShell>
  );
}
