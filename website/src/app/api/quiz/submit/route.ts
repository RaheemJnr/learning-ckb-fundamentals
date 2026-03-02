import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { submitQuizAttempt } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
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
    const { lessonId, score, totalQuestions, answers } = body;

    // Validate required fields
    if (
      typeof lessonId !== "number" ||
      typeof score !== "number" ||
      typeof totalQuestions !== "number" ||
      !Array.isArray(answers)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body. Required: lessonId (number), score (number), totalQuestions (number), answers (array).",
        },
        { status: 400 }
      );
    }

    // Validate score bounds
    if (score < 0 || score > totalQuestions) {
      return NextResponse.json(
        { error: "Score must be between 0 and totalQuestions." },
        { status: 400 }
      );
    }

    if (totalQuestions < 1) {
      return NextResponse.json(
        { error: "totalQuestions must be at least 1." },
        { status: 400 }
      );
    }

    const result = await submitQuizAttempt(
      walletAddress,
      lessonId,
      score,
      totalQuestions,
      answers
    );

    return NextResponse.json({
      success: true,
      attempt: result[0] ?? null,
    });
  } catch (error) {
    console.error("Quiz submit error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
