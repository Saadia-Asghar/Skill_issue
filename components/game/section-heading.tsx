import type { ReactNode } from "react";

interface Props {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}

/**
 * Big chunky arcade-style section heading. Use as the first child of any
 * full-page section. The eyebrow is small caps (think "ROUND 1 ·"), the
 * title is a fat Fredoka headline, and `right` slot holds CTAs / metadata.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  right,
  className = "",
}: Props) {
  return (
    <header
      className={`flex flex-wrap items-end justify-between gap-4 ${className}`}
    >
      <div>
        {eyebrow ? (
          <p
            className="text-[10px] font-bold uppercase tracking-[0.4em]"
            style={{ color: "var(--gold)" }}
          >
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-base text-muted">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </header>
  );
}
