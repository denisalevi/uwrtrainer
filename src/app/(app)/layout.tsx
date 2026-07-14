import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { BottomNav } from "@/components/bottom-nav";
import { TeamSwitcher } from "@/components/team-switcher";
import { ActiveWorkoutBar } from "@/components/active-workout-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const teams = user.teamIds.length
    ? await prisma.team.findMany({
        where: { id: { in: user.teamIds } },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-slate-100">
      <header className="flex items-center justify-end px-4 pt-3">
        <TeamSwitcher teams={teams} activeTeamId={user.activeTeamId} />
      </header>
      <main className="flex-1 px-4 pt-2 pb-safe">{children}</main>
      {/* Persistent "workout in progress" timers — visible on every page except the logger. */}
      <ActiveWorkoutBar />
      <BottomNav />
    </div>
  );
}
