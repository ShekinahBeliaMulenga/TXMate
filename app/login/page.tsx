"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

/* ---------- 3D scene content ---------- */

const ORBIT = ["CS 250", "Σ  z = 1.96", "Debit = Credit", "TCP / IP", "def mean()"];
const DEPTH = 18; // number of stacked layers that make the logo solid
const STEP = 3; // px between layers

const GLYPHS: { t: string; l: string; d: string; s: string }[] = [
  { t: "Σ", l: "6%", d: "0s", s: "text-2xl" },
  { t: "SELECT *", l: "20%", d: "2.2s", s: "text-xs" },
  { t: "O(n log n)", l: "38%", d: "4.1s", s: "text-xs" },
  { t: "μ ± σ", l: "58%", d: "1.3s", s: "text-sm" },
  { t: "git push", l: "74%", d: "3.4s", s: "text-xs" },
  { t: "∫ f(x)dx", l: "88%", d: "5.2s", s: "text-sm" },
  { t: "0x7D", l: "47%", d: "6.1s", s: "text-xs" },
];

function Logo3D() {
  return (
    <div className="p3d relative select-none text-8xl font-extrabold leading-none tracking-tight">
      {Array.from({ length: DEPTH }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute inset-0 whitespace-nowrap"
          style={{
            transform: `translateZ(${(DEPTH * STEP) / 2 - (i + 1) * STEP}px)`,
            color: `hsl(352 62% ${29 - i * 1.15}%)`,
          }}
        >
          TXMate
        </span>
      ))}
      <span className="front relative block whitespace-nowrap" style={{ transform: `translateZ(${(DEPTH * STEP) / 2}px)` }}>
        <span className="text-[#f5b324]">TX</span>
        <span className="text-[#fff1d6]">Mate</span>
      </span>
    </div>
  );
}

function Orbit() {
  return (
    <div className="p3d tiltring absolute left-1/2 top-1/2 h-0 w-0">
      <div className="p3d ring absolute left-0 top-0 h-0 w-0">
        {ORBIT.map((label, i) => {
          const angle = (360 / ORBIT.length) * i;
          return (
            <div
              key={label}
              className="p3d absolute left-0 top-0 h-0 w-0"
              style={{ transform: `rotateY(${angle}deg) translateZ(var(--R))`, ["--a" as string]: `${angle}deg` }}
            >
              <div className="face absolute left-0 top-0 h-0 w-0">
                <span className="chip absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/20 bg-[#2b2320] px-3 py-1.5 font-mono text-xs text-[#f5e6c8] shadow-lg">
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- page ---------- */

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const sceneRef = useRef<HTMLDivElement>(null);

  // Shake the card whenever a new error appears.
  useEffect(() => {
    if (!error) return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [error]);

  function handlePointerMove(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType === "touch") return;
    const el = sceneRef.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${(x * 26).toFixed(1)}deg`);
    el.style.setProperty("--rx", `${(-y * 16).toFixed(1)}deg`);
  }

  function handlePointerLeave() {
    sceneRef.current?.style.setProperty("--ry", "0deg");
    sceneRef.current?.style.setProperty("--rx", "0deg");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      const result = await authClient.signIn.email({
        email: normalizedEmail,
        password,
      });

      if (result.error) {
        setError(result.error.message || "Unable to sign in.");
        setLoading(false);
        return;
      }

      const redirectResponse = await fetch("/api/auth/redirect", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!redirectResponse.ok) {
        setError("Unable to determine where to take you.");
        setLoading(false);
        return;
      }

      const redirectData = (await redirectResponse.json()) as { redirectTo?: string };

      if (!redirectData.redirectTo) {
        setError("Unable to determine where to take you.");
        setLoading(false);
        return;
      }

      // Success: keep the button in its loading state while navigating
      router.replace(redirectData.redirectTo);
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
      setLoading(false);
    }
  }

  // The terminal on the left mirrors what the person is doing in the form.
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const termLines: { key: string; tone: string; text: string }[] = [{ key: "cmd", tone: "text-[#f5e6c8]", text: "txmate login --student" }];
  if (emailOk) termLines.push({ key: "email", tone: "text-emerald-400", text: "✓ email recognised" });
  if (password) termLines.push({ key: "pw", tone: "text-emerald-400", text: "✓ password entered" });
  if (loading) termLines.push({ key: "load", tone: "text-[#f5b324]", text: "… verifying with TXMate" });
  if (error) termLines.push({ key: `err-${error}`, tone: "text-[#ff8f9c]", text: `✕ ${error}` });

  const inputBase =
    "w-full rounded-xl border border-gray-300 bg-white py-3 text-base text-gray-900 placeholder:text-gray-400 outline-none transition duration-150 focus:border-[#6b1728] focus:ring-4 focus:ring-[#6b1728]/10 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm";

  return (
    <main className="flex min-h-dvh flex-col bg-[#1b1613] lg:grid lg:grid-cols-[1.1fr_0.9fr]">
      <style>{`
        .p3d{transform-style:preserve-3d}
        .scene{perspective:1100px}
        .pointer{transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .25s ease-out}
        .enter{animation:enter 1.2s cubic-bezier(.2,.8,.2,1) both}
        .sway{animation:sway 10s ease-in-out infinite}
        .tiltring{transform:rotateX(-16deg)}
        .ring{--R:250px;animation:spin 24s linear infinite}
        .face{animation:face 24s linear infinite}
        .floor{animation:floor 10s ease-in-out infinite}
        @keyframes enter{from{transform:rotateX(55deg) rotateY(-95deg) scale(.4)}to{transform:none}}
        @keyframes sway{0%,100%{transform:rotateY(-22deg) rotateX(7deg)}50%{transform:rotateY(22deg) rotateX(-5deg)}}
        @keyframes spin{to{transform:rotateY(360deg)}}
        @keyframes face{from{transform:rotateY(calc(var(--a) * -1))}to{transform:rotateY(calc(var(--a) * -1 - 360deg))}}
        @keyframes floor{0%,100%{transform:translateX(-26px) scaleX(1);opacity:.55}50%{transform:translateX(26px) scaleX(.85);opacity:.35}}
        @keyframes floaty{0%{transform:translateY(24px);opacity:0}20%{opacity:.45}100%{transform:translateY(-150px);opacity:0}}
        .glyph{animation:floaty 9s ease-in-out infinite both}
        @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        .rise{animation:rise .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0) * 80ms + 200ms)}
        .tline{animation:rise .35s ease both}
        @keyframes blink{50%{opacity:0}}
        .caret{display:inline-block;width:7px;height:13px;margin-left:2px;vertical-align:-2px;background:#f5b324;animation:blink 1s step-end infinite}
        @keyframes shake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}
        .shake{animation:shake .5s}
        @keyframes shine{0%,55%{transform:translateX(-120%) skewX(-18deg)}100%{transform:translateX(320%) skewX(-18deg)}}
        .btnshine{position:absolute;top:0;bottom:0;left:0;width:35%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent);animation:shine 4.5s ease-in-out infinite;pointer-events:none}
        @keyframes glowtext{from{text-shadow:0 0 0 rgba(245,179,36,0)}to{text-shadow:0 0 26px rgba(245,179,36,.9)}}
        .busy .front{animation:glowtext .8s ease-in-out infinite alternate}
        .busy .chip{border-color:#f5b324}
        .grid3{background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:32px 32px;-webkit-mask-image:radial-gradient(ellipse 75% 70% at 50% 45%,#000,transparent);mask-image:radial-gradient(ellipse 75% 70% at 50% 45%,#000,transparent)}
        @keyframes drift{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,-24px)}}
        .blob{animation:drift 14s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){
          *{animation:none!important;transition:none!important}
          .ring,.tiltring{display:none}
        }
      `}</style>

      {/* ---------- left: 3D TXMate scene ---------- */}
      <aside
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className={`relative h-64 shrink-0 overflow-hidden sm:h-72 lg:h-auto lg:min-h-dvh ${loading ? "busy" : ""}`}
      >
        <div aria-hidden="true" className="grid3 pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="blob pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#7d1f2a]/50 blur-3xl" />
        <div aria-hidden="true" className="blob pointer-events-none absolute -bottom-32 right-0 h-72 w-72 rounded-full bg-[#8f4e00]/25 blur-3xl" style={{ animationDelay: "-6s" }} />

        {/* drifting code glyphs */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 overflow-hidden font-mono text-[#f5e6c8]">
          {GLYPHS.map((g) => (
            <span key={g.t} className={`glyph absolute bottom-6 ${g.s}`} style={{ left: g.l, animationDelay: g.d }}>{g.t}</span>
          ))}
        </div>

        <p className="absolute left-6 top-6 hidden font-mono text-xs text-[#8a7f7a] lg:block xl:left-10 xl:top-10">{"// peer academic support"}</p>

        {/* the 3D stage */}
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center lg:-translate-y-10">
          <div className="scene scale-[.52] sm:scale-[.7] lg:scale-[.62] xl:scale-90 2xl:scale-100">
            <div ref={sceneRef} className="pointer p3d relative">
              <div className="enter p3d">
                <div className="sway p3d relative">
                  <Logo3D />
                  <Orbit />
                </div>
              </div>
            </div>
            <div className="floor pointer-events-none absolute left-1/2 top-full mt-10 h-6 w-72 -translate-x-1/2 rounded-[50%] bg-black/60 blur-xl" />
          </div>
        </div>

        {/* live terminal (desktop) */}
        <div className="absolute inset-x-6 bottom-6 hidden lg:block xl:inset-x-10 xl:bottom-10">
          <div className="max-w-md overflow-hidden rounded-xl bg-[#120e0c]/90 font-mono text-[13px] shadow-2xl ring-1 ring-white/10 backdrop-blur">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
              <i className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><i className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><i className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[11px] text-[#8a7f7a]">~/txmate: login</span>
            </div>
            <div className="min-h-[7.5rem] space-y-1.5 p-4" aria-hidden="true">
              {termLines.map((l, i) => (
                <p key={l.key} className={`tline ${l.tone}`}>
                  {i === 0 && <span className="mr-2 text-emerald-400">$</span>}
                  {l.text}
                </p>
              ))}
              <p><span className="caret" /></p>
            </div>
          </div>
        </div>
      </aside>

      {/* ---------- right: form ---------- */}
      <section className="relative z-10 -mt-7 flex flex-1 flex-col justify-center rounded-t-[28px] bg-[#faf9f6] px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-16 lg:mt-0 lg:rounded-none lg:px-12 lg:pt-8">
        <Link
          href="/"
          aria-label="Back to home page"
          title="Home"
          className="rise absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-[#7d1f2a]/30 hover:text-[#7d1f2a] active:scale-95 focus-visible:outline-2 focus-visible:outline-[#7d1f2a] lg:left-8 lg:top-8"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
          </svg>
        </Link>

        <div className="mx-auto w-full max-w-md">
          <div className="rise" style={{ "--i": 1 } as React.CSSProperties}>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#282321]">Welcome back</h1>
            <p className="mt-1.5 text-sm text-gray-600">Sign in to find your Academic Mate, or pick up where you left off.</p>
          </div>

          <div className={`mt-7 sm:rounded-3xl sm:border sm:border-gray-200/80 sm:bg-white sm:p-8 sm:shadow-xl sm:shadow-gray-200/50 ${shake ? "shake" : ""}`}>
            <form method = "post" onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Email */}
              <div className="rise" style={{ "--i": 2 } as React.CSSProperties}>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-800">Email address</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    required
                    autoComplete="email"
                    disabled={loading}
                    className={`${inputBase} pl-10 pr-4`}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="rise" style={{ "--i": 3 } as React.CSSProperties}>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-800">Password</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    disabled={loading}
                    className={`${inputBase} pl-10 pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-400 hover:text-gray-600 focus-visible:text-[#4d0014] focus-visible:outline-none"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" /></svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div role="alert" className="tline flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
                  <svg className="h-5 w-5 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <div className="rise" style={{ "--i": 4 } as React.CSSProperties}>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#4d0014] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-[#4d0014]/15 transition duration-150 hover:bg-[#6b1728] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#6b1728]/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {!loading && <span aria-hidden="true" className="btnshine" />}
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="rise mt-6 border-t border-gray-100 pt-6 text-center text-sm text-gray-600" style={{ "--i": 5 } as React.CSSProperties}>
              Don&apos;t have an account?{" "}
              <Link className="font-semibold text-[#4d0014] underline-offset-2 transition hover:text-[#8f4e00] hover:underline" href="/register">
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}