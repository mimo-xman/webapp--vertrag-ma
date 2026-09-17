"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/language-provider";
import { HomeHeader } from "@/components/home-header";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Send,
  FolderOpen,
  Languages,
  MessageCircle,
  TrendingDown,
  ShieldCheck,
  Building2,
  Lock,
  Banknote,
  ChevronRight,
} from "lucide-react";

export default function HomePage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<{ companies: number; sent: number }>({ companies: 0, sent: 0 });

  useEffect(() => {
    fetch("/api/public/stats")
      .then((r) => r.json())
      .then((d) => setStats({ companies: d.companies || 0, sent: d.sent || 0 }))
      .catch(() => {});
  }, []);

  return (
    <div className="bg-background">
      {/* ── Briefkopf (letterhead nav) ─────────────────────── */}
      <HomeHeader />

      <main className="flex-1">
        {/* ── Hero ───────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-[#d8d5cc]">
          {/* Background grid — graph paper */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "linear-gradient(#d8d5cc 1px, transparent 1px), linear-gradient(90deg, #d8d5cc 1px, transparent 1px)",
              backgroundSize: "36px 36px",
            }}
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
            <div className="fade-up">
              <p className="eyebrow mb-4 border border-[#1e4475]/30 bg-[#1e4475]/5 px-2.5 py-1 inline-block">
                {t("home.heroEyebrow")}
              </p>
              <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                {t("home.heroTitle")}
                <br />
                <span className="text-[#1e4475]">{t("home.heroTitleAccent")}</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t("home.heroSubtitle")}
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-12 px-7 text-base font-semibold">
                  <Link href="/register">
                    {t("home.heroCta")}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base">
                  <a href="#services">{t("home.heroCtaSecondary")}</a>
                </Button>
              </div>
              {/* Live stats */}
              <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
                <div>
                  <dt className="eyebrow">{t("home.heroStat1")}</dt>
                  <dd className="num mt-1 text-2xl font-bold">
                    {stats.companies.toLocaleString("fr-FR")}+
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">{t("home.heroStat2")}</dt>
                  <dd className="num mt-1 text-2xl font-bold">
                    {stats.sent.toLocaleString("fr-FR")}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">{t("home.heroStat3")}</dt>
                  <dd className="num mt-1 text-2xl font-bold">2–3</dd>
                </div>
              </dl>
            </div>

            {/* The Bewerbung document — signature visual */}
            <div className="relative mx-auto w-full max-w-sm fade-up fade-up-delay-2" aria-hidden>
              <div className="relative rotate-[1.5deg] rounded-sm border border-[#c9c6bc] bg-white p-6 shadow-[0_8px_24px_rgba(26,29,33,0.08)]">
                <div className="flex items-start justify-between border-b-2 border-[#1a1d21] pb-3">
                  <div>
                    <p className="font-display text-sm font-extrabold tracking-tight">BEWERBUNG</p>
                    <p className="aktenzeichen mt-0.5">AKTE VT-2026-0042</p>
                  </div>
                  <div className="text-right">
                    <p className="aktenzeichen">DATUM</p>
                    <p className="font-mono text-xs font-semibold">13.02.2026</p>
                  </div>
                </div>
                <div className="space-y-2.5 py-4">
                  <div className="h-2 w-full rounded-full bg-[#e9e6dd]" />
                  <div className="h-2 w-11/12 rounded-full bg-[#e9e6dd]" />
                  <div className="h-2 w-4/5 rounded-full bg-[#e9e6dd]" />
                  <div className="flex gap-2 pt-1">
                    <div className="h-14 flex-1 rounded-sm border border-[#d8d5cc] bg-[#fafaf6]" />
                    <div className="h-14 w-14 rounded-sm border border-[#d8d5cc] bg-[#fafaf6]" />
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#e9e6dd]" />
                  <div className="h-2 w-3/4 rounded-full bg-[#e9e6dd]" />
                </div>
                <div className="flex items-center justify-between border-t border-[#d8d5cc] pt-3">
                  <p className="aktenzeichen">ANLAGE: DOSSIER.PDF</p>
                  <div className="flex h-6 w-8 items-center justify-center rounded-[2px] border border-[#1e4475]/40 bg-[#1e4475]/10">
                    <Send className="h-3 w-3 text-[#1e4475]" />
                  </div>
                </div>

                {/* Stamps — positioned outside card boundaries */}
                <div className="stamp stamp-green stamp-anim absolute -right-4 top-12 !text-[10px] sm:!text-xs">
                  GEPRÜFT ✓
                </div>
                <div
                  className="stamp stamp-blue stamp-anim absolute -left-6 bottom-12 !text-[10px] sm:!text-xs"
                  style={{ animationDelay: "0.25s" }}
                >
                  500 / TAG
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Services ──────────────────────────────────────── */}
        <section id="services" className="border-b border-[#d8d5cc] py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="eyebrow mb-2 fade-up">01 — LEISTUNGEN</p>
            <h2 className="font-display text-3xl font-bold tracking-tight fade-up fade-up-delay-1">
              {t("home.servicesTitle")}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground fade-up fade-up-delay-2">
              {t("home.servicesSubtitle")}
            </p>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                {
                  icon: Send,
                  title: t("home.service1Title"),
                  desc: t("home.service1Desc"),
                  price: t("home.service1Price"),
                },
                {
                  icon: FolderOpen,
                  title: t("home.service2Title"),
                  desc: t("home.service2Desc"),
                  price: t("home.service2Price"),
                },
                {
                  icon: Languages,
                  title: t("home.service3Title"),
                  desc: t("home.service3Desc"),
                  price: t("home.service3Price"),
                },
              ].map((service, i) => (
                <div
                  key={service.title}
                  className={`form-sheet group flex flex-col p-6 transition-shadow hover:shadow-md fade-up fade-up-delay-${i + 1}`}
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-sm border border-[#1e4475]/30 bg-[#1e4475]/5 text-[#1e4475]">
                      <service.icon className="h-5 w-5" />
                    </div>
                    <span className="stamp stamp-blue stamp-flat">{service.price}</span>
                  </div>
                  <h3 className="font-display text-lg font-bold">{service.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {service.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────── */}
        <section id="how" className="border-b border-[#d8d5cc] bg-[#fafaf6] py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="eyebrow mb-2 fade-up">02 — ABLAUF</p>
            <h2 className="font-display text-3xl font-bold tracking-tight fade-up fade-up-delay-1">
              {t("home.howTitle")}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground fade-up fade-up-delay-2">
              {t("home.howSubtitle")}
            </p>

            <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {[
                { title: t("home.how1Title"), desc: t("home.how1Desc") },
                { title: t("home.how2Title"), desc: t("home.how2Desc") },
                { title: t("home.how3Title"), desc: t("home.how3Desc") },
                { title: t("home.how4Title"), desc: t("home.how4Desc") },
              ].map((step, i) => (
                <li key={step.title} className="form-sheet relative flex flex-col p-6">
                  <span className="num mb-4 text-3xl font-bold text-[#d8d5cc]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-display text-base font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                  {i < 3 && (
                    <ChevronRight className="absolute -right-3.5 top-1/2 hidden h-6 w-6 -translate-y-1/2 rounded-full border border-[#d8d5cc] bg-white text-[#75797f] lg:block" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Pricing ───────────────────────────────────────── */}
        <section id="pricing" className="border-b border-[#d8d5cc] py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="eyebrow mb-2 fade-up">03 — PREISE</p>
            <h2 className="font-display text-3xl font-bold tracking-tight fade-up fade-up-delay-1">
              {t("home.pricingTitle")}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground fade-up fade-up-delay-2">
              {t("home.pricingSubtitle")}
            </p>

            <div className="mt-10 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              {/* Price table — official form style */}
              <div className="form-sheet overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      [t("home.pricingRow1Label"), t("home.pricingRow1Value"), null],
                      [t("home.pricingRow2Label"), t("home.pricingRow2Value"), t("home.pricingRow2Note")],
                      [t("home.pricingRow3Label"), t("home.pricingRow3Value"), null],
                      [t("home.pricingRow4Label"), t("home.pricingRow4Value"), null],
                    ].map(([label, value, note]) => (
                      <tr key={label as string} className="border-b border-[#e9e6dd] last:border-0">
                        <td className="px-5 py-4 font-medium">{label}</td>
                        <td className="px-5 py-4 text-right">
                          <span className="num font-semibold">{value}</span>
                          {note && (
                            <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-[#2f6b4a]">
                              <TrendingDown className="h-3 w-3" />
                              {note}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Example calculation with strikethrough discount */}
              <div className="form-sheet border-[#1e4475]/40 bg-[#fafaf6] p-6">
                <p className="eyebrow mb-4">{t("home.pricingExampleTitle")}</p>
                <div className="space-y-3 text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">1 600 postulations</span>
                    <span className="num font-medium">16 $</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">500 / jour</span>
                    <span className="num flex items-center gap-2">
                      <span className="relative text-muted-foreground">
                        5 $
                        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rotate-[-6deg] bg-[#b3391f]" />
                      </span>
                      <span className="font-medium">2 $</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#2f6b4a]">
                    <span className="flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      {t("home.pricingRow2Note")}
                    </span>
                    <span className="num">−3 $</span>
                  </div>
                  <div className="rule-dashed" />
                  <div className="flex items-baseline justify-between">
                    <span className="font-display font-bold">{t("demandes.priceTotal")}</span>
                    <span className="num font-display text-2xl font-extrabold text-[#1e4475]">
                      18 $
                    </span>
                  </div>
                  <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
                    {t("home.pricingExampleDesc")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust ─────────────────────────────────────────── */}
        <section className="border-b border-[#d8d5cc] bg-[#fafaf6] py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="eyebrow mb-2 fade-up">04 — VERTRAUEN</p>
            <h2 className="font-display text-3xl font-bold tracking-tight fade-up fade-up-delay-1">
              {t("home.trustTitle")}
            </h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                { icon: Building2, title: t("home.trust1Title"), desc: t("home.trust1Desc") },
                { icon: Lock, title: t("home.trust2Title"), desc: t("home.trust2Desc") },
                { icon: Banknote, title: t("home.trust3Title"), desc: t("home.trust3Desc") },
              ].map((item, i) => (
                <div key={item.title} className={`form-sheet p-6 fade-up fade-up-delay-${i + 1}`}>
                  <item.icon className="h-6 w-6 text-[#1e4475]" />
                  <h3 className="mt-3 font-display text-base font-bold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────── */}
        <section id="faq" className="border-b border-[#d8d5cc] py-16 lg:py-20">
          <div className="mx-auto max-w-3xl px-4">
            <p className="eyebrow mb-2 fade-up">05 — FRAGEN</p>
            <h2 className="font-display text-3xl font-bold tracking-tight fade-up fade-up-delay-1">
              {t("home.faqTitle")}
            </h2>
            <Accordion type="single" collapsible className="mt-8">
              {[
                { q: t("home.faq1Q"), a: t("home.faq1A") },
                { q: t("home.faq2Q"), a: t("home.faq2A") },
                { q: t("home.faq3Q"), a: t("home.faq3A") },
                { q: t("home.faq4Q"), a: t("home.faq4A") },
              ].map((item, i) => (
                <AccordionItem key={item.q} value={`item-${i}`} className="border-[#d8d5cc]">
                  <AccordionTrigger className="text-left font-display text-base font-semibold hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[#1a1d21] py-16 lg:py-20">
          <div
            aria-hidden
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(#2a2e34 1px, transparent 1px), linear-gradient(90deg, #2a2e34 1px, transparent 1px)",
              backgroundSize: "36px 36px",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-4 text-center fade-up">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#f4f2ec] sm:text-4xl">
              {t("home.ctaTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[#9a9ea6]">{t("home.ctaSubtitle")}</p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 bg-[#f4f2ec] px-8 text-base font-semibold text-[#1a1d21] hover:bg-[#e9e6dd]">
                <Link href="/register">{t("home.ctaButton")}</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-[#2a2e34] bg-transparent px-8 text-base text-[#9a9ea6] hover:bg-[#2a2e34] hover:text-[#f4f2ec]"
              >
                <Link href="/login">{t("nav.login")}</Link>
              </Button>
            </div>
            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#9a9ea6]">
              <ShieldCheck className="h-3.5 w-3.5" />
              2FA · Emails vérifiés · Paiement transparent via WhatsApp
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="bg-[#fafaf6]">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">{t("home.footerTagline")}</p>
            </div>
            <div>
              <p className="eyebrow mb-3">{t("home.footerLinks")}</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/login" className="text-muted-foreground hover:text-foreground">{t("nav.login")}</Link></li>
                <li><Link href="/register" className="text-muted-foreground hover:text-foreground">{t("nav.register")}</Link></li>
                <li><a href="#services" className="text-muted-foreground hover:text-foreground">{t("home.servicesTitle")}</a></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow mb-3">{t("home.footerServices")}</p>
              <ul className="space-y-2 text-sm">
                <li className="text-muted-foreground">{t("home.service1Title")}</li>
                <li className="text-muted-foreground">{t("home.service2Title")}</li>
                <li className="text-muted-foreground">{t("home.service3Title")}</li>
              </ul>
            </div>
            <div>
              <p className="eyebrow mb-3">{t("home.footerContact")}</p>
              <a
                href="https://wa.me/212600000000"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1e4475] hover:underline"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </div>
          </div>
          <div className="rule-dashed my-6" />
          <p className="aktenzeichen">{t("home.footerLegal", { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </div>
  );
}
