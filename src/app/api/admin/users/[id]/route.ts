import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { User } from "@/models/User";
import { Postulation } from "@/models/Postulation";
import { PostulationDemande } from "@/models/PostulationDemande";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { logAdminAction } from "@/lib/audit";

// DELETE /api/admin/users/[id] — cascade delete user + all their data.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();

  if (id === auth.user._id) {
    return NextResponse.json(
      { success: false, error: "Vous ne pouvez pas supprimer votre propre compte depuis ici." },
      { status: 400 }
    );
  }

  const user = await User.findById(id);
  if (!user) {
    return NextResponse.json({ success: false, error: "Utilisateur introuvable" }, { status: 404 });
  }

  await Promise.all([
    Postulation.deleteMany({ user_id: id }),
    PostulationDemande.deleteMany({ user_id: id }),
    DossierDemandeForAdd.deleteMany({ user_id: id }),
    DossierDemandeForCreate.deleteMany({ user_id: id }),
    User.findByIdAndDelete(id),
  ]);

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "user.delete",
    entity_type: "user",
    entity_id: id,
    details: `Utilisateur ${user.email} et toutes ses données supprimés`,
  });

  return NextResponse.json({ success: true });
}
