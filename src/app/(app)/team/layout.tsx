import { requireTrainer } from "@/lib/dal";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  await requireTrainer();
  return <>{children}</>;
}
