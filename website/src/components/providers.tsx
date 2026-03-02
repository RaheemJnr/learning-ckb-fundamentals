"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { CccProvider } from "@/components/ccc-provider";
import { AuthProvider } from "@/contexts/auth-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <CccProvider>
        <AuthProvider>{children}</AuthProvider>
      </CccProvider>
    </ThemeProvider>
  );
}
