import type { ButtonHTMLAttributes, ReactNode } from "react";

// Primitives from ~/DESIGN.md (Ledger). Buttons are 36px (44px on touch), 4px
// radius. Primary is ink-on-canvas, accent is the page's single most important
// action (never both on one page), ghost is the quiet default.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "accent" | "ghost" | "quiet" | "danger"; size?: "md" | "sm" };

export function Button({ variant = "ghost", size = "md", className = "", ...rest }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-sm font-medium whitespace-nowrap cursor-pointer disabled:cursor-default disabled:text-stone pointer-coarse:min-h-11";
  const sizes = size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-[14px]";
  const variants = {
    primary: "bg-primary text-primary-on hover:bg-primary-hover disabled:hover:bg-primary",
    accent: "bg-accent text-accent-on hover:bg-accent-hover disabled:hover:bg-accent",
    ghost: "border border-hairline-strong text-ink hover:bg-hover disabled:border-hairline disabled:hover:bg-transparent",
    quiet: "text-mute hover:text-ink",
    danger: "border border-hairline-strong text-danger hover:bg-hover",
  }[variant];
  return <button className={`${base} ${sizes} ${variants} ${className}`} {...rest} />;
}

export const inputClass =
  "h-9 w-full rounded-sm border border-field bg-card px-3 text-[14px] text-ink outline-none placeholder:text-mute aria-invalid:border-danger pointer-coarse:h-11";

/** A labelled form control. `error` shows in danger mono under the field. */
export function Field({ label, children, hint, error, id }: { label: string; children: ReactNode; hint?: string; error?: string | null; id?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[12px] text-mute">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[12px] text-mute">{hint}</span>}
      {error && (
        <span id={id ? `${id}-error` : undefined} className="mt-1 block font-mono text-[12px] text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

/** A section opener: hairline-strong rule with a mono label left and real meta right. */
export function SectionRule({ label, meta, children }: { label: string; meta?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-t border-hairline-strong pt-3">
      <div className="flex items-baseline justify-between gap-4 font-mono text-[12px]">
        <h2 className="text-ink">{label}</h2>
        {meta && <span className="text-mute">{meta}</span>}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}

/** Page frame for app screens: 1120px max, scale gutters, serif title. */
export function Page({ title, lede, children }: { title: string; lede?: string; children?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-6 pt-12 pb-24 max-[720px]:px-4 max-[720px]:pt-8">
      <h1 className="font-serif text-[40px] leading-[1.1] tracking-[-0.01em] max-[720px]:text-[32px]">{title}</h1>
      {lede && <p className="mt-3 max-w-[60ch] font-serif text-[18px] leading-[1.6] text-body">{lede}</p>}
      <div className="mt-12 space-y-12">{children}</div>
    </main>
  );
}

/** Nothing here yet: a serif line in body and at most one ghost action. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="font-serif text-[18px] leading-[1.35] text-body">{children}</p>
      {action}
    </div>
  );
}

/** Only inside buttons. */
export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-hairline-strong border-t-ink ${className}`} aria-hidden />;
}
