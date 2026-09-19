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
    add_price: number;
  };
  contact: {
    whatsapp_url: string;
  };
  schema_version: number;
  createdAt: Date;
  updatedAt: Date;
}

const SettingSchema = new Schema<ISetting>(
  {
    postulation_demandes: {
      price_of_hundred_total: { type: Number, default: 1 },
      price_of_hundred_per_day: { type: Number, default: 1 },
      free_per_day_amount: { type: Number, default: 300 },
      min_total: { type: Number, default: 100 },
      min_per_day: { type: Number, default: 100 },
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
        add_price: { type: Number, default: 0 },
      },
    contact: {
      whatsapp_url: { type: String, default: "https://wa.me/212600000000" },
    },
    schema_version: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const Setting = mongoose.models.Setting || mongoose.model<ISetting>("Setting", SettingSchema);

// ── Settings migrations ──────────────────────────────────────────────────
// One-time migrations for settings documents created with OLD defaults.
// Guarded by schema_version so each migration runs exactly once per database,
// and each migration only touches values that still hold an OLD default —
// a value an admin has deliberately customized is never overwritten.
const SETTINGS_MIGRATIONS: Array<(doc: ISetting) => string[]> = [
  // v1 — minimums of demande de postulation lowered (spec change):
  // min_total 500 → 100, min_per_day 300 → 100.
  (doc) => {
    const applied: string[] = [];
    if (doc.postulation_demandes.min_total === 500) {
      doc.postulation_demandes.min_total = 100;
      applied.push("min_total 500 → 100");
    }
    if (doc.postulation_demandes.min_per_day === 300) {
      doc.postulation_demandes.min_per_day = 100;
      applied.push("min_per_day 300 → 100");
    }
    return applied;
  },
];

// Always return the singleton settings document, creating it with defaults if missing.
export async function getSettings(): Promise<ISetting> {
  let doc = await Setting.findOne();
  if (!doc) doc = await Setting.create({ schema_version: SETTINGS_MIGRATIONS.length });

  const currentVersion = doc.schema_version || 0;
  if (currentVersion < SETTINGS_MIGRATIONS.length) {
    const applied: string[] = [];
    for (let v = currentVersion; v < SETTINGS_MIGRATIONS.length; v++) {
      applied.push(...SETTINGS_MIGRATIONS[v](doc));
      doc.schema_version = v + 1;
    }
    await doc.save();
    if (applied.length > 0) {
      console.log(`[SETTINGS] Migration appliquée (v${SETTINGS_MIGRATIONS.length}) : ${applied.join(", ")}`);
    }
  }
  return doc;
}
