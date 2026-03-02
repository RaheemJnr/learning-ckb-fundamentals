import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getQuizHistory } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const walletAddress = cookieStore.get("wallet-address")?.value;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Not authenticated. Connect your wallet first." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const lessonIdParam = searchParams.get("lessonId");

    if (!lessonIdParam) {
      return NextResponse.json(
        { error: "lessonId query parameter is required." },
        { status: 400 }
      );
    }

    const lessonId = parseInt(lessonIdParam, 10);

    if (isNaN(lessonId) || lessonId < 1) {
      return NextResponse.json(
        { error: "lessonId must be a positive integer." },
        { status: 400 }
      );
    }

    const history = await getQuizHistory(walletAddress, lessonId);

    return NextResponse.json({
      success: true,
      attempts: history,
    });
  } catch (error) {
    console.error("Quiz history error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
