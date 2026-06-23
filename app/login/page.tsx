import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function LoginPage() {
  return (
    <div className="login-page">
      <section className="login-hero" aria-hidden>
        <div className="login-hero-content">
          <div className="login-hero-mark">B</div>
          <h1>Quản trị pipeline truyện</h1>
          <p>
            Theo dõi truyện, chapter, job queue và chạy script crawl/dịch/polish — tất cả từ một bảng điều khiển
            tập trung.
          </p>
        </div>
      </section>
      <section className="login-form-side">
        <Suspense fallback={<LoadingBlock label="Đang tải form đăng nhập..." />}>
          <LoginForm />
        </Suspense>
      </section>
    </div>
  );
}
