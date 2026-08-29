import mongoose, { Schema } from "mongoose";

export interface ISetting extends mongoose.Document {
  postulation_demandes: {
    price_of_hundred_total: number;
    price_of_hundred_per_day: number;
    free_per_day_amount: number;
    min_total: number;
    min_per_day: number;
    step_total: number;
    step_per_day: number;
  };
  postulations: {
    email_message: string;
    email_subject: string;
  };
  dossier: {
    creation_price: number;
  };
  contact: {
    whatsapp_url: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SettingSchema = new Schema<ISetting>(
  {
    postulation_demandes: {
      price_of_hundred_total: { type: Number, default: 1 },
      price_of_hundred_per_day: { type: Number, default: 1 },
      free_per_day_amount: { type: Number, default: 300 },
      min_total: { type: Number, default: 500 },
      min_per_day: { type: Number, default: 300 },
      step_total: { type: Number, default: 500 },
      step_per_day: { type: Number, default: 100 },
    },
    postulations: {
      email_message: {
        type: String,
        default:
          "Sehr geehrte Damen und Herren,\n\nanbei sende ich Ihnen meine Bewerbungsunterlagen. Über eine Einladung zu einem persönlichen Gespräch würde ich mich sehr freuen.\n\nMit freundlichen Grüßen",
      },
      email_subject: { type: String, default: "Bewerbung" },
    },
    dossier: {
      creation_price: { type: Number, default: 20 },
    },
    contact: {
      whatsapp_url: { type: String, default: "https://wa.me/212600000000" },
    },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const Setting = mongoose.models.Setting || mongoose.model<ISetting>("Setting", SettingSchema);

// Always return the singleton settings document, creating it with defaults if missing.
export async function getSettings(): Promise<ISetting> {
  let doc = await Setting.findOne();
  if (!doc) doc = await Setting.create({});
  return doc;
}
