import Link from "next/link";
import type { ReactNode } from "react";

/** Shown when an API answers 401: a serif line and a link to sign in. */
export function SignInNote({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="font-serif text-[18px] leading-[1.35] text-body">{children}</p>
      <Link href="/account" className="inline-flex h-9 items-center rounded-sm border border-hairline-strong px-4 text-[14px] font-medium text-ink hover:bg-hover pointer-coarse:min-h-11">
        Sign in
      </Link>
    </div>
  );
}
