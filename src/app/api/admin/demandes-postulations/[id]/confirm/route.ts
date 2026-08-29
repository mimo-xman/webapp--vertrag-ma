import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { PostulationDemande } from "@/models/PostulationDemande";
import { logAdminAction } from "@/lib/audit";
import { createPostulationsForDemande } from "@/lib/postulation-utils";

// POST — confirm payment: status → payed, then automatically
// create all postulations with the demande's configuration.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();

  const demande = await PostulationDemande.findById(id);
  if (!demande) {
    return NextResponse.json({ success: false, error: "Demande introuvable" }, { status: 404 });
  }
  if (demande.status !== "en_attente") {
    return NextResponse.json(
      { success: false, error: "Cette demande n'est pas en attente (déjà traitée)." },
      { status: 400 }
    );
  }

  // Create the postulations BEFORE marking payed so a failure keeps it pending.
  try {
    const result = await createPostulationsForDemande({
      user_id: demande.user_id as mongoose.Types.ObjectId,
      demande_id: demande._id as mongoose.Types.ObjectId,
      categorie_ids: (demande.categorie_ids as mongoose.Types.ObjectId[]) || [],
      nmbr_total: demande.nmbr_total,
      nmbr_per_day: demande.nmbr_per_day,
    });

    demande.status = "payed";
    demande.confirmed_at = new Date();
    await demande.save();

    await logAdminAction({
      admin_id: auth.user._id,
      admin_email: auth.user.email,
      action: "demande_postulation.confirm",
      entity_type: "postulation_demande",
      entity_id: id,
      details: `Paiement confirmé (${demande.price} $) — ${result.created} postulations créées pour ${demande.ref_number}`,
    });

    return NextResponse.json({
      success: true,
      created: result.created,
      days: result.days,
      message: `${result.created} postulation(s) créée(s)`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la création des postulations",
      },
      { status: 400 }
    );
  }
}
