import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Company } from "@/models/Company";
import { Postulation } from "@/models/Postulation";
import { PostulationDemande } from "@/models/PostulationDemande";
import { logAdminAction } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  categorie_ids: z.array(z.string()).default([]),
});

const toggleSchema = z.object({ active: z.boolean() });

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
    { returnDocument: "after" }
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

// PATCH - activate / deactivate a company.
// A deactivated company is excluded from NEW demande targeting (counts,
// selection, snapshot) but keeps receiving its already-scheduled postulations.
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
  const company = await Company.findByIdAndUpdate(
    id,
    { active: parsed.data.active },
    { new: true }
  );
  if (!company) {
    return NextResponse.json({ success: false, error: "Entreprise introuvable" }, { status: 404 });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "company.toggle",
    entity_type: "company",
    entity_id: id,
    details: `Entreprise « ${company.name} » (${company.email}) ${
      parsed.data.active ? "activée" : "désactivée"
    }`,
  });

  return NextResponse.json({ success: true, active: company.active });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();

  // Data-integrity guard: never delete a company that is used by postulations
  // (sent or scheduled) or reserved by a pending demande - the historical
  // links would break (postulations would lose their company). Deactivate it
  // instead: data and history are preserved, and it stops being targeted by
  // new demandes.
  const [postulationsCount, pendingDemandesCount] = await Promise.all([
    Postulation.countDocuments({ company_id: id }),
    PostulationDemande.countDocuments({ company_ids: id, status: "en_attente" }),
  ]);
  if (postulationsCount > 0 || pendingDemandesCount > 0) {
    const reasons: string[] = [];
    if (postulationsCount > 0) {
      reasons.push(`utilisée dans ${postulationsCount} postulation(s)`);
    }
    if (pendingDemandesCount > 0) {
      reasons.push(`réservée par ${pendingDemandesCount} demande(s) de postulation en attente`);
    }
    return NextResponse.json(
      {
        success: false,
        error: `Impossible de supprimer cette entreprise : elle est ${reasons.join(" et ")}. Désactivez-la plutôt : l'historique est préservé et elle ne sera plus ciblée par les nouvelles demandes.`,
      },
      { status: 400 }
    );
  }

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
