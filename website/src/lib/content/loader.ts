import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { lessonsData } from './lessons-data';
import type { LessonMeta, Lesson, LessonQuiz } from './types';

const CONTENT_DIR = path.join(process.cwd(), 'src/content');

/**
 * Get all lesson metadata (no content loaded).
 */
export function getAllLessons(): LessonMeta[] {
  return lessonsData;
}

/**
 * Get lesson metadata and MDX content by slug.
 * Returns null if the slug is not found in the registry.
 * Returns empty content if the MDX file does not yet exist.
 */
export function getLessonBySlug(slug: string): Lesson | null {
  const meta = lessonsData.find((l) => l.slug === slug);
  if (!meta) return null;

  const filePath = path.join(CONTENT_DIR, `${meta.slug}.mdx`);
  if (!fs.existsSync(filePath)) {
    return { ...meta, content: '' };
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const { content } = matter(fileContent);
  return { ...meta, content };
}

/**
 * Get lesson metadata and MDX content by lesson ID.
 */
export function getLessonById(id: number): Lesson | null {
  const meta = lessonsData.find((l) => l.id === id);
  if (!meta) return null;
  return getLessonBySlug(meta.slug);
}

/**
 * Get quiz data for a lesson by slug.
 * Returns null if no quiz file exists yet.
 */
export function getLessonQuiz(slug: string): LessonQuiz | null {
  const quizPath = path.join(CONTENT_DIR, 'quizzes', `${slug}.json`);
  if (!fs.existsSync(quizPath)) return null;
  const raw = fs.readFileSync(quizPath, 'utf-8');
  return JSON.parse(raw) as LessonQuiz;
}

/**
 * Get all lessons belonging to a specific phase.
 */
export function getLessonsByPhase(phase: number): LessonMeta[] {
  return lessonsData.filter((l) => l.phase === phase);
}

/**
 * Get the next lesson in the sequence, or null if this is the last lesson.
 */
export function getNextLesson(currentId: number): LessonMeta | null {
  const idx = lessonsData.findIndex((l) => l.id === currentId);
  if (idx === -1 || idx === lessonsData.length - 1) return null;
  return lessonsData[idx + 1];
}

/**
 * Get the previous lesson in the sequence, or null if this is the first lesson.
 */
export function getPreviousLesson(currentId: number): LessonMeta | null {
  const idx = lessonsData.findIndex((l) => l.id === currentId);
  if (idx <= 0) return null;
  return lessonsData[idx - 1];
}

/**
 * Get all unique phase names with their phase numbers.
 */
export function getPhases(): { phase: number; name: string }[] {
  const seen = new Set<number>();
  const phases: { phase: number; name: string }[] = [];
  for (const lesson of lessonsData) {
    if (!seen.has(lesson.phase)) {
      seen.add(lesson.phase);
      phases.push({ phase: lesson.phase, name: lesson.phaseName });
    }
  }
  return phases;
}
