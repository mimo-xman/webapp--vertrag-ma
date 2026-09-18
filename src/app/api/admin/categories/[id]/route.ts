import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Category } from "@/models/Category";
import { Company } from "@/models/Company";
import { logAdminAction } from "@/lib/audit";

const updateSchema = z.object({ name: z.string().trim().min(2).max(60) });

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
    return NextResponse.json({ success: false, error: "Nom invalide" }, { status: 400 });
  }

  await connectDB();
  const category = await Category.findByIdAndUpdate(id, { name: parsed.data.name }, { returnDocument: "after" });
  if (!category) {
    return NextResponse.json({ success: false, error: "Catégorie introuvable" }, { status: 404 });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "category.update",
    entity_type: "category",
    entity_id: id,
    details: `Catégorie renommée en « ${category.name} »`,
  });

  return NextResponse.json({ success: true, data: { _id: String(category._id), name: category.name } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();

  const category = await Category.findById(id);
  if (!category) {
    return NextResponse.json({ success: false, error: "Catégorie introuvable" }, { status: 404 });
  }

  // Companies are NOT deleted: they simply lose this category.
  const affected = await Company.countDocuments({ categorie_ids: id });
  await Company.updateMany({ categorie_ids: id }, { $pull: { categorie_ids: id } });
  await Category.findByIdAndDelete(id);

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "category.delete",
    entity_type: "category",
    entity_id: id,
    details: `Catégorie « ${category.name} » supprimée (${affected} entreprise(s) détachée(s))`,
  });

  return NextResponse.json({ success: true, affected_companies: affected });
}
