import { useLocation } from "wouter";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  Layers,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Phone,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BRAND,
  FOOTER,
  FOUNDER_QUOTES,
  HOMEPAGE_GOVERNANCE,
  STATS,
  TAGLINE,
} from "@shared/brand-messaging";

const iconMap: Record<string, LucideIcon> = {
  BrainCircuit,
  ClipboardCheck,
  Layers,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Phone,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wand2,
};

const toneStyles = {
  amber: "border-amber-200/60 bg-amber-50 text-amber-950",
  blue: "border-sky-200/60 bg-sky-50 text-sky-950",
  cyan: "border-cyan-200/60 bg-cyan-50 text-cyan-950",
  emerald: "border-emerald-200/60 bg-emerald-50 text-emerald-950",
  indigo: "border-indigo-200/60 bg-indigo-50 text-indigo-950",
  rose: "border-rose-200/60 bg-rose-50 text-rose-950",
  slate: "border-slate-200/60 bg-slate-100 text-slate-950",
  teal: "border-teal-200/60 bg-teal-50 text-teal-950",
} as const;

function getIcon(iconName: string): LucideIcon {
  return iconMap[iconName] || Sparkles;
}

function SectionBadge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Badge className={`rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] ${className}`}>
      {children}
    </Badge>
  );
}

function RuntimeVisual() {
  const orbitStates = [
    {
      id: "research",
      eyebrow: "State 01",
      title: "Research",
      detail: "Account context.",
      iconName: "BrainCircuit",
      positionClass: "left-[6px] top-[56px] sm:left-[24px] sm:top-[112px]",
      animation: { x: [0, -4, 0, -2, 0], y: [0, -8, 0, 5, 0] },
    },
    {
      id: "generate",
      eyebrow: "State 02",
      title: "Generate",
      detail: "Assets in flow.",
      iconName: "Wand2",
      positionClass: "right-[6px] top-[56px] sm:right-[24px] sm:top-[120px]",
      animation: { x: [0, 5, 0, 3, 0], y: [0, 6, 0, -7, 0] },
    },
    {
      id: "preview",
      eyebrow: "State 03",
      title: "Preview",
      detail: "Safe simulation.",
      iconName: "Play",
      positionClass: "right-[6px] bottom-[18px] sm:right-[22px] sm:bottom-[54px]",
      animation: { x: [0, 5, 0, 3, 0], y: [0, 7, 0, -5, 0] },
    },
    {
      id: "govern",
      eyebrow: "State 04",
      title: "Govern",
      detail: "QA attached.",
      iconName: "ClipboardCheck",
      positionClass: "left-[6px] bottom-[18px] sm:left-[22px] sm:bottom-[62px]",
      animation: { x: [0, -5, 0, -3, 0], y: [0, -6, 0, 8, 0] },
    },
  ];

  return (
    <div className="relative mx-auto h-[560px] w-full max-w-[640px] overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.18),transparent_34%),linear-gradient(160deg,#06171d_0%,#0a2730_45%,#071118_100%)] shadow-[0_32px_120px_-48px_rgba(6,182,212,0.65)]">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:58px_58px] opacity-20" />
      <div className="absolute left-8 right-8 top-8 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">
          {HOMEPAGE_GOVERNANCE.releaseLabel} - v{HOMEPAGE_GOVERNANCE.version}
        </p>
        <p className="m-0 mt-2 text-sm font-semibold text-white">Shared context before execution</p>
      </div>

      <div className="absolute left-1/2 top-[52%] h-[344px] w-[344px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10 sm:h-[420px] sm:w-[420px]" />
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 34, repeat: Infinity, ease: "linear" }}
        className="absolute left-1/2 top-[52%] h-[292px] w-[292px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-cyan-200/15 sm:h-[360px] sm:w-[360px]"
      />
      <div className="absolute left-1/2 top-[52%] h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/10 sm:h-[268px] sm:w-[268px]" />

      <div className="absolute left-1/2 top-[52%] z-20 w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-white/15 bg-white/[0.08] px-4 py-4 text-center backdrop-blur-xl sm:w-[212px] sm:px-5 sm:py-5">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-100 sm:h-11 sm:w-11">
          <BrainCircuit className="h-5 w-5" />
        </div>
        <p className="m-0 mt-3 font-mono text-[9px] uppercase tracking-[0.22em] text-slate-300 sm:mt-4 sm:text-[10px]">Shared reasoning</p>
        <h3 className="m-0 mt-2 text-base font-semibold leading-tight text-white sm:text-[1.35rem]">Launch state</h3>
        <p className="m-0 mt-2 text-[10px] leading-4 text-slate-200/76 sm:mt-3 sm:text-[11px] sm:leading-5">
          Context, policy, and preview stay attached.
        </p>
        <div className="mt-3 rounded-full border border-white/10 bg-black/10 px-3 py-1.5 sm:mt-4">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-300 sm:text-[10px]">Previewed + governed</p>
        </div>
      </div>

      {orbitStates.map((state) => {
        const Icon = getIcon(state.iconName);

        return (
          <motion.div
            key={state.id}
            animate={state.animation}
            transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut", repeatType: "mirror" }}
            className={`absolute z-10 ${state.positionClass}`}
          >
            <div className="w-[96px] rounded-[24px] border border-white/10 bg-white/[0.06] px-3 py-3 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.8)] backdrop-blur-xl sm:w-[138px] sm:px-4 sm:py-4">
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-2xl bg-white/10 text-white sm:mb-3 sm:h-9 sm:w-9">
                <Icon className="h-4 w-4" />
              </div>
              <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-100/60 sm:text-[10px]">{state.eyebrow}</p>
              <p className="m-0 mt-1.5 text-xs font-semibold leading-4 text-white sm:mt-2 sm:text-sm sm:leading-5">{state.title}</p>
              <p className="m-0 mt-1 text-[10px] leading-4 text-slate-200/72 sm:mt-1.5 sm:text-[11px]">{state.detail}</p>
            </div>
          </motion.div>
        );
      })}

      <div className="absolute inset-x-0 bottom-6 px-6 sm:bottom-8 sm:px-8">
        <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 backdrop-blur-md">
          <p className="m-0 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100/60">Managed through content governance</p>
          <p className="m-0 mt-1 text-xs text-slate-200/72 sm:text-sm">Four states stay in sync around one launch decision instead of colliding into a dashboard pile.</p>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [, setLocation] = useLocation();

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#f5fbfb] text-slate-950" itemScope itemType="https://schema.org/WebPage">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#04131a]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-300/10 text-white">
              <span className="font-display text-sm font-bold tracking-tight">{BRAND.company.logoInitials}</span>
            </div>
            <div className="hidden sm:block">
              <p className="font-display text-lg font-semibold text-white">{BRAND.company.parentBrand}</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/70">{BRAND.company.productName}</p>
            </div>
          </a>

          <div className="hidden items-center gap-7 lg:flex">
            {HOMEPAGE_GOVERNANCE.navigation.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => scrollToSection(item.href.replace("#", ""))}
                className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
              >
                {item.label}
              </button>
            ))}
            <a href="/resources-centre" className="text-sm font-medium text-slate-300 transition-colors hover:text-white">
              Resources
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setLocation("/client-portal/login")} className="hidden text-slate-200 hover:bg-white/10 hover:text-white sm:inline-flex">
              Client Login
            </Button>
            <Button onClick={() => setLocation("/book/admin/demo")} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              {HOMEPAGE_GOVERNANCE.hero.primaryCta}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <main>
        <section id="story" className="relative overflow-hidden bg-[#04131a] pb-24 pt-40 text-white md:pt-44">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_85%_15%,rgba(45,212,191,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.12),transparent_24%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: "easeOut" }} className="max-w-3xl">
              <SectionBadge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                {HOMEPAGE_GOVERNANCE.hero.badge} - v{HOMEPAGE_GOVERNANCE.version}
              </SectionBadge>
              <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-100/75">{HOMEPAGE_GOVERNANCE.hero.eyebrow}</p>
              <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-white md:text-6xl lg:text-[5.5rem]">
                {HOMEPAGE_GOVERNANCE.hero.headline}
              </h1>
              <p className="mt-5 font-display text-2xl font-medium tracking-[-0.03em] text-cyan-100 md:text-3xl">
                {HOMEPAGE_GOVERNANCE.hero.subHeadline}
              </p>
              <p className="mt-8 text-lg leading-8 text-slate-200/88">{HOMEPAGE_GOVERNANCE.hero.summary}</p>
              <div className="mt-8 grid gap-3">
                {HOMEPAGE_GOVERNANCE.hero.bullets.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                    <span className="text-sm leading-6 text-slate-100/88">{bullet}</span>
                  </div>
                ))}
              </div>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Button size="lg" onClick={() => setLocation("/book/admin/demo")} className="h-14 bg-cyan-400 px-8 text-base text-slate-950 hover:bg-cyan-300">
                  {HOMEPAGE_GOVERNANCE.hero.primaryCta}
                  <ArrowRight className="h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => scrollToSection("platform")} className="h-14 border-white/15 bg-white/5 px-8 text-base text-white hover:bg-white/10">
                  <Play className="h-5 w-5" />
                  {HOMEPAGE_GOVERNANCE.hero.secondaryCta}
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200">
                  {TAGLINE.primary}
                </Badge>
                <Badge className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-100">
                  {HOMEPAGE_GOVERNANCE.hero.supportingLabel}
                </Badge>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.12, ease: "easeOut" }} className="pt-4 lg:pt-0">
              <RuntimeVisual />
            </motion.div>
          </div>

          <div className="border-t border-white/10 bg-black/15">
            <div className="mx-auto grid max-w-7xl gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4">
              {HOMEPAGE_GOVERNANCE.proofBar.map((item) => (
                <div key={item.label} className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-md">
                  <p className="font-display text-3xl font-semibold tracking-[-0.03em] text-white">{item.value}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24">
          <div className="mx-auto max-w-7xl">
            <SectionBadge className="border-slate-200 bg-white text-slate-700">Platform Story</SectionBadge>
            <h2 className="mt-5 max-w-4xl font-display text-4xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
              The old stack creates activity. It does not create shared judgment.
            </h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
              The newest version of the platform is built to replace fragmented execution, generic outreach,
              and unguided AI with one reasoning-first, auditable operating model.
            </p>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {HOMEPAGE_GOVERNANCE.stackFrictions.map((item) => {
                const Icon = getIcon(item.iconName);

                return (
                  <div key={item.title} className="h-full rounded-xl border border-slate-200 bg-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.25)]">
                    <div className="p-7">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-600">
                          {item.stat}
                        </div>
                      </div>
                      <h3 className="mt-6 font-display text-2xl font-semibold tracking-[-0.03em] text-slate-950">{item.title}</h3>
                      <p className="mt-4 text-base leading-7 text-slate-600">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="platform" className="bg-white px-6 py-24">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <SectionBadge className="border-cyan-200 bg-cyan-50 text-cyan-900">Orchestration Flow</SectionBadge>
                <h2 className="mt-5 font-display text-4xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
                  The platform behaves like an operating system, not a tool bundle.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-600">
                  Intelligence comes first, creation follows context, simulation happens before launch, and governance stays visible the entire way through.
                </p>

                <div className="mt-10 space-y-4">
                  {HOMEPAGE_GOVERNANCE.orchestrationFlow.map((item) => (
                    <div key={item.step} className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 font-mono text-xs font-semibold tracking-[0.22em] text-white">
                          {item.step}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {HOMEPAGE_GOVERNANCE.platformModules.map((module) => {
                  const Icon = getIcon(module.iconName);
                  const tone = toneStyles[module.tone as keyof typeof toneStyles];

                  return (
                    <div key={module.name} className="h-full rounded-xl border border-slate-200 bg-white shadow-[0_28px_80px_-56px_rgba(14,116,144,0.32)]">
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tone}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <Badge className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                            {module.category}
                          </Badge>
                        </div>
                        <h3 className="mt-6 font-display text-2xl font-semibold tracking-[-0.03em] text-slate-950">{module.name}</h3>
                        <p className="mt-3 text-sm leading-7 text-slate-600">{module.description}</p>
                        <div className="mt-6 space-y-2">
                          {module.highlights.map((highlight) => (
                            <div key={highlight} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <ChevronRight className="mt-0.5 h-4 w-4 text-cyan-700" />
                              <span className="text-sm text-slate-700">{highlight}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section id="governance" className="relative overflow-hidden bg-[#062029] px-6 py-24 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.14),transparent_35%)]" />
          <div className="relative mx-auto max-w-7xl">
            <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="max-w-3xl">
                <SectionBadge className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
                  {HOMEPAGE_GOVERNANCE.governanceStory.badge}
                </SectionBadge>
                <h2 className="mt-5 font-display text-4xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
                  {HOMEPAGE_GOVERNANCE.governanceStory.title}
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-200/82">{HOMEPAGE_GOVERNANCE.governanceStory.description}</p>
                <div className="mt-8 rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
                  <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-cyan-100/75">Governance controls</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {HOMEPAGE_GOVERNANCE.managedThrough.map((item) => (
                      <Badge key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-100">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {HOMEPAGE_GOVERNANCE.governanceStory.pillars.map((item) => {
                  const Icon = getIcon(item.iconName);

                  return (
                    <div key={item.title} className="h-full rounded-xl border border-white/10 bg-white/5 text-white backdrop-blur-xl">
                      <div className="p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-100">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="mt-6 font-display text-2xl font-semibold tracking-[-0.03em] text-white">{item.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-slate-200/78">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="px-6 py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <SectionBadge className="border-slate-200 bg-white text-slate-700">Our Story</SectionBadge>
              <h2 className="mt-5 font-display text-4xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
                {HOMEPAGE_GOVERNANCE.story.title}
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">{HOMEPAGE_GOVERNANCE.story.body}</p>

              <div className="mt-8 rounded-xl border border-slate-200 bg-white shadow-[0_24px_80px_-52px_rgba(15,23,42,0.24)]">
                <div className="p-7">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-950 text-2xl font-semibold text-white">
                      {BRAND.founder.initials}
                    </div>
                    <div>
                      <p className="font-display text-xl font-semibold text-slate-950">{BRAND.founder.name}</p>
                      <p className="text-sm text-slate-500">{BRAND.founder.title}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Founded in {BRAND.company.foundedLocation}, {BRAND.company.foundedYear}
                      </p>
                    </div>
                  </div>
                  <blockquote className="mt-6 border-l-2 border-cyan-300 pl-5 text-lg leading-8 text-slate-700">
                    {FOUNDER_QUOTES.landing}
                  </blockquote>
                  <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    {[
                      { label: "Years", value: STATS.yearsExperience },
                      { label: "Enterprise clients", value: STATS.enterpriseClients },
                      { label: "Global campaigns", value: STATS.globalCampaigns },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="font-display text-2xl font-semibold tracking-[-0.03em] text-slate-950">{item.value}</p>
                        <p className="mt-1 text-sm text-slate-500">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white shadow-[0_24px_80px_-52px_rgba(15,23,42,0.22)]">
                <div className="p-7">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-900">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-display text-2xl font-semibold tracking-[-0.03em] text-slate-950">Built for operators</p>
                      <p className="text-sm text-slate-500">The teams replacing noise with governed execution.</p>
                    </div>
                  </div>
                  <div className="mt-6 space-y-3">
                    {HOMEPAGE_GOVERNANCE.audiences.map((audience) => (
                      <div key={audience} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-cyan-700" />
                        <span className="text-sm leading-6 text-slate-700">{audience}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-[linear-gradient(145deg,#ecfeff_0%,#f8fafc_100%)] shadow-[0_24px_80px_-52px_rgba(6,182,212,0.25)]">
                <div className="p-7">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-display text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                        Reasoning-first, nothing-forgotten execution
                      </p>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{TAGLINE.corePromise}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[linear-gradient(145deg,#06171d_0%,#0b2a34_52%,#09303b_100%)] px-6 py-24 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.18),transparent_34%)]" />
          <div className="relative mx-auto max-w-5xl text-center">
            <SectionBadge className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100">Final CTA</SectionBadge>
            <h2 className="mt-6 font-display text-4xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
              {HOMEPAGE_GOVERNANCE.cta.title}
            </h2>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-200/82">{HOMEPAGE_GOVERNANCE.cta.description}</p>
            <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
              <Button size="lg" onClick={() => setLocation("/book/admin/demo")} className="h-14 bg-cyan-400 px-8 text-base text-slate-950 hover:bg-cyan-300">
                {HOMEPAGE_GOVERNANCE.cta.primary}
                <ArrowRight className="h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => setLocation("/proposal-request")} className="h-14 border-white/15 bg-white/5 px-8 text-base text-white hover:bg-white/10">
                {HOMEPAGE_GOVERNANCE.cta.secondary}
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#04131a] px-6 py-16 text-white" itemScope itemType="https://schema.org/WPFooter">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <span className="font-display text-sm font-bold tracking-tight">{BRAND.company.logoInitials}</span>
                </div>
                <div>
                  <p className="font-display text-lg font-semibold">{BRAND.company.parentBrand}</p>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{BRAND.company.productName}</p>
                </div>
              </div>
              <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">{TAGLINE.footerTagline}</p>
              <div className="mt-5 space-y-1 text-sm text-slate-500">
                <p className="font-medium text-slate-300">{BRAND.company.legalName}</p>
                <p>{BRAND.company.location}</p>
                <p>{BRAND.company.phone}</p>
                <p>{BRAND.domains.primary}</p>
              </div>
            </div>

            <div>
              <h3 className="font-display text-base font-semibold text-white">Platform</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                {FOOTER.navSections.platform.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>

            <div>
              <h3 className="font-display text-base font-semibold text-white">Services</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                {FOOTER.navSections.services.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>

            <div>
              <h3 className="font-display text-base font-semibold text-white">Resources</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                <li><a href="/resources-centre" className="transition-colors hover:text-white">Resources Center</a></li>
                <li><button type="button" onClick={() => scrollToSection("about")} className="transition-colors hover:text-white">About Us</button></li>
                <li><button type="button" onClick={() => scrollToSection("story")} className="transition-colors hover:text-white">Platform Story</button></li>
              </ul>
            </div>

            <div>
              <h3 className="font-display text-base font-semibold text-white">Get Started</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                <li><a href="/book/admin/demo" className="transition-colors hover:text-white">Schedule a Meeting</a></li>
                <li><a href="/proposal-request" className="transition-colors hover:text-white">Request a Proposal</a></li>
                <li><a href="/contact" className="transition-colors hover:text-white">Contact Us</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
            <p>{FOOTER.copyright}</p>
            <div className="flex gap-6">
              <a href="/privacy" className="transition-colors hover:text-white">Privacy Policy</a>
              <a href="/terms" className="transition-colors hover:text-white">Terms of Service</a>
              <a href="/gdpr" className="transition-colors hover:text-white">GDPR</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
