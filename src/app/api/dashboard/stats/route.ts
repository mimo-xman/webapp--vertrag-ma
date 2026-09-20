import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { Postulation } from "@/models/Postulation";
import { PostulationDemande } from "@/models/PostulationDemande";
import { User } from "@/models/User";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const userId = new mongoose.Types.ObjectId(auth.user._id);

  const [
    postulationsByStatus,
    demandesByStatus,
    upcoming,
    user,
    activeAddDemande,
    activeCreateDemande,
    lastAddDemande,
    lastCreateDemande,
    totalAddDemandes,
    totalCreateDemandes,
  ] = await Promise.all([
    Postulation.aggregate<{ _id: string; count: number }>([
      { $match: { user_id: userId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    PostulationDemande.aggregate<{ _id: string; count: number }>([
      { $match: { user_id: userId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Postulation.find({
      user_id: userId,
      status: "en_attente",
      scheduled_at: { $gte: new Date() },
    })
      .sort({ scheduled_at: 1 })
      .limit(10)
      .populate("company_id", "name")
      .lean(),
    User.findById(userId).select("dossier_pdf_link").lean(),
    DossierDemandeForAdd.findOne({ user_id: userId, active: true }).lean(),
    DossierDemandeForCreate.findOne({ user_id: userId, active: true }).lean(),
    DossierDemandeForAdd.findOne({ user_id: userId }).sort({ createdAt: -1 }).lean(),
    DossierDemandeForCreate.findOne({ user_id: userId }).sort({ createdAt: -1 }).lean(),
    DossierDemandeForAdd.countDocuments({ user_id: userId }),
    DossierDemandeForCreate.countDocuments({ user_id: userId }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const entry of postulationsByStatus) statusMap[entry._id] = entry.count;

  const demandesMap: Record<string, number> = {};
  for (const entry of demandesByStatus) demandesMap[entry._id] = entry.count;

  // The single active demande (at most one by design: creation XOR add).
  const activeDemande = activeCreateDemande
    ? {
        type: "creation" as const,
        ref_number: activeCreateDemande.ref_number,
        status: activeCreateDemande.status,
        cancelled_by: activeCreateDemande.cancelled_by,
        price: activeCreateDemande.price,
        traduction_price: activeCreateDemande.traduction_price || 0,
        payed_at: activeCreateDemande.payed_at,
        created_at: activeCreateDemande.createdAt,
      }
    : activeAddDemande
      ? {
          type: "ajout" as const,
          ref_number: activeAddDemande.ref_number,
          status: activeAddDemande.status,
          cancelled_by: activeAddDemande.cancelled_by,
          price: activeAddDemande.price,
          traduction_price: 0,
          created_at: activeAddDemande.createdAt,
        }
      : null;

  // The most recent demande of either type (for the dashboard summary).
  const lastDemande =
    lastCreateDemande && (!lastAddDemande ||
      new Date(lastCreateDemande.createdAt) >= new Date(lastAddDemande.createdAt))
      ? {
          type: "creation" as const,
          ref_number: lastCreateDemande.ref_number,
          status: lastCreateDemande.status,
          cancelled_by: lastCreateDemande.cancelled_by,
          price: lastCreateDemande.price,
          traduction_price: lastCreateDemande.traduction_price || 0,
          payed_at: lastCreateDemande.payed_at,
          created_at: lastCreateDemande.createdAt,
        }
      : lastAddDemande
        ? {
            type: "ajout" as const,
            ref_number: lastAddDemande.ref_number,
            status: lastAddDemande.status,
            cancelled_by: lastAddDemande.cancelled_by,
            price: lastAddDemande.price,
            traduction_price: 0,
            created_at: lastAddDemande.createdAt,
          }
        : null;

  return NextResponse.json({
    success: true,
    stats: {
      postulations: {
        total: Object.values(statusMap).reduce((a, b) => a + b, 0),
        envoyee: statusMap["envoyee"] || 0,
        en_attente: statusMap["en_attente"] || 0,
        echouee: statusMap["echouee"] || 0,
        re_execute: statusMap["re_execute"] || 0,
      },
      demandes: {
        total: Object.values(demandesMap).reduce((a, b) => a + b, 0),
        en_attente: demandesMap["en_attente"] || 0,
        payed: demandesMap["payed"] || 0,
        canceled: demandesMap["canceled"] || 0,
      },
      dossier: {
        has_dossier: Boolean(user?.dossier_pdf_link),
        dossier_pdf_link: user?.dossier_pdf_link || null,
        active_demande: activeDemande,
        last_demande: lastDemande,
        total_add_demandes: totalAddDemandes,
        total_create_demandes: totalCreateDemandes,
      },
    },
    upcoming: upcoming.map((p) => ({
      _id: String(p._id),
      scheduled_at: p.scheduled_at,
      company_name: (p.company_id as { name?: string })?.name || "-",
    })),
  });
}
