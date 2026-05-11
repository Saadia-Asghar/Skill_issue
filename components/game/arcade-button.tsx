"use client";

import Link from "next/link";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

export type ArcadeSkin =
  | "lime"
  | "purple"
  | "cyan"
  | "gold"
  | "magenta"
  | "tangerine"
  | "ghost"
  | "ink";

export type ArcadeSize = "sm" | "md" | "lg";

const SKINS: Record<
  ArcadeSkin,
  { skin: string; shadow: string; ink: string }
> = {
  lime: { skin: "var(--lime)", shadow: "#3d7a00", ink: "#0a1f00" },
  purple: { skin: "var(--accent)", shadow: "#4a1f9e", ink: "#fff8e7" },
  cyan: { skin: "var(--accent-2)", shadow: "#0e5b73", ink: "#001b22" },
  gold: { skin: "var(--gold)", shadow: "#9a7c00", ink: "#1a0f00" },
  magenta: { skin: "var(--magenta)", shadow: "#8d0a35", ink: "#fff8e7" },
  tangerine: { skin: "var(--tangerine)", shadow: "#9a430b", ink: "#1f0a00" },
  ghost: { skin: "var(--surface-2)", shadow: "var(--surface)", ink: "#fff8e7" },
  ink: { skin: "#0a071a", shadow: "#000", ink: "#fff8e7" },
};

const SIZE_CLASS: Record<ArcadeSize, string> = {
  sm: "arcade arcade-sm",
  md: "arcade",
  lg: "arcade arcade-lg",
};

interface CommonProps {
  skin?: ArcadeSkin;
  size?: ArcadeSize;
  full?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "style" | "className">;

/**
 * Chunky arcade-style button. Sits on a heavy bottom drop-shadow that
 * disappears on `:active`, while the button shifts down — giving the
 * feeling of physically pressing a cabinet button.
 */
export const ArcadeButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function ArcadeButton(
    {
      skin = "lime",
      size = "md",
      full = false,
      children,
      className = "",
      style,
      ...rest
    },
    ref,
  ) {
    const sk = SKINS[skin];
    return (
      <button
        ref={ref}
        className={`${SIZE_CLASS[size]} ${full ? "w-full" : ""} ${className}`}
        style={
          {
            "--skin": sk.skin,
            "--shadow": sk.shadow,
            "--ink": sk.ink,
            ...style,
          } as CSSProperties
        }
        {...rest}
      >
        {children}
      </button>
    );
  },
);

interface LinkProps extends CommonProps {
  href: string;
  prefetch?: boolean;
  target?: AnchorHTMLAttributes<HTMLAnchorElement>["target"];
  rel?: AnchorHTMLAttributes<HTMLAnchorElement>["rel"];
}

/**
 * Same chunky look as `ArcadeButton`, rendered as a Next.js `<Link>`.
 */
export function ArcadeLink({
  skin = "lime",
  size = "md",
  full = false,
  href,
  children,
  className = "",
  style,
  prefetch,
  target,
  rel,
}: LinkProps) {
  const sk = SKINS[skin];
  return (
    <Link
      href={href}
      prefetch={prefetch}
      target={target}
      rel={rel}
      className={`${SIZE_CLASS[size]} ${full ? "w-full" : ""} ${className}`}
      style={
        {
          "--skin": sk.skin,
          "--shadow": sk.shadow,
          "--ink": sk.ink,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </Link>
  );
}
