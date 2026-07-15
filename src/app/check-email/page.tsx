import { AuthShell } from "@/components/auth-screen";
import { ResendVerificationForm } from "@/components/auth-mail-forms";
import { getServerT } from "@/lib/i18n/server";

/** Post-signup landing: "we emailed you a confirmation link" (+ resend). */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; sendfail?: string }>;
}) {
  const { email, sendfail } = await searchParams;
  const { t } = await getServerT();
  return (
    <AuthShell title={t("auth.checkEmailTitle")} subtitle={t("app.tagline")}>
      <div className="space-y-4">
        {sendfail ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("auth.mailSendFailed")}
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            {t("auth.checkEmailBody", { email: email ?? "—" })}
          </p>
        )}
        <ResendVerificationForm email={email ?? ""} />
      </div>
    </AuthShell>
  );
}
