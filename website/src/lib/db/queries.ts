import { db } from './index';
import { users, lessonProgress, quizAttempts } from './schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Upsert a user on wallet connect.
 * Creates the user if they don't exist, or updates lastLogin if they do.
 */
export async function upsertUser(walletAddress: string, displayName?: string) {
  return db
    .insert(users)
    .values({
      walletAddress,
      displayName: displayName ?? null,
      lastLogin: new Date(),
    })
    .onConflictDoUpdate({
      target: users.walletAddress,
      set: {
        lastLogin: new Date(),
        ...(displayName !== undefined ? { displayName } : {}),
      },
    })
    .returning();
}

/**
 * Get all lesson progress records for a user.
 */
export async function getUserProgress(walletAddress: string) {
  return db
    .select()
    .from(lessonProgress)
    .where(eq(lessonProgress.walletAddress, walletAddress))
    .orderBy(lessonProgress.lessonId);
}

/**
 * Update lesson progress for a specific user and lesson.
 * Creates a new record if one doesn't exist, or updates the existing one.
 */
export async function updateLessonProgress(
  walletAddress: string,
  lessonId: number,
  status: string
) {
  const now = new Date();

  return db
    .insert(lessonProgress)
    .values({
      walletAddress,
      lessonId,
      status,
      startedAt: status === 'in_progress' || status === 'completed' ? now : null,
      completedAt: status === 'completed' ? now : null,
    })
    .onConflictDoUpdate({
      target: [lessonProgress.walletAddress, lessonProgress.lessonId],
      set: {
        status,
        ...(status === 'in_progress'
          ? { startedAt: sql`COALESCE(${lessonProgress.startedAt}, ${now})` }
          : {}),
        ...(status === 'completed' ? { completedAt: now } : {}),
      },
    })
    .returning();
}

/**
 * Submit a quiz attempt for a specific user and lesson.
 */
export async function submitQuizAttempt(
  walletAddress: string,
  lessonId: number,
  score: number,
  totalQuestions: number,
  answers: unknown
) {
  return db
    .insert(quizAttempts)
    .values({
      walletAddress,
      lessonId,
      score,
      totalQuestions,
      answersJson: answers,
    })
    .returning();
}

/**
 * Get quiz attempt history for a specific user and lesson,
 * ordered by most recent first.
 */
export async function getQuizHistory(walletAddress: string, lessonId: number) {
  return db
    .select()
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.walletAddress, walletAddress),
        eq(quizAttempts.lessonId, lessonId)
      )
    )
    .orderBy(desc(quizAttempts.attemptedAt));
}

/**
 * Get the best (highest) quiz score for each lesson for a given user.
 */
export async function getBestQuizScores(walletAddress: string) {
  return db
    .select({
      lessonId: quizAttempts.lessonId,
      bestScore: sql<number>`max(${quizAttempts.score})`.as('best_score'),
      totalQuestions: sql<number>`max(${quizAttempts.totalQuestions})`.as(
        'total_questions'
      ),
      attempts: sql<number>`count(*)::int`.as('attempts'),
    })
    .from(quizAttempts)
    .where(eq(quizAttempts.walletAddress, walletAddress))
    .groupBy(quizAttempts.lessonId)
    .orderBy(quizAttempts.lessonId);
}
