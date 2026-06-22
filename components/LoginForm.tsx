"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Đăng nhập thất bại");
      setLoading(false);
      return;
    }

    const next = (searchParams.get("next") || "/") as Route;
    router.push(next);
    router.refresh();
  }

  return (
    <form className="panel form-grid login-card" onSubmit={onSubmit}>
      <h1 style={{ margin: 0 }}>BetterBox Admin</h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>Chỉ tài khoản admin (`reader_users.role = admin`) được phép.</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <label>
        Username
        <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </div>
    </form>
  );
}
