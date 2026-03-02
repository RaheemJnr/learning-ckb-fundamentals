import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Code2,
  Layers,
  Rocket,
  Shield,
  Zap,
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
import { Separator } from "@/components/ui/separator";

const techStack = [
  { label: "TypeScript", variant: "secondary" as const },
  { label: "Rust", variant: "secondary" as const },
  { label: "CCC SDK", variant: "default" as const },
  { label: "Next.js", variant: "secondary" as const },
  { label: "RISC-V", variant: "secondary" as const },
];

const phases = [
  {
    number: 1,
    title: "Foundations",
    description:
      "CKB architecture, the Cell Model, transactions, and your first on-chain interactions using CCC SDK.",
    lessons: "Lessons 1-5",
    icon: BookOpen,
    color: "text-blue-500 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    number: 2,
    title: "Script Development",
    description:
      "Write, compile, and deploy on-chain scripts (smart contracts) in Rust targeting the CKB-VM (RISC-V).",
    lessons: "Lessons 6-10",
    icon: Code2,
    color: "text-emerald-500 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    number: 3,
    title: "Advanced Patterns",
    description:
      "UDT tokens, NFTs, complex type scripts, and advanced transaction building patterns.",
    lessons: "Lessons 11-15",
    icon: Layers,
    color: "text-violet-500 dark:text-violet-400",
    bgColor: "bg-violet-500/10",
  },
  {
    number: 4,
    title: "dApp Architecture",
    description:
      "Full-stack dApp development, indexer integration, state management, and real-world design patterns.",
    lessons: "Lessons 16-20",
    icon: Shield,
    color: "text-amber-500 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  {
    number: 5,
    title: "Production & Beyond",
    description:
      "Testing, security, deployment best practices, and a capstone project putting it all together.",
    lessons: "Lessons 21-24",
    icon: Rocket,
    color: "text-rose-500 dark:text-rose-400",
    bgColor: "bg-rose-500/10",
  },
];

const stats = [
  { value: "24", label: "Lessons" },
  { value: "5", label: "Phases" },
  { value: "Hands-on", label: "Projects" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            {/* Eyebrow */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground">
              <Zap className="size-3.5 text-primary" />
              <span>Open-source CKB education platform</span>
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Learning CKB{" "}
              <span className="bg-gradient-to-r from-primary to-emerald-500 bg-clip-text text-transparent">
                Fundamentals
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              A comprehensive 24-lesson journey from CKB basics to building
              production dApps on the Nervos Network.
            </p>

            {/* Tech Stack Badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {techStack.map((tech) => (
                <Badge key={tech.label} variant={tech.variant}>
                  {tech.label}
                </Badge>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="gap-2">
                <Link href="/lessons">
                  Start Learning
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/dashboard">View Dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-3 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-primary sm:text-4xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Phases Section */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Course Overview
          </h2>
          <p className="mt-4 text-muted-foreground">
            Five progressive phases taking you from zero to building production
            dApps on CKB.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {phases.map((phase) => (
            <Card
              key={phase.number}
              className="group relative overflow-hidden transition-shadow hover:shadow-lg"
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-10 items-center justify-center rounded-lg ${phase.bgColor}`}
                  >
                    <phase.icon className={`size-5 ${phase.color}`} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Phase {phase.number}
                    </p>
                    <CardTitle className="text-lg">{phase.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {phase.description}
                </CardDescription>
                <Separator className="my-4" />
                <p className="text-xs font-medium text-muted-foreground">
                  {phase.lessons}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* What You'll Learn Section */}
      <section className="border-t border-border/60 bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              What You&apos;ll Learn
            </h2>
            <p className="mt-4 text-muted-foreground">
              By the end of this course, you&apos;ll have the skills to build
              real-world applications on Nervos CKB.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Cell Model Mastery",
                description:
                  "Understand CKB's unique UTXO-like cell model and how it enables powerful on-chain programming.",
              },
              {
                title: "Script Development",
                description:
                  "Write smart contracts (scripts) in Rust that compile to RISC-V and run on the CKB-VM.",
              },
              {
                title: "CCC SDK Proficiency",
                description:
                  "Build transactions, interact with cells, and connect wallets using the CCC SDK.",
              },
              {
                title: "Token Standards",
                description:
                  "Create and manage User Defined Tokens (UDTs) and NFTs using CKB's native patterns.",
              },
              {
                title: "Full-Stack dApps",
                description:
                  "Build complete decentralized applications with Next.js frontends connected to CKB.",
              },
              {
                title: "Production Deployment",
                description:
                  "Test, audit, and deploy your scripts and dApps to CKB mainnet with confidence.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-border/60 bg-card p-6 transition-shadow hover:shadow-md"
              >
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8 text-center sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Ready to start building on CKB?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Jump into Lesson 1 and begin your journey into the Nervos Network
            ecosystem.
          </p>
          <div className="mt-8">
            <Button asChild size="lg" className="gap-2">
              <Link href="/lessons">
                Start Learning
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
