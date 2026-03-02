"use client";

import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** Value from 0 to 100 */
  value: number;
  /** Show the percentage label */
  showLabel?: boolean;
  /** Additional class names for the outer container */
  className?: string;
  /** Height class override (default: h-3) */
  heightClass?: string;
}

function getColorClass(value: number): string {
  if (value < 25) return "bg-red-500";
  if (value < 50) return "bg-yellow-500";
  if (value < 75) return "bg-blue-500";
  return "bg-green-500";
}

export function ProgressBar({
  value,
  showLabel = true,
  className,
  heightClass = "h-3",
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const colorClass = getColorClass(clamped);

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{Math.round(clamped)}%</span>
        </div>
      )}
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          heightClass
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            colorClass
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
