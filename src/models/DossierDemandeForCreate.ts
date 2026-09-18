import mongoose, { Schema } from "mongoose";

// Status values: en_attente | payed | in_creation | completed | cancelled
export type DossierCreateDemandeStatus = 
  | "en_attente" 
  | "payed" 
  | "in_creation" 
  | "completed" 
  | "cancelled";

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
  active: boolean; // true tant que la demande n'est pas terminée
  cancelled_by: "user" | "admin" | null;
  cancelled_at: Date | null;
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
      enum: ["en_attente", "payed", "in_creation", "completed", "cancelled"],
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
DossierDemandeForCreateSchema.index({ user_id: 1, active: 1 });

export const DossierDemandeForCreate =
  mongoose.models.DossierDemandeForCreate ||
  mongoose.model<IDossierDemandeForCreate>("DossierDemandeForCreate", DossierDemandeForCreateSchema);