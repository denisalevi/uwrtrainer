import * as React from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-xl font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400";
  const variants = {
    primary: "bg-teal-600 text-white hover:bg-teal-700",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
    ghost: "text-slate-700 hover:bg-slate-100",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
  };
  const sizes = { md: "h-11 px-4 text-sm", sm: "h-9 px-3 text-sm" };
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function SectionTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-xs font-semibold uppercase tracking-wide text-slate-500", className)} {...props} />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium text-slate-700", className)} {...props} />;
}

const fieldCls =
  "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldCls, className)} {...props} />;
}
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldCls, "min-h-[80px]", className)} {...props} />;
}
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldCls, "appearance-none", className)} {...props} />;
}

export function Badge({
  className,
  tone = "slate",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "slate" | "teal" | "amber" | "red" | "green" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    teal: "bg-teal-100 text-teal-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    green: "bg-green-100 text-green-700",
  };
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

/** A collapsible settings card: native <details> styled like Card, with a chevron summary. */
export function Collapsible({
  title,
  hint,
  badge,
  defaultOpen,
  className,
  children,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group rounded-2xl border border-slate-200 bg-white shadow-sm open:border-slate-300",
        className,
      )}
    >
      <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-3 list-none [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            {title}
            {badge}
          </span>
          {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
        </div>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
        >
          <path
            fillRule="evenodd"
            d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>
      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
