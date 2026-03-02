# CKB Learning Platform - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 24-lesson incremental CKB learning platform with a Vercel-hosted Next.js website featuring wallet auth, progress tracking, quizzes, and 24 standalone lesson projects.

**Architecture:** GitHub monorepo with a Next.js 15 website (Tailwind + shadcn/ui + Vercel Postgres + CCC wallet auth) and 24 standalone lesson project folders. Lessons 1-6 and 13-24 use TypeScript + CCC SDK. Lessons 7-12 mix Rust (on-chain scripts) with TypeScript (off-chain interaction). Each lesson is a self-contained project with its own package.json/Cargo.toml.

**Tech Stack:** Next.js 15, Tailwind CSS, shadcn/ui, Drizzle ORM, Vercel Postgres, CCC SDK (@ckb-ccc/ccc), OffCKB, Rust + ckb-script-templates, MDX, Jose (JWT)

---

## Task 1: Initialize GitHub Repository and Monorepo Structure

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `lessons/` (empty directories for all 24 lessons)

**Step 1: Create GitHub repo**

```bash
cd /Users/raheemjnr/AndroidStudioProjects/planner3d/learning-ckb-fundamentals
git init
gh repo create learning-ckb-fundamentals --public --description "A comprehensive 24-lesson incremental learning platform for Nervos CKB blockchain development"
```

**Step 2: Create root README.md**

Create `README.md` with project overview, curriculum table, tech stack, getting started instructions.

**Step 3: Create .gitignore**

Standard Node.js + Rust + Next.js gitignore.

**Step 4: Create lesson directory stubs**

```bash
for i in $(seq -w 1 24); do mkdir -p lessons/; done
```

Create all 24 lesson directories with placeholder READMEs.

**Step 5: Initial commit and push**

```bash
git add -A && git commit -m "feat: initialize repo with project structure"
git push -u origin main
```

---

## Task 2: Scaffold Next.js Website

**Files:**
- Create: `website/` (Next.js 15 app via create-next-app)
- Create: `website/tailwind.config.ts`
- Create: `website/app/layout.tsx`
- Create: `website/app/page.tsx`

**Step 1: Create Next.js app**

```bash
cd website
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
```

**Step 2: Install shadcn/ui**

```bash
npx shadcn@latest init
```

**Step 3: Install CCC SDK and dependencies**

```bash
npm install @ckb-ccc/ccc @ckb-ccc/connector-react jose drizzle-orm @vercel/postgres
npm install -D drizzle-kit
```

**Step 4: Create root layout with basic shell**

Root layout with navigation, dark mode toggle, wallet connect button placeholder.

**Step 5: Create landing page**

Hero section with course overview, lesson count, tech stack badges.

**Step 6: Commit**

```bash
git add website/ && git commit -m "feat: scaffold Next.js website with shadcn/ui and CCC SDK"
```

---

## Task 3: Database Schema and Drizzle Setup

**Files:**
- Create: `website/lib/db/schema.ts`
- Create: `website/lib/db/index.ts`
- Create: `website/lib/db/queries.ts`
- Create: `website/drizzle.config.ts`

**Step 1: Define Drizzle schema**

```typescript
// website/lib/db/schema.ts
import { pgTable, text, serial, integer, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  walletAddress: text('wallet_address').primaryKey(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow(),
  lastLogin: timestamp('last_login').defaultNow(),
});

export const lessonProgress = pgTable('lesson_progress', {
  id: serial('id').primaryKey(),
  walletAddress: text('wallet_address').references(() => users.walletAddress),
  lessonId: integer('lesson_id').notNull(),
  status: text('status').default('not_started'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  uniqueUserLesson: uniqueIndex('unique_user_lesson').on(table.walletAddress, table.lessonId),
}));

export const quizAttempts = pgTable('quiz_attempts', {
  id: serial('id').primaryKey(),
  walletAddress: text('wallet_address').references(() => users.walletAddress),
  lessonId: integer('lesson_id').notNull(),
  score: integer('score').notNull(),
  totalQuestions: integer('total_questions').notNull(),
  answersJson: jsonb('answers_json'),
  attemptedAt: timestamp('attempted_at').defaultNow(),
});
```

**Step 2: Create DB connection**

```typescript
// website/lib/db/index.ts
import { drizzle } from 'drizzle-orm/vercel-postgres';
import { sql } from '@vercel/postgres';
import * as schema from './schema';

export const db = drizzle(sql, { schema });
```

**Step 3: Create query helpers**

Functions for: upsertUser, getProgress, updateProgress, submitQuiz, getQuizHistory.

**Step 4: Create drizzle config**

```typescript
// website/drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.POSTGRES_URL! },
} satisfies Config;
```

**Step 5: Generate and push migration**

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

**Step 6: Commit**

```bash
git add website/lib/db/ website/drizzle* && git commit -m "feat: add Drizzle ORM schema and DB setup"
```

---

## Task 4: CCC Wallet Authentication

**Files:**
- Create: `website/lib/auth/wallet.ts`
- Create: `website/components/wallet-connect.tsx`
- Create: `website/app/api/auth/connect/route.ts`
- Create: `website/app/api/auth/session/route.ts`
- Create: `website/contexts/auth-context.tsx`

**Step 1: Create auth context with CCC connector**

React context that wraps CCC's connector-react, exposes wallet address, connection status, connect/disconnect functions.

**Step 2: Create wallet-connect component**

Button component using CCC connector-react. Shows "Connect Wallet" when disconnected, shows truncated address when connected.

**Step 3: Create connect API route**

POST endpoint: receives wallet address, upserts user in DB, creates JWT session cookie.

**Step 4: Create session API route**

GET endpoint: reads JWT cookie, returns current user session data.

**Step 5: Wire auth into root layout**

Wrap app in CCC provider and auth context.

**Step 6: Commit**

```bash
git add website/lib/auth/ website/components/wallet-connect.tsx website/app/api/auth/ website/contexts/
git commit -m "feat: add CCC wallet authentication with JWT sessions"
```

---

## Task 5: Lesson Content System (MDX)

**Files:**
- Create: `website/lib/content/lessons.ts`
- Create: `website/lib/content/types.ts`
- Create: `website/app/lessons/page.tsx`
- Create: `website/app/lessons/[id]/page.tsx`
- Create: `website/components/lesson-sidebar.tsx`
- Create: `website/components/code-block.tsx`

**Step 1: Install MDX dependencies**

```bash
npm install @next/mdx @mdx-js/loader @mdx-js/react next-mdx-remote gray-matter rehype-highlight rehype-slug remark-gfm
```

**Step 2: Create lesson types**

Define LessonMeta (id, title, description, phase, prerequisites, realWorldExamples), Quiz types.

**Step 3: Create lesson loader**

Function that reads MDX files from `content/`, parses frontmatter, returns lesson list and individual lessons.

**Step 4: Create lessons overview page**

Grid layout showing all 24 lessons grouped by phase. Each card shows title, description, progress status (if logged in).

**Step 5: Create individual lesson page**

Dynamic route [id] that loads MDX content, renders it with custom components, shows progress controls.

**Step 6: Create sidebar component**

Left sidebar with lesson navigation, phase grouping, progress indicators (checkmarks for completed, current indicator for in-progress).

**Step 7: Create code-block component**

Syntax-highlighted code block with copy button, language indicator. Used in MDX content.

**Step 8: Commit**

```bash
git add website/lib/content/ website/app/lessons/ website/components/
git commit -m "feat: add MDX lesson content system with sidebar navigation"
```

---

## Task 6: Quiz System

**Files:**
- Create: `website/app/lessons/[id]/quiz/page.tsx`
- Create: `website/app/api/quiz/submit/route.ts`
- Create: `website/app/api/quiz/history/route.ts`
- Create: `website/components/quiz-card.tsx`
- Create: `website/lib/content/quizzes.ts`

**Step 1: Define quiz data structure**

Each lesson has a quiz JSON: array of {question, options[], correctAnswer, explanation}.

**Step 2: Create quiz page**

Renders questions one at a time, tracks answers, shows instant feedback per question, final score summary.

**Step 3: Create quiz submit API**

POST: receives wallet_address, lesson_id, answers. Scores the quiz, saves to quiz_attempts table.

**Step 4: Create quiz history API**

GET: returns all quiz attempts for a user+lesson, including best score.

**Step 5: Create quiz card component**

Interactive multiple-choice card with A/B/C/D options, correct/incorrect highlighting, explanation reveal.

**Step 6: Commit**

```bash
git add website/app/lessons/*/quiz/ website/app/api/quiz/ website/components/quiz-card.tsx website/lib/content/quizzes.ts
git commit -m "feat: add quiz system with scoring and history"
```

---

## Task 7: Progress Dashboard

**Files:**
- Create: `website/app/dashboard/page.tsx`
- Create: `website/app/api/progress/route.ts`
- Create: `website/components/progress-bar.tsx`
- Create: `website/components/lesson-card.tsx`

**Step 1: Create progress API**

GET: returns all lesson progress for current user.
PUT: updates lesson status (not_started → in_progress → completed).

**Step 2: Create dashboard page**

Overall progress bar, lesson grid with status colors, phase completion stats, quiz scores summary, streak tracker.

**Step 3: Create progress bar component**

Animated progress bar showing X/24 lessons completed, percentage.

**Step 4: Create lesson card component**

Card showing lesson title, status badge, quiz score (if attempted), time completed.

**Step 5: Commit**

```bash
git add website/app/dashboard/ website/app/api/progress/ website/components/progress-bar.tsx website/components/lesson-card.tsx
git commit -m "feat: add progress dashboard with tracking"
```

---

## Task 8: Deploy Website to Vercel

**Step 1: Create Vercel project**

```bash
cd website
npx vercel --yes
```

**Step 2: Set up Vercel Postgres**

```bash
npx vercel env pull .env.local
```

Add POSTGRES_URL via Vercel dashboard or CLI.

**Step 3: Push migration to production DB**

```bash
npx drizzle-kit push
```

**Step 4: Deploy**

```bash
npx vercel --prod
```

**Step 5: Commit any config changes**

```bash
git add . && git commit -m "feat: configure Vercel deployment"
```

---

## Tasks 9-32: Generate All 24 Lesson Projects + MDX Content

Each lesson is delegated to a parallel subagent that generates:
1. The standalone project folder in `lessons/XX-name/`
2. The MDX content file in `website/content/XX-name.mdx`
3. The quiz data in `website/content/quizzes/XX-name.json`

**These tasks run in parallel batches using superpowers:dispatching-parallel-agents.**

### Task 9: Lesson 01 - Cell Model Explorer
- **Project**: `lessons/01-cell-model-explorer/` (TypeScript + CCC SDK)
- **Content**: MDX explaining Cell Model + quiz
- **Exercise**: CLI app that connects to devnet and displays cell structures

### Task 10: Lesson 02 - Transaction Anatomy
- **Project**: `lessons/02-transaction-anatomy/` (TypeScript + CCC SDK)
- **Content**: MDX explaining transaction flow + quiz
- **Exercise**: Transaction visualizer showing inputs→outputs

### Task 11: Lesson 03 - Capacity Calculator
- **Project**: `lessons/03-capacity-calculator/` (TypeScript + CCC SDK)
- **Content**: MDX on tokenomics + quiz
- **Exercise**: CLI tool calculating on-chain storage costs

### Task 12: Lesson 04 - Dev Environment Setup
- **Project**: `lessons/04-dev-environment-setup/` (TypeScript + CCC SDK + OffCKB)
- **Content**: MDX with installation walkthrough + quiz
- **Exercise**: Script that bootstraps devnet and verifies setup

### Task 13: Lesson 05 - First Transfer
- **Project**: `lessons/05-first-transfer/` (TypeScript + CCC SDK)
- **Content**: MDX on building transactions + quiz
- **Exercise**: CLI tool that transfers CKB between addresses

### Task 14: Lesson 06 - Cell Explorer
- **Project**: `lessons/06-cell-explorer/` (TypeScript + CCC SDK)
- **Content**: MDX on cell queries + quiz
- **Exercise**: Interactive cell search and display tool

### Task 15: Lesson 07 - Script Basics
- **Project**: `lessons/07-script-basics/` (TypeScript + CCC SDK)
- **Content**: MDX on lock/type script execution model + quiz
- **Exercise**: App that deploys and interacts with default scripts

### Task 16: Lesson 08 - Hash Lock Script
- **Project**: `lessons/08-hash-lock-script/` (Rust + TypeScript)
- **Content**: MDX on writing lock scripts in Rust + quiz
- **Exercise**: Rust hash-lock script + TS deployment/testing

### Task 17: Lesson 09 - Script Debugging
- **Project**: `lessons/09-script-debugging/` (Rust + TypeScript)
- **Content**: MDX on CKB-Debugger + quiz
- **Exercise**: Debug intentionally broken scripts

### Task 18: Lesson 10 - Type Script Counter
- **Project**: `lessons/10-type-script-counter/` (Rust + TypeScript)
- **Content**: MDX on type scripts + quiz
- **Exercise**: Counter type script with state transitions

### Task 19: Lesson 11 - Molecule Serialization
- **Project**: `lessons/11-molecule-serialization/` (Rust + TypeScript)
- **Content**: MDX on molecule format + quiz
- **Exercise**: Custom molecule schemas with serialize/deserialize

### Task 20: Lesson 12 - CKB-VM Deep Dive
- **Project**: `lessons/12-ckb-vm-deep-dive/` (Rust + TypeScript)
- **Content**: MDX on RISC-V VM internals + quiz
- **Exercise**: Benchmark script cycle consumption

### Task 21: Lesson 13 - xUDT Tokens
- **Project**: `lessons/13-xudt-tokens/` (TypeScript + CCC SDK)
- **Content**: MDX on fungible tokens + quiz
- **Exercise**: Issue and transfer custom tokens

### Task 22: Lesson 14 - Spore NFTs
- **Project**: `lessons/14-spore-nfts/` (TypeScript + CCC SDK)
- **Content**: MDX on Spore protocol + quiz
- **Exercise**: Mint Spore NFTs with on-chain content

### Task 23: Lesson 15 - Omnilock Wallet
- **Project**: `lessons/15-omnilock-wallet/` (TypeScript + CCC SDK)
- **Content**: MDX on Omnilock modes + quiz
- **Exercise**: Multi-auth wallet with CKB + ETH signatures

### Task 24: Lesson 16 - Composability Patterns
- **Project**: `lessons/16-composability-patterns/` (TypeScript + CCC SDK)
- **Content**: MDX on CKB composability + quiz
- **Exercise**: Token-gated content system

### Task 25: Lesson 17 - Cell Management
- **Project**: `lessons/17-cell-management/` (TypeScript + CCC SDK)
- **Content**: MDX on cell strategies + quiz
- **Exercise**: Cell optimization and management tool

### Task 26: Lesson 18 - RPC Dashboard
- **Project**: `lessons/18-rpc-dashboard/` (TypeScript + CCC SDK)
- **Content**: MDX on CKB RPC API + quiz
- **Exercise**: Real-time chain stats dashboard

### Task 27: Lesson 19 - Full Node Setup
- **Project**: `lessons/19-full-node-setup/` (TypeScript + Shell scripts)
- **Content**: MDX on node operation + quiz
- **Exercise**: Node setup scripts + health monitoring

### Task 28: Lesson 20 - Light Client App
- **Project**: `lessons/20-light-client-app/` (TypeScript + CCC SDK)
- **Content**: MDX on light client protocol + quiz
- **Exercise**: Light client verification app

### Task 29: Lesson 21 - RGB++ Explorer
- **Project**: `lessons/21-rgbpp-explorer/` (TypeScript + CCC SDK)
- **Content**: MDX on RGB++ protocol + quiz
- **Exercise**: RGB++ asset explorer

### Task 30: Lesson 22 - Token DEX
- **Project**: `lessons/22-token-dex/` (TypeScript + CCC SDK)
- **Content**: MDX on DEX patterns + quiz
- **Exercise**: Simple xUDT orderbook exchange

### Task 31: Lesson 23 - NFT Marketplace
- **Project**: `lessons/23-nft-marketplace/` (TypeScript + CCC SDK + Next.js)
- **Content**: MDX on full-stack dApp + quiz
- **Exercise**: Complete Spore marketplace with wallet connect

### Task 32: Lesson 24 - Mainnet Deployment
- **Project**: `lessons/24-mainnet-deployment/` (TypeScript + CCC SDK)
- **Content**: MDX on production deployment + quiz
- **Exercise**: Deploy to testnet with monitoring

---

## Task 33: Final Integration and Polish

**Step 1: Link all MDX content files to website**

Ensure all 24 MDX files are in `website/content/` and quiz JSONs in `website/content/quizzes/`.

**Step 2: Test full user flow**

- Connect wallet → Browse lessons → Read lesson → Run exercise → Take quiz → Check dashboard

**Step 3: Add real-world examples to each lesson**

Ensure each MDX includes the "Real-World Examples" section with actual CKB projects.

**Step 4: Final commit and deploy**

```bash
git add -A && git commit -m "feat: complete all 24 lessons and website integration"
npx vercel --prod
```

---

## Execution Strategy

This plan has 33 tasks. Tasks 1-8 are sequential (website scaffold). Tasks 9-32 (24 lessons) can be **parallelized in batches** using superpowers:dispatching-parallel-agents. Task 33 is final integration.

**Recommended execution:**
1. Tasks 1-8: Sequential (website foundation)
2. Tasks 9-32: Parallel batches of 4-6 lessons at a time
3. Task 33: Sequential (final integration)
