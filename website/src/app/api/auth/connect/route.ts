import { NextRequest, NextResponse } from "next/server";
import { upsertUser } from "@/lib/db/queries";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 }
      );
    }

    // Upsert the user in the database
    const result = await upsertUser(walletAddress);

    // Set wallet address in a session cookie
    const cookieStore = await cookies();
    cookieStore.set("wallet-address", walletAddress, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return NextResponse.json({
      success: true,
      user: result[0] ?? null,
    });
  } catch (error) {
    console.error("Auth connect error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
