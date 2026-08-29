import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { getSettings, Setting } from "@/models/Setting";
import { logAdminAction } from "@/lib/audit";

// GET — current settings.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const settings = await getSettings();
  return NextResponse.json({ success: true, settings });
}

const schema = z.object({
  postulation_demandes: z
    .object({
      price_of_hundred_total: z.number().min(0).max(100),
      price_of_hundred_per_day: z.number().min(0).max(100),
      free_per_day_amount: z.number().int().min(0).max(10000),
      min_total: z.number().int().min(100).max(10000),
      min_per_day: z.number().int().min(100).max(10000),
      step_total: z.number().int().min(50).max(5000),
      step_per_day: z.number().int().min(25).max(5000),
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

// PUT — update settings (merge semantics).
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
  if (update.postulation_demandes) {
    Object.assign(settings.postulation_demandes, update.postulation_demandes);
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
