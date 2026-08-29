// French messages for @el-zazo/email-verifier rejection reasons.

const MESSAGES: Record<string, string> = {
  major_provider_trusted: "Cet email est valide.",
  all_checks_passed: "Cet email est valide.",
  invalid_syntax: "L'adresse email est syntaxiquement invalide.",
  disposable_static_list: "Les adresses email temporaires ne sont pas acceptées.",
  no_mx_records: "Le domaine de cet email ne peut pas recevoir d'emails (pas de serveur MX).",
  domain_not_found: "Le domaine de cet email n'existe pas.",
  dns_timeout: "La vérification du domaine a expiré, réessayez.",
  dns_error: "Erreur lors de la vérification du domaine, réessayez.",
};

export function getEmailStatusMessage(reason: string | null): string {
  if (!reason) return "Cet email est valide.";
  return MESSAGES[reason] || "Cet email ne semble pas valide.";
}
