import { AuthForm } from "@/components/auth-form";

/** Shared centered-card layout for all auth pages (login/signup/reset/verify…). */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
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
          {children}
        </div>
      </div>
    </main>
  );
}

export function AuthScreen({
  title,
  subtitle,
  mode,
  requireCode = false,
  resetAvailable = false,
}: {
  title: string;
  subtitle: string;
  mode: "login" | "signup";
  requireCode?: boolean;
  resetAvailable?: boolean;
}) {
  return (
    <AuthShell title={title} subtitle={subtitle}>
      <AuthForm mode={mode} requireCode={requireCode} resetAvailable={resetAvailable} />
    </AuthShell>
  );
}
