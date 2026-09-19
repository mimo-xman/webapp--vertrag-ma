import mongoose, { Schema } from "mongoose";

// Status values — TWO workflows depending on the demande's price:
//
// price = 0 (verification is free — default):
//   en_attente → en_cours_de_revision → confirmed | rejected
//   en_attente → cancelled (by user, before the review starts)
//
// price > 0 (the admin priced the dossier verification):
//   waiting_payment → payed_waiting_review → payed_in_review → confirmed | rejected
//   waiting_payment → cancelled (by user or admin, before payment)
//   payed_waiting_review / payed_in_review → cancelled (by admin, with a message)
export type DossierAddDemandeStatus =
  | "en_attente"
  | "waiting_payment"
  | "payed_waiting_review"
  | "payed_in_review"
  | "en_cours_de_revision"
  | "confirmed"
  | "rejected"
  | "cancelled";

export interface IDossierDemandeForAdd extends mongoose.Document {
  ref_number: string;
  user_id: mongoose.Types.ObjectId;
  dossier_pdf_link: string;
  // Price in effect when the demande was created (0 by default). Stored on
  // the demande because the admin can change the price at any time — the
  // user pays the price he saw, not the current one.
  price: number;
  confirmed_at: Date | null;
  // When the admin validated the payment (price > 0 workflow).
  payed_at: Date | null;
  message_on_failed: string | null;
  status: DossierAddDemandeStatus;
  active: boolean; // true tant que la demande n'est pas terminée
  cancelled_by: "user" | "admin" | null;
  cancelled_at: Date | null;
  cancel_message: string | null; // message de l'admin lors d'une annulation après paiement (visible par l'utilisateur)
  createdAt: Date;
  updatedAt: Date;
}

const DossierDemandeForAddSchema = new Schema<IDossierDemandeForAdd>(
  {
    ref_number: { type: String, required: true, unique: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dossier_pdf_link: { type: String, required: true },
    price: { type: Number, default: 0, min: 0 },
    confirmed_at: { type: Date, default: null },
    payed_at: { type: Date, default: null },
    message_on_failed: { type: String, default: null },
    status: {
      type: String,
      enum: [
        "en_attente",
        "waiting_payment",
        "payed_waiting_review",
        "payed_in_review",
        "en_cours_de_revision",
        "confirmed",
        "rejected",
        "cancelled",
      ],
      default: "en_attente",
      index: true,
    },
    active: { type: Boolean, default: true, index: true },
    cancelled_by: { type: String, enum: ["user", "admin"], default: null },
    cancelled_at: { type: Date, default: null },
    cancel_message: { type: String, default: null, maxlength: 2000 },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

// Index composé pour vérifier rapidement s'il y a une demande active
DossierDemandeForAddSchema.index({ user_id: 1, active: 1 });

export const DossierDemandeForAdd =
  mongoose.models.DossierDemandeForAdd ||
  mongoose.model<IDossierDemandeForAdd>("DossierDemandeForAdd", DossierDemandeForAddSchema);
