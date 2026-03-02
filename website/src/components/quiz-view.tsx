"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { QuizCard } from "@/components/quiz-card";
import { useAuth } from "@/contexts/auth-context";
import type { QuizQuestion } from "@/lib/content/types";

interface QuizViewProps {
  lessonId: number;
  lessonTitle: string;
  lessonSlug: string;
  questions: QuizQuestion[];
}

interface QuizAnswer {
  questionId: number;
  selectedAnswer: number;
  isCorrect: boolean;
}

export function QuizView({
  lessonId,
  lessonTitle,
  lessonSlug,
  questions,
}: QuizViewProps) {
  const { isConnected } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, QuizAnswer>>(new Map());
  const [showResults, setShowResults] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const answeredCount = answers.size;
  const currentAnswer = answers.get(currentQuestion.id) ?? null;

  const score = Array.from(answers.values()).filter((a) => a.isCorrect).length;
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
  const passed = percentage >= 70;

  const handleSelectAnswer = useCallback(
    (answerIndex: number) => {
      if (answers.has(currentQuestion.id)) return;

      const answer: QuizAnswer = {
        questionId: currentQuestion.id,
        selectedAnswer: answerIndex,
        isCorrect: answerIndex === currentQuestion.correctAnswer,
      };

      setAnswers((prev) => {
        const next = new Map(prev);
        next.set(currentQuestion.id, answer);
        return next;
      });
    },
    [currentQuestion, answers]
  );

  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, totalQuestions]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const handleFinish = useCallback(async () => {
    setShowResults(true);

    // Auto-submit if user is connected
    if (isConnected && !submitted) {
      setIsSubmitting(true);
      try {
        const answersPayload = Array.from(answers.values()).map((a) => ({
          questionId: a.questionId,
          selectedAnswer: a.selectedAnswer,
          isCorrect: a.isCorrect,
        }));

        await fetch("/api/quiz/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId,
            score,
            totalQuestions,
            answers: answersPayload,
          }),
        });

        setSubmitted(true);
      } catch (error) {
        console.error("Failed to submit quiz:", error);
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [isConnected, submitted, answers, lessonId, score, totalQuestions]);

  const handleRetake = useCallback(() => {
    setCurrentIndex(0);
    setAnswers(new Map());
    setShowResults(false);
    setSubmitted(false);
  }, []);

  // ---------- Results screen ----------
  if (showResults) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Score card */}
        <Card>
          <CardContent className="flex flex-col items-center py-8 text-center">
            <div
              className={
                passed
                  ? "flex size-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/40"
                  : "flex size-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40"
              }
            >
              <Trophy
                className={
                  passed
                    ? "size-8 text-green-600 dark:text-green-400"
                    : "size-8 text-amber-600 dark:text-amber-400"
                }
              />
            </div>

            <h2 className="mt-4 text-2xl font-bold">
              {passed ? "Great job!" : "Keep learning!"}
            </h2>

            <p className="mt-1 text-muted-foreground">
              {passed
                ? "You passed the quiz. Well done!"
                : "You need 70% to pass. Review the lesson and try again."}
            </p>

            {/* Score display */}
            <div className="mt-6 w-full max-w-xs space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Score</span>
                <span className="font-semibold">
                  {score} / {totalQuestions}
                </span>
              </div>
              <Progress value={percentage} className="h-3" />
              <p
                className={
                  passed
                    ? "text-center text-2xl font-bold text-green-600 dark:text-green-400"
                    : "text-center text-2xl font-bold text-amber-600 dark:text-amber-400"
                }
              >
                {percentage}%
              </p>
            </div>

            {isSubmitting && (
              <p className="mt-3 text-xs text-muted-foreground">
                Saving your score...
              </p>
            )}
            {submitted && (
              <p className="mt-3 text-xs text-green-600 dark:text-green-400">
                Score saved to your profile.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Question review */}
        <Card>
          <CardContent className="space-y-4 py-4">
            <h3 className="font-semibold text-sm">Question Review</h3>
            <div className="space-y-2">
              {questions.map((q, i) => {
                const answer = answers.get(q.id);
                const correct = answer?.isCorrect ?? false;

                return (
                  <div
                    key={q.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <span
                      className={
                        correct
                          ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-semibold dark:bg-green-950/40 dark:text-green-400"
                          : "flex size-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 text-xs font-semibold dark:bg-red-950/40 dark:text-red-400"
                      }
                    >
                      {correct ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          className="size-3.5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          className="size-3.5"
                        >
                          <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">
                        {i + 1}. {q.question}
                      </p>
                      {!correct && answer && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Correct answer:{" "}
                          <span className="font-medium text-foreground">
                            {q.options[q.correctAnswer]}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={handleRetake} variant="outline" className="gap-2">
            <RotateCcw className="size-4" />
            Retake Quiz
          </Button>
          <Button asChild>
            <Link href={`/lessons/${lessonSlug}`}>
              <ArrowLeft className="size-4" />
              Back to Lesson
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Quiz flow ----------
  const allAnswered = answeredCount === totalQuestions;
  const progressPercent =
    totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/lessons/${lessonSlug}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="size-3" />
          Back to lesson
        </Link>
        <h1 className="text-xl font-bold tracking-tight">
          Quiz: {lessonTitle}
        </h1>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {answeredCount} of {totalQuestions} answered
          </span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
        <Progress value={progressPercent} />
      </div>

      {/* Current question */}
      <Card>
        <CardContent className="py-6">
          <QuizCard
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            totalQuestions={totalQuestions}
            selectedAnswer={currentAnswer?.selectedAnswer ?? null}
            onSelectAnswer={handleSelectAnswer}
          />
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className="gap-1"
        >
          <ArrowLeft className="size-3.5" />
          Previous
        </Button>

        <div className="flex items-center gap-1.5">
          {questions.map((q, i) => {
            const answered = answers.has(q.id);
            const isCurrent = i === currentIndex;

            return (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(i)}
                className={
                  isCurrent
                    ? "size-2.5 rounded-full bg-primary ring-2 ring-primary/30 transition-all"
                    : answered
                      ? "size-2 rounded-full bg-primary/60 transition-all hover:bg-primary"
                      : "size-2 rounded-full bg-muted-foreground/30 transition-all hover:bg-muted-foreground/50"
                }
                aria-label={`Go to question ${i + 1}`}
              />
            );
          })}
        </div>

        {currentIndex === totalQuestions - 1 && allAnswered ? (
          <Button size="sm" onClick={handleFinish} className="gap-1">
            Finish Quiz
            <Trophy className="size-3.5" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={
              currentIndex === totalQuestions - 1 || !currentAnswer
            }
            className="gap-1"
          >
            Next
            <ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
