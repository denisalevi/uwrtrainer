import { AuthScreen } from "@/components/auth-screen";
import { getServerT } from "@/lib/i18n/server";
import { mailEnabled } from "@/lib/mail";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  const { t } = await getServerT();
  return (
    <AuthScreen
      title={t("auth.loginTitle")}
      subtitle={t("app.tagline")}
      mode="login"
      resetAvailable={mailEnabled()}
      notice={deleted ? t("auth.accountDeleted") : undefined}
    />
  );
}
