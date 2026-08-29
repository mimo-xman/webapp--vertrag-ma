import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Postulation } from "@/models/Postulation";
import { logAdminAction } from "@/lib/audit";

// POST /api/admin/postulations/re-execute
// Marks all failed postulations as re_execute AND triggers the
// manual GitHub Actions workflow via the GitHub REST API.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();

  // Move failed → re_execute (team has analyzed and fixed the issue).
  const toRelaunch = await Postulation.countDocuments({ status: "echouee" });
  await Postulation.updateMany({ status: "echouee" }, { $set: { status: "re_execute" } });
  const pending = await Postulation.countDocuments({ status: "re_execute" });

  // Trigger the workflow via GitHub API (if configured).
  const token = process.env.GITHUB_WORKFLOW_TOKEN;
  const repo = process.env.GITHUB_WORKFLOW_REPO || "za-zo/webapp--vertrag.ma";

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
    details: `Relance déclenchée : ${toRelaunch} échouée(s) → re_execute, ${pending} en attente de relance. Workflow: ${workflow_triggered ? "lancé" : `non lancé (${workflow_error})`}`,
  });

  return NextResponse.json({
    success: true,
    moved_to_re_execute: toRelaunch,
    total_to_re_execute: pending,
    workflow_triggered,
    workflow_error,
  });
}
