"use client";

import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/lib/content/types";

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

interface QuizCardProps {
  question: QuizQuestion;
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: number | null;
  onSelectAnswer: (answerIndex: number) => void;
}

export function QuizCard({
  question,
  questionNumber,
  totalQuestions,
  selectedAnswer,
  onSelectAnswer,
}: QuizCardProps) {
  const hasAnswered = selectedAnswer !== null;
  const isCorrect = selectedAnswer === question.correctAnswer;

  return (
    <div className="space-y-6">
      {/* Question header */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Question {questionNumber} of {totalQuestions}
        </p>
        <h3 className="text-lg font-semibold leading-relaxed">
          {question.question}
        </h3>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {question.options.map((option, index) => {
          const isSelected = selectedAnswer === index;
          const isCorrectOption = index === question.correctAnswer;

          let optionStyle =
            "border bg-card hover:bg-accent/50 hover:border-primary/30 cursor-pointer";

          if (hasAnswered) {
            if (isCorrectOption) {
              optionStyle =
                "border-green-500 bg-green-50 dark:bg-green-950/30 dark:border-green-600";
            } else if (isSelected && !isCorrect) {
              optionStyle =
                "border-red-500 bg-red-50 dark:bg-red-950/30 dark:border-red-600";
            } else {
              optionStyle =
                "border bg-card opacity-60 cursor-default";
            }
          }

          return (
            <button
              key={index}
              onClick={() => !hasAnswered && onSelectAnswer(index)}
              disabled={hasAnswered}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg p-4 text-left transition-all",
                optionStyle
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                  hasAnswered && isCorrectOption
                    ? "bg-green-500 text-white"
                    : hasAnswered && isSelected && !isCorrect
                      ? "bg-red-500 text-white"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {OPTION_LABELS[index]}
              </span>
              <span className="text-sm leading-relaxed pt-0.5">{option}</span>

              {/* Feedback icons */}
              {hasAnswered && isCorrectOption && (
                <span className="ml-auto shrink-0 pt-0.5 text-green-600 dark:text-green-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
              {hasAnswered && isSelected && !isCorrect && (
                <span className="ml-auto shrink-0 pt-0.5 text-red-600 dark:text-red-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Explanation - shown after answering */}
      {hasAnswered && (
        <div
          className={cn(
            "rounded-lg border p-4",
            isCorrect
              ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
              : "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
          )}
        >
          <p className="text-xs font-semibold mb-1">
            {isCorrect ? "Correct!" : "Not quite right"}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {question.explanation}
          </p>
        </div>
      )}
    </div>
  );
}
