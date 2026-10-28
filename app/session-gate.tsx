"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { Actor } from "@/lib/model-types";
import { ArrowRight, BookOpen, ShieldCheck } from "lucide-react";
export function SessionGate({
  children,
}: {
  children: (actor: Actor, signOut: () => void) => React.ReactNode;
}) {
  const [user, setUser] = useState<Actor | null>(null),
    [loading, setLoading] = useState(true),
    [defaults, setDefaults] = useState(false),
    [email, setEmail] = useState("dealer@demo.local"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    apiFetch("/api/session")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user);
        setDefaults(!!d.defaultDemoPasswords);
        if (d.defaultDemoPasswords) setPassword("DealerDemo!2026");
      })
      .catch(() =>
        setError("Could not connect to the workspace. Please refresh."),
      )
      .finally(() => setLoading(false));
  }, []);
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setUser(d.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setError("");
    try {
      const r = await apiFetch("/api/session", { method: "DELETE" });
      if (!r.ok) throw Error("Could not sign out.");
      setUser(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <main className="model-loading" aria-busy="true">
        Opening your workspace…
      </main>
    );
  if (user)
    return <div key={user.id}>{children(user, () => void signOut())}</div>;
  return (
    <main className="model-login">
      <section className="model-login-story">
        <a href="/" className="model-wordmark">
          HYUNDAI <span>Sales Academy</span>
        </a>
        <div>
          <BookOpen size={36} />
          <h1>
            Knowledge for
            <br />
            every conversation.
          </h1>
          <p>
            A shared learning workspace for dealer teams and Hyundai’s learning
            team.
          </p>
          <img src="/ev-studio.svg" alt="Illustrated electric crossover" />
        </div>
        <p className="model-login-foot">
          Independent prototype · Fictional records · Australian demo
        </p>
      </section>
      <section className="model-login-form">
        <span className="model-kicker">Dealer Sales Coach</span>
        <h2>Welcome to your workspace.</h2>
        <p>Sign in to continue learning or manage your dealer network.</p>
        <div className="model-login-options">
          <button
            type="button"
            aria-pressed={email === "dealer@demo.local"}
            onClick={() => {
              setEmail("dealer@demo.local");
              setPassword(defaults ? "DealerDemo!2026" : "");
              setError("");
            }}
          >
            Dealer consultant<small>Olivia Bennett</small>
          </button>
          <button
            type="button"
            aria-pressed={email === "internal@demo.local"}
            onClick={() => {
              setEmail("internal@demo.local");
              setPassword(defaults ? "InternalDemo!2026" : "");
              setError("");
            }}
          >
            Hyundai internal<small>Learning team</small>
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <label className="field">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        {defaults && (
          <details className="model-credentials">
            <summary>Demo sign-in details</summary>
            <p>
              Dealer: <code>DealerDemo!2026</code>
              <br />
              Internal: <code>InternalDemo!2026</code>
            </p>
            <p>These public demo credentials are for fictional records only.</p>
          </details>
        )}
        <p className="model-login-note">
          <ShieldCheck size={17} /> Each account opens its own permitted
          records.
        </p>
      </section>
    </main>
  );
}
