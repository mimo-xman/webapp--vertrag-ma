"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/language-provider";
import { HomeHeader } from "@/components/home-header";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  computePrice,
  normalizePricing,
  DEFAULT_PRICING,
  type PricingSettings,
} from "@/lib/pricing";
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
  MessageSquare,
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
  // Live pricing - mirrors the admin settings (prices, steps, free amounts,
  // dossier prices). Everything in the pricing section is computed from it.
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING);
  const [dossierPrices, setDossierPrices] = useState<{ creation: number; add: number }>({
    creation: 20,
    add: 0,
  });
  const [whatsappUrl, setWhatsappUrl] = useState("https://wa.me/212600000000");

  useEffect(() => {
    fetch("/api/public/stats")
      .then((r) => r.json())
      .then((d) => {
        setStats({ companies: d.companies || 0, sent: d.sent || 0 });
        if (d.pricing) setPricing(normalizePricing(d.pricing));
        if (d.dossier) {
          setDossierPrices({ creation: d.dossier.creation_price ?? 20, add: d.dossier.add_price ?? 0 });
        }
        if (d.whatsapp_url) setWhatsappUrl(d.whatsapp_url);
      })
      .catch(() => {});
  }, []);

  // Example quantities derived from the LIVE steps - stays representative
  // whatever the admin configures (min + 3 steps total, min + 4 steps/day).
  const exampleTotal = pricing.total.min + 3 * pricing.total.step;
  const examplePerDay = pricing.per_day.min + 4 * pricing.per_day.step;
  const example = computePrice(exampleTotal, examplePerDay, pricing);

  return (
    <div className="bg-background">
      {/* ── Briefkopf (letterhead nav) ─────────────────────── */}
      <HomeHeader />

      <main className="flex-1">
        {/* ── Hero ───────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border">
          {/* Background grid : graph paper */}
          <div aria-hidden className="bg-graph-paper absolute inset-0 opacity-35" />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
            <div className="fade-up">
              <p className="eyebrow mb-4 border border-primary/30 bg-primary/5 px-2.5 py-1 inline-block">
                {t("home.heroEyebrow")}
              </p>
              <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                {t("home.heroTitle")}
                <br />
                <span className="text-primary">{t("home.heroTitleAccent")}</span>
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

            {/* The Bewerbung document : signature visual (a physical paper
                sheet: stays white in both themes) */}
            <div className="relative mx-auto w-full max-w-sm fade-up fade-up-delay-2" aria-hidden>
              <div className="doc-paper relative rotate-[1.5deg] rounded-sm p-6">
                <div className="flex items-start justify-between border-b-2 border-foreground pb-3">
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
                  <div className="h-2 w-full rounded-full bg-secondary" />
                  <div className="h-2 w-11/12 rounded-full bg-secondary" />
                  <div className="h-2 w-4/5 rounded-full bg-secondary" />
                  <div className="flex gap-2 pt-1">
                    <div className="h-14 flex-1 rounded-sm border border-border bg-paper" />
                    <div className="h-14 w-14 rounded-sm border border-border bg-paper" />
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary" />
                  <div className="h-2 w-3/4 rounded-full bg-secondary" />
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <p className="aktenzeichen">ANLAGE: DOSSIER.PDF</p>
                  <div className="flex h-6 w-8 items-center justify-center rounded-[2px] border border-primary/40 bg-primary/10">
                    <Send className="h-3 w-3 text-primary" />
                  </div>
                </div>

                {/* Stamps : positioned like official document stamps (overlapping edges) */}
                <div className="stamp stamp-green stamp-anim absolute -right-3 -top-3 !text-[10px] sm:!text-xs">
                  GEPRÜFT ✓
                </div>
                <div
                  className="stamp stamp-blue stamp-anim absolute -left-3 -bottom-3 !text-[10px] sm:!text-xs"
                  style={{ animationDelay: "0.25s" }}
                >
                  500 / TAG
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Services ──────────────────────────────────────── */}
        <section id="services" className="border-b border-border py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="eyebrow mb-2 fade-up">01 · LEISTUNGEN</p>
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
                    <div className="flex h-11 w-11 items-center justify-center rounded-sm border border-primary/30 bg-primary/5 text-primary">
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
        <section id="how" className="border-b border-border bg-paper py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="eyebrow mb-2 fade-up">02 · ABLAUF</p>
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
                  <span className="num mb-4 text-3xl font-bold text-border">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-display text-base font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                  {i < 3 && (
                    <ChevronRight className="absolute -right-3.5 top-1/2 hidden h-6 w-6 -translate-y-1/2 rounded-full border border-border bg-card text-muted-foreground lg:block" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Pricing : fully LIVE: prices, steps and free amounts come
             from the admin settings (see /api/public/stats) ────────── */}
        <section id="pricing" className="border-b border-border py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="eyebrow mb-2 fade-up">03 · PREISE</p>
            <h2 className="font-display text-3xl font-bold tracking-tight fade-up fade-up-delay-1">
              {t("home.pricingTitle")}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground fade-up fade-up-delay-2">
              {t("home.pricingSubtitle")}
            </p>

            <div className="mt-10 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              {/* Price table : official form style (values are LIVE from the admin settings) */}
              <div className="form-sheet overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      [
                        t("home.pricingRow1Label"),
                        `${pricing.total.step_price} $ / ${pricing.total.step.toLocaleString("fr-FR")} ${t("home.pricingUnitPostulations")}`,
                        pricing.total.free_amount > 0
                          ? t("home.pricingFreeNoteTotal", { count: pricing.total.free_amount })
                          : null,
                      ],
                      [
                        t("home.pricingRow2Label"),
                        `${pricing.per_day.step_price} $ / ${pricing.per_day.step.toLocaleString("fr-FR")} ${t("home.pricingUnitPerDay")}`,
                        pricing.per_day.free_amount > 0
                          ? t("home.pricingFreeNote", { count: pricing.per_day.free_amount })
                          : null,
                      ],
                      [t("home.pricingRow3Label"), `${dossierPrices.creation} $`, null],
                      [
                        t("home.pricingRow4Label"),
                        dossierPrices.add > 0
                          ? `${dossierPrices.add} $`
                          : t("home.pricingFreeValue"),
                        null,
                      ],
                    ].map(([label, value, note]) => (
                      <tr key={label as string} className="border-b border-secondary last:border-0">
                        <td className="px-5 py-4 font-medium">{label}</td>
                        <td className="px-5 py-4 text-right">
                          <span className="num font-semibold">{value}</span>
                          {note && (
                            <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-success">
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

              {/* Example calculation : computed with the LIVE pricing engine */}
              <div className="form-sheet border-primary/40 bg-paper p-6">
                <p className="eyebrow mb-4">{t("home.pricingExampleTitle")}</p>
                <div className="space-y-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-muted-foreground">
                      {t("home.pricingExampleTotal", { count: exampleTotal.toLocaleString("fr-FR") })}
                    </span>
                    <span className="num flex shrink-0 items-center gap-2">
                      {example.total_discount > 0 && (
                        <span className="relative text-muted-foreground">
                          {example.total_full_price} $
                          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rotate-[-6deg] bg-destructive" />
                        </span>
                      )}
                      <span className="font-medium">{example.total_price} $</span>
                    </span>
                  </div>
                  {example.total_discount > 0 && (
                    <div className="flex items-center justify-between gap-3 text-xs text-success">
                      <span className="flex min-w-0 items-center gap-1">
                        <TrendingDown className="h-3 w-3 shrink-0" />
                        {t("home.pricingFreeNoteTotal", { count: pricing.total.free_amount })}
                      </span>
                      <span className="num shrink-0">−{example.total_discount} $</span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-muted-foreground">
                      {t("home.pricingExamplePerDay", { count: examplePerDay })}
                    </span>
                    <span className="num flex shrink-0 items-center gap-2">
                      {example.per_day_discount > 0 && (
                        <span className="relative text-muted-foreground">
                          {example.per_day_price} $
                          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rotate-[-6deg] bg-destructive" />
                        </span>
                      )}
                      <span className="font-medium">{example.per_day_price_after_discount} $</span>
                    </span>
                  </div>
                  {example.per_day_discount > 0 && (
                    <div className="flex items-center justify-between gap-3 text-xs text-success">
                      <span className="flex min-w-0 items-center gap-1">
                        <TrendingDown className="h-3 w-3 shrink-0" />
                        {t("home.pricingFreeNote", { count: pricing.per_day.free_amount })}
                      </span>
                      <span className="num shrink-0">−{example.per_day_discount} $</span>
                    </div>
                  )}
                  <div className="rule-dashed" />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display font-bold">{t("demandes.priceTotal")}</span>
                    <span className="num font-display text-2xl font-extrabold text-primary">
                      {example.final_price} $
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
        <section className="border-b border-border bg-paper py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="eyebrow mb-2 fade-up">04 · VERTRAUEN</p>
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
                  <item.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 font-display text-base font-bold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────── */}
        <section id="faq" className="border-b border-border py-16 lg:py-20">
          <div className="mx-auto max-w-3xl px-4">
            <p className="eyebrow mb-2 fade-up">05 · FRAGEN</p>
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
                <AccordionItem key={item.q} value={`item-${i}`} className="border-border">
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

        {/* ── Final CTA : the ink band ──────────────────────── */}
        <section className="relative overflow-hidden bg-ink-section py-16 lg:py-20">
          <div aria-hidden className="bg-graph-paper-ink absolute inset-0 opacity-20" />
          <div className="relative mx-auto max-w-6xl px-4 text-center fade-up">
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink-section-foreground sm:text-4xl">
              {t("home.ctaTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[var(--ink-section-muted)]">
              {t("home.ctaSubtitle")}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 bg-primary px-8 text-base font-semibold hover:bg-primary/90">
                <Link href="/register">{t("home.ctaButton")}</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-white/20 bg-transparent px-8 text-base text-[var(--ink-section-muted)] hover:bg-white/10 hover:text-ink-section-foreground"
              >
                <Link href="/login">{t("nav.login")}</Link>
              </Button>
            </div>
            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[var(--ink-section-muted)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              2FA · Emails vérifiés · Paiement transparent via WhatsApp
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="bg-paper">
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
              <div className="space-y-2">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
                <div>
                  <Link href="/contact" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                    <MessageSquare className="h-4 w-4" />
                    {t("home.footerContactSupport")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="rule-dashed my-6" />
          <p className="aktenzeichen">{t("home.footerLegal", { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </div>
  );
}
