import { getServerT } from "@/lib/i18n/server";
import { AuthScreen } from "@/app/login/page";

export default async function SignupPage() {
  const { t } = await getServerT();
  return <AuthScreen title={t("auth.signupTitle")} subtitle={t("app.tagline")} mode="signup" />;
}
