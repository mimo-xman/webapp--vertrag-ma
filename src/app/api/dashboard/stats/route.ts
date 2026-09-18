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
    pendingAddDemande,
    pendingCreateDemande,
    allAddDemandes,
    allCreateDemandes,
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
    DossierDemandeForAdd.findOne({ user_id: userId, status: "en_attente" }).lean(),
    DossierDemandeForCreate.findOne({
      user_id: userId,
      status: { $in: ["en_attente", "payed"] },
    }).lean(),
    DossierDemandeForAdd.find({ user_id: userId }).lean(),
    DossierDemandeForCreate.find({ user_id: userId }).lean(),
  ]);

  const statusMap: Record<string, number> = {};
  for (const entry of postulationsByStatus) statusMap[entry._id] = entry.count;

  const demandesMap: Record<string, number> = {};
  for (const entry of demandesByStatus) demandesMap[entry._id] = entry.count;

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
        pending_add_demande: Boolean(pendingAddDemande),
        pending_create_demande: pendingCreateDemande
          ? {
              status: pendingCreateDemande.status,
              ref_number: pendingCreateDemande.ref_number,
            }
          : null,
        total_add_demandes: allAddDemandes.length,
        total_create_demandes: allCreateDemandes.length,
      },
    },
    upcoming: upcoming.map((p) => ({
      _id: String(p._id),
      scheduled_at: p.scheduled_at,
      company_name: (p.company_id as { name?: string })?.name || "—",
    })),
  });
}
