import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/session";
import { isTrainer, type Locale, DEFAULT_LOCALE, isLocale } from "@/lib/constants";

export type CurrentUser = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  /** The team currently viewed (persisted choice if still a member, else first membership). */
  activeTeamId: string | null;
  /** All team ids the user belongs to. */
  teamIds: string[];
  locale: Locale;
  availabilityNote: string | null;
  trainerNote: string | null;
  restTimerEnabled: boolean;
  restTimerBeep: boolean;
  restTimerVibrate: boolean;
  restWarmupSeconds: number;
  restMainSeconds: number;
  restBbbSeconds: number;
};

/**
 * The authoritative auth check. Reads the session cookie, then loads the user
 * from the DB. Memoized per request via React `cache`. Returns null if not
 * authenticated or the user no longer exists.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session?.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      activeTeamId: true,
      memberships: { select: { teamId: true }, orderBy: { createdAt: "asc" } },
      locale: true,
      availabilityNote: true,
      trainerNote: true,
      restTimerEnabled: true,
      restTimerBeep: true,
      restTimerVibrate: true,
      restWarmupSeconds: true,
      restMainSeconds: true,
      restBbbSeconds: true,
    },
  });
  if (!user) return null;

  const teamIds = user.memberships.map((m) => m.teamId);
  const { memberships: _memberships, ...rest } = user;
  return {
    ...rest,
    activeTeamId:
      user.activeTeamId && teamIds.includes(user.activeTeamId)
        ? user.activeTeamId
        : (teamIds[0] ?? null),
    teamIds,
    locale: isLocale(user.locale) ? user.locale : DEFAULT_LOCALE,
  };
});

/** Require an authenticated user, else redirect to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require a trainer/admin, else redirect. */
export async function requireTrainer(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isTrainer(user.role)) redirect("/dashboard");
  return user;
}
