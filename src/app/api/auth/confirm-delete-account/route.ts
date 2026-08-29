import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Postulation } from "@/models/Postulation";
import { PostulationDemande } from "@/models/PostulationDemande";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { createLogoutResponse } from "@/lib/auth";

// Deliberately POST (not GET): email scanners auto-prefetch GET links.
const schema = z.object({ token: z.string().min(10) });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Token invalide" }, { status: 400 });
    }

    await connectDB();
    const candidates = await User.find({
      delete_account_token: { $ne: null },
      delete_account_expires: { $gt: new Date() },
    });

    let target: typeof candidates[number] | null = null;
    for (const candidate of candidates) {
      const match = await bcrypt.compare(parsed.data.token, candidate.delete_account_token!);
      if (match) {
        target = candidate;
        break;
      }
    }

    if (!target) {
      return NextResponse.json(
        { success: false, error: "Lien invalide ou expiré" },
        { status: 400 }
      );
    }

    // Cascade delete: all user data.
    await Promise.all([
      Postulation.deleteMany({ user_id: target._id }),
      PostulationDemande.deleteMany({ user_id: target._id }),
      DossierDemandeForAdd.deleteMany({ user_id: target._id }),
      DossierDemandeForCreate.deleteMany({ user_id: target._id }),
      User.findByIdAndDelete(target._id),
    ]);

    return createLogoutResponse();
  } catch (error) {
    console.error("[CONFIRM-DELETE]", error);
    return NextResponse.json({ success: false, error: "Erreur" }, { status: 500 });
  }
}
