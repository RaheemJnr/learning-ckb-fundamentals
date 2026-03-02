"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  GraduationCap,
  BarChart3,
  Layers,
  Loader2,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ProgressBar } from "@/components/progress-bar";
import { LessonProgressCard } from "@/components/lesson-progress-card";
import { useAuth } from "@/contexts/auth-context";
import { lessonsData } from "@/lib/content/lessons-data";

type LessonStatus = "not_started" | "in_progress" | "completed";

interface ProgressRecord {
  id: number;
  walletAddress: string;
  lessonId: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface QuizScoreRecord {
  lessonId: number;
  bestScore: number;
  totalQuestions: number;
  attempts: number;
}

interface ProgressData {
  progress: ProgressRecord[];
  quizScores: QuizScoreRecord[];
}

// Phase definitions
const phases = [
  { phase: 1, name: "Foundations", lessons: "1-6" },
  { phase: 2, name: "Scripts & Smart Contracts", lessons: "7-12" },
  { phase: 3, name: "Token Standards & Composability", lessons: "13-17" },
  { phase: 4, name: "Infrastructure", lessons: "18-20" },
  { phase: 5, name: "Production", lessons: "21-24" },
];

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

export function DashboardContent() {
  const { walletAddress, isConnected, connect } = useAuth();
  const [data, setData] = useState<ProgressData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/progress");
      if (!res.ok) {
        if (res.status === 401) {
          setData(null);
          return;
        }
        throw new Error("Failed to fetch progress data");
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) {
      fetchProgress();
    } else {
      setData(null);
    }
  }, [isConnected, fetchProgress]);

  // Build lookup maps
  const progressMap = new Map<number, LessonStatus>();
  if (data?.progress) {
    for (const p of data.progress) {
      progressMap.set(p.lessonId, p.status as LessonStatus);
    }
  }

  const quizMap = new Map<number, QuizScoreRecord>();
  if (data?.quizScores) {
    for (const q of data.quizScores) {
      quizMap.set(q.lessonId, q);
    }
  }

  // Compute stats
  const totalLessons = lessonsData.length;
  const completedCount = Array.from(progressMap.values()).filter(
    (s) => s === "completed"
  ).length;
  const inProgressCount = Array.from(progressMap.values()).filter(
    (s) => s === "in_progress"
  ).length;
  const overallPercent =
    totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0;

  // Current phase: the highest phase with at least one in-progress or completed lesson
  const currentPhase = (() => {
    let highest = 1;
    for (const lesson of lessonsData) {
      const status = progressMap.get(lesson.id);
      if (status === "in_progress" || status === "completed") {
        if (lesson.phase > highest) highest = lesson.phase;
      }
    }
    return highest;
  })();

  const currentPhaseName =
    phases.find((p) => p.phase === currentPhase)?.name ?? "Foundations";

  // Quiz average
  const quizScoresArr = data?.quizScores ?? [];
  const quizAverage = (() => {
    if (quizScoresArr.length === 0) return 0;
    const total = quizScoresArr.reduce((sum, q) => {
      return sum + (q.totalQuestions > 0 ? (q.bestScore / q.totalQuestions) * 100 : 0);
    }, 0);
    return Math.round(total / quizScoresArr.length);
  })();

  // Not connected state
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8">
          <Button asChild variant="ghost" size="sm" className="mb-4 gap-2">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to Home
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">
            Your Learning Journey
          </h1>
          <p className="mt-2 text-muted-foreground">
            Track your progress through the Learning CKB Fundamentals course.
          </p>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="size-8 text-primary" />
            </div>
            <h2 className="mt-6 text-xl font-semibold">
              Connect Your Wallet to Track Progress
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Link your CKB wallet to save lesson progress, quiz scores, and
              track your journey through all 24 lessons.
            </p>
            <Button className="mt-6 gap-2" onClick={connect}>
              <Wallet className="size-4" />
              Connect Wallet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading && !data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-center justify-center py-32">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">
            Loading your progress...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8">
          <Button asChild variant="ghost" size="sm" className="mb-4 gap-2">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to Home
            </Link>
          </Button>
        </div>
        <Card className="border-destructive/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <h2 className="mt-4 text-lg font-semibold">
              Failed to Load Progress
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button className="mt-4" variant="outline" onClick={fetchProgress}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 gap-2">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to Home
          </Link>
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Your Learning Journey
            </h1>
            <p className="mt-1 text-muted-foreground">
              Track your progress through the Learning CKB Fundamentals course.
            </p>
          </div>
          {walletAddress && (
            <Badge variant="outline" className="w-fit font-mono text-xs">
              {truncateAddress(walletAddress)}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <BookOpen className="size-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {completedCount}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {totalLessons}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Lessons Completed
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Layers className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">Phase {currentPhase}</p>
              <p className="text-xs text-muted-foreground">
                {currentPhaseName}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <GraduationCap className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {quizAverage}
                <span className="text-sm font-normal text-muted-foreground">
                  %
                </span>
              </p>
              <p className="text-xs text-muted-foreground">Quiz Average</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <BarChart3 className="size-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{inProgressCount}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overall Progress Bar */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Overall Progress</CardTitle>
          <CardDescription>
            {completedCount} of {totalLessons} lessons completed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProgressBar value={overallPercent} heightClass="h-4" />
        </CardContent>
      </Card>

      <Separator className="mb-8" />

      {/* Phase Progress Tabs */}
      <Tabs defaultValue="phase-1">
        <TabsList className="mb-6 flex-wrap">
          {phases.map((p) => {
            const phaseLessons = lessonsData.filter(
              (l) => l.phase === p.phase
            );
            const phaseCompleted = phaseLessons.filter(
              (l) => progressMap.get(l.id) === "completed"
            ).length;
            return (
              <TabsTrigger key={p.phase} value={`phase-${p.phase}`}>
                <span className="hidden sm:inline">Phase {p.phase}:</span>{" "}
                {p.name}
                <Badge
                  variant="secondary"
                  className="ml-1.5 text-[10px] px-1.5"
                >
                  {phaseCompleted}/{phaseLessons.length}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {phases.map((p) => {
          const phaseLessons = lessonsData.filter((l) => l.phase === p.phase);
          const phaseCompleted = phaseLessons.filter(
            (l) => progressMap.get(l.id) === "completed"
          ).length;
          const phasePercent =
            phaseLessons.length > 0
              ? (phaseCompleted / phaseLessons.length) * 100
              : 0;

          return (
            <TabsContent key={p.phase} value={`phase-${p.phase}`}>
              <div className="mb-4">
                <h3 className="text-lg font-semibold">
                  Phase {p.phase}: {p.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {phaseCompleted} of {phaseLessons.length} lessons completed
                </p>
                <ProgressBar
                  value={phasePercent}
                  showLabel={false}
                  className="mt-2"
                  heightClass="h-2"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {phaseLessons.map((lesson) => (
                  <LessonProgressCard
                    key={lesson.id}
                    lesson={lesson}
                    status={progressMap.get(lesson.id) ?? "not_started"}
                    bestScore={quizMap.get(lesson.id) ?? null}
                  />
                ))}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Recent Activity */}
      {data?.progress && data.progress.length > 0 && (
        <>
          <Separator className="my-8" />
          <div>
            <h3 className="mb-4 text-lg font-semibold">Recent Activity</h3>
            <div className="space-y-2">
              {data.progress
                .filter((p) => p.completedAt || p.startedAt)
                .sort((a, b) => {
                  const dateA = a.completedAt ?? a.startedAt ?? "";
                  const dateB = b.completedAt ?? b.startedAt ?? "";
                  return (
                    new Date(dateB).getTime() - new Date(dateA).getTime()
                  );
                })
                .slice(0, 5)
                .map((record) => {
                  const lesson = lessonsData.find(
                    (l) => l.id === record.lessonId
                  );
                  if (!lesson) return null;
                  const isCompleted = record.status === "completed";
                  const date = record.completedAt ?? record.startedAt;
                  return (
                    <Link
                      key={record.id}
                      href={`/lessons/${lesson.slug}`}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent/30"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`size-2 rounded-full ${
                            isCompleted ? "bg-green-500" : "bg-blue-500"
                          }`}
                        />
                        <div>
                          <p className="text-sm font-medium">
                            Lesson {lesson.id}: {lesson.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isCompleted ? "Completed" : "Started"}
                          </p>
                        </div>
                      </div>
                      {date && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(date).toLocaleDateString()}
                        </span>
                      )}
                    </Link>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
