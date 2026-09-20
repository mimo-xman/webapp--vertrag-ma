import mongoose, { Schema } from "mongoose";

export interface ISetting extends mongoose.Document {
  postulation_pricing: {
    total: {
      step: number;
      step_price: number;
      min: number;
      max: number;
      free_amount: number;
    };
    per_day: {
      step: number;
      step_price: number;
      min: number;
      max: number;
      free_amount: number;
    };
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

const pricingAxisDefaults = {
  step: { type: Number, default: 500 },
  step_price: { type: Number, default: 5 },
  min: { type: Number, default: 100 },
  max: { type: Number, default: 100000 },
  free_amount: { type: Number, default: 0 },
};

const SettingSchema = new Schema<ISetting>(
  {
    // Pricing v2 - two independent axes (total / per day), each configured
    // with its own step, step price, min, max and free amount.
    postulation_pricing: {
      total: { ...pricingAxisDefaults, free_amount: { type: Number, default: 0 } },
      per_day: {
        step: { type: Number, default: 100 },
        step_price: { type: Number, default: 1 },
        min: { type: Number, default: 100 },
        max: { type: Number, default: 100000 },
        free_amount: { type: Number, default: 300 },
      },
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
    schema_version: { type: Number, default: 2 },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const Setting = mongoose.models.Setting || mongoose.model<ISetting>("Setting", SettingSchema);

// ── Settings migrations ──────────────────────────────────────────────────
// Guarded by schema_version so each migration runs exactly once per database.
// A value an admin has deliberately customized is never overwritten (only
// exact OLD defaults are upgraded).
const round2 = (v: number) => Math.round(v * 100) / 100;

// v2 - pricing model restructured into two independent axes.
// The legacy block `postulation_demandes` is no longer part of the mongoose
// schema, so the migration reads the RAW document (native driver) to keep
// the admin's customized values. Conversion:
//   axis.step       = legacy.step_{axis}
//   axis.step_price = legacy.price_of_hundred_{axis} * legacy.step_{axis} / 100
//   axis.min        = legacy.min_{axis} (with the v1 lowering 500→100 / 300→100)
//   axis.max        = 100000 (new ceiling - availability still applies on top)
//   axis.free       = per_day: legacy.free_per_day_amount · total: 0
async function migratePricingV2(doc: ISetting): Promise<string[]> {
  // Already migrated (idempotent guard).
  if (doc.postulation_pricing?.total?.step) return [];

  const raw = (await Setting.collection.findOne({ _id: doc._id })) as Record<string, unknown> | null;
  const legacy = (raw?.postulation_demandes || {}) as Record<string, number>;

  // v1 lowering of the minimums (only exact old defaults are upgraded).
  const legacyMinTotal = legacy.min_total === 500 ? 100 : (legacy.min_total ?? 100);
  const legacyMinPerDay = legacy.min_per_day === 300 ? 100 : (legacy.min_per_day ?? 100);

  doc.postulation_pricing = {
    total: {
      step: legacy.step_total ?? 500,
      step_price: round2(((legacy.price_of_hundred_total ?? 1) * (legacy.step_total ?? 500)) / 100),
      min: legacyMinTotal,
      max: 100000,
      free_amount: 0,
    },
    per_day: {
      step: legacy.step_per_day ?? 100,
      step_price: round2(((legacy.price_of_hundred_per_day ?? 1) * (legacy.step_per_day ?? 100)) / 100),
      min: legacyMinPerDay,
      max: 100000,
      free_amount: legacy.free_per_day_amount ?? 300,
    },
  };

  // Remove the legacy block from the raw document (no longer read anywhere).
  await Setting.collection.updateOne({ _id: doc._id }, { $unset: { postulation_demandes: "" } });

  return ["prix → modèle par axe (total / par jour) : prix du pas, maximum, gratuits par axe"];
}

// Always return the singleton settings document, creating it with defaults if missing.
export async function getSettings(): Promise<ISetting> {
  let doc = await Setting.findOne();
  if (!doc) doc = await Setting.create({ schema_version: 2 });

  const currentVersion = doc.schema_version || 0;
  if (currentVersion < 2) {
    const applied: string[] = [];
    for (let v = currentVersion; v < 2; v++) {
      applied.push(...(await migratePricingV2(doc)));
    }
    doc.schema_version = 2;
    await doc.save();
    if (applied.length > 0) {
      console.log(`[SETTINGS] Migration appliquée (v2) : ${applied.join(", ")}`);
    }
  }
  return doc;
}
