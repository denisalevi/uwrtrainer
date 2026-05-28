import { AuthForm } from "@/components/auth-form";

export function AuthScreen({
  title,
  subtitle,
  mode,
}: {
  title: string;
  subtitle: string;
  mode: "login" | "signup";
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-2xl">
            🤿
          </div>
          <h1 className="text-2xl font-bold text-slate-900">UWR Trainer</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
          <AuthForm mode={mode} />
        </div>
      </div>
    </main>
  );
}
