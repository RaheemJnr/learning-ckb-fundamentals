import type { Metadata } from "next";
import { DashboardContent } from "@/components/dashboard-content";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Track your progress through the Learning CKB Fundamentals course.",
};

export default function DashboardPage() {
  return <DashboardContent />;
}
