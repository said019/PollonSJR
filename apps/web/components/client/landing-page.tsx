"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken, clearTokens } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import type { MenuByCategory, ProductPublic } from "@pollon/types";
import { AuthModal } from "./auth-modal";
import {
  User,
  LogOut,
  Star,
  Menu as MenuIcon,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  MapPin,
} from "lucide-react";

interface PublicPromotion {
  id: string;
  name: string;
  description: string | null;
  price: number;
  items: Array<{
    productId: string;
    productName: string;
    emoji: string | null;
    qty: number;
    variant: string | null;
  }>;
}

const STORE_LAT = parseFloat(process.env.NEXT_PUBLIC_STORE_LAT || "20.5881");
const STORE_LNG = parseFloat(process.env.NEXT_PUBLIC_STORE_LNG || "-99.9953");

/* ────────────────────────────────────────────────────────────── */
/*  NavBar — frosted glass with warm char tones                   */
/* ────────────────────────────────────────────────────────────── */
function NavBar({
  authed,
  onLogin,
  onLogout,
}: {
  authed: boolean;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Lock scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <nav className="fixed top-0 w-full z-50 bg-surface/70 backdrop-blur-xl border-b border-outline-variant/10">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg border border-primary/20">
              <Image
                src="/pollon-logo.jpg"
                alt="Pollón SJR"
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xl font-headline font-extrabold text-tertiary tracking-tight">
              POLLÓN<span className="text-primary">.</span>
            </span>
          </Link>

          {/* Nav links — desktop */}
          <div className="hidden md:flex items-center gap-8 font-headline font-semibold text-sm tracking-tight">
            <Link href="/menu" className="text-primary hover:text-primary-fixed transition-colors">
              Menú
            </Link>
            <a href="#como-pedir" className="text-on-surface-variant hover:text-tertiary transition-colors">
              Cómo Pedir
            </a>
            <a href="#proceso" className="text-on-surface-variant hover:text-tertiary transition-colors">
              El Proceso
            </a>
            {authed ? (
              <Link href="/loyalty" className="text-secondary hover:text-secondary-fixed transition-colors flex items-center gap-1.5">
                <Star size={14} />
                Mi Lealtad
              </Link>
            ) : (
              <a href="#rewards" className="text-on-surface-variant hover:text-tertiary transition-colors">
                Rewards
              </a>
            )}
            <a href="#location" className="text-on-surface-variant hover:text-tertiary transition-colors">
              Ubicación
            </a>
          </div>

          {/* Right side — auth + CTA + mobile hamburger */}
          <div className="flex items-center gap-3">
            {/* Desktop auth + CTA */}
            <div className="hidden md:flex items-center gap-3">
              {authed ? (
                <>
                  <Link
                    href="/loyalty"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-secondary/30 text-xs font-headline font-bold text-secondary hover:bg-secondary/10 transition-colors"
                  >
                    <Star size={14} />
                    Mi Tarjeta
                  </Link>
                  <Link
                    href="/profile"
                    title="Mi perfil"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-headline font-bold text-on-surface hover:border-primary hover:text-primary transition-colors"
                  >
                    <User size={14} />
                    <span className="hidden sm:inline">Mi perfil</span>
                  </Link>
                  <button
                    onClick={onLogout}
                    aria-label="Cerrar sesión"
                    title="Cerrar sesión"
                    className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                  >
                    <LogOut size={18} />
                  </button>
                </>
              ) : (
                <button
                  onClick={onLogin}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-headline font-bold text-on-surface hover:border-primary hover:text-primary transition-colors"
                >
                  <User size={15} />
                  Entrar
                </button>
              )}
            </div>

            {/* Always visible: Ordenar Ya */}
            <Link
              href="/menu"
              className="bg-primary text-on-primary px-4 sm:px-5 py-2.5 rounded-xl font-headline font-bold text-xs sm:text-sm tracking-tight hover:brightness-110 transition-all active:scale-95 glow-primary"
            >
              Ordenar Ya
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
              aria-expanded={mobileOpen}
              className="md:hidden p-2 rounded-xl border border-outline-variant/30 text-on-surface hover:border-primary/40 hover:text-primary transition-colors"
            >
              <MenuIcon size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            role="dialog"
            aria-label="Menú de navegación"
            className="absolute right-0 top-0 h-full w-72 max-w-[85vw] bg-surface-container-high border-l border-outline-variant/15 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-outline-variant/15 px-5 py-4">
              <span className="text-lg font-headline font-extrabold text-tertiary tracking-tight">
                POLLÓN<span className="text-primary">.</span>
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
                className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-variant"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              <Link
                href="/menu"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-primary/10 font-headline font-bold text-sm text-primary"
              >
                Menú completo
              </Link>
              <a
                href="#como-pedir"
                onClick={() => setMobileOpen(false)}
                className="flex items-center px-3 py-3 rounded-xl font-headline font-semibold text-sm text-on-surface hover:bg-surface-variant"
              >
                Cómo pedir
              </a>
              <a
                href="#proceso"
                onClick={() => setMobileOpen(false)}
                className="flex items-center px-3 py-3 rounded-xl font-headline font-semibold text-sm text-on-surface hover:bg-surface-variant"
              >
                El proceso
              </a>
              {authed ? (
                <Link
                  href="/loyalty"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl font-headline font-semibold text-sm text-secondary hover:bg-surface-variant"
                >
                  <Star size={14} />
                  Mi tarjeta de lealtad
                </Link>
              ) : (
                <a
                  href="#rewards"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-3 py-3 rounded-xl font-headline font-semibold text-sm text-on-surface hover:bg-surface-variant"
                >
                  Rewards
                </a>
              )}
              <a
                href="#location"
                onClick={() => setMobileOpen(false)}
                className="flex items-center px-3 py-3 rounded-xl font-headline font-semibold text-sm text-on-surface hover:bg-surface-variant"
              >
                Ubicación
              </a>
            </nav>

            <div className="border-t border-outline-variant/15 p-4 space-y-2">
              {authed ? (
                <>
                  <Link
                    href="/profile"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-headline font-bold text-on-surface"
                  >
                    <User size={15} />
                    Mi perfil
                  </Link>
                  <button
                    onClick={() => {
                      onLogout();
                      setMobileOpen(false);
                    }}
                    className="flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-xl text-sm font-headline font-bold text-error hover:bg-error/10"
                  >
                    <LogOut size={15} />
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    onLogin();
                    setMobileOpen(false);
                  }}
                  className="flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-headline font-bold text-on-surface"
                >
                  <User size={15} />
                  Iniciar sesión
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Hero — diagonal cut, massive type, floating badges            */
/* ────────────────────────────────────────────────────────────── */
function HeroSection() {
  return (
    <section className="relative min-h-[100vh] flex items-end overflow-hidden">
      {/* BG image + overlays */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/menu/hero-spread.jpeg"
          alt="Mesa llena de pollo frito, hamburguesas, snacks y bebidas de Pollón SJR"
          fill
          className="object-cover scale-105"
          priority
        />
        {/* warm gradient from bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/60 to-transparent" />
        {/* diagonal cut overlay */}
        <div
          className="absolute inset-0 bg-surface"
          style={{ clipPath: "polygon(0 85%, 100% 70%, 100% 100%, 0 100%)" }}
        />
        {/* grain texture */}
        <div className="absolute inset-0 grain" />
      </div>

      {/* Floating badge — top right */}
      <div
        className="absolute top-28 right-8 md:right-16 z-20 animate-float"
        style={{ "--float-rotate": "6deg" } as React.CSSProperties}
      >
        <div className="w-24 h-24 md:w-28 md:h-28 bg-secondary rounded-full flex items-center justify-center shadow-2xl rotate-12 border-4 border-surface">
          <span className="font-headline font-extrabold text-on-secondary text-center text-[10px] md:text-xs uppercase leading-tight">
            Nuevo<br />Nivel<br />Crunch
          </span>
        </div>
      </div>

      {/* Spinning badge — mid left (desktop) */}
      <div className="absolute top-1/3 left-6 z-20 hidden lg:block">
        <div className="w-20 h-20 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center animate-spin-slow">
          <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            local_fire_department
          </span>
        </div>
      </div>

      {/* Hero Content */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-12 pb-24 md:pb-32">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="animate-fade-up inline-flex items-center gap-2 bg-secondary/15 border border-secondary/30 text-secondary px-4 py-1.5 rounded-full mb-6 backdrop-blur-sm">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
              verified
            </span>
            <span className="text-xs font-headline font-bold uppercase tracking-wider">
              Lo Mejor de SJR
            </span>
          </div>

          {/* Heading */}
          <h1 className="animate-fade-up delay-100 text-6xl sm:text-8xl md:text-9xl lg:text-[10rem] font-headline font-extrabold text-tertiary uppercase leading-[0.85] tracking-tighter mb-8">
            EL{" "}
            <span className="text-primary text-glow">CRUNCH</span>
            <br />
            <span className="text-stroke">SUPREMO</span>
          </h1>

          {/* Subtext */}
          <p className="animate-fade-up delay-200 text-lg md:text-xl font-body text-on-surface-variant max-w-lg leading-relaxed mb-10">
            El bocado más fuerte de San Juan del Río. Doble empanizado, especias
            de alto voltaje, cero compromisos.
          </p>

          {/* CTAs */}
          <div className="animate-fade-up delay-300 flex flex-wrap gap-4">
            <Link
              href="/menu"
              className="group relative bg-primary text-on-primary px-8 py-4 rounded-2xl font-headline font-bold text-lg shadow-2xl hover:scale-105 transition-all active:scale-95 animate-pulse-glow"
            >
              Prueba el Sabor
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full animate-ping" />
            </Link>
            <Link
              href="/menu"
              className="bg-surface-container-high/80 backdrop-blur text-tertiary px-8 py-4 rounded-2xl font-headline font-bold text-lg border border-outline-variant/30 hover:border-primary/40 hover:bg-surface-variant transition-all"
            >
              Ver Menú
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Marquee Strip — scrolling text between sections               */
/* ────────────────────────────────────────────────────────────── */
function MarqueeStrip() {
  const words = "CRUNCH · POLLO · SABOR · FUEGO · SJR · CRUNCH · POLLO · SABOR · FUEGO · SJR · ";
  return (
    <div className="overflow-hidden bg-primary py-3 -rotate-1 scale-x-105 relative z-10">
      <div className="animate-marquee whitespace-nowrap flex">
        <span className="font-headline font-extrabold text-on-primary text-sm tracking-[0.3em] uppercase mx-4">
          {words}{words}
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Menu Highlights — bento grid with overlapping cards           */
/* ────────────────────────────────────────────────────────────── */
function MenuHighlights({
  comboFamiliar,
  todaysPromo,
}: {
  comboFamiliar: ProductPublic | null;
  todaysPromo: PublicPromotion | null;
}) {
  return (
    <section className="py-24 px-6 lg:px-12 max-w-7xl mx-auto relative">
      {/* Section header */}
      <div className="flex justify-between items-end mb-14">
        <div>
          <span className="text-xs font-headline font-bold text-primary uppercase tracking-[0.3em] mb-2 block">
            Nuestros Favoritos
          </span>
          <h2 className="text-4xl md:text-6xl font-headline font-extrabold text-tertiary uppercase tracking-tighter leading-none">
            Lo Esencial
          </h2>
        </div>
        <Link
          href="/menu"
          className="group hidden md:flex items-center gap-2 text-on-surface-variant font-headline font-bold text-sm uppercase tracking-wider hover:text-primary transition-colors"
        >
          Menú Completo
          <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
            arrow_forward
          </span>
        </Link>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5">
        {/* Large Card — Combo Familiar (real data) */}
        <Link
          href="/menu"
          className="md:col-span-7 group relative rounded-3xl overflow-hidden min-h-[420px] block"
        >
          <Image
            src={comboFamiliar?.imageUrl || "/menu/combo-familiar.jpeg"}
            alt={
              comboFamiliar?.description ??
              "Combo Familiar: pollo frito con bisquets y complementos"
            }
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          {/* Price sticker — real price */}
          {comboFamiliar && (
            <div className="absolute top-5 right-5 bg-secondary text-on-secondary px-3 py-1.5 rounded-full font-headline font-extrabold text-lg shadow-lg rotate-3">
              {formatCents(comboFamiliar.price)}
            </div>
          )}
          <div className="absolute bottom-0 left-0 p-7 md:p-9">
            <span className="bg-primary/20 text-primary border border-primary/30 backdrop-blur-sm px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full mb-3 inline-block">
              Mejor Precio
            </span>
            <h3 className="text-3xl md:text-4xl font-headline font-extrabold text-white uppercase tracking-tighter leading-none mb-2">
              {comboFamiliar?.name ?? "El Combo Familiar"}
            </h3>
            <p className="text-white/70 font-body text-sm max-w-sm line-clamp-3">
              {comboFamiliar?.description ??
                "Pollo frito con bisquets y complementos para toda la familia."}
            </p>
          </div>
        </Link>

        {/* Tall Vertical Card */}
        <div className="md:col-span-5 group relative rounded-3xl overflow-hidden min-h-[420px] cursor-pointer">
          <Image
            src="/menu/boneless-dip.jpeg"
            alt="Boneless crujiente sumergido en salsa BBQ"
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
          <div className="absolute bottom-0 left-0 p-7">
            <h3 className="text-2xl font-headline font-extrabold text-tertiary uppercase tracking-tighter mb-2">
              Boneless
            </h3>
            <p className="text-on-surface-variant text-sm mb-4">
              Trozos sin hueso con salsa BBQ.
            </p>
            <Link
              href="/menu"
              className="bg-primary text-on-primary w-11 h-11 rounded-full inline-flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
            >
              <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
            </Link>
          </div>
        </div>

        {/* Wide Card */}
        <div className="md:col-span-5 group relative rounded-3xl overflow-hidden min-h-[320px] cursor-pointer">
          <Image
            src="/menu/hamburguesa-arrachera.jpeg"
            alt="Hamburguesa Arrachera con papas a la francesa"
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/50 group-hover:bg-black/30 transition-colors duration-500" />
          <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-8">
            <h3 className="text-3xl md:text-4xl font-headline font-extrabold text-tertiary uppercase tracking-tighter leading-none mb-3">
              Hamburguesa<br />Arrachera
            </h3>
            <div className="h-1 w-10 bg-primary rounded-full mb-3" />
            <p className="text-tertiary/80 font-body text-sm">
              100% carne, jalapeños y queso derretido.
            </p>
          </div>
        </div>

        {/* Promo Card — real promotion of the day or generic fallback */}
        <Link
          href="/menu"
          className="md:col-span-7 relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary via-primary-dim to-primary-container p-8 md:p-10 flex flex-col justify-between min-h-[320px] group grain"
        >
          <div className="relative z-10">
            <span className="text-on-primary/60 text-xs font-headline font-bold uppercase tracking-[0.3em] block mb-2">
              {todaysPromo ? "Promo de hoy" : "Promociones"}
            </span>
            <h3 className="text-3xl md:text-4xl font-headline font-extrabold text-on-primary uppercase tracking-tighter mb-4 leading-tight">
              {todaysPromo
                ? todaysPromo.name
                : (
                  <>
                    Combos<br />Para Compartir
                  </>
                )}
            </h3>
            <p className="text-on-primary/80 font-body max-w-sm line-clamp-3">
              {todaysPromo?.description ??
                "Pareja, Familiar, Extra o Jumbo. Todos con bisquets y complementos."}
            </p>
          </div>
          <div className="relative z-10 flex items-end justify-between mt-6">
            {todaysPromo ? (
              <span className="text-5xl md:text-6xl font-headline font-extrabold text-on-primary leading-none">
                {formatCents(todaysPromo.price)}
              </span>
            ) : (
              <span className="text-7xl md:text-8xl font-headline font-extrabold text-on-primary/10 uppercase leading-none">
                COMBO
              </span>
            )}
            <span
              className="material-symbols-outlined text-on-primary/30 text-5xl group-hover:rotate-12 transition-transform duration-500"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden
            >
              whatshot
            </span>
          </div>
        </Link>
      </div>

      {/* Mobile link */}
      <div className="mt-8 md:hidden text-center">
        <Link
          href="/menu"
          className="inline-flex items-center gap-2 text-primary font-headline font-bold text-sm uppercase tracking-wider"
        >
          Ver Menú Completo
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </Link>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  How to Order — 4-step guide with icons + food photos          */
/* ────────────────────────────────────────────────────────────── */
function HowToOrder() {
  const steps = [
    {
      num: "01",
      icon: "restaurant_menu",
      title: "Abre el Menú",
      desc: "Entra a la plataforma y navega entre nuestras categorías: pollo, hamburguesas, boneless, bebidas y más.",
      img: "/menu/combo-familiar.jpeg",
      imgAlt: "Combo familiar Pollón",
      cta: null,
    },
    {
      num: "02",
      icon: "add_shopping_cart",
      title: "Elige tu Antojo",
      desc: "Toca cualquier producto para ver detalles y agrégalo a tu carrito. Puedes personalizar salsas y guarniciones.",
      img: "/menu/boneless.jpeg",
      imgAlt: "Boneless Pollón",
      cta: null,
    },
    {
      num: "03",
      icon: "edit_location_alt",
      title: "Confirma tu Dirección",
      desc: "Escribe tu calle, número y colonia. Revisamos que estés dentro de nuestra zona de entrega antes de confirmar.",
      img: "/menu/hamburguesas-dobles.jpeg",
      imgAlt: "Hamburguesas dobles Pollón",
      cta: null,
    },
    {
      num: "04",
      icon: "delivery_dining",
      title: "¡Espera y Disfruta!",
      desc: "Paga en línea y recibe tu pedido en casa. Recibirás una confirmación y podrás rastrear el estatus en tiempo real.",
      img: "/menu/tiras-pollo-papas.jpeg",
      imgAlt: "Tiras de pollo con papas",
      cta: { label: "Ordenar Ahora", href: "/menu" },
    },
  ];

  return (
    <section id="como-pedir" className="py-28 px-6 lg:px-12 relative overflow-hidden">
      {/* subtle grid bg */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(249,115,22,1) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-16 gap-4">
          <div>
            <span className="text-xs font-headline font-bold text-primary uppercase tracking-[0.3em] mb-2 block">
              Sin Complicaciones
            </span>
            <h2 className="text-5xl md:text-7xl font-headline font-extrabold text-tertiary uppercase leading-none tracking-tighter">
              ¿CÓMO{" "}
              <span className="text-stroke">PEDIR?</span>
            </h2>
          </div>
          <p className="text-on-surface-variant max-w-sm leading-relaxed md:text-right">
            En cuatro pasos sencillos tu pedido llega directo a tu puerta.
            Sin llamadas, sin esperas interminables.
          </p>
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((step, idx) => (
            <div
              key={step.num}
              className="group relative flex flex-col bg-surface-container rounded-3xl overflow-hidden border border-outline-variant/15 hover:border-primary/40 transition-all duration-500 hover:-translate-y-1"
            >
              {/* Photo thumbnail */}
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={step.img}
                  alt={step.imgAlt}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110 brightness-75"
                />
                {/* Dark gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-surface-container via-surface-container/40 to-transparent" />

                {/* Step number — ghost behind */}
                <span className="absolute bottom-2 right-3 font-headline font-extrabold text-6xl text-white/10 leading-none select-none">
                  {step.num}
                </span>

                {/* Icon chip — top left */}
                <div className="absolute top-4 left-4 w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
                  <span
                    className="material-symbols-outlined text-on-primary text-lg"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {step.icon}
                  </span>
                </div>

                {/* Connector arrow (all except last) */}
                {idx < steps.length - 1 && (
                  <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-6 h-6 bg-primary rounded-full items-center justify-center shadow-md">
                    <span className="material-symbols-outlined text-on-primary text-sm">
                      chevron_right
                    </span>
                  </div>
                )}
              </div>

              {/* Text body */}
              <div className="flex flex-col flex-1 p-5">
                <h3 className="font-headline font-extrabold text-tertiary text-base uppercase tracking-tight mb-2">
                  {step.title}
                </h3>
                <p className="text-on-surface-variant font-body text-sm leading-relaxed flex-1">
                  {step.desc}
                </p>

                {step.cta && (
                  <Link
                    href={step.cta.href}
                    className="mt-5 inline-flex items-center justify-center gap-2 bg-primary text-on-primary py-2.5 px-5 rounded-xl font-headline font-bold text-sm hover:brightness-110 transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-base">
                      bolt
                    </span>
                    {step.cta.label}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom tip strip */}
        <div className="mt-10 flex flex-wrap gap-4 items-center justify-center">
          {[
            { icon: "lock", label: "Pago 100% seguro" },
            { icon: "schedule", label: "Entrega en ~22 min" },
            { icon: "support_agent", label: "Soporte por WhatsApp" },
            { icon: "star", label: "Sin app extra — todo desde el navegador" },
          ].map((tip) => (
            <div
              key={tip.label}
              className="flex items-center gap-2 bg-surface-container-low border border-outline-variant/10 px-4 py-2 rounded-full"
            >
              <span
                className="material-symbols-outlined text-primary text-base"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {tip.icon}
              </span>
              <span className="text-on-surface-variant text-xs font-headline font-semibold">
                {tip.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Secret Process — numbered timeline steps                      */
/* ────────────────────────────────────────────────────────────── */
function SecretProcess() {
  const steps = [
    {
      num: "01",
      title: "Marinada 24h",
      desc: "Combinación secreta de especias y hierbas durante un día entero.",
      icon: "schedule",
      img: "/menu/pollo-frito.jpeg",
    },
    {
      num: "02",
      title: "Doble Empanizado",
      desc: "Mezcla propia de 11 especias secretas y trigo selecto para las Crestas Crujientes.",
      icon: "texture",
      img: "/menu/nuggets.jpeg",
    },
    {
      num: "03",
      title: "Calor de Precisión",
      desc: "Monitoreo constante para asegurar 0% aguado, 100% crujiente.",
      icon: "thermostat",
      img: "/menu/boneless-dip.jpeg",
    },
  ];

  return (
    <section id="proceso" className="py-28 relative overflow-hidden">
      {/* Warm surface background */}
      <div className="absolute inset-0 bg-surface-container-low" />
      <div className="absolute inset-0 grain" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="text-center mb-20">
          <span className="text-xs font-headline font-bold text-primary uppercase tracking-[0.3em] mb-2 block">
            Nuestro Ritual
          </span>
          <h2 className="text-5xl md:text-7xl lg:text-8xl font-headline font-extrabold text-tertiary uppercase leading-none tracking-tighter">
            EL{" "}
            <span className="text-stroke">SECRETO</span>
            <br />
            DEL CRUNCH
          </h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {steps.map((step) => (
            <div
              key={step.num}
              className="group relative bg-surface-container rounded-3xl overflow-hidden border border-outline-variant/15 hover:border-primary/30 transition-all duration-500"
            >
              {/* Image */}
              <div className="aspect-[4/3] relative overflow-hidden">
                <Image
                  src={step.img}
                  alt={step.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-container to-transparent" />
                {/* Step number */}
                <div className="absolute top-4 left-4 font-headline font-extrabold text-5xl text-white/10">
                  {step.num}
                </div>
              </div>
              {/* Text */}
              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-lg">
                      {step.icon}
                    </span>
                  </div>
                  <h3 className="font-headline font-bold text-tertiary text-lg uppercase tracking-tight">
                    {step.title}
                  </h3>
                </div>
                <p className="text-on-surface-variant font-body text-sm leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Loyalty Section — VIP club with metallic card                 */
/* ────────────────────────────────────────────────────────────── */
function LoyaltySection() {
  return (
    <section id="rewards" className="py-28 px-6 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-br from-[#1C1917] to-[#0C0A09] rounded-[2rem] overflow-hidden border border-outline-variant/10 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left — text */}
            <div className="p-10 lg:p-16 flex flex-col justify-center">
              <span className="text-xs font-headline font-bold text-secondary uppercase tracking-[0.3em] mb-3 block">
                El Club del Crunch
              </span>
              <h2 className="text-4xl lg:text-6xl font-headline font-extrabold text-tertiary uppercase tracking-tighter mb-6 leading-none">
                VIP<br />POLLÓN
              </h2>
              <p className="text-on-surface-variant text-base lg:text-lg mb-10 max-w-md leading-relaxed">
                Junta cinco compras entregadas y desbloquea un producto gratis.
                Tu recompensa se guarda en tu tarjeta y vence a los seis meses.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-6 mb-10">
                <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
                  <div className="text-primary text-3xl font-headline font-extrabold mb-1">5</div>
                  <div className="text-on-surface-variant text-xs font-headline font-semibold uppercase tracking-wider">
                    Compras para ganar
                  </div>
                </div>
                <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
                  <div className="text-secondary text-3xl font-headline font-extrabold mb-1">GRATIS</div>
                  <div className="text-on-surface-variant text-xs font-headline font-semibold uppercase tracking-wider">
                    Producto favorito
                  </div>
                </div>
              </div>

              <Link
                href="/loyalty"
                className="inline-flex items-center justify-center gap-3 bg-tertiary text-surface px-7 py-3.5 rounded-2xl font-headline font-bold text-sm hover:brightness-95 transition-all active:scale-95 w-fit"
              >
                <span className="material-symbols-outlined text-lg">loyalty</span>
                Ver Mi Tarjeta
              </Link>
            </div>

            {/* Right — card mockup */}
            <div className="relative p-10 lg:p-16 flex items-center justify-center overflow-hidden">
              {/* Subtle radial glow behind card */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.08)_0%,transparent_70%)]" />
              <div className="absolute inset-0 grain" />

              {/* Card */}
              <div className="relative z-10 w-full max-w-xs aspect-[3/4.5] bg-gradient-to-br from-[#292524] via-[#1C1917] to-[#0C0A09] rounded-[1.75rem] p-7 shadow-2xl border border-outline-variant/20">
                {/* Card header */}
                <div className="flex justify-between items-start mb-10">
                  <span className="text-primary font-headline font-extrabold text-lg tracking-tight">
                    POLLÓN<span className="text-secondary">.</span>
                  </span>
                  <span className="material-symbols-outlined text-outline/30 text-xl">contactless</span>
                </div>

                {/* Member level */}
                <div className="mb-8">
                  <div className="text-on-surface-variant/50 text-[10px] uppercase font-bold tracking-[0.2em] mb-1">
                    Nivel de Miembro
                  </div>
                  <div className="text-secondary font-headline font-extrabold text-2xl uppercase tracking-tight">
                    EXTRA CRISPY
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-5">
                  <div className="flex justify-between items-center border-b border-outline-variant/15 pb-3">
                    <span className="text-on-surface-variant/50 text-[10px] uppercase font-bold tracking-[0.15em]">
                      Compras
                    </span>
                    <span className="text-tertiary font-headline font-extrabold text-lg">3/5</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-outline-variant/15 pb-3">
                    <span className="text-on-surface-variant/50 text-[10px] uppercase font-bold tracking-[0.15em]">
                      Próxima Recompensa
                    </span>
                    <span className="text-tertiary font-headline font-bold text-sm">
                      Producto gratis
                    </span>
                  </div>
                </div>

                {/* QR placeholder */}
                <div className="absolute bottom-7 left-1/2 -translate-x-1/2 w-20 h-20 bg-tertiary rounded-xl flex items-center justify-center shadow-lg">
                  <div className="grid grid-cols-3 gap-0.5 w-12 h-12">
                    {[1,0,1,0,1,0,1,0,1].map((v, i) => (
                      <div key={i} className={`w-full h-full rounded-sm ${v ? "bg-surface" : "bg-transparent"}`} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Location Section — map + delivery estimator                   */
/* ────────────────────────────────────────────────────────────── */
function DeliveryEstimator() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
        ok: true;
        zoneName: string;
        feeMXN: string;
        distanceKm: number;
        estimatedMinutes?: number;
      }
    | { ok: false; reason: string }
  >(null);

  const handleEstimate = async () => {
    const q = address.trim();
    if (!q) return;
    setLoading(true);
    setResult(null);
    try {
      // 1. Geocode via Nominatim (free, public, no API key)
      const params = new URLSearchParams({
        q: `${q}, San Juan del Río, Querétaro, México`,
        format: "json",
        limit: "1",
        countrycodes: "mx",
      });
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { Accept: "application/json" } }
      );
      const geo = (await geoRes.json()) as Array<{ lat: string; lon: string }>;
      if (!geo[0]) {
        setResult({
          ok: false,
          reason: "No encontramos esa dirección. Sé más específico.",
        });
        return;
      }
      const lat = parseFloat(geo[0].lat);
      const lng = parseFloat(geo[0].lon);

      // 2. Hit our delivery/calculate endpoint
      const fee = await api.post<{
        available: boolean;
        zoneName?: string;
        feeMXN?: string;
        distanceKm: number;
        estimatedMinutes?: number;
        reason?: string;
      }>("/api/delivery/calculate", { lat, lng });

      if (!fee.available) {
        setResult({
          ok: false,
          reason: fee.reason || "Tu dirección está fuera de cobertura.",
        });
        return;
      }
      setResult({
        ok: true,
        zoneName: fee.zoneName ?? "Zona disponible",
        feeMXN: fee.feeMXN ?? "—",
        distanceKm: fee.distanceKm,
        estimatedMinutes: fee.estimatedMinutes,
      });
    } catch {
      setResult({
        ok: false,
        reason: "No pudimos calcular ahora. Intenta de nuevo.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/15">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
          <MapPin size={16} className="text-primary" />
        </div>
        <h4 className="font-headline font-bold text-sm uppercase tracking-tight">
          ¿Llegamos a tu casa?
        </h4>
      </div>
      <div className="space-y-3">
        <label htmlFor="estimator-address" className="sr-only">
          Tu dirección en San Juan del Río
        </label>
        <input
          id="estimator-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleEstimate();
          }}
          className="w-full bg-surface-container-highest rounded-xl p-3.5 text-sm text-on-surface border border-outline-variant/15 focus:border-primary/50 focus:ring-1 focus:ring-primary/30 outline-none transition-all placeholder:text-on-surface-variant/40"
          placeholder="Ej: Av. Juárez Norte 123, Centro"
          type="text"
          autoComplete="street-address"
          disabled={loading}
        />
        <button
          onClick={() => void handleEstimate()}
          disabled={loading || !address.trim()}
          className="w-full bg-primary text-on-primary py-3 rounded-xl font-headline font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Calculando…
            </>
          ) : (
            "Verificar dirección"
          )}
        </button>
      </div>

      {/* Result */}
      {result && result.ok && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-500"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold">¡Sí entregamos!</p>
              <p className="text-xs mt-0.5">
                {result.zoneName} · {result.distanceKm} km · envío {result.feeMXN}
                {result.estimatedMinutes
                  ? ` · ~${result.estimatedMinutes} min`
                  : ""}
              </p>
              <Link
                href="/menu"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary hover:underline"
              >
                Hacer mi pedido →
              </Link>
            </div>
          </div>
        </div>
      )}
      {result && !result.ok && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3 text-error"
        >
          <div className="flex items-start gap-2">
            <XCircle size={16} className="mt-0.5 flex-shrink-0" />
            <p className="text-sm">{result.reason}</p>
          </div>
        </div>
      )}

      <p className="mt-4 text-[10px] text-on-surface-variant/60 leading-relaxed">
        El costo y tiempo se confirman al hacer el pedido. Cobertura en San Juan
        del Río y zonas aledañas.
      </p>
    </div>
  );
}

function LocationSection() {
  return (
    <section
      id="location"
      className="py-28 px-6 lg:px-12 max-w-7xl mx-auto"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Text + Estimator */}
        <div className="lg:col-span-4 flex flex-col justify-center">
          <span className="text-xs font-headline font-bold text-primary uppercase tracking-[0.3em] mb-2 block">
            Encuéntranos
          </span>
          <h2 className="text-4xl md:text-5xl font-headline font-extrabold text-tertiary uppercase tracking-tighter mb-6 leading-none">
            ESTAMOS<br />EN LA{" "}
            <span className="text-primary">ZONA</span>
          </h2>
          <p className="text-on-surface-variant mb-8 leading-relaxed">
            Los más rápidos de San Juan del Río. Encuéntranos o recibe tu pedido
            en tu puerta en tiempo récord.
          </p>

          <DeliveryEstimator />
        </div>

        {/* Map */}
        <div className="lg:col-span-8 aspect-[16/10] rounded-3xl overflow-hidden border border-outline-variant/15 relative group">
          <Image
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBMerO8HsC1BqrWG7qH9TN1LbC8Ufy8ifZa_VxJ5efmeJ-m2Cb_PHrC0bIItFtbgPgDD6U5Z9FEjYTYZk7t4dm1ECWbocSW_sh7WbBGlEWyQkN0Llc3_ZVBVZ-QOv_fJId_qCM_BmZZ0tQjP5_KVuEBqibP0cEWtyg1AmzXgS5aH1opQMiVG2EJ6FhdZ7dXESTm8kzk1YtGVeouuTAHWka0cFUj-4C3B1M1ZrP6bBdb85ja5EYmCW0fVVYDOX4LFtUdpNOgBN51fGc"
            alt="Mapa de San Juan del Río"
            fill
            className="object-cover grayscale opacity-40 group-hover:opacity-50 transition-opacity duration-500"
          />
          {/* Pin */}
          <div className="absolute top-1/3 left-1/3">
            <div className="relative">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-2xl animate-pulse-glow">
                <span
                  className="material-symbols-outlined text-on-primary text-lg"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  location_on
                </span>
              </div>
              {/* Tooltip on hover */}
              <div className="absolute top-12 left-0 bg-surface-container border border-outline-variant/20 px-4 py-2.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                <p className="text-xs font-headline font-bold uppercase text-tertiary whitespace-nowrap">
                  POLLÓN HQ — CENTRO
                </p>
                <p className="text-[10px] text-on-surface-variant">
                  San Juan del Río, QRO
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Footer — minimal + large watermark typography                 */
/* ────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-outline-variant/10 bg-surface">
      {/* Large watermark */}
      <div className="absolute bottom-0 left-0 right-0 text-center pointer-events-none select-none">
        <span className="font-headline font-extrabold text-[12rem] md:text-[18rem] text-outline-variant/5 uppercase leading-none block -mb-12 md:-mb-16">
          POLLÓN
        </span>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          {/* Brand */}
          <div className="md:col-span-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center rotate-[-4deg]">
                <span className="text-on-primary font-headline font-extrabold text-xs">P</span>
              </div>
              <span className="text-lg font-headline font-extrabold text-tertiary tracking-tight">
                POLLÓN<span className="text-primary">.</span>
              </span>
            </div>
            <p className="text-on-surface-variant/60 font-body text-sm leading-relaxed max-w-xs">
              Nacidos en San Juan del Río. Criados para el crunch. Herencia de
              alto voltaje servida fresca a diario.
            </p>
          </div>

          {/* Links */}
          <div className="md:col-span-2">
            <h5 className="text-xs font-headline font-bold text-tertiary uppercase tracking-[0.2em] mb-5">
              Explorar
            </h5>
            <ul className="space-y-3">
              <li>
                <Link href="/menu" className="text-on-surface-variant/50 hover:text-primary text-sm transition-colors">
                  Menú
                </Link>
              </li>
              <li>
                <a href="#rewards" className="text-on-surface-variant/50 hover:text-primary text-sm transition-colors">
                  Rewards
                </a>
              </li>
              <li>
                <a href="#location" className="text-on-surface-variant/50 hover:text-primary text-sm transition-colors">
                  Ubicación
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <h5 className="text-xs font-headline font-bold text-tertiary uppercase tracking-[0.2em] mb-5">
              Legal
            </h5>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-on-surface-variant/50 hover:text-primary text-sm transition-colors">
                  Privacidad
                </a>
              </li>
              <li>
                <a href="#" className="text-on-surface-variant/50 hover:text-primary text-sm transition-colors">
                  Términos
                </a>
              </li>
              <li>
                <a href="#" className="text-on-surface-variant/50 hover:text-primary text-sm transition-colors">
                  Alérgenos
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <h5 className="text-xs font-headline font-bold text-tertiary uppercase tracking-[0.2em] mb-5">
              Contacto
            </h5>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-on-surface-variant/50 hover:text-primary text-sm transition-colors">
                  Instagram
                </a>
              </li>
              <li>
                <a href="#" className="text-on-surface-variant/50 hover:text-primary text-sm transition-colors">
                  TikTok
                </a>
              </li>
              <li>
                <a href="#" className="text-on-surface-variant/50 hover:text-primary text-sm transition-colors">
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>

          {/* SJR badge */}
          <div className="md:col-span-2 flex md:justify-end items-start">
            <div className="text-right">
              <div className="text-outline-variant/30 font-headline font-extrabold text-5xl uppercase leading-none mb-2">
                SJR
              </div>
              <p className="text-on-surface-variant/30 text-[10px] font-bold uppercase tracking-wider">
                &copy;2025 POLLÓN SJR
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Floating Order CTA — glowing pulse (mobile)                   */
/* ────────────────────────────────────────────────────────────── */
function FloatingCartButton() {
  return (
    <Link
      href="/menu"
      aria-label="Ir al menú"
      className="fixed bottom-6 right-6 z-50 bg-primary w-14 h-14 rounded-2xl flex items-center justify-center text-on-primary shadow-2xl hover:scale-110 active:scale-90 transition-transform lg:hidden animate-pulse-glow"
    >
      <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden>
        shopping_basket
      </span>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Export                                                        */
/* ────────────────────────────────────────────────────────────── */
export function LandingPage() {
  const [authed, setAuthed] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    setAuthed(!!getToken());
  }, []);

  const handleLogout = () => {
    clearTokens();
    setAuthed(false);
  };

  const { data: menu } = useQuery({
    queryKey: ["menu-landing"],
    queryFn: () => api.get<MenuByCategory[]>("/api/menu"),
    staleTime: 5 * 60_000,
  });

  const { data: promosToday = [] } = useQuery({
    queryKey: ["promos-today-landing"],
    queryFn: () =>
      api.get<PublicPromotion[]>("/api/menu/promotions/today"),
    staleTime: 5 * 60_000,
  });

  const comboFamiliar = useMemo<ProductPublic | null>(() => {
    if (!menu) return null;
    const all = menu.flatMap((c) => c.products);
    return (
      all.find((p) => /familiar/i.test(p.name)) ??
      all.find((p) => /combo/i.test(p.name)) ??
      null
    );
  }, [menu]);

  const todaysPromo = promosToday[0] ?? null;

  return (
    <>
      <NavBar
        authed={authed}
        onLogin={() => setAuthOpen(true)}
        onLogout={handleLogout}
      />
      <main>
        <HeroSection />
        <MarqueeStrip />
        <MenuHighlights
          comboFamiliar={comboFamiliar}
          todaysPromo={todaysPromo}
        />
        <HowToOrder />
        <SecretProcess />
        <LoyaltySection />
        <LocationSection />
      </main>
      <Footer />
      <FloatingCartButton />
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthed(true);
          setAuthOpen(false);
        }}
      />
    </>
  );
}
