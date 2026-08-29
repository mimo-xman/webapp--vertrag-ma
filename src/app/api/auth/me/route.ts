import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireAuth } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, "me-get", 60, 60 * 1000);
  if (!rl.success) {
    return NextResponse.json({ success: false, error: "Trop de requêtes" }, { status: 429 });
  }

  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const user = await User.findById(auth.user._id)
    .select(
      "-password -email_verification_token -resetToken -delete_account_token -disable_2fa_token -two_factor_secret"
    )
    .lean();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    user: {
      ...user,
      _id: String(user._id),
      two_factor_enabled: user.two_factor_enabled,
      has_backup_codes: (user.two_factor_backup_codes || []).length > 0,
      two_factor_backup_codes: undefined,
    },
  });
}

const updateSchema = z.object({
  full_name: z.string().trim().min(3).max(80).optional(),
  date_of_birth: z.string().nullable().optional(),
});

export async function PUT(request: NextRequest) {
  const rl = rateLimit(request, "me-put", 30, 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: "Trop de requêtes" },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Données invalides" }, { status: 400 });
  }

  await connectDB();
  const update: Record<string, unknown> = {};
  if (parsed.data.full_name !== undefined) update.full_name = parsed.data.full_name;
  if (parsed.data.date_of_birth !== undefined) {
    update.date_of_birth = parsed.data.date_of_birth ? new Date(parsed.data.date_of_birth) : null;
  }

  const user = await User.findByIdAndUpdate(auth.user._id, update, { new: true })
    .select("_id email full_name date_of_birth role")
    .lean();

  return NextResponse.json({ success: true, user: { ...user, _id: String(user!._id) } });
}
