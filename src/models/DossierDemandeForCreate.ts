import mongoose, { Schema } from "mongoose";

// Status values: en_attente | payed | in_creation | completed | canceled
export type DossierCreateDemandeStatus = "en_attente" | "payed" | "in_creation" | "completed" | "canceled";

export interface IDossierDemandeForCreate extends mongoose.Document {
  ref_number: string;
  user_id: mongoose.Types.ObjectId;
  price: number;
  traduction_price: number;
  payed_at: Date | null;
  dossier_ready_at: Date | null;
  completed_at: Date | null;
  dossier_pdf_link: string | null;
  status: DossierCreateDemandeStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DossierDemandeForCreateSchema = new Schema<IDossierDemandeForCreate>(
  {
    ref_number: { type: String, required: true, unique: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    traduction_price: { type: Number, default: 0, min: 0 },
    payed_at: { type: Date, default: null },
    dossier_ready_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    dossier_pdf_link: { type: String, default: null },
    status: {
      type: String,
      enum: ["en_attente", "payed", "in_creation", "completed", "canceled"],
      default: "en_attente",
      index: true,
    },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const DossierDemandeForCreate =
  mongoose.models.DossierDemandeForCreate ||
  mongoose.model<IDossierDemandeForCreate>("DossierDemandeForCreate", DossierDemandeForCreateSchema);
