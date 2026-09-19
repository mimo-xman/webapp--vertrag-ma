// Company eligibility for NEW demande de postulation targeting.
//
// A company is eligible only when:
//   - it is active (deactivated companies are excluded from counts,
//     selection and the demande snapshot — but keep receiving the
//     postulations already scheduled for them), and
//   - the user has never applied to it (lifetime anti-duplicate), and
//   - when specific categories are selected, it belongs to one of them;
//     when NO category is selected ("all companies"), it belongs to at
//     least one ACTIVE category — or to no category at all.
//
// The admin confirmation later creates the postulations from the SNAPSHOT
// saved on the demande (see PostulationDemande.company_ids), so this
// eligibility only decides which companies can be SELECTED, never which
// already-scheduled postulations get sent.

import type mongoose from "mongoose";
import { Category } from "@/models/Category";

export interface EligibilityParams {
  /** Companies the user already applied to (Postulation.distinct). */
  usedCompanyIds: unknown[];
  /** Selected category ObjectIds — empty array means "all companies". */
  categoryIds?: mongoose.Types.ObjectId[];
}

export async function buildEligibleCompanyFilter(
  params: EligibilityParams
): Promise<Record<string, unknown>> {
  const { usedCompanyIds, categoryIds = [] } = params;

  const filter: Record<string, unknown> = {
    active: true,
    _id: { $nin: usedCompanyIds },
  };

  if (categoryIds.length > 0) {
    filter.categorie_ids = { $in: categoryIds };
    return filter;
  }

  // "All companies" mode — a deactivated category removes its companies
  // from targeting: only companies with at least one active category (or
  // no category at all) are eligible.
  const activeCategoryIds = await Category.find({ active: true }).distinct("_id");
  filter.$or = [
    { categorie_ids: { $size: 0 } },
    { categorie_ids: { $in: activeCategoryIds } },
  ];
  return filter;
}
