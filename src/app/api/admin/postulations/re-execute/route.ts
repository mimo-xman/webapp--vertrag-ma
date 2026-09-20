import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Postulation } from "@/models/Postulation";
import { logAdminAction } from "@/lib/audit";
import { hasActiveExecution, startExecutionWave } from "@/lib/postulation-executor";
import { parseDateParam, END_OF_DAY_MS } from "@/lib/api-filters";

// POST /api/admin/postulations/re-execute - "Lancer la relance".
// 1. Marks failed postulations (echouee) as re_execute - only those
//    scheduled today or in the past (scheduled_at <= end of today), or
//    within the optional admin-selected date interval [date_from, date_to]
//    (the picker caps every date at today: the future is never relaunched).
// 2. Runs them via the selected target:
//      github → dispatches the GitHub Actions workflow (async, with the
//               same date interval passed as workflow inputs)
//      server → runs the execution wave directly on this backend
//               (Oracle Cloud VM), one parallel execution per mail sender.
// A freshness check prevents launching a second execution of the same
// target while one is still active (the atomic postulation claiming also
// guarantees no double sending even without this check).

const schema = z.object({
  target: z.enum(["github", "server"]).default("github"),
  // Optional relaunch interval (YYYY-MM-DD, both <= today by construction
  // of the picker). date_from must be <= date_to.
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Cible ou dates invalides" }, { status: 400 });
  }
  const { target, date_from, date_to } = parsed.data;

  // Interval validation: start must be <= end (also enforced client-side,
  // but the API never trusts the client).
  const from = parseDateParam(date_from, 0);
  const to = parseDateParam(date_to, END_OF_DAY_MS);
  if (from && to && from.getTime() > to.getTime()) {
    return NextResponse.json(
      { success: false, error: "La date de début doit être antérieure ou égale à la date de fin." },
      { status: 400 }
    );
  }

  await connectDB();

  // 0. Guard: refuse to launch twice in parallel for the same target.
  if (await hasActiveExecution(target)) {
    return NextResponse.json(
      {
        success: false,
        error:
          target === "github"
            ? "Une exécution GitHub est déjà en cours. Attendez sa fin avant d'en lancer une autre."
            : "Une exécution serveur est déjà en cours. Attendez sa fin avant d'en lancer une autre.",
        code: "EXECUTION_ALREADY_RUNNING",
      },
      { status: 409 }
    );
  }

  // 1. Move failed → re_execute (team has analyzed and fixed the issue).
  //    Scheduling window: explicit interval, or "today or overdue" by default.
  const windowFilter: Record<string, unknown> = { status: "echouee" };
  if (from || to) {
    windowFilter.scheduled_at = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  } else {
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);
    windowFilter.scheduled_at = { $lte: endOfToday };
  }

  const toRelaunch = await Postulation.countDocuments(windowFilter);
  await Postulation.updateMany(windowFilter, { $set: { status: "re_execute" } });

  // Pending = everything re_execute within the SAME window.
  const pendingFilter: Record<string, unknown> = { status: "re_execute" };
  pendingFilter.scheduled_at = windowFilter.scheduled_at;
  const pending = await Postulation.countDocuments(pendingFilter);

  if (pending === 0) {
    return NextResponse.json({
      success: true,
      moved_to_re_execute: toRelaunch,
      total_to_re_execute: 0,
      target,
      executions_created: 0,
      execution_ids: [],
      workflow_triggered: false,
      workflow_error: null,
      message: "Aucune postulation à relancer (seules les postulations programmées aujourd'hui ou passées sont concernées).",
    });
  }

  // 2a. Server backend: run the wave here, one execution per mail sender.
  if (target === "server") {
    const wave = await startExecutionWave({
      trigger: "server",
      statuses: ["re_execute"],
      scheduledFrom: from ?? undefined,
      scheduledTo: to ?? undefined,
      dueTodayOnly: !from && !to, // default window: today or overdue only
      adminId: auth.user._id,
    });

    // Don't await the whole wave - the executions page shows it live.
    wave.promise
      .then((summary) => {
        console.log(
          `[RE-EXECUTE] Vague serveur terminée : ${summary.sent} envoyée(s), ${summary.failed} échouée(s)` +
            (summary.senders_limited.length > 0
              ? ` · limite quotidienne : ${summary.senders_limited.join(", ")}`
              : "") +
            (summary.fatal_error ? ` · ${summary.fatal_error}` : "")
        );
      })
      .catch(() => {});

    await logAdminAction({
      admin_id: auth.user._id,
      admin_email: auth.user.email,
      action: "postulation.re_execute",
      entity_type: "postulation",
      details: `Relance serveur déclenchée : ${toRelaunch} échouée(s) → re_execute, ${pending} à relancer, ${wave.execution_ids.length} exécution(s) créée(s)${wave.execution_ids.length === 0 ? " (aucun mail sender disponible)" : ""}`,
    });

    return NextResponse.json({
      success: true,
      moved_to_re_execute: toRelaunch,
      total_to_re_execute: pending,
      target: "server",
      executions_created: wave.execution_ids.length,
      execution_ids: wave.execution_ids,
      workflow_triggered: wave.execution_ids.length > 0,
      workflow_error:
        wave.execution_ids.length === 0 ? "Aucun mail sender actif disponible" : null,
    });
  }

  // 2b. GitHub workflow: dispatch via the GitHub API, passing the interval
  //      as workflow inputs so the worker relaunches the same window.
  const token = process.env.GITHUB_WORKFLOW_TOKEN;
  const repo = process.env.GITHUB_WORKFLOW_REPO || "mimo-xman/webapp--vertrag-ma";

  let workflow_triggered = false;
  let workflow_error: string | null = null;

  if (token) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/re-execute-postulations.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              ...(date_from ? { date_from } : {}),
              ...(date_to ? { date_to } : {}),
            },
          }),
        }
      );
      workflow_triggered = response.ok;
      if (!response.ok) {
        workflow_error = `GitHub API ${response.status}`;
      }
    } catch (e) {
      workflow_error = e instanceof Error ? e.message : "Erreur réseau GitHub";
    }
  } else {
    workflow_error = "GITHUB_WORKFLOW_TOKEN non configuré";
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "postulation.re_execute",
    entity_type: "postulation",
    details: `Relance GitHub déclenchée : ${toRelaunch} échouée(s) → re_execute, ${pending} en attente de relance${from ? ` (du ${date_from}` : ""}${to ? ` au ${date_to})` : from ? ")" : ""}. Workflow: ${workflow_triggered ? "lancé" : `non lancé (${workflow_error})`}`,
  });

  return NextResponse.json({
    success: true,
    moved_to_re_execute: toRelaunch,
    total_to_re_execute: pending,
    target: "github",
    executions_created: 0,
    execution_ids: [],
    workflow_triggered,
    workflow_error,
  });
}
