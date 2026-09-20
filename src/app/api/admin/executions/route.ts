import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Execution } from "@/models/Execution";
import { Postulation } from "@/models/Postulation";
import { User } from "@/models/User";
import { Company } from "@/models/Company";

// GET /api/admin/executions - workflow execution registry.
//
// Modes (mutually exclusive query params):
//   ?date=YYYY-MM-DD   → paginated list of that day + counts (live polling)
//   ?id=<executionId>   → full detail incl. postulations with user/company names
//   ?postulation_id=.. → executions that processed this postulation (light)

function startOfDayUTC(dateStr: string): Date | null {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return d;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;

  // ── Detail mode: one execution with its postulations ──────────────────
  const id = params.get("id");
  if (id) {
    const execution = await Execution.findById(id).lean();
    if (!execution) {
      return NextResponse.json({ success: false, error: "Exécution introuvable" }, { status: 404 });
    }

    // Resolve user + company names for the embedded postulation entries
    // (bounded to the first 300 entries to keep the response light).
    const entries = (execution.postulations || []).slice(0, 300);
    const userIds = [...new Set(entries.map((e) => String(e.postulation_id)))];

    const postulations = await Postulation.find({ _id: { $in: userIds } })
      .populate("user_id", "full_name email")
      .populate("company_id", "name email")
      .lean();

    const byId = new Map(postulations.map((p) => [String(p._id), p]));

    return NextResponse.json({
      success: true,
      execution: {
        _id: String(execution._id),
        ref_number: execution.ref_number,
        trigger: execution.trigger,
        status: execution.status,
        mail_sender_name: execution.mail_sender_name,
        total: execution.total,
        success: execution.success,
        failed: execution.failed,
        fatal_error: execution.fatal_error,
        started_at: execution.started_at,
        finished_at: execution.finished_at,
        created_by: execution.created_by ? String(execution.created_by) : null,
        postulations: (execution.postulations || []).map((e) => ({
          postulation_id: String(e.postulation_id),
          status: e.status,
          error: e.error,
          executed_at: e.executed_at,
        })),
        postulations_details: entries.map((e) => {
          const p = byId.get(String(e.postulation_id));
          return {
            postulation_id: String(e.postulation_id),
            status: e.status,
            error: e.error,
            executed_at: e.executed_at,
            user: p?.user_id
              ? {
                  _id: String((p.user_id as { _id: unknown })._id),
                  full_name: (p.user_id as { full_name?: string }).full_name,
                  email: (p.user_id as { email?: string }).email,
                }
              : null,
            company: p?.company_id
              ? {
                  _id: String((p.company_id as { _id: unknown })._id),
                  name: (p.company_id as { name?: string }).name,
                  email: (p.company_id as { email?: string }).email,
                }
              : null,
          };
        }),
      },
    });
  }

  // ── Per-postulation mode: executions linked to one postulation ────────
  const postulationId = params.get("postulation_id");
  if (postulationId) {
    const executions = await Execution.find({
      "postulations.postulation_id": new mongoose.Types.ObjectId(postulationId),
    })
      .sort({ started_at: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      success: true,
      data: executions.map((e) => {
        const entry = (e.postulations || []).find(
          (p) => String(p.postulation_id) === postulationId
        );
        return {
          _id: String(e._id),
          ref_number: e.ref_number,
          trigger: e.trigger,
          status: e.status,
          mail_sender_name: e.mail_sender_name,
          started_at: e.started_at,
          finished_at: e.finished_at,
          outcome: entry ? { status: entry.status, error: entry.error } : null,
        };
      }),
    });
  }

  // ── List mode (optional date; NO date param = ALL executions) ─────────
  // The admin page picker starts at today but its X clears the date: an
  // absent/empty date then lists every execution, whatever the day.
  const dateStr = params.get("date") || "";
  const filter: Record<string, unknown> = {};
  if (dateStr) {
    const day = startOfDayUTC(dateStr);
    if (!day) {
      return NextResponse.json({ success: false, error: "Date invalide" }, { status: 400 });
    }
    const nextDay = new Date(day);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    filter.started_at = { $gte: day, $lt: nextDay };
  }

  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 20)));
  const triggerFilter = params.get("trigger");
  if (triggerFilter && triggerFilter !== "all") filter.trigger = triggerFilter;

  const [items, total, totals] = await Promise.all([
    Execution.find(filter)
      .sort({ started_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-postulations")
      .lean(),
    Execution.countDocuments(filter),
    Execution.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          executions: { $sum: 1 },
          sent: { $sum: "$success" },
          failed: { $sum: "$failed" },
        },
      },
    ]),
  ]);

  const agg = totals[0] || { executions: 0, sent: 0, failed: 0 };

  return NextResponse.json({
    success: true,
    date: dateStr,
    data: items.map((e) => ({
      _id: String(e._id),
      ref_number: e.ref_number,
      trigger: e.trigger,
      status: e.status,
      mail_sender_name: e.mail_sender_name,
      total: e.total,
      success: e.success,
      failed: e.failed,
      fatal_error: e.fatal_error,
      started_at: e.started_at,
      finished_at: e.finished_at,
    })),
    totals: {
      executions: agg.executions,
      sent: agg.sent,
      failed: agg.failed,
    },
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
