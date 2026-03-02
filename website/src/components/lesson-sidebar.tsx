"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { LessonMeta } from "@/lib/content/types";

interface LessonSidebarProps {
  lessons: LessonMeta[];
  phases: { phase: number; name: string }[];
}

const phaseColors: Record<number, string> = {
  1: "text-blue-600 dark:text-blue-400",
  2: "text-purple-600 dark:text-purple-400",
  3: "text-amber-600 dark:text-amber-400",
  4: "text-emerald-600 dark:text-emerald-400",
  5: "text-rose-600 dark:text-rose-400",
};

function SidebarContent({ lessons, phases }: LessonSidebarProps) {
  const pathname = usePathname();
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(() => {
    // Auto-expand the phase containing the current lesson
    const currentSlug = pathname.split("/lessons/")[1]?.split("/")[0];
    const currentLesson = lessons.find((l) => l.slug === currentSlug);
    const initialExpanded = new Set<number>();
    if (currentLesson) {
      initialExpanded.add(currentLesson.phase);
    } else {
      // Default: expand phase 1
      initialExpanded.add(1);
    }
    return initialExpanded;
  });

  const togglePhase = (phase: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  };

  const lessonsByPhase = phases.map((p) => ({
    ...p,
    lessons: lessons.filter((l) => l.phase === p.phase),
  }));

  return (
    <nav className="space-y-1" aria-label="Lesson navigation">
      {/* Link to all lessons */}
      <Link
        href="/lessons"
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
          pathname === "/lessons"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground"
        )}
      >
        <BookOpen className="size-4" />
        All Lessons
      </Link>

      <div className="my-2 border-b" />

      {lessonsByPhase.map((group) => {
        const isExpanded = expandedPhases.has(group.phase);
        return (
          <div key={group.phase}>
            <button
              onClick={() => togglePhase(group.phase)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              {isExpanded ? (
                <ChevronDown className="size-4 shrink-0" />
              ) : (
                <ChevronRight className="size-4 shrink-0" />
              )}
              <span className={cn("truncate", phaseColors[group.phase])}>
                Phase {group.phase}
              </span>
              <Badge
                variant="secondary"
                className="ml-auto text-[10px] px-1.5 py-0"
              >
                {group.lessons.length}
              </Badge>
            </button>

            {isExpanded && (
              <div className="ml-4 space-y-0.5 border-l pl-2">
                {group.lessons.map((lesson) => {
                  const isActive = pathname === `/lessons/${lesson.slug}`;
                  return (
                    <Link
                      key={lesson.id}
                      href={`/lessons/${lesson.slug}`}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent",
                        isActive
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {lesson.id}
                      </span>
                      <span className="truncate">{lesson.title}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Desktop sidebar - always visible on large screens.
 */
export function LessonSidebarDesktop(props: LessonSidebarProps) {
  return (
    <aside className="hidden lg:block w-72 shrink-0 border-r">
      <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto px-3 py-6">
        <SidebarContent {...props} />
      </div>
    </aside>
  );
}

/**
 * Mobile sidebar - opens as a sheet on small screens.
 */
export function LessonSidebarMobile(props: LessonSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="fixed bottom-4 left-4 z-40 gap-2 shadow-lg"
          >
            <Menu className="size-4" />
            Lessons
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 overflow-y-auto p-4">
          <SheetHeader>
            <SheetTitle>Lessons</SheetTitle>
          </SheetHeader>
          <div className="mt-4" onClick={() => setOpen(false)}>
            <SidebarContent {...props} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
