import { AuthScreen } from "@/components/auth-screen";
import { getServerT } from "@/lib/i18n/server";

export default async function SignupPage() {
  const { t } = await getServerT();
  return <AuthScreen title={t("auth.signupTitle")} subtitle={t("app.tagline")} mode="signup" />;
}
