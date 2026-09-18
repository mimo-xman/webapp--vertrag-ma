import mongoose, { Schema } from "mongoose";

export interface IUser extends mongoose.Document {
  full_name: string;
  date_of_birth: Date | null;
  email: string;
  password: string;
  role: "user" | "admin";
  active: boolean;
  dossier_pdf_link: string | null;
  dossier_source_type: "ajout" | "creation" | null;
  dossier_source_demande_id: mongoose.Types.ObjectId | null;
  dossier_source_ref_number: string | null;
  email_verification_token: string | null;
  email_verification_expires: Date | null;
  delete_account_token: string | null;
  delete_account_expires: Date | null;
  resetToken: string | null;
  resetTokenExpiry: Date | null;
  passwordChangedAt: Date | null;
  two_factor_secret: string | null;
  two_factor_enabled: boolean;
  two_factor_backup_codes: string[];
  disable_2fa_token: string | null;
  disable_2fa_expires: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    full_name: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
    date_of_birth: { type: Date, default: null },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ["user", "admin"], default: "user", index: true },
    active: { type: Boolean, default: false },
    dossier_pdf_link: { type: String, default: null },
    dossier_source_type: { type: String, enum: ["ajout", "creation"], default: null },
    dossier_source_demande_id: { type: Schema.Types.ObjectId, default: null },
    dossier_source_ref_number: { type: String, default: null },
    email_verification_token: { type: String, default: null },
    email_verification_expires: { type: Date, default: null },
    delete_account_token: { type: String, default: null },
    delete_account_expires: { type: Date, default: null },
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    two_factor_secret: { type: String, default: null },
    two_factor_enabled: { type: Boolean, default: false },
    two_factor_backup_codes: { type: [String], default: [] },
    disable_2fa_token: { type: String, default: null },
    disable_2fa_expires: { type: Date, default: null },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
