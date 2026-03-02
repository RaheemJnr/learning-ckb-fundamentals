"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}

/**
 * Custom code block component with copy-to-clipboard and language label.
 * Used as the `pre` component in MDX rendering.
 */
export function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Extract language from className (set by rehype-highlight or mdx code fences)
  const languageMatch =
    typeof className === "string" ? className.match(/language-(\w+)/) : null;
  const language = languageMatch ? languageMatch[1] : null;

  // Also check child element for language class
  const childProps =
    children && typeof children === "object" && "props" in children
      ? (children as React.ReactElement<{ className?: string; children?: React.ReactNode }>).props
      : null;
  const childLanguageMatch = childProps?.className?.match(/language-(\w+)/);
  const displayLanguage = language ?? (childLanguageMatch ? childLanguageMatch[1] : null);

  const getTextContent = useCallback((): string => {
    if (!children) return "";
    if (typeof children === "string") return children;
    if (
      typeof children === "object" &&
      "props" in children &&
      typeof (children as React.ReactElement<{ children?: React.ReactNode }>).props.children === "string"
    ) {
      return (children as React.ReactElement<{ children: string }>).props.children;
    }
    // Fallback: try to extract text from the DOM when copying
    return "";
  }, [children]);

  const handleCopy = useCallback(async () => {
    const text = getTextContent();
    if (text) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for complex children: find the code element's text
      const codeEl = document.querySelector("[data-code-block-active]");
      if (codeEl) {
        await navigator.clipboard.writeText(codeEl.textContent ?? "");
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getTextContent]);

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border border-border/50 bg-[#1e1e2e] text-sm">
      {/* Top bar with language label and copy button */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-white/40">
          {displayLanguage ?? "code"}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
            copied
              ? "text-green-400"
              : "text-white/40 hover:bg-white/10 hover:text-white/70"
          )}
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="size-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre
        className={cn(
          "overflow-x-auto p-4 text-white/90 leading-relaxed",
          className
        )}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

/**
 * Inline code component for MDX rendering.
 */
export function InlineCode({
  children,
  ...props
}: React.ComponentProps<"code">) {
  // If this code element is inside a pre (code block), render without inline styles
  // The parent CodeBlock handles styling in that case
  const isInsidePre =
    typeof props.className === "string" &&
    props.className.includes("language-");

  if (isInsidePre) {
    return (
      <code className={props.className} {...props}>
        {children}
      </code>
    );
  }

  return (
    <code
      className="rounded-md bg-muted px-1.5 py-0.5 text-sm font-mono text-foreground"
      {...props}
    >
      {children}
    </code>
  );
}
