import { AuthScreen } from "@/components/auth-screen";
import { getServerT } from "@/lib/i18n/server";

export default async function LoginPage() {
  const { t } = await getServerT();
  return <AuthScreen title={t("auth.loginTitle")} subtitle={t("app.tagline")} mode="login" />;
}
