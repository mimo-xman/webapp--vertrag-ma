import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { getSettings, Setting } from "@/models/Setting";
import { logAdminAction } from "@/lib/audit";

// GET - current settings.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const settings = await getSettings();
  return NextResponse.json({ success: true, settings });
}

const pricingAxisSchema = z.object({
  step: z.number().int().min(1).max(10000),
  step_price: z.number().min(0).max(10000),
  min: z.number().int().min(0).max(100000),
  max: z.number().int().min(1).max(1000000),
  free_amount: z.number().int().min(0).max(1000000),
});

const schema = z.object({
  postulation_pricing: z
    .object({
      total: pricingAxisSchema,
      per_day: pricingAxisSchema,
    })
    .partial()
    .optional(),
  postulations: z
    .object({
      email_message: z.string().min(10).max(20000),
      email_subject: z.string().trim().min(1).max(200),
    })
    .partial()
    .optional(),
  dossier: z
    .object({
      creation_price: z.number().min(0).max(10000),
      add_price: z.number().min(0).max(10000),
    })
    .partial()
    .optional(),
  contact: z
    .object({
      whatsapp_url: z.string().url(),
    })
    .partial()
    .optional(),
});

// PUT - update settings (merge semantics).
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Données invalides" },
      { status: 400 }
    );
  }

  await connectDB();
  const settings = await getSettings();

  const update = parsed.data;
  if (update.postulation_pricing) {
    if (update.postulation_pricing.total) {
      Object.assign(settings.postulation_pricing.total, update.postulation_pricing.total);
    }
    if (update.postulation_pricing.per_day) {
      Object.assign(settings.postulation_pricing.per_day, update.postulation_pricing.per_day);
    }
  }
  if (update.postulations) {
    Object.assign(settings.postulations, update.postulations);
  }
  if (update.dossier) {
    Object.assign(settings.dossier, update.dossier);
  }
  if (update.contact) {
    Object.assign(settings.contact, update.contact);
  }
  await settings.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "settings.update",
    entity_type: "settings",
    details: `Paramètres mis à jour : ${Object.keys(update).join(", ")}`,
  });

  return NextResponse.json({ success: true, settings });
}
