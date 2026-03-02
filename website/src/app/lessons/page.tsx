import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Lessons",
  description: "Browse all 24 lessons in the Learning CKB Fundamentals course.",
};

export default function LessonsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-8">
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

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <BookOpen className="size-8 text-primary" />
          </div>
          <h2 className="mt-6 text-xl font-semibold">Lessons Coming Soon</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            The lesson content system is being built. Check back soon for the
            full curriculum with interactive exercises and quizzes.
          </p>
          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            <span>Content pipeline under development</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
