import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-lg"
            >
              <BookOpen className="size-5 text-primary" />
              <span>Learning CKB</span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              A comprehensive journey from CKB basics to building production
              dApps on Nervos Network.
            </p>
          </div>

          {/* Course */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Course</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/lessons"
                  className="transition-colors hover:text-foreground"
                >
                  All Lessons
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="transition-colors hover:text-foreground"
                >
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Resources</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href="https://docs.nervos.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  Nervos Docs
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/ckb-ecofund/ccc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  CCC SDK
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/nervosnetwork/ckb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  CKB on GitHub
                </a>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Community</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href="https://discord.gg/nervos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  Discord
                </a>
              </li>
              <li>
                <a
                  href="https://talk.nervos.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  Forum
                </a>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-muted-foreground">
            Built with Next.js, Tailwind CSS, and CCC SDK. Open-source
            educational content.
          </p>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Learning CKB Fundamentals
          </p>
        </div>
      </div>
    </footer>
  );
}
