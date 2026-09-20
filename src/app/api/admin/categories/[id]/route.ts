import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Category } from "@/models/Category";
import { Company } from "@/models/Company";
import { logAdminAction } from "@/lib/audit";

const updateSchema = z.object({ name: z.string().trim().min(2).max(60) });
const toggleSchema = z.object({ active: z.boolean() });

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

// PATCH - activate / deactivate a category.
// A deactivated category is hidden from the user's category selector, and
// its companies are excluded from NEW demande targeting (selection, counts
// and snapshot). Already-scheduled postulations keep their course.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Données invalides" }, { status: 400 });
  }

  await connectDB();
  const category = await Category.findByIdAndUpdate(
    id,
    { active: parsed.data.active },
    { new: true }
  );
  if (!category) {
    return NextResponse.json({ success: false, error: "Catégorie introuvable" }, { status: 404 });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "category.toggle",
    entity_type: "category",
    entity_id: id,
    details: `Catégorie « ${category.name} » ${parsed.data.active ? "activée" : "désactivée"}`,
  });

  return NextResponse.json({ success: true, active: category.active });
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

  // Data-integrity guard: a category containing companies must not be
  // deleted - its companies would lose their classification. Deactivate it
  // instead (its companies stop being targeted by new demandes) or move the
  // companies elsewhere first.
  const companiesCount = await Company.countDocuments({ categorie_ids: id });
  if (companiesCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Impossible de supprimer cette catégorie : elle contient ${companiesCount} entreprise(s). Déplacez ou supprimez d'abord ses entreprises : ou désactivez simplement la catégorie (elle ne sera plus proposée aux utilisateurs).`,
      },
      { status: 400 }
    );
  }

  await Category.findByIdAndDelete(id);

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "category.delete",
    entity_type: "category",
    entity_id: id,
    details: `Catégorie « ${category.name} » supprimée (vide)`,
  });

  return NextResponse.json({ success: true, affected_companies: 0 });
}
