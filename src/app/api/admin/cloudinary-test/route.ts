import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { testCloudinaryPdfDelivery } from "@/lib/cloudinary";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// POST /api/admin/cloudinary-test - self-diagnostic of the PDF hosting:
// uploads a tiny test PDF to Cloudinary, verifies that its delivery link is
// publicly reachable, then destroys the test asset.
// Detects: missing configuration / account-level PDF delivery block
// (with the exact console steps to fix it) / any other error.
export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "cloudinary-test", 3, 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: "Trop de tests. Réessayez dans une minute." },
      { status: 429, headers: rateLimitHeaders(rl, 3) }
    );
  }

  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const result = await testCloudinaryPdfDelivery();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("[CLOUDINARY-TEST]", error);
    return NextResponse.json(
      {
        success: false,
        result: {
          status: "error",
          message: error instanceof Error ? error.message : "Erreur inconnue lors du test.",
        },
      },
      { status: 500 }
    );
  }
}
