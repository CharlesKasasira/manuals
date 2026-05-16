import { Suspense } from "react";
import { LoginForm } from "@/components/layout/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
