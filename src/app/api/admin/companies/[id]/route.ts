import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Company } from "@/models/Company";
import { logAdminAction } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  categorie_ids: z.array(z.string()).default([]),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();
  const company = await Company.findById(id).populate("categorie_ids", "name").lean();
  if (!company) {
    return NextResponse.json({ success: false, error: "Entreprise introuvable" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: company });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Données invalides" }, { status: 400 });
  }

  await connectDB();
  const duplicate = await Company.findOne({
    email: parsed.data.email.toLowerCase(),
    _id: { $ne: id },
  });
  if (duplicate) {
    return NextResponse.json(
      { success: false, error: "Une autre entreprise utilise déjà cet email" },
      { status: 400 }
    );
  }

  const company = await Company.findByIdAndUpdate(
    id,
    {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      categorie_ids: parsed.data.categorie_ids,
    },
    { new: true }
  );
  if (!company) {
    return NextResponse.json({ success: false, error: "Entreprise introuvable" }, { status: 404 });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "company.update",
    entity_type: "company",
    entity_id: id,
    details: `Entreprise « ${company.name} » modifiée`,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();
  const company = await Company.findByIdAndDelete(id);
  if (!company) {
    return NextResponse.json({ success: false, error: "Entreprise introuvable" }, { status: 404 });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "company.delete",
    entity_type: "company",
    entity_id: id,
    details: `Entreprise « ${company.name} » (${company.email}) supprimée`,
  });

  return NextResponse.json({ success: true });
}
