import mongoose, { Schema } from "mongoose";

export interface ICategory extends mongoose.Document {
  name: string;
  // An inactive category is hidden from the user's category selector and
  // its companies are excluded from NEW demande targeting.
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 60 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const Category =
  mongoose.models.Category || mongoose.model<ICategory>("Category", CategorySchema);
