import mongoose, { Schema } from "mongoose";

// Status values: en_attente | en_cours_de_revision | confirmed | rejected | cancelled
export type DossierAddDemandeStatus = 
  | "en_attente" 
  | "en_cours_de_revision" 
  | "confirmed" 
  | "rejected" 
  | "cancelled";

export interface IDossierDemandeForAdd extends mongoose.Document {
  ref_number: string;
  user_id: mongoose.Types.ObjectId;
  dossier_pdf_link: string;
  price: number; // 0 par défaut, mais stocké pour historique
  confirmed_at: Date | null;
  message_on_failed: string | null;
  status: DossierAddDemandeStatus;
  active: boolean; // true tant que la demande n'est pas terminée
  cancelled_by: "user" | "admin" | null;
  cancelled_at: Date | null;
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
    message_on_failed: { type: String, default: null },
    status: {
      type: String,
      enum: ["en_attente", "en_cours_de_revision", "confirmed", "rejected", "cancelled"],
      default: "en_attente",
      index: true,
    },
    active: { type: Boolean, default: true, index: true },
    cancelled_by: { type: String, enum: ["user", "admin"], default: null },
    cancelled_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

// Index composé pour vérifier rapidement s'il y a une demande active
DossierDemandeForAddSchema.index({ user_id: 1, active: 1 });

export const DossierDemandeForAdd =
  mongoose.models.DossierDemandeForAdd ||
  mongoose.model<IDossierDemandeForAdd>("DossierDemandeForAdd", DossierDemandeForAddSchema);