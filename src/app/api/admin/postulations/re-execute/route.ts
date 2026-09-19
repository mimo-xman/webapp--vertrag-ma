import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Postulation } from "@/models/Postulation";
import { logAdminAction } from "@/lib/audit";
import { hasActiveExecution, startExecutionWave } from "@/lib/postulation-executor";

// POST /api/admin/postulations/re-execute — "Lancer la relance".
// 1. Marks all failed postulations (echouee) as re_execute.
// 2. Runs them via the selected target:
//      github → dispatches the GitHub Actions workflow (async)
//      server → runs the execution wave directly on this backend
//               (Oracle Cloud VM), one parallel execution per mail sender.
// A freshness check prevents launching a second execution of the same
// target while one is still active (the atomic postulation claiming also
// guarantees no double sending even without this check).

const schema = z.object({
  target: z.enum(["github", "server"]).default("github"),
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
  const toRelaunch = await Postulation.countDocuments({ status: "echouee" });
  await Postulation.updateMany({ status: "echouee" }, { $set: { status: "re_execute" } });
  const pending = await Postulation.countDocuments({ status: "re_execute" });

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
      message: "Aucune postulation à relancer.",
    });
  }

  // 2a. Server backend: run the wave here, one execution per mail sender.
  if (target === "server") {
    const wave = await startExecutionWave({
      trigger: "server",
      statuses: ["re_execute"],
      dueTodayOnly: false, // relaunch ALL re_execute postulations, whatever their date
      adminId: auth.user._id,
    });

    // Don't await the whole wave — the executions page shows it live.
    wave.promise
      .then((summary) => {
        console.log(
          `[RE-EXECUTE] Vague serveur terminée : ${summary.sent} envoyée(s), ${summary.failed} échouée(s)` +
            (summary.fatal_error ? ` — ${summary.fatal_error}` : "")
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

  // 2b. GitHub workflow: dispatch via the GitHub API.
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
    action: "postulation.re_execute",
    entity_type: "postulation",
    details: `Relance GitHub déclenchée : ${toRelaunch} échouée(s) → re_execute, ${pending} en attente de relance. Workflow: ${workflow_triggered ? "lancé" : `non lancé (${workflow_error})`}`,
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
