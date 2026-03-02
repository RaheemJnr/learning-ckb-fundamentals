import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAllLessons, getPhases } from "@/lib/content/loader";

export const metadata: Metadata = {
  title: "Lessons",
  description:
    "Browse all 24 lessons in the Learning CKB Fundamentals course.",
};

const phaseColors: Record<number, string> = {
  1: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  2: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  3: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  4: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  5: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

export default function LessonsPage() {
  const lessons = getAllLessons();
  const phases = getPhases();

  // Group lessons by phase
  const lessonsByPhase = phases.map((phase) => ({
    ...phase,
    lessons: lessons.filter((l) => l.phase === phase.phase),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-10">
        <Button asChild variant="ghost" size="sm" className="mb-4 gap-2">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to Home
          </Link>
        </Button>

        <h1 className="text-3xl font-bold tracking-tight">All Lessons</h1>
        <p className="mt-2 text-muted-foreground">
          24 lessons across 5 phases, from CKB basics to production dApps.
        </p>
      </div>

      <div className="space-y-12">
        {lessonsByPhase.map((group) => (
          <section key={group.phase}>
            {/* Phase header */}
            <div className="mb-6 flex items-center gap-3">
              <Badge
                variant="secondary"
                className={phaseColors[group.phase] ?? ""}
              >
                Phase {group.phase}
              </Badge>
              <h2 className="text-xl font-semibold">{group.name}</h2>
              <span className="text-sm text-muted-foreground">
                {group.lessons.length} lesson
                {group.lessons.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Lesson cards grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.lessons.map((lesson) => (
                <Link
                  key={lesson.id}
                  href={`/lessons/${lesson.slug}`}
                  className="group"
                >
                  <Card className="h-full transition-colors hover:border-primary/40 hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                          {lesson.id}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {lesson.estimatedTime}
                        </div>
                      </div>
                      <CardTitle className="mt-2 text-base leading-snug group-hover:text-primary transition-colors">
                        {lesson.title}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 text-xs">
                        {lesson.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <BookOpen className="size-3.5" />
                        <span>{lesson.projectFolder}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
