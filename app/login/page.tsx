import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="login-page">
      <Suspense fallback={<p>Đang tải...</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
