"use client";

import type {
  ProductPublic,
  CartItemModifier,
  ProductModifierPublic,
} from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { RelatedProductsRail } from "./related-products-rail";

interface Props {
  open: boolean;
  product: ProductPublic | null;
  defaultVariant?: string | null;
  defaultModifiers?: CartItemModifier[];
  defaultQty?: number;
  defaultNotes?: string;
  /** When editing an existing cart line, change the primary button copy. */
  editing?: boolean;
  imageUrl?: string | null;
  onClose: () => void;
  onConfirm: (data: {
    variant: string | null;
    modifiers: CartItemModifier[];
    qty: number;
    notes: string;
    finalUnitPrice: number;
  }) => void;
}

// modifierId -> { optionLabel -> qty }
type Selection = Record<string, Record<string, number>>;

function isQuotaMod(m: ProductModifierPublic): boolean {
  return typeof m.totalQuota === "number" && m.totalQuota > 0;
}

function totalPicks(picks: Record<string, number> | undefined): number {
  if (!picks) return 0;
  return Object.values(picks).reduce((s, n) => s + n, 0);
}

export function ProductOptionsModal({
  open,
  product,
  defaultVariant = null,
  defaultModifiers,
  defaultQty,
  defaultNotes,
  editing,
  imageUrl,
  onClose,
  onConfirm,
}: Props) {
  const [variant, setVariant] = useState<string | null>(defaultVariant);
  const [selections, setSelections] = useState<Selection>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !product) return;
    setVariant(defaultVariant ?? null);
    setQty(defaultQty && defaultQty > 0 ? defaultQty : 1);
    setNotes(defaultNotes ?? "");
    setError(null);

    const initial: Selection = {};
    (product.modifiers ?? []).forEach((m) => {
      initial[m.id] = {};
    });

    // Pre-fill selections from defaultModifiers (when editing a cart item).
    // Match modifiers by name (CartItemModifier doesn't carry modifier id).
    if (defaultModifiers && defaultModifiers.length > 0 && product.modifiers) {
      for (const dm of defaultModifiers) {
        const mod = product.modifiers.find((m) => m.name === dm.name);
        if (!mod) continue;
        const optExists = mod.options.some((o) => o.label === dm.option);
        if (!optExists) continue;
        initial[mod.id] = {
          ...initial[mod.id],
          [dm.option]: (initial[mod.id]?.[dm.option] ?? 0) + (dm.qty ?? 1),
        };
      }
    }
    setSelections(initial);
  }, [open, product, defaultVariant, defaultModifiers, defaultQty, defaultNotes]);

  const basePrice = useMemo(() => {
    if (!product) return 0;
    if (variant && product.variants) {
      const v = product.variants.find((vv) => vv.label === variant);
      if (v) return v.price;
    }
    return product.price;
  }, [product, variant]);

  const modsTotal = useMemo(() => {
    if (!product) return 0;
    let total = 0;
    for (const mod of product.modifiers ?? []) {
      const picks = selections[mod.id] ?? {};
      for (const [label, n] of Object.entries(picks)) {
        const opt = mod.options.find((o) => o.label === label);
        if (opt) total += opt.price * n;
      }
    }
    return total;
  }, [product, selections]);

  const finalUnitPrice = basePrice + modsTotal;

  const setQtyFor = (modId: string, label: string, next: number) => {
    setSelections((s) => {
      const current = { ...(s[modId] ?? {}) };
      if (next <= 0) delete current[label];
      else current[label] = next;
      return { ...s, [modId]: current };
    });
  };

  const togglePick = (mod: ProductModifierPublic, optionLabel: string) => {
    const picks = selections[mod.id] ?? {};
    const has = (picks[optionLabel] ?? 0) > 0;

    if (mod.maxSelect === 1 && !isQuotaMod(mod)) {
      // single-select: replace
      setSelections((s) => ({
        ...s,
        [mod.id]: has ? {} : { [optionLabel]: 1 },
      }));
      return;
    }

    if (has) {
      setQtyFor(mod.id, optionLabel, 0);
      return;
    }

    const total = totalPicks(picks);
    if (!isQuotaMod(mod) && total >= mod.maxSelect) return;
    setQtyFor(mod.id, optionLabel, 1);
  };

  const validate = (): string | null => {
    if (!product) return null;
    for (const mod of product.modifiers ?? []) {
      const picks = selections[mod.id] ?? {};
      const total = totalPicks(picks);

      if (isQuotaMod(mod)) {
        const quota = mod.totalQuota!;
        if (total !== quota) {
          return `"${mod.name}" debe sumar ${quota} (vas ${total})`;
        }
        continue;
      }

      if (mod.required && total === 0) {
        return `Selecciona una opción para "${mod.name}"`;
      }
      if (total < mod.minSelect) {
        return `"${mod.name}" requiere al menos ${mod.minSelect} opción${
          mod.minSelect > 1 ? "es" : ""
        }`;
      }
    }
    return null;
  };

  const handleConfirm = () => {
    if (!product) return;
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    const flatMods: CartItemModifier[] = [];
    for (const mod of product.modifiers ?? []) {
      const picks = selections[mod.id] ?? {};
      for (const [label, n] of Object.entries(picks)) {
        if (n <= 0) continue;
        const opt = mod.options.find((o) => o.label === label);
        if (!opt) continue;
        flatMods.push({
          name: mod.name,
          option: label,
          price: opt.price,
          qty: n,
        });
      }
    }
    onConfirm({
      variant,
      modifiers: flatMods,
      qty,
      notes,
      finalUnitPrice,
    });
  };

  if (!product) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[92vh] flex-col rounded-t-3xl border-t border-outline-variant/15 bg-surface-container shadow-2xl sm:inset-x-auto sm:left-1/2 sm:top-[6vh] sm:max-h-[88vh] sm:w-[min(92vw,520px)] sm:-translate-x-1/2 sm:rounded-3xl"
          >
            <div className="relative overflow-hidden rounded-t-3xl">
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white backdrop-blur-sm"
              >
                <X size={16} />
              </button>
              <div className="relative h-44 w-full bg-surface-container-high">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={product.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 520px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-7xl">
                    {product.emoji ?? "🍗"}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-container via-transparent" />
                <div className="absolute bottom-3 left-4 right-12">
                  <h2 className="font-headline text-xl font-extrabold text-tertiary">
                    {product.name}
                  </h2>
                  {product.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant/80">
                      {product.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {/* Variants */}
              {product.variants && product.variants.length > 0 && (
                <Section title="Tamaño" required>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map((v) => (
                      <button
                        key={v.label}
                        onClick={() => setVariant(v.label)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${
                          variant === v.label
                            ? "border-primary bg-primary text-on-primary"
                            : "border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:border-primary/40"
                        }`}
                      >
                        {v.label} · {formatCents(v.price)}
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* Modifiers */}
              {product.modifiers?.map((mod) => {
                const picks = selections[mod.id] ?? {};
                const total = totalPicks(picks);
                const isQuota = isQuotaMod(mod);
                const remaining = isQuota ? (mod.totalQuota ?? 0) - total : 0;

                return (
                  <Section
                    key={mod.id}
                    title={mod.name}
                    required={
                      isQuota ||
                      mod.required ||
                      mod.minSelect > 0
                    }
                    hint={
                      isQuota
                        ? `Elige ${mod.totalQuota} en total · puedes repetir`
                        : mod.maxSelect > 1
                          ? `Elige hasta ${mod.maxSelect}${
                              mod.minSelect > 0 ? ` (mín. ${mod.minSelect})` : ""
                            }`
                          : undefined
                    }
                    badge={
                      isQuota
                        ? `${total} / ${mod.totalQuota}`
                        : undefined
                    }
                  >
                    {isQuota ? (
                      <div className="space-y-1.5">
                        {mod.options.map((opt) => {
                          const n = picks[opt.label] ?? 0;
                          const canAdd = remaining > 0;
                          return (
                            <div
                              key={opt.label}
                              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-all ${
                                n > 0
                                  ? "border-primary/40 bg-primary/5 text-on-surface"
                                  : "border-outline-variant/25 bg-surface-container-high text-on-surface"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{opt.label}</p>
                                {opt.price > 0 && (
                                  <p className="text-[10px] text-on-surface-variant">
                                    +{formatCents(opt.price)} c/u
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 rounded-full border border-outline-variant/30 bg-surface px-1 py-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setQtyFor(mod.id, opt.label, Math.max(0, n - 1))
                                  }
                                  disabled={n <= 0}
                                  aria-label="Quitar uno"
                                  className="rounded-full p-1 text-on-surface-variant disabled:opacity-30"
                                >
                                  <Minus size={12} />
                                </button>
                                <span
                                  className={`w-5 text-center text-sm font-bold ${
                                    n > 0 ? "text-primary" : "text-on-surface-variant/50"
                                  }`}
                                >
                                  {n}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setQtyFor(mod.id, opt.label, n + 1)}
                                  disabled={!canAdd}
                                  aria-label="Agregar uno"
                                  className="rounded-full p-1 text-on-surface-variant disabled:opacity-30"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {remaining > 0 && (
                          <p className="text-[11px] text-amber-500">
                            Te {remaining === 1 ? "falta" : "faltan"}{" "}
                            <strong>{remaining}</strong> por elegir
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {mod.options.map((opt) => {
                          const isPicked = (picks[opt.label] ?? 0) > 0;
                          const disabled =
                            !isPicked &&
                            mod.maxSelect > 1 &&
                            total >= mod.maxSelect;
                          return (
                            <button
                              key={opt.label}
                              onClick={() => togglePick(mod, opt.label)}
                              disabled={disabled}
                              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all disabled:opacity-40 ${
                                isPicked
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-outline-variant/25 bg-surface-container-high text-on-surface hover:border-primary/40"
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <span
                                  className={`flex h-4 w-4 items-center justify-center border ${
                                    isPicked
                                      ? "border-primary bg-primary"
                                      : "border-outline-variant/40"
                                  } ${
                                    mod.maxSelect === 1 ? "rounded-full" : "rounded"
                                  }`}
                                >
                                  {isPicked && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                  )}
                                </span>
                                {opt.label}
                              </span>
                              <span className="text-[11px] font-semibold text-on-surface-variant">
                                {opt.price > 0 ? `+${formatCents(opt.price)}` : "Incluido"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </Section>
                );
              })}

              {/* Notes */}
              <Section title="Notas (opcional)">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Sin cebolla, picante extra, etc."
                  maxLength={200}
                  rows={2}
                  className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-high p-3 text-sm text-on-surface outline-none focus:border-primary/60"
                />
              </Section>

              {error && (
                <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
                  {error}
                </div>
              )}
            </div>

            {/* "Va bien con esto" — collaborative filtering. */}
            {product && <RelatedProductsRail productId={product.id} />}

            {/* Footer */}
            <div className="flex items-center gap-3 border-t border-outline-variant/15 bg-surface-container-high/40 p-4">
              <div className="flex items-center gap-1 rounded-full border border-outline-variant/30 bg-surface-container px-2 py-1">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="rounded-full p-1 text-on-surface-variant disabled:opacity-30"
                  disabled={qty <= 1}
                  aria-label="Menos"
                >
                  <Minus size={14} />
                </button>
                <span className="w-6 text-center font-headline text-sm font-bold">
                  {qty}
                </span>
                <button
                  onClick={() => setQty((q) => Math.min(20, q + 1))}
                  className="rounded-full p-1 text-on-surface-variant"
                  aria-label="Más"
                >
                  <Plus size={14} />
                </button>
              </div>
              <button
                onClick={handleConfirm}
                className="flex flex-1 items-center justify-between rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary"
              >
                <span>{editing ? "Guardar cambios" : "Agregar al carrito"}</span>
                <span>{formatCents(finalUnitPrice * qty)}</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({
  title,
  children,
  required,
  hint,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
  badge?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="font-headline text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          {title}
        </h3>
        {required && (
          <span className="rounded bg-error/10 px-1.5 text-[9px] font-bold uppercase tracking-wider text-error">
            Obligatorio
          </span>
        )}
        {badge && (
          <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
            {badge}
          </span>
        )}
        {hint && (
          <span className="text-[10px] text-on-surface-variant/60">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
