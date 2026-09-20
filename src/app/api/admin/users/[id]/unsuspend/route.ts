import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { User } from "@/models/User";
import { logAdminAction } from "@/lib/audit";

// POST /api/admin/users/[id]/unsuspend - re-activate a suspended account.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();

  if (id === auth.user._id) {
    return NextResponse.json({ success: false, error: "Action impossible sur votre propre compte." }, { status: 400 });
  }

  const user = await User.findById(id);
  if (!user) {
    return NextResponse.json({ success: false, error: "Utilisateur introuvable" }, { status: 404 });
  }
  if (!user.suspended) {
    return NextResponse.json({ success: false, error: "Ce compte n'est pas suspendu." }, { status: 400 });
  }

  user.suspended = false;
  user.suspended_at = null;
  user.suspended_reason = null;
  await user.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "user.unsuspend",
    entity_type: "user",
    entity_id: id,
    details: `Compte ${user.email} ré-activé (suspension levée)`,
  });

  return NextResponse.json({ success: true });
}
