import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { User } from "@/models/User";
import { logAdminAction } from "@/lib/audit";

const schema = z.object({ role: z.enum(["user", "admin"]) });

// POST — transfer user <-> admin.
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
    return NextResponse.json({ success: false, error: "Rôle invalide" }, { status: 400 });
  }

  await connectDB();
  if (id === auth.user._id) {
    return NextResponse.json(
      { success: false, error: "Vous ne pouvez pas modifier votre propre rôle." },
      { status: 400 }
    );
  }

  const user = await User.findByIdAndUpdate(id, { role: parsed.data.role }, { returnDocument: "after" });
  if (!user) {
    return NextResponse.json({ success: false, error: "Utilisateur introuvable" }, { status: 404 });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "user.transfer_role",
    entity_type: "user",
    entity_id: id,
    details: `Rôle de ${user.email} changé vers « ${parsed.data.role} »`,
  });

  return NextResponse.json({ success: true, role: user.role });
}
