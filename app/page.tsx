"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* ---------- hooks ---------- */

function useInView() {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

function useTyper(text: string, speed = 45, hold = 2600) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    const tick = (i: number) => {
      setN(i);
      t = setTimeout(() => tick(i < text.length ? i + 1 : 0), i < text.length ? speed : hold);
    };
    t = setTimeout(() => tick(0), 400);
    return () => clearTimeout(t);
  }, [text, speed, hold]);
  return text.slice(0, n);
}

/* ---------- small building blocks ---------- */

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useInView();
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`rv ${seen ? "in" : ""} ${className}`}>
      {children}
    </div>
  );
}

function Count({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const [ref, seen] = useInView();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min((now - start) / 1600, 1);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, to]);
  return (
    <span ref={ref}>
      {prefix}
      {v.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

const KEYWORDS = /^(def|while|return|print|SELECT|FROM|WHERE|AVG|if|else)$/;
function Code({ code }: { code: string }) {
  const parts = code.split(/(\b(?:def|while|return|print|SELECT|FROM|WHERE|AVG|if|else)\b|#.*$|\d+)/gm);
  return (
    <>
      {parts.map((p, i) =>
        KEYWORDS.test(p) ? <span key={i} className="text-[#f5b324]">{p}</span>
        : p.startsWith("#") ? <span key={i} className="text-[#8a7f7a]">{p}</span>
        : /^\d+$/.test(p) ? <span key={i} className="text-[#ff8f9c]">{p}</span>
        : <span key={i}>{p}</span>
      )}
    </>
  );
}

function CodeWindow({ code, output, className = "" }: { code: string; output?: string; className?: string }) {
  const typed = useTyper(code);
  return (
    <div className={`overflow-hidden rounded-xl bg-[#282321] font-mono text-[11px] leading-5 text-[#e9e2dc] shadow-xl ring-1 ring-black/10 ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <i className="h-2 w-2 rounded-full bg-[#ff5f57]" /><i className="h-2 w-2 rounded-full bg-[#febc2e]" /><i className="h-2 w-2 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[10px] text-[#8a7f7a]">session.py</span>
      </div>
      <pre className="min-h-[7.5rem] whitespace-pre-wrap px-3 py-2.5">
        <Code code={typed} />
        <span className="caret" />
        {output && typed.length === code.length && <span className="mt-1 block text-emerald-400">▶ {output}</span>}
      </pre>
    </div>
  );
}

const pdf = (z: number) => Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
const cdf = (z: number) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const p = pdf(z) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};
const NX = (z: number) => 120 + z * 28;
const NY = (z: number) => 100 - pdf(z) * 220;
const ZS = Array.from({ length: 81 }, (_, i) => -4 + i * 0.1);

function NormalCurve() {
  const [ref, seen] = useInView();
  const [z, setZ] = useState(1);
  useEffect(() => {
    if (!seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      setZ(2.7 * Math.sin((now - t0) / 1500));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen]);
  const pt = (p: number) => `${NX(p).toFixed(1)} ${NY(p).toFixed(1)}`;
  const curve = ZS.map((p, i) => `${i ? "L" : "M"}${pt(p)}`).join(" ");
  const area = `M${NX(-4)} 100 ${ZS.filter((p) => p <= z).map((p) => `L${pt(p)}`).join(" ")} L${pt(z)} L${NX(z).toFixed(1)} 100Z`;
  return (
    <div ref={ref}>
      <svg viewBox="0 0 240 122" className="h-40 w-full" fill="none">
        <path d={area} fill="#7d1f2a" opacity=".22" />
        <path d={curve} stroke="#7d1f2a" strokeWidth="2" strokeLinecap="round" />
        <line x1="4" x2="236" y1="100" y2="100" stroke="#d8cec5" />
        {[-3, -2, -1, 0, 1, 2, 3].map((k) => (
          <g key={k}>
            <line x1={NX(k)} x2={NX(k)} y1="100" y2="103" stroke="#b9aea6" />
            <text x={NX(k)} y="113" textAnchor="middle" fontSize="8" fill="#8a7f7a">{k}</text>
          </g>
        ))}
        <line x1={NX(z)} x2={NX(z)} y1={NY(z)} y2="100" stroke="#f5b324" strokeWidth="1.5" strokeDasharray="3 2" />
        <circle cx={NX(z)} cy={NY(z)} r="4.5" fill="#f5b324" stroke="#fff" strokeWidth="1.5" />
      </svg>
      <div className="mt-1 flex items-center justify-between font-mono text-xs tabular-nums text-[#4b423e]">
        <span>z = {z.toFixed(2)}</span>
        <span>P(Z ≤ z) = <b className="text-[#7d1f2a]">{cdf(z).toFixed(3)}</b></span>
        <span className="text-[#8a7f7a]">μ = 0 · σ = 1</span>
      </div>
    </div>
  );
}

const CY = [30, 75, 120] as const;
const FWD = (y: number) => `M36 ${y} L112 75 L188 75 L262 75 L338 75`;
const BACK = (y: number) => `M338 75 L262 75 L188 75 L112 75 L36 ${y}`;
function Packet({ path, begin, color }: { path: string; begin: number; color: string }) {
  return (
    <rect x="-4" y="-2.5" width="8" height="5" rx="1.5" fill={color} opacity="0">
      <animateMotion dur="3.6s" begin={`${begin}s`} repeatCount="indefinite" path={path} />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.92;1" dur="3.6s" begin={`${begin}s`} repeatCount="indefinite" />
    </rect>
  );
}
function Led({ x, y, d = 0 }: { x: number; y: number; d?: number }) {
  return <circle cx={x} cy={y} r="1.3" fill="#28c840" className="led" style={{ animationDelay: `${d}s` }} />;
}
function Network({ className = "" }: { className?: string }) {
  const st = { fill: "#fff", stroke: "#7d1f2a", strokeWidth: 1.4 } as const;
  const links = [...CY.map((y) => `M36 ${y} L112 75`), "M112 75 L188 75", "M188 75 L262 75", "M262 75 L338 75"];
  return (
    <div>
      <svg viewBox="0 0 360 150" className={className} fill="none">
        {links.map((d) => <path key={d} d={d} stroke="#d8cec5" strokeWidth="1.6" strokeDasharray="3 3" className="dash" />)}
        {CY.map((y, i) => (
          <g key={y}>
            <rect x="26" y={y - 7} width="20" height="13" rx="2" {...st} />
            <rect x="22" y={y + 7} width="28" height="2.5" rx="1" fill="#7d1f2a" />
            <Led x={36} y={y - 1} d={i * 0.4} />
          </g>
        ))}
        <rect x="96" y="68" width="32" height="14" rx="3" {...st} />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={101 + i * 6.5} y="74" width="4" height="4" rx=".6" fill="#f3ece7" stroke="#7d1f2a" strokeWidth=".6" />)}
        {[0, 1, 2, 3].map((i) => <Led key={i} x={103 + i * 6.5} y={71} d={i * 0.3} />)}
        <rect x="174" y="69" width="28" height="12" rx="3" {...st} />
        <path d="M180 69 L177 59 M196 69 L199 59" stroke="#7d1f2a" strokeWidth="1.4" strokeLinecap="round" />
        <Led x={181} y={75} /><Led x={186} y={75} d={0.5} />
        <path d="M248 83h28a9 9 0 0 0 1-18 11 11 0 0 0-21-3 9.5 9.5 0 0 0-8 21z" fill="#f3ece7" stroke="#7d1f2a" strokeWidth="1.4" />
        {[60, 70, 80].map((y) => (
          <g key={y}>
            <rect x="326" y={y - 3} width="24" height="8" rx="1.8" {...st} />
            <Led x={331} y={y + 1} d={y / 100} />
          </g>
        ))}
        {CY.map((y, i) => (
          <g key={y}>
            <Packet path={FWD(y)} begin={i * 1.2} color="#f5b324" />
            <Packet path={BACK(y)} begin={i * 1.2 + 1.8} color="#7d1f2a" />
          </g>
        ))}
        <g fontSize="8" fill="#8a7f7a" textAnchor="middle">
          <text x="36" y="144">Clients</text><text x="112" y="100">Switch</text><text x="188" y="100">Router</text>
          <text x="262" y="100">Internet</text><text x="338" y="100">Server</text>
        </g>
      </svg>
      <div className="mt-1 flex justify-center gap-5 text-[11px] text-[#6d6260]">
        <span className="flex items-center gap-1.5"><i className="h-2 w-3 rounded-sm bg-[#f5b324]" />Request</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-3 rounded-sm bg-[#7d1f2a]" />Response</span>
      </div>
    </div>
  );
}

function Ledger() {
  const rows: [string, string, string][] = [["Cash", "4,500", ""], ["Service revenue", "", "4,500"], ["Equipment", "1,200", ""], ["Accounts payable", "", "1,200"]];
  return (
    <div className="text-xs">
      <div className="grid grid-cols-[1fr_4.5rem_4.5rem] border-b border-[#efe8e1] pb-1.5 font-semibold uppercase tracking-wider text-[10px] text-[#8a7f7a]">
        <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
      </div>
      {rows.map(([a, d, c], i) => (
        <div key={a} className="row grid grid-cols-[1fr_4.5rem_4.5rem] border-b border-[#f3ece7] py-1.5 tabular-nums" style={{ transitionDelay: `${i * 140}ms` }}>
          <span>{a}</span><span className="text-right">{d}</span><span className="text-right">{c}</span>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_4.5rem_4.5rem] pt-2 font-bold tabular-nums">
        <span className="flex items-center gap-1.5">Totals <em className="not-italic rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Balanced ✓</em></span>
        <span className="text-right"><Count to={5700} /></span><span className="text-right"><Count to={5700} /></span>
      </div>
    </div>
  );
}

function Tilt({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 7}deg) rotateY(${(x - 0.5) * 9}deg) translateY(-4px)`;
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <div ref={ref} onMouseMove={move} onMouseLeave={leave} className="tilt rounded-xl">
      {children}
    </div>
  );
}

function Tick() {
  return (
    <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="tickp" />
    </svg>
  );
}

/* ---------- content ---------- */

const STEPS = [
  { n: "01", title: "Find your Academic Mate", body: "Search verified students from your own university and filter by the course you need." },
  { n: "02", title: "Send a request", body: "Describe the topics you're stuck on and share when you're free." },
  { n: "03", title: "Study together", body: "Study with someone who has already taken the course, then repeat whenever you need." },
];
const FEATURES = [
  ["Verified students", "Every Academic Mate is verified, so you know who you're learning from."],
  ["Matched to your courses", "Results follow your programme, year and semester."],
  ["You control your privacy", "Choose who sees your profile, student ID and phone number."],
  ["Your campus, together", "Built around your university, school and programme."],
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f9f8f6] text-[#282321]">
      <style>{`
        .rv{opacity:0;transform:translateY(28px);transition:opacity .8s cubic-bezier(.2,.8,.2,1),transform .8s cubic-bezier(.2,.8,.2,1)}
        .rv.in{opacity:1;transform:none}
        .rv:not(.in) *{animation-play-state:paused}
        @keyframes drift{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,-24px)}}
        @keyframes draw{0%{stroke-dashoffset:1}55%,100%{stroke-dashoffset:0}}
        @keyframes fade{0%,20%{opacity:0}60%,100%{opacity:1}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
        @keyframes ring{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.6);opacity:0}}
        @keyframes dash{to{stroke-dashoffset:-12}}
        @keyframes blink{50%{opacity:0}}
        @keyframes led{0%,100%{opacity:.25}50%{opacity:1}}
        .led{animation:led 1.4s ease-in-out infinite}
        .blob{animation:drift 14s ease-in-out infinite}
        .draw{stroke-dasharray:1;animation:draw 5s ease-in-out infinite}
        .fade{animation:fade 5s ease-in-out infinite}
        .pulse,.ring{transform-box:fill-box;transform-origin:center;animation:pulse 2.4s ease-in-out infinite}
        .ring{animation:ring 2.4s ease-out infinite}
        .dash{animation:dash 1.2s linear infinite}
        .caret{display:inline-block;width:6px;height:12px;margin-left:1px;vertical-align:-2px;background:#f5b324;animation:blink 1s step-end infinite}
        .bar{transform-box:fill-box;transform-origin:bottom;transform:scaleY(0);transition:transform .9s cubic-bezier(.2,.8,.2,1)}
        .rv.in .bar{transform:scaleY(1)}
        .row{opacity:0;transform:translateX(-12px);transition:.6s ease}
        .rv.in .row{opacity:1;transform:none}
        @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes shine{0%,55%{transform:translateX(-120%) skewX(-18deg)}100%{transform:translateX(320%) skewX(-18deg)}}
        @keyframes halo{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.7);opacity:0}}
        @keyframes tick{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
        @keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(125,31,42,.35)}50%{box-shadow:0 0 0 6px rgba(125,31,42,0)}}
        .mcard .st{opacity:0;animation:rise .6s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:calc(var(--i) * 90ms + 350ms)}
        .shine{position:absolute;top:0;bottom:0;left:0;width:40%;background:linear-gradient(90deg,transparent,rgba(245,179,36,.16),transparent);animation:shine 6s ease-in-out infinite;pointer-events:none}
        .halo{position:absolute;inset:0;border-radius:9999px;border:2px solid #7d1f2a;animation:halo 2.4s ease-out infinite}
        .tickp{stroke-dasharray:1;animation:tick .7s ease .9s both}
        .reqbtn{animation:glow 2.6s ease-in-out infinite;transition:transform .2s}
        .mcard:hover .reqbtn{transform:translateX(2px)}
        @keyframes gshift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes avail{0%{box-shadow:0 0 0 0 rgba(16,185,129,.55)}100%{box-shadow:0 0 0 7px rgba(16,185,129,0)}}
        .gborder{background:linear-gradient(120deg,#7d1f2a,#f5b324,#7d1f2a,#e4dbd3);background-size:300% 300%;animation:gshift 7s ease infinite}
        .tilt{transition:transform .25s ease-out;will-change:transform}
        .spot{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .3s;background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%),rgba(245,179,36,.16),transparent 70%)}
        .tilt:hover .spot{opacity:1}
        .avail{display:inline-block;width:7px;height:7px;border-radius:9999px;background:#10b981;animation:avail 1.8s ease-out infinite}
        .arrow{display:inline-block;transition:transform .2s}
        .tilt:hover .arrow{transform:translateX(3px)}
        .tl{opacity:0;transform:translateX(-10px);transition:opacity .5s ease,transform .5s ease}
        .rv.in .tl{opacity:1;transform:none}
        .termgrid{background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:32px 32px;-webkit-mask-image:radial-gradient(ellipse 80% 70% at 70% 40%,#000,transparent);mask-image:radial-gradient(ellipse 80% 70% at 70% 40%,#000,transparent)}
        @media (prefers-reduced-motion:reduce){.tl{opacity:1;transform:none}}
        @media (prefers-reduced-motion:reduce){.mcard .st{opacity:1}.tickp{stroke-dashoffset:0}}
        @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rv{opacity:1;transform:none}.bar{transform:none}.row{opacity:1;transform:none}.draw{stroke-dashoffset:0}}
      `}</style>

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-[#efe8e1]/80 bg-[#f9f8f6]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="text-xl font-extrabold tracking-tight">TX<span className="text-[#7d1f2a]">Mate</span></Link>
          <nav className="flex items-center gap-3 text-sm font-semibold">
            <a href="#about" className="rounded-full px-4 py-2 text-[#6d6260] hover:text-[#282321]">About</a>
            <Link href="/register" className="rounded-full bg-[#7d1f2a] px-5 py-2 text-white shadow-sm transition hover:bg-[#651922]">Get started</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-2 lg:pt-24">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
            Academic help from students who have taken your courses.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-[#6b625d]">
            TXMate connects you with verified Academic Mates at your university, so help with the courses you&apos;re struggling in is always one request away.
          </p>
        </div>

        <Reveal>
          <Tilt>
          <div className="gborder rounded-xl p-px shadow-xl shadow-[#7d1f2a]/10">
          <article className="mcard relative overflow-hidden rounded-[11px] bg-white px-4 py-5 sm:px-5">
            <span aria-hidden="true" className="spot" />
            <span aria-hidden="true" className="shine" />
            <div className="flex items-start gap-3">
              <div aria-hidden="true" className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8e2431] to-[#4a1119] text-xs font-semibold text-white shadow-md"><span className="halo" />SM</div>
              <div className="min-w-0 flex-1">
                <div className="st flex items-start justify-between gap-3" style={{ "--i": 0 } as React.CSSProperties}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <h2 className="text-sm font-semibold">Shekinah B Mulenga</h2>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"><Tick /> Verified</span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] font-medium leading-5 text-[#7d1f2a]">
                      Computer Networks | Statistical Modelling
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold tabular-nums text-[#7d1f2a]">K 150</p>
                    <p className="mt-0.5 text-[11px] text-[#8a7f7a]">per session</p>
                  </div>
                </div>
                <p className="st mt-2 text-[13px] leading-5" style={{ "--i": 1 } as React.CSSProperties}><span className="rounded bg-[#f3ece7] px-1.5 py-0.5 font-semibold text-[#7d1f2a]">CS 250</span><span className="text-[#6d6260]"> · Data Structures &amp; Algorithms</span></p>
                <p className="st mt-1 text-sm leading-5 text-[#4b423e]" style={{ "--i": 2 } as React.CSSProperties}>Lets cover lists, stacks, queues, trees, graphs, sorting and algorithm analysis</p>
                <div className="st mt-1.5 flex flex-wrap items-center gap-x-3 text-xs leading-5 text-[#6d6260]" style={{ "--i": 3 } as React.CSSProperties}>
                  <span>1 hour session</span><span aria-hidden="true" className="h-3 w-px bg-[#e4dbd3]" /><span>2 years experience</span><span aria-hidden="true" className="h-3 w-px bg-[#e4dbd3]" />
                </div>
                <div className="st mt-3 flex items-center justify-between" style={{ "--i": 4 } as React.CSSProperties}>
                  <span className="text-xs font-semibold text-[#7d1f2a]">Details</span>
                  <span className="reqbtn inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#7d1f2a] to-[#a52a3a] px-4 text-[13px] font-semibold text-white shadow-md shadow-[#7d1f2a]/30">Request</span>
                </div>
              </div>
            </div>
          </article>
          </div>
          </Tilt>
        </Reveal>
      </section>

      {/* Subject showcase */}
      <section id="subjects" className="mx-auto max-w-6xl px-5 py-12">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Support across your core courses</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[#6d6260]">Find an Academic Mate who has already completed the course you&apos;re taking.</p>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h3 className="font-bold">Programming</h3>
              <p className="mb-4 mt-1 text-sm text-[#6d6260]">Get guidance on code, algorithms and projects.</p>
              <CodeWindow code={"def mean(xs):\n  return sum(xs) / len(xs)\n\ngrades = [72, 85, 91, 68]\nprint(mean(grades))"} output="79.0" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h3 className="font-bold">Statistics</h3>
              <p className="mb-4 mt-1 text-sm text-[#6d6260]">Z-scores, the normal distribution and probability.</p>
              <NormalCurve />
            </div>
          </Reveal>
          <Reveal>
            <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h3 className="font-bold">Accounting</h3>
              <p className="mb-4 mt-1 text-sm text-[#6d6260]">Journals, ledgers and trial balances.</p>
              <Ledger />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h3 className="font-bold">Networks</h3>
              <p className="mb-4 mt-1 text-sm text-[#6d6260]">Topologies, protocols and data transmission.</p>
              <Network className="mx-auto h-44 w-full" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section id="about" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal><h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">How TXMate works</h2></Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 130}>
              <div className="h-full rounded-2xl bg-white p-7 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-md">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3ece7] text-sm font-extrabold text-[#7d1f2a]">{s.n}</span>
                <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#6b625d]">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-[#1b1613] p-6 text-white sm:p-12">
            <div aria-hidden="true" className="termgrid pointer-events-none absolute inset-0" />
            <div aria-hidden="true" className="blob pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#7d1f2a]/50 blur-3xl" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <p className="font-mono text-xs text-[#f5b324]">{"// why txmate"}</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Built for students, by design.</h2>
                <p className="mt-4 text-[#cfc6bf]">Whether you need help or want to give it, TXMate keeps it trusted, relevant and private.</p>
                <Link href="/register" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#f5b324] px-5 py-3 font-mono text-sm font-bold text-[#1b1613] transition hover:bg-[#ffc94d]">
                  <span aria-hidden="true">$</span> Become an Academic Mate
                </Link>
              </div>

              <div className="overflow-hidden rounded-xl bg-[#120e0c] font-mono text-[13px] shadow-2xl ring-1 ring-white/10">
                <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
                  <i className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><i className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><i className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  <span className="ml-3 text-[11px] text-[#8a7f7a]">~/txmate: check</span>
                </div>
                <div className="space-y-3.5 p-5">
                  <p><span className="text-emerald-400">$</span> txmate check<span className="caret" /></p>
                  {FEATURES.map(([t, b], i) => (
                    <div key={t} className="tl flex gap-3" style={{ transitionDelay: `${500 + i * 350}ms` }}>
                      <span className="text-emerald-400">✓</span>
                      <div>
                        <p className="font-semibold text-[#f5e6c8]">{t}</p>
                        <p className="mt-0.5 leading-5 text-[#a89d96]">{b}</p>
                      </div>
                    </div>
                  ))}
                  <p className="tl border-t border-white/10 pt-3 text-[#8a7f7a]" style={{ transitionDelay: "2000ms" }}>
                    <span className="font-semibold text-emerald-400">{FEATURES.length} passed</span> · 0 failed
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-5 py-20 text-center">
        <Reveal>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to find your Academic Mate?</h2>
          <p className="mt-3 text-[#6b625d]">Join TXMate and find your Academic Mate today.</p>
          <Link href="/register" className="mt-8 inline-block rounded-full bg-[#7d1f2a] px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#7d1f2a]/25 transition hover:-translate-y-0.5 hover:bg-[#651922]">Create your account</Link>
        </Reveal>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 border-t border-[#f0ebe5] px-5 py-8 text-xs text-[#8a7f7a]">
        <span suppressHydrationWarning>© {new Date().getFullYear()} TXMate</span><span>Peer academic support for university students</span>
      </footer>
    </div>
  );
}