import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  ExternalLink,
  FileQuestion,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeBlock, InlineCode } from "@/components/code-block";
import {
  getAllLessons,
  getLessonBySlug,
  getNextLesson,
  getPreviousLesson,
  getLessonQuiz,
} from "@/lib/content/loader";
import { LessonProgressControls } from "@/components/lesson-progress-controls";

// Custom MDX components
const mdxComponents = {
  pre: CodeBlock,
  code: InlineCode,
  // Style headings for better readability
  h1: (props: React.ComponentProps<"h1">) => (
    <h1
      className="mt-8 mb-4 text-3xl font-bold tracking-tight scroll-mt-20"
      {...props}
    />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h2
      className="mt-8 mb-3 text-2xl font-semibold tracking-tight scroll-mt-20 border-b pb-2"
      {...props}
    />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3
      className="mt-6 mb-2 text-xl font-semibold tracking-tight scroll-mt-20"
      {...props}
    />
  ),
  h4: (props: React.ComponentProps<"h4">) => (
    <h4
      className="mt-4 mb-2 text-lg font-semibold tracking-tight scroll-mt-20"
      {...props}
    />
  ),
  p: (props: React.ComponentProps<"p">) => (
    <p className="mb-4 leading-7 text-foreground/90" {...props} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="mb-4 ml-6 list-disc space-y-1 text-foreground/90" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol
      className="mb-4 ml-6 list-decimal space-y-1 text-foreground/90"
      {...props}
    />
  ),
  li: (props: React.ComponentProps<"li">) => (
    <li className="leading-7" {...props} />
  ),
  a: (props: React.ComponentProps<"a">) => (
    <a
      className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
      target={props.href?.startsWith("http") ? "_blank" : undefined}
      rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    />
  ),
  blockquote: (props: React.ComponentProps<"blockquote">) => (
    <blockquote
      className="mb-4 border-l-4 border-primary/30 pl-4 italic text-muted-foreground"
      {...props}
    />
  ),
  table: (props: React.ComponentProps<"table">) => (
    <div className="mb-4 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  th: (props: React.ComponentProps<"th">) => (
    <th
      className="border-b bg-muted/50 px-4 py-2 text-left font-semibold"
      {...props}
    />
  ),
  td: (props: React.ComponentProps<"td">) => (
    <td className="border-b px-4 py-2" {...props} />
  ),
  hr: (props: React.ComponentProps<"hr">) => (
    <hr className="my-8 border-border" {...props} />
  ),
  strong: (props: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
};

const phaseColors: Record<number, string> = {
  1: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  2: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  3: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  4: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  5: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

// Generate static params for all lessons
export function generateStaticParams() {
  return getAllLessons().map((lesson) => ({
    slug: lesson.slug,
  }));
}

// Generate metadata for each lesson
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);
  if (!lesson) {
    return { title: "Lesson Not Found" };
  }
  return {
    title: lesson.title,
    description: lesson.description,
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);

  if (!lesson) {
    notFound();
  }

  const prevLesson = getPreviousLesson(lesson.id);
  const nextLesson = getNextLesson(lesson.id);
  const quiz = getLessonQuiz(slug);

  return (
    <article className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10">
      {/* Lesson header */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge
            variant="secondary"
            className={phaseColors[lesson.phase] ?? ""}
          >
            Phase {lesson.phase}: {lesson.phaseName}
          </Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {lesson.estimatedTime}
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
          Lesson {lesson.id}: {lesson.title}
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          {lesson.description}
        </p>
      </header>

      {/* Progress controls (client component - only shows when wallet connected) */}
      <div className="mb-6">
        <LessonProgressControls lessonId={lesson.id} />
      </div>

      {/* MDX Content */}
      {lesson.content ? (
        <div className="prose-custom">
          <MDXRemote
            source={lesson.content}
            components={mdxComponents}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkGfm],
                rehypePlugins: [rehypeSlug, rehypeHighlight],
              },
            }}
          />
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Clock className="size-6 text-primary" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">
              Content Coming Soon
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              This lesson&apos;s content is being developed. Check back soon for
              the full tutorial with code examples and exercises.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Real-world examples */}
      {lesson.realWorldExamples.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold border-b pb-2">
            Real-World Examples
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {lesson.realWorldExamples.map((example, i) => (
              <Card key={i} className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {example.name}
                    {example.url && (
                      <a
                        href={example.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 transition-colors"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs">
                    {example.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Quiz link */}
      {quiz && (
        <section className="mt-8">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <FileQuestion className="size-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">Ready for the quiz?</p>
                  <p className="text-xs text-muted-foreground">
                    {quiz.questions.length} questions to test your knowledge
                  </p>
                </div>
              </div>
              <Button asChild size="sm">
                <Link href={`/lessons/${slug}/quiz`}>Take Quiz</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Navigation - Previous / Next */}
      <nav className="mt-12 flex items-stretch gap-4 border-t pt-6">
        {prevLesson ? (
          <Link
            href={`/lessons/${prevLesson.slug}`}
            className="group flex flex-1 flex-col items-start rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
          >
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowLeft className="size-3" />
              Previous
            </span>
            <span className="mt-1 text-sm font-medium group-hover:text-primary transition-colors">
              {prevLesson.title}
            </span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}

        {nextLesson ? (
          <Link
            href={`/lessons/${nextLesson.slug}`}
            className="group flex flex-1 flex-col items-end rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
          >
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              Next
              <ArrowRight className="size-3" />
            </span>
            <span className="mt-1 text-sm font-medium group-hover:text-primary transition-colors">
              {nextLesson.title}
            </span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}
      </nav>
    </article>
  );
}
