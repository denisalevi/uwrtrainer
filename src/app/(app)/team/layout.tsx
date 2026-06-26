import { requireUser } from "@/lib/dal";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  // Team area is readable by every logged-in member (read-only for non-trainers).
  await requireUser();
  return <>{children}</>;
}
