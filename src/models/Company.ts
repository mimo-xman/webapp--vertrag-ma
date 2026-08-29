import mongoose, { Schema } from "mongoose";

export interface ICompany extends mongoose.Document {
  name: string;
  email: string;
  categorie_ids: mongoose.Types.ObjectId[];
  created_by: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120, index: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    categorie_ids: { type: [Schema.Types.ObjectId], ref: "Category", default: [] },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

CompanySchema.index({ name: "text", email: "text" });

export const Company =
  mongoose.models.Company || mongoose.model<ICompany>("Company", CompanySchema);
