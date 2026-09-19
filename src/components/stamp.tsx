"use client";

// der Stempel — the signature status element: a rubber-stamp badge.

import { cn } from "@/lib/utils";

export type StampVariant = "ink" | "blue" | "red" | "green" | "gold";

const VARIANT_CLASS: Record<StampVariant, string> = {
  ink: "stamp-ink",
  blue: "stamp-blue",
  red: "stamp-red",
  green: "stamp-green",
  gold: "stamp-gold",
};

export function Stamp({
  variant = "ink",
  className,
  animate = false,
  children,
}: {
  variant?: StampVariant;
  className?: string;
  animate?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("stamp", VARIANT_CLASS[variant], animate && "stamp-anim", className)}>
      {children}
    </span>
  );
}

// Status → stamp variant mapping (DB status values).
export function statusVariant(status: string): StampVariant {
  switch (status) {
    case "envoyee":
    case "payed":
    case "confirmed":
    case "completed":
    case "active":
    case "success":
      return "green";
    case "echouee":
    case "rejected":
    case "failed":
    case "suspended":
      return "red";
    case "re_execute":
      return "gold";
    case "executing":
    case "running":
    case "in_use":
      return "blue";
    case "en_attente":
    case "canceled":
    default:
      return "ink";
  }
}

export function StatusStamp({
  status,
  label,
  className,
  animate,
}: {
  status: string;
  label: string;
  className?: string;
  animate?: boolean;
}) {
  return (
    <Stamp variant={statusVariant(status)} className={className} animate={animate}>
      {label}
    </Stamp>
  );
}
