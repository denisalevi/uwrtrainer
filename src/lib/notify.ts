import "server-only";
import { prisma } from "@/lib/db";
import { mailEnabled, sendSignupNotice } from "@/lib/mail";

/** Setting key: also notify TRAINER users about new signups ("1"/"0"; admins always get one). */
export const SIGNUP_NOTIFY_TRAINERS_KEY = "notifySignupTrainers";

export async function getSignupNotifyTrainers(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: SIGNUP_NOTIFY_TRAINERS_KEY } });
  return row?.value === "1";
}

/**
 * Email admins (and trainers, if the admin setting is on) that a new member finished
 * signing up — fired when the member's email gets VERIFIED, so abandoned unverified
 * signups stay quiet. Failures are logged, never surfaced: notification must not break
 * the verification flow it rides on.
 */
export async function notifySignupVerified(userId: string): Promise<void> {
  if (!mailEnabled()) return;
  try {
    const joined = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: { select: { team: { select: { name: true } } } },
      },
    });
    if (!joined?.email) return;
    const teamNames = joined.memberships.map((m) => m.team.name).join(", ");

    const includeTrainers = await getSignupNotifyTrainers();
    const recipients = await prisma.user.findMany({
      where: {
        role: { in: includeTrainers ? ["ADMIN", "TRAINER"] : ["ADMIN"] },
        email: { not: null },
        id: { not: joined.id },
      },
      select: { email: true, name: true, locale: true },
    });

    await Promise.all(
      recipients.map((r) =>
        sendSignupNotice(
          { email: r.email!, name: r.name, locale: r.locale },
          { name: joined.name, email: joined.email!, teamNames },
        ).catch((err) => console.error(`signup notice to ${r.email} failed`, err)),
      ),
    );
  } catch (err) {
    console.error("signup notification failed", err);
  }
}
