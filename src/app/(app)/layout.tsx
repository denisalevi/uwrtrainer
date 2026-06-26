import { requireUser } from "@/lib/dal";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-slate-100">
      <main className="flex-1 px-4 pt-5 pb-safe">{children}</main>
      <BottomNav />
    </div>
  );
}
