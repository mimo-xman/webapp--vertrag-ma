import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { getAuthUserFromRequest } from "@/lib/auth";
import { SupportMessage, SUPPORT_REASONS } from "@/models/SupportMessage";
import { createWithUniqueRef } from "@/lib/ref-number";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// POST /api/contact — public support form submission.
// Each message gets a unique reference id (VT-S-…) the user can quote.
const schema = z.object({
  full_name: z.string().trim().min(3).max(80),
  email: z.string().trim().email().max(200),
  reason: z.enum(SUPPORT_REASONS),
  message: z.string().trim().min(10).max(5000),
});

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "contact", 5, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: "Trop de messages envoyés. Réessayez dans une heure." },
      { status: 429, headers: rateLimitHeaders(rl, 5) }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Formulaire invalide" },
      { status: 400 }
    );
  }

  await connectDB();

  // Best-effort user link (works even for suspended accounts).
  const authUser = await getAuthUserFromRequest(request).catch(() => null);

  const message = await createWithUniqueRef(
    (ref) =>
      SupportMessage.create({
        ref_id: ref,
        user_id: authUser?._id ?? null,
        full_name: parsed.data.full_name,
        email: parsed.data.email.toLowerCase(),
        reason: parsed.data.reason,
        message: parsed.data.message,
        status: "active",
      }),
    "S"
  );

  return NextResponse.json({ success: true, ref_id: message.ref_id });
}
