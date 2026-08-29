import mongoose, { Schema } from "mongoose";

// Status values: en_attente | payed | canceled
export type PostulationDemandeStatus = "en_attente" | "payed" | "canceled";

export interface IPostulationDemande extends mongoose.Document {
  ref_number: string;
  user_id: mongoose.Types.ObjectId;
  categorie_ids: mongoose.Types.ObjectId[];
  nmbr_total: number;
  nmbr_per_day: number;
  price: number;
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
    nmbr_total: { type: Number, required: true, min: 500 },
    nmbr_per_day: { type: Number, required: true, min: 300 },
    price: { type: Number, required: true, min: 0 },
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
