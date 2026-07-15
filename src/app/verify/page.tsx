import Link from "next/link";
import { AuthShell } from "@/components/auth-screen";
import { getServerT } from "@/lib/i18n/server";
import { consumeAuthToken } from "@/lib/auth-token-store";
import { prisma } from "@/lib/db";

/** Lands here from the emailed confirmation link; redeeming the token verifies the email. */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const { t } = await getServerT();

  let verified = false;
  if (token) {
    const userId = await consumeAuthToken(token, "VERIFY_EMAIL");
    if (userId) {
      // Keep the first verification timestamp if a stale link is clicked again.
      await prisma.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
      verified = true;
    }
  }

  return (
    <AuthShell title={t("auth.verifyTitle")} subtitle={t("app.tagline")}>
      <div className="space-y-4">
        <p
          className={
            verified
              ? "rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800"
              : "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          }
        >
          {t(verified ? "auth.verifySuccess" : "auth.verifyInvalid")}
        </p>
        <p className="text-center text-sm text-slate-600">
          <Link href="/login" className="text-teal-700 hover:underline">
            {t("auth.goToLogin")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
