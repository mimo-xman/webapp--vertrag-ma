import mongoose, { Schema } from "mongoose";

// Status values: en_attente | payed | canceled
export type PostulationDemandeStatus = "en_attente" | "payed" | "canceled";

// Snapshot of the pricing parameters that were in effect when the user
// created the demande. Prices and steps can change at any time in the admin
// settings — the demande keeps the exact parameters used for its own price
// so both the user and the admin can see how it was computed, forever.
const pricingAxisSnapshot = {
  step: { type: Number, required: true },
  step_price: { type: Number, required: true },
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  free_amount: { type: Number, required: true },
};

export interface IPricingSnapshot {
  total: {
    step: number;
    step_price: number;
    min: number;
    max: number;
    free_amount: number;
  };
  per_day: {
    step: number;
    step_price: number;
    min: number;
    max: number;
    free_amount: number;
  };
  breakdown: {
    total_price: number;
    per_day_price: number;
    per_day_discount: number;
    per_day_price_after_discount: number;
    final_price: number;
  };
}

export interface IPostulationDemande extends mongoose.Document {
  ref_number: string;
  user_id: mongoose.Types.ObjectId;
  categorie_ids: mongoose.Types.ObjectId[];
  // Snapshot of the exact companies selected when the user created the
  // demande (eligible at that time). The admin confirmation creates the
  // postulations from THIS list, so later deactivations/deletions cannot
  // reduce what the user paid for.
  company_ids: mongoose.Types.ObjectId[];
  nmbr_total: number;
  nmbr_per_day: number;
  // Final price, computed once at creation — never recomputed later.
  price: number;
  // Pricing parameters in effect at creation time (see IPricingSnapshot).
  pricing_snapshot: IPricingSnapshot;
  confirmed_at: Date | null;
  status: PostulationDemandeStatus;
  createdAt: Date;
  updatedAt: Date;
}

const PostulationDemandeSchema = new Schema<IPostulationDemande>(
  {
    ref_number: { type: String, required: true, unique: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    categorie_ids: { type: [Schema.Types.ObjectId], ref: "Category", default: [] },
    company_ids: { type: [Schema.Types.ObjectId], ref: "Company", default: [] },
    nmbr_total: { type: Number, required: true, min: 100 },
    nmbr_per_day: { type: Number, required: true, min: 100 },
    price: { type: Number, required: true, min: 0 },
    pricing_snapshot: {
      type: {
        total: pricingAxisSnapshot,
        per_day: pricingAxisSnapshot,
        breakdown: {
          total_price: { type: Number, required: true },
          per_day_price: { type: Number, required: true },
          per_day_discount: { type: Number, required: true },
          per_day_price_after_discount: { type: Number, required: true },
          final_price: { type: Number, required: true },
        },
      },
      default: null,
    },
    confirmed_at: { type: Date, default: null },
    status: {
      type: String,
      enum: ["en_attente", "payed", "canceled"],
      default: "en_attente",
      index: true,
    },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const PostulationDemande =
  mongoose.models.PostulationDemande ||
  mongoose.model<IPostulationDemande>("PostulationDemande", PostulationDemandeSchema);
