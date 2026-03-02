export interface LessonMeta {
  id: number;
  slug: string;
  title: string;
  description: string;
  phase: number;
  phaseName: string;
  prerequisites: number[]; // lesson IDs
  realWorldExamples: { name: string; description: string; url?: string }[];
  projectFolder: string;
  estimatedTime: string; // e.g. "45 minutes"
}

export interface Lesson extends LessonMeta {
  content: string; // raw MDX content
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number; // index into options
  explanation: string;
}

export interface LessonQuiz {
  lessonId: number;
  questions: QuizQuestion[];
}
