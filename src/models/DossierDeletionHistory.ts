import mongoose, { Schema } from "mongoose";

export interface IDossierDeletionHistory extends mongoose.Document {
  user_id: mongoose.Types.ObjectId;
  dossier_pdf_link: string | null;
  source_type: "ajout" | "creation";
  source_demande_id: mongoose.Types.ObjectId | null;
  source_ref_number: string | null;
  deleted_at: Date;
}

const DossierDeletionHistorySchema = new Schema<IDossierDeletionHistory>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dossier_pdf_link: { type: String, default: null },
    source_type: { type: String, enum: ["ajout", "creation"], required: true },
    source_demande_id: { type: Schema.Types.ObjectId, ref: "DossierDemandeForAdd", default: null },
    source_ref_number: { type: String, default: null },
    deleted_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

DossierDeletionHistorySchema.index({ user_id: 1, deleted_at: -1 });

export const DossierDeletionHistory =
  mongoose.models.DossierDeletionHistory ||
  mongoose.model<IDossierDeletionHistory>("DossierDeletionHistory", DossierDeletionHistorySchema);