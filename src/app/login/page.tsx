import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { LoginView } from "./login-view";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <LoginView>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-xl bg-surface-2" />}>
        <LoginForm />
      </Suspense>
    </LoginView>
  );
}
