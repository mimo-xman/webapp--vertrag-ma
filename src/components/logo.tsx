"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  href = "/",
  inverted = false,
}: {
  className?: string;
  href?: string;
  inverted?: boolean;
}) {
  return (
    <Link href={href} className={cn("group inline-flex items-baseline gap-1 select-none", className)}>
      <span
        className={`font-display text-xl font-extrabold tracking-tight ${
          inverted ? "text-sidebar-primary" : "text-foreground"
        }`}
      >
        Vertrag
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight text-warning group-hover:text-[#e8b04b] transition-colors">
        .ma
      </span>
    </Link>
  );
}
