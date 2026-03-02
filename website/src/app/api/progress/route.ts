import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getUserProgress,
  getBestQuizScores,
  updateLessonProgress,
} from "@/lib/db/queries";

const VALID_STATUSES = ["not_started", "in_progress", "completed"] as const;

/**
 * GET /api/progress
 * Returns the authenticated user's lesson progress and best quiz scores.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const walletAddress = cookieStore.get("wallet-address")?.value;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Not authenticated. Connect your wallet first." },
        { status: 401 }
      );
    }

    const [progress, quizScores] = await Promise.all([
      getUserProgress(walletAddress),
      getBestQuizScores(walletAddress),
    ]);

    return NextResponse.json({ progress, quizScores });
  } catch (error) {
    console.error("GET /api/progress error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/progress
 * Updates lesson progress for the authenticated user.
 * Body: { lessonId: number, status: 'not_started' | 'in_progress' | 'completed' }
 */
export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const walletAddress = cookieStore.get("wallet-address")?.value;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Not authenticated. Connect your wallet first." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { lessonId, status } = body;

    if (typeof lessonId !== "number" || lessonId < 1 || lessonId > 24) {
      return NextResponse.json(
        { error: "lessonId must be a number between 1 and 24." },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const result = await updateLessonProgress(walletAddress, lessonId, status);

    return NextResponse.json({ success: true, record: result[0] ?? null });
  } catch (error) {
    console.error("PUT /api/progress error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
