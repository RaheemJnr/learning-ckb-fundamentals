import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  walletAddress: text('wallet_address').primaryKey(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow(),
  lastLogin: timestamp('last_login').defaultNow(),
});

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: serial('id').primaryKey(),
    walletAddress: text('wallet_address').references(() => users.walletAddress),
    lessonId: integer('lesson_id').notNull(),
    status: text('status').default('not_started'), // not_started, in_progress, completed
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    uniqueIndex('unique_user_lesson').on(table.walletAddress, table.lessonId),
  ]
);

export const quizAttempts = pgTable('quiz_attempts', {
  id: serial('id').primaryKey(),
  walletAddress: text('wallet_address').references(() => users.walletAddress),
  lessonId: integer('lesson_id').notNull(),
  score: integer('score').notNull(),
  totalQuestions: integer('total_questions').notNull(),
  answersJson: jsonb('answers_json'),
  attemptedAt: timestamp('attempted_at').defaultNow(),
});
