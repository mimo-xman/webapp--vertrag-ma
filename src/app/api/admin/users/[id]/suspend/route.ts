import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { User } from "@/models/User";
import { logAdminAction } from "@/lib/audit";

// POST /api/admin/users/[id]/suspend — suspend a user account.
// Suspended users can still log in but only see the /suspended page and
// can contact the support. Rules: admins cannot be suspended, and no
// self-suspension (the current admin is already excluded from the list).
const schema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Données invalides" }, { status: 400 });
  }

  await connectDB();

  if (id === auth.user._id) {
    return NextResponse.json(
      { success: false, error: "Vous ne pouvez pas suspendre votre propre compte." },
      { status: 400 }
    );
  }

  const user = await User.findById(id);
  if (!user) {
    return NextResponse.json({ success: false, error: "Utilisateur introuvable" }, { status: 404 });
  }
  if (user.role === "admin") {
    return NextResponse.json(
      { success: false, error: "Un compte administrateur ne peut pas être suspendu." },
      { status: 400 }
    );
  }
  if (user.suspended) {
    return NextResponse.json({ success: false, error: "Ce compte est déjà suspendu." }, { status: 400 });
  }

  user.suspended = true;
  user.suspended_at = new Date();
  user.suspended_reason = parsed.data.reason || null;
  await user.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "user.suspend",
    entity_type: "user",
    entity_id: id,
    details: `Compte ${user.email} suspendu${parsed.data.reason ? ` — motif : ${parsed.data.reason}` : ""}`,
  });

  return NextResponse.json({ success: true });
}
