import { AuthShell } from "@/components/auth-screen";
import { ResetPasswordForm } from "@/components/auth-mail-forms";
import { getServerT } from "@/lib/i18n/server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const { t } = await getServerT();
  return (
    <AuthShell title={t("auth.resetTitle")} subtitle={t("app.tagline")}>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-slate-600">{t("auth.resetLinkInvalid")}</p>
      )}
    </AuthShell>
  );
}
