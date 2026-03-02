import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Clock, FileQuestion } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QuizView } from "@/components/quiz-view";
import {
  getAllLessons,
  getLessonBySlug,
  getLessonQuiz,
} from "@/lib/content/loader";

// Generate static params for all lessons
export function generateStaticParams() {
  return getAllLessons().map((lesson) => ({
    slug: lesson.slug,
  }));
}

// Generate metadata for each quiz page
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);
  if (!lesson) {
    return { title: "Quiz Not Found" };
  }
  return {
    title: `Quiz: ${lesson.title}`,
    description: `Test your knowledge of ${lesson.title} with this interactive quiz.`,
  };
}

export default async function QuizPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);

  if (!lesson) {
    notFound();
  }

  const quiz = getLessonQuiz(slug);

  // Quiz not available yet
  if (!quiz || quiz.questions.length === 0) {
    return (
      <div className="flex-1 px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-2xl">
          <Link
            href={`/lessons/${slug}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="size-3" />
            Back to lesson
          </Link>

          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Clock className="size-6 text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">Quiz Coming Soon</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                The quiz for this lesson is being developed. Check back soon to
                test your knowledge!
              </p>
              <Button asChild className="mt-6" variant="outline">
                <Link href={`/lessons/${slug}`}>
                  <ArrowLeft className="size-4" />
                  Return to Lesson
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-8 sm:px-6 lg:px-10">
      <QuizView
        lessonId={lesson.id}
        lessonTitle={lesson.title}
        lessonSlug={slug}
        questions={quiz.questions}
      />
    </div>
  );
}
