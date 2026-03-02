"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PlayCircle,
  CheckCircle2,
  Loader2,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";

type LessonStatus = "not_started" | "in_progress" | "completed";

interface LessonProgressControlsProps {
  lessonId: number;
}

const statusDisplay: Record<
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

export function LessonProgressControls({
  lessonId,
}: LessonProgressControlsProps) {
  const { isConnected } = useAuth();
  const [status, setStatus] = useState<LessonStatus>("not_started");
  const [isUpdating, setIsUpdating] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Fetch current progress on mount
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/progress");
      if (!res.ok) return;
      const data = await res.json();
      const record = data.progress?.find(
        (p: { lessonId: number }) => p.lessonId === lessonId
      );
      if (record) {
        setStatus(record.status as LessonStatus);
      }
    } catch {
      // Silently fail - controls will show default state
    } finally {
      setHasFetched(true);
    }
  }, [lessonId]);

  useEffect(() => {
    if (isConnected) {
      fetchStatus();
    } else {
      setHasFetched(true);
    }
  }, [isConnected, fetchStatus]);

  const updateStatus = async (newStatus: LessonStatus) => {
    setIsUpdating(true);
    try {
      const res = await fetch("/api/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, status: newStatus }),
      });
      if (res.ok) {
        setStatus(newStatus);
      }
    } catch {
      // Silently fail
    } finally {
      setIsUpdating(false);
    }
  };

  // Don't render anything if not connected or hasn't fetched yet
  if (!isConnected) return null;
  if (!hasFetched) return null;

  const config = statusDisplay[status];
  const StatusIcon = config.icon;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      {/* Current status badge */}
      <Badge variant="secondary" className={`gap-1.5 ${config.badgeClass}`}>
        <StatusIcon className="size-3.5" />
        {config.label}
      </Badge>

      <div className="flex items-center gap-2">
        {/* Start Lesson button - shown only if not_started */}
        {status === "not_started" && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => updateStatus("in_progress")}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <PlayCircle className="size-3.5" />
            )}
            Start Lesson
          </Button>
        )}

        {/* Mark as Complete button - shown if in_progress */}
        {status === "in_progress" && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => updateStatus("completed")}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Mark as Complete
          </Button>
        )}

        {/* Already completed - allow resetting to in_progress */}
        {status === "completed" && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs"
            onClick={() => updateStatus("in_progress")}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <PlayCircle className="size-3.5" />
            )}
            Mark as In Progress
          </Button>
        )}
      </div>
    </div>
  );
}
