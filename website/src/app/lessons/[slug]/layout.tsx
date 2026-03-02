import { getAllLessons, getPhases } from "@/lib/content/loader";
import {
  LessonSidebarDesktop,
  LessonSidebarMobile,
} from "@/components/lesson-sidebar";

export default function LessonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lessons = getAllLessons();
  const phases = getPhases();

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Desktop sidebar */}
      <LessonSidebarDesktop lessons={lessons} phases={phases} />

      {/* Main content */}
      <div className="flex-1 min-w-0">{children}</div>

      {/* Mobile sidebar (floating button + sheet) */}
      <LessonSidebarMobile lessons={lessons} phases={phases} />
    </div>
  );
}
