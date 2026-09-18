import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { User } from "@/models/User";

// GET — all creation demandes with user info.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 10)));
  const status = params.get("status");
  const search = params.get("search")?.trim();
  const sortField = params.get("sort") || "createdAt";
  const sortOrder = params.get("order") === "asc" ? 1 : -1;

  const filter: Record<string, unknown> = {};
  if (status && status !== "all") filter.status = status;
  if (search) {
    const users = await User.find({
      $or: [
        { full_name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    })
      .select("_id")
      .lean();
    filter.user_id = { $in: users.map((u) => u._id) };
  }

  const allowedSorts = ["createdAt", "status", "price", "payed_at", "completed_at"];
  const sort: Record<string, 1 | -1> = {
    [allowedSorts.includes(sortField) ? sortField : "createdAt"]: sortOrder,
  };

  const [items, total] = await Promise.all([
    DossierDemandeForCreate.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user_id", "full_name email")
      .lean(),
    DossierDemandeForCreate.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map((d) => ({
      _id: String(d._id),
      ref_number: d.ref_number,
      price: d.price,
      traduction_price: d.traduction_price,
      status: d.status,
      cancelled_by: d.cancelled_by,
      cancelled_at: d.cancelled_at,
      cancel_message: d.cancel_message,
      payed_at: d.payed_at,
      dossier_ready_at: d.dossier_ready_at,
      completed_at: d.completed_at,
      dossier_pdf_link: d.dossier_pdf_link,
      createdAt: d.createdAt,
      user: d.user_id
        ? {
            _id: String((d.user_id as { _id: unknown })._id),
            full_name: (d.user_id as { full_name?: string }).full_name,
            email: (d.user_id as { email?: string }).email,
          }
        : null,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
