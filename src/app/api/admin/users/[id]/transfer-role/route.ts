import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { User } from "@/models/User";
import { logAdminAction } from "@/lib/audit";
import { sendEmailBrevo } from "@/lib/email";

const schema = z.object({ role: z.enum(["user", "admin"]) });

// POST - transfer user <-> admin.
//   user → admin : applied immediately after the standard confirmation popup.
//   admin → user : NEVER applied directly. An approval email is sent to the
//                  creator's address (CREATOR_EMAIL in .env), who alone can
//                  decide such a demotion. When CREATOR_EMAIL is not
//                  configured, the action is explicitly refused.
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

  const user = await User.findById(id).select("full_name email role active suspended createdAt");
  if (!user) {
    return NextResponse.json({ success: false, error: "Utilisateur introuvable" }, { status: 404 });
  }

  // Demoting an admin → creator approval required.
  if (parsed.data.role === "user" && user.role === "admin") {
    const creatorEmail = process.env.CREATOR_EMAIL;
    if (!creatorEmail) {
      await logAdminAction({
        admin_id: auth.user._id,
        admin_email: auth.user.email,
        action: "user.transfer_role_refused",
        entity_type: "user",
        entity_id: id,
        details: `Rétrogradation de ${user.email} refusée : CREATOR_EMAIL non configuré`,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "Cette action ne peut pas être effectuée : l'adresse email du créateur n'est pas configurée (CREATOR_EMAIL). Seul le créateur peut décider d'un passage d'admin vers user.",
          code: "CREATOR_EMAIL_MISSING",
        },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    try {
      await sendEmailBrevo({
        to: creatorEmail,
        subject: "Vertrag.ma · Demande de rétrogradation d'un admin",
        htmlContent: `
          <p>Bonjour,</p>
          <p>L'administrateur <b>${auth.user.full_name}</b> (${auth.user.email}) demande le passage du rôle <b>admin</b> au rôle <b>user</b> pour :</p>
          <p><b>${user.full_name}</b> (${user.email})</p>
          <p>Seul vous, créateur de la plateforme, pouvez décider de cette modification. Après vérification, appliquez-la depuis l'administration : ${appUrl}/admin/users</p>
          <p style="color:#71757c;font-size:12px;">Demande enregistrée le ${new Date().toLocaleString("fr-FR")}.</p>
        `,
      });
    } catch (e) {
      console.error("[TRANSFER-ROLE] Approval email failed:", e);
      return NextResponse.json(
        {
          success: false,
          error:
            "L'email au créateur n'a pas pu être envoyé. Vérifiez la configuration du service email, puis réessayez.",
        },
        { status: 502 }
      );
    }

    await logAdminAction({
      admin_id: auth.user._id,
      admin_email: auth.user.email,
      action: "user.transfer_role_request",
      entity_type: "user",
      entity_id: id,
      details: `Demande de rétrogradation de ${user.email} (admin → user) envoyée au créateur (${creatorEmail})`,
    });

    return NextResponse.json({
      success: true,
      approval_required: true,
      message: `La demande a été envoyée au créateur (${creatorEmail}). Le rôle ne sera modifié qu'après sa décision.`,
    });
  }

  // Promoting (user → admin): applied directly.
  const updated = await User.findByIdAndUpdate(id, { role: parsed.data.role }, { returnDocument: "after" });
  if (!updated) {
    return NextResponse.json({ success: false, error: "Utilisateur introuvable" }, { status: 404 });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "user.transfer_role",
    entity_type: "user",
    entity_id: id,
    details: `Rôle de ${updated.email} changé vers « ${parsed.data.role} »`,
  });

  return NextResponse.json({ success: true, role: updated.role });
}
