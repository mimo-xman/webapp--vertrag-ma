// Unified dossier-demande status system.
//
// One single source of truth for status labels, colors, price wording and
// cancellation rules — used by the user pages (dossier, dashboard) AND the
// admin pages so the exact same wording appears everywhere in the webapp.
//
// DB status values (shared enums):
//   Creation demande: en_attente | payed | in_creation | completed | cancelled
//   Add demande (price = 0): en_attente | en_cours_de_revision | confirmed | rejected | cancelled
//   Add demande (price > 0): waiting_payment | payed_waiting_review | payed_in_review
//                            | confirmed | rejected | cancelled

export type DossierDemandeType = "creation" | "ajout";

export interface StatusLike {
  status: string;
  cancelled_by?: "user" | "admin" | null;
}

export type StampVariant = "green" | "blue" | "ink" | "red" | "gold";

/** i18n key for a creation demande status (context-specific wording). */
export function createStatusKey(d: StatusLike): string {
  switch (d.status) {
    case "en_attente":
      return "dossier.statusAwaitingPayment"; // En attente de paiement
    case "payed":
      return "dossier.statusPaidAwaitingCreation"; // Payée et en attente de la création
    case "in_creation":
      return "dossier.statusPaidInCreation"; // Payée et en cours de création
    case "completed":
      return "dossier.statusCompleted"; // Terminée
    case "cancelled":
      return d.cancelled_by === "admin"
        ? "dossier.statusCancelledByAdmin"
        : "dossier.statusCancelledByUser";
    default:
      return "dossier.statusAwaitingPayment";
  }
}

/** i18n key for an add demande status (context-specific wording). */
export function addStatusKey(d: StatusLike): string {
  switch (d.status) {
    case "en_attente":
      return "dossier.statusAwaitingReview"; // En attente de révision
    case "waiting_payment":
      return "dossier.statusWaitingPayment"; // En attente de paiement
    case "payed_waiting_review":
      return "dossier.statusPayedAwaitingReview"; // Payée et en attente de révision
    case "payed_in_review":
      return "dossier.statusPayedInReview"; // Payée et en cours de révision
    case "en_cours_de_revision":
      return "dossier.statusUnderReview"; // En cours de révision
    case "confirmed":
      return "dossier.statusConfirmed"; // Confirmée
    case "rejected":
      return "dossier.statusRejected"; // Rejetée
    case "cancelled":
      return d.cancelled_by === "admin"
        ? "dossier.statusCancelledByAdmin"
        : "dossier.statusCancelledByUser";
    default:
      return "dossier.statusAwaitingReview";
  }
}

/** Stamp color for a status (identical for both demande types). */
export function statusVariant(d: StatusLike): StampVariant {
  switch (d.status) {
    case "confirmed":
    case "completed":
      return "green";
    case "en_attente":
    case "payed":
    case "in_creation":
    case "waiting_payment":
    case "payed_waiting_review":
    case "payed_in_review":
      return "blue";
    case "en_cours_de_revision":
      return "ink";
    case "rejected":
    case "cancelled":
      return "red";
    default:
      return "ink";
  }
}

/** Is the demande still in an active (non-final) state? */
export function isDemandeActive(d: StatusLike): boolean {
  return !["completed", "cancelled", "confirmed", "rejected"].includes(d.status);
}

/**
 * Can the USER cancel this demande? Only before the money/review is engaged:
 * - Creation: only before payment (status en_attente).
 * - Add: while en_attente (free) or waiting_payment (priced, payment not
 *   yet validated by the admin).
 */
export function userCanCancel(type: DossierDemandeType, d: StatusLike): boolean {
  if (type === "creation") return d.status === "en_attente";
  return d.status === "en_attente" || d.status === "waiting_payment";
}

/**
 * Can the ADMIN cancel this demande?
 * - Creation: only while UNPAID (en_attente) — once the payment is
 *   confirmed it cannot be cancelled.
 * - Add: any active status (before confirmation/rejection). When the
 *   payment has been validated (payed_*), a message is required.
 */
export function adminCanCancel(type: DossierDemandeType, d: StatusLike): boolean {
  if (type === "creation") {
    return d.status === "en_attente";
  }
  return isDemandeActive(d);
}

/** Has the add demande's payment been validated by the admin? */
export function isAddDemandePayed(d: StatusLike): boolean {
  return d.status === "payed_waiting_review" || d.status === "payed_in_review";
}

export interface PriceParts {
  /** e.g. "20 $" — the main demande price, never summed with translation. */
  main: string;
  /** e.g. "+ 5 $ (Traduction)" — empty string when no translation price. */
  traduction: string;
  /** "à payer" | "payés" — the suffix wording. */
  suffixKey: string;
}

/**
 * Price wording for a CREATION demande. The creation price and the
 * translation price are always shown separately, never summed:
 *   en_attente            → "20 $ à payer"
 *   payed/in_creation/completed → "20 $ + 5 $ (Traduction) payés"
 *   cancelled (not paid)  → "0 $ payés" (user cancels only before payment)
 *   cancelled (admin, after payment) → "20 $ payés" (the price was paid)
 */
export function createPriceParts(
  t: (key: string) => string,
  d: { status: string; price: number; traduction_price?: number; payed_at?: string | Date | null }
): string {
  const trad = d.traduction_price || 0;
  const traductionLabel =
    trad > 0 ? ` + ${formatPrice(trad)} (${t("dossier.traductionPrice")})` : "";

  if (d.status === "en_attente") {
    return `${formatPrice(d.price)}${traductionLabel} ${t("dossier.priceToPay")}`;
  }
  if (d.status === "cancelled") {
    // Payment confirmed before the admin cancelled → the price was paid.
    if (d.payed_at) {
      return `${formatPrice(d.price)}${traductionLabel} ${t("dossier.pricePaid")}`;
    }
    // User cancels only before payment → nothing was paid.
    return `${formatPrice(0)} ${t("dossier.pricePaid")}`;
  }
  return `${formatPrice(d.price)}${traductionLabel} ${t("dossier.pricePaid")}`;
}

/**
 * Price wording for an ADD demande (price snapshotted at creation):
 *   waiting_payment / en_attente / en_cours_de_revision → "5 $ à payer"
 *   payed_* (payment validated)                          → "5 $ payés"
 *   confirmed                                            → "5 $ payés"
 *   rejected / cancelled (not paid)                      → "0 $ payés"
 *   cancelled (admin, after payment)                     → "5 $ payés"
 */
export function addPriceParts(
  t: (key: string) => string,
  d: { status: string; price: number; payed_at?: string | Date | null; cancelled_by?: "user" | "admin" | null }
): string {
  if (d.status === "waiting_payment" || d.status === "en_attente" || d.status === "en_cours_de_revision") {
    return `${formatPrice(d.price)} ${t("dossier.priceToPay")}`;
  }
  if (d.status === "confirmed" || isAddDemandePayed(d)) {
    return `${formatPrice(d.price)} ${t("dossier.pricePaid")}`;
  }
  if (d.status === "cancelled" && d.payed_at) {
    return `${formatPrice(d.price)} ${t("dossier.pricePaid")}`;
  }
  return `${formatPrice(0)} ${t("dossier.pricePaid")}`;
}

/** Format a number as "N $" (integers without decimals). */
export function formatPrice(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)} $`;
}
