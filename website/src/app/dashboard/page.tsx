import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Track your progress through the Learning CKB Fundamentals course.",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 gap-2">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to Home
          </Link>
        </Button>

        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Track your progress, quiz scores, and achievements.
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <LayoutDashboard className="size-8 text-primary" />
          </div>
          <h2 className="mt-6 text-xl font-semibold">Dashboard Coming Soon</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Connect your wallet to track lesson progress, quiz scores, and earn
            on-chain achievements. The dashboard requires wallet authentication.
          </p>
          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            <span>Authentication & progress tracking under development</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
