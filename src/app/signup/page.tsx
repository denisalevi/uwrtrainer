import { AuthScreen } from "@/components/auth-screen";
import { getServerT } from "@/lib/i18n/server";
import { signupRequiresCode } from "@/app/actions/auth";

export default async function SignupPage() {
  const { t } = await getServerT();
  const requireCode = await signupRequiresCode();
  return (
    <AuthScreen
      title={t("auth.signupTitle")}
      subtitle={t("app.tagline")}
      mode="signup"
      requireCode={requireCode}
    />
  );
}
