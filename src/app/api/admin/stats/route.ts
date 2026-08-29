import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { User } from "@/models/User";
import { Company } from "@/models/Company";
import { Category } from "@/models/Category";
import { Postulation } from "@/models/Postulation";
import { PostulationDemande } from "@/models/PostulationDemande";
import { MailSender } from "@/models/MailSender";
import { AuditLog } from "@/models/AuditLog";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();

  const [
    usersCount,
    companiesCount,
    categoriesCount,
    postulationsByStatus,
    demandesByStatus,
    dossiersCount,
    mailSendersCount,
    recentAudit,
  ] = await Promise.all([
    User.countDocuments(),
    Company.countDocuments(),
    Category.countDocuments(),
    Postulation.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    PostulationDemande.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    User.countDocuments({ dossier_pdf_link: { $ne: null } }),
    MailSender.countDocuments(),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).lean(),
  ]);

  const pStatus: Record<string, number> = {};
  for (const e of postulationsByStatus) pStatus[e._id] = e.count;
  const dStatus: Record<string, number> = {};
  for (const e of demandesByStatus) dStatus[e._id] = e.count;

  return NextResponse.json({
    success: true,
    stats: {
      users: usersCount,
      companies: companiesCount,
      categories: categoriesCount,
      postulations: {
        total: Object.values(pStatus).reduce((a, b) => a + b, 0),
        en_attente: pStatus["en_attente"] || 0,
        envoyee: pStatus["envoyee"] || 0,
        echouee: pStatus["echouee"] || 0,
        re_execute: pStatus["re_execute"] || 0,
      },
      demandes: {
        total: Object.values(dStatus).reduce((a, b) => a + b, 0),
        en_attente: dStatus["en_attente"] || 0,
        payed: dStatus["payed"] || 0,
        canceled: dStatus["canceled"] || 0,
      },
      dossiers: dossiersCount,
      mail_senders: mailSendersCount,
    },
    recent_audit: recentAudit.map((a) => ({
      _id: String(a._id),
      admin_email: a.admin_email,
      action: a.action,
      entity_type: a.entity_type,
      createdAt: a.createdAt,
    })),
  });
}
