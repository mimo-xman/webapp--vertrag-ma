import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Postulation } from "@/models/Postulation";
import { logAdminAction } from "@/lib/audit";
import { hasActiveExecution, startExecutionWave } from "@/lib/postulation-executor";

// POST /api/admin/postulations/execute-pending - "Lancer l'exécution".
// Manual launch of the DAILY wave (same process as the 06:00 UTC GitHub
// workflow): processes postulations with status en_attente or re_execute
// scheduled TODAY or overdue - never future ones.
//   server → runs the wave directly on this backend (one parallel
//            execution per available mail sender)
//   github → dispatches the daily send-postulations workflow

const schema = z.object({
  target: z.enum(["github", "server"]).default("server"),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Cible invalide" }, { status: 400 });
  }
  const target = parsed.data.target;

  await connectDB();

  // Guard: refuse to launch twice in parallel for the same target.
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

  // Only today's + overdue postulations - identical window to the daily workflow.
  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);
  const pending = await Postulation.countDocuments({
    status: { $in: ["en_attente", "re_execute"] },
    scheduled_at: { $lte: endOfToday },
  });

  if (pending === 0) {
    return NextResponse.json({
      success: true,
      pending: 0,
      target,
      executions_created: 0,
      execution_ids: [],
      workflow_triggered: false,
      workflow_error: null,
      message: "Aucune postulation à exécuter aujourd'hui.",
    });
  }

  // Server backend: run the wave here, one execution per mail sender.
  if (target === "server") {
    const wave = await startExecutionWave({
      trigger: "server",
      statuses: ["en_attente", "re_execute"],
      dueTodayOnly: true,
      adminId: auth.user._id,
    });

    wave.promise
      .then((summary) => {
        console.log(
          `[EXECUTE-PENDING] Vague serveur terminée : ${summary.sent} envoyée(s), ${summary.failed} échouée(s)` +
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
      action: "postulation.execute_pending",
      entity_type: "postulation",
      details: `Exécution manuelle des postulations en attente (serveur) : ${pending} à traiter, ${wave.execution_ids.length} exécution(s) créée(s)${wave.execution_ids.length === 0 ? " (aucun mail sender disponible)" : ""}`,
    });

    return NextResponse.json({
      success: true,
      pending,
      target: "server",
      executions_created: wave.execution_ids.length,
      execution_ids: wave.execution_ids,
      workflow_triggered: wave.execution_ids.length > 0,
      workflow_error:
        wave.execution_ids.length === 0 ? "Aucun mail sender actif disponible" : null,
    });
  }

  // GitHub workflow: dispatch the daily send-postulations workflow.
  const token = process.env.GITHUB_WORKFLOW_TOKEN;
  const repo = process.env.GITHUB_WORKFLOW_REPO || "mimo-xman/webapp--vertrag-ma";

  let workflow_triggered = false;
  let workflow_error: string | null = null;

  if (token) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/send-postulations.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({ ref: "main" }),
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
    action: "postulation.execute_pending",
    entity_type: "postulation",
    details: `Exécution manuelle des postulations en attente (GitHub) : ${pending} à traiter. Workflow: ${workflow_triggered ? "lancé" : `non lancé (${workflow_error})`}`,
  });

  return NextResponse.json({
    success: true,
    pending,
    target: "github",
    executions_created: 0,
    execution_ids: [],
    workflow_triggered,
    workflow_error,
  });
}
