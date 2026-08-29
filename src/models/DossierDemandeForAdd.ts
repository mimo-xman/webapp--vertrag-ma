import mongoose, { Schema } from "mongoose";

// Status values: en_attente | confirmed | rejected
export type DossierAddDemandeStatus = "en_attente" | "confirmed" | "rejected";

export interface IDossierDemandeForAdd extends mongoose.Document {
  ref_number: string;
  user_id: mongoose.Types.ObjectId;
  dossier_pdf_link: string;
  confirmed_at: Date | null;
  message_on_failed: string | null;
  status: DossierAddDemandeStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DossierDemandeForAddSchema = new Schema<IDossierDemandeForAdd>(
  {
    ref_number: { type: String, required: true, unique: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dossier_pdf_link: { type: String, required: true },
    confirmed_at: { type: Date, default: null },
    message_on_failed: { type: String, default: null },
    status: {
      type: String,
      enum: ["en_attente", "confirmed", "rejected"],
      default: "en_attente",
      index: true,
    },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const DossierDemandeForAdd =
  mongoose.models.DossierDemandeForAdd ||
  mongoose.model<IDossierDemandeForAdd>("DossierDemandeForAdd", DossierDemandeForAddSchema);
