import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Company } from "@/models/Company";
import { Postulation } from "@/models/Postulation";

// Public, non-sensitive counters for the home page.
export async function GET() {
  try {
    await connectDB();
    const [companies, sent] = await Promise.all([
      Company.countDocuments(),
      Postulation.countDocuments({ status: "envoyee" }),
    ]);
    return NextResponse.json({
      success: true,
      companies,
      sent,
    });
  } catch {
    return NextResponse.json({ success: true, companies: 0, sent: 0 });
  }
}
