"use client";

import Link from "next/link";
import { CheckCircle2, Circle, PlayCircle, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LessonMeta } from "@/lib/content/types";

type LessonStatus = "not_started" | "in_progress" | "completed";

interface LessonProgressCardProps {
  lesson: LessonMeta;
  status: LessonStatus;
  bestScore?: { bestScore: number; totalQuestions: number; attempts: number } | null;
}

const statusConfig: Record<
  LessonStatus,
  { label: string; icon: React.ElementType; badgeClass: string }
> = {
  not_started: {
    label: "Not Started",
    icon: Circle,
    badgeClass:
      "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400",
  },
  in_progress: {
    label: "In Progress",
    icon: PlayCircle,
    badgeClass:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
};

export function LessonProgressCard({
  lesson,
  status,
  bestScore,
}: LessonProgressCardProps) {
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  const scorePercent =
    bestScore && bestScore.totalQuestions > 0
      ? Math.round((bestScore.bestScore / bestScore.totalQuestions) * 100)
      : null;

  return (
    <Link href={`/lessons/${lesson.slug}`}>
      <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/30">
        <CardContent className="flex flex-col gap-3 py-4">
          {/* Top row: lesson number + status */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Lesson {lesson.id}
            </span>
            <Badge
              variant="secondary"
              className={`gap-1 text-[10px] ${config.badgeClass}`}
            >
              <StatusIcon className="size-3" />
              {config.label}
            </Badge>
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold leading-snug">{lesson.title}</h3>

          {/* Bottom row: estimated time + quiz score */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{lesson.estimatedTime}</span>
            {scorePercent !== null && (
              <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                <Trophy className="size-3" />
                {scorePercent}%
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
