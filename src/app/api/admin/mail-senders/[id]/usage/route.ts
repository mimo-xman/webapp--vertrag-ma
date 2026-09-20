import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { MailSender } from "@/models/MailSender";

// GET /api/admin/mail-senders/[id]/usage - per-day usage history.
// Groups the usage_log timestamps by UTC day, most recent first:
//   { success, data: { days: [{ date: "12/01/2026", iso: "2026-01-12",
//     count: 5, times: ["11:10:55", "11:22:45", ...] }], total } }
// Times are UTC (same reference the executor uses for daily limits).

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();

  const sender = await MailSender.findById(id)
    .select("name type usage_log usage_count success_count failed_count daily_limit")
    .lean();
  if (!sender) {
    return NextResponse.json({ success: false, error: "Service introuvable" }, { status: 404 });
  }

  const byDay = new Map<string, Date[]>();
  for (const at of sender.usage_log || []) {
    const d = new Date(at);
    const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const list = byDay.get(iso);
    if (list) list.push(d);
    else byDay.set(iso, [d]);
  }

  const days = Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // most recent first
    .map(([iso, times]) => ({
      iso,
      date: `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
      count: times.length,
      times: times
        .map((t) => t.toISOString().slice(11, 19)) // HH:MM:SS (UTC)
        .sort(),
    }));

  return NextResponse.json({
    success: true,
    data: {
      _id: String(sender._id),
      name: sender.name,
      type: sender.type,
      usage_count: sender.usage_count,
      success_count: sender.success_count,
      failed_count: sender.failed_count,
      daily_limit: sender.daily_limit || 0,
      days,
    },
  });
}
