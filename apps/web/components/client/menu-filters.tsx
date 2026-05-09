"use client";

import { Filter, X } from "lucide-react";

export type MenuFilterTag =
  | "vegetariano"
  | "vegano"
  | "picante"
  | "muy_picante"
  | "sin_gluten"
  | "sin_lactosa"
  | "saludable"
  | "kids"
  | "para_compartir"
  | "nuevo";

const TAG_META: Record<MenuFilterTag, { label: string; emoji: string }> = {
  vegetariano: { label: "Vegetariano", emoji: "🥬" },
  vegano: { label: "Vegano", emoji: "🌱" },
  picante: { label: "Picante", emoji: "🌶️" },
  muy_picante: { label: "Muy picante", emoji: "🔥" },
  sin_gluten: { label: "Sin gluten", emoji: "🌾" },
  sin_lactosa: { label: "Sin lactosa", emoji: "🥛" },
  saludable: { label: "Saludable", emoji: "💪" },
  kids: { label: "Para niños", emoji: "🧒" },
  para_compartir: { label: "Compartir", emoji: "👥" },
  nuevo: { label: "Nuevo", emoji: "✨" },
};

export function MenuFilters({
  available,
  active,
  onChange,
}: {
  available: MenuFilterTag[];
  active: MenuFilterTag[];
  onChange: (next: MenuFilterTag[]) => void;
}) {
  if (available.length === 0) return null;

  const toggle = (tag: MenuFilterTag) => {
    if (active.includes(tag)) {
      onChange(active.filter((t) => t !== tag));
    } else {
      onChange([...active, tag]);
    }
  };

  const visibleTags = available.filter((t) => TAG_META[t]);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/70">
        <Filter size={11} />
        Filtros
      </span>
      {visibleTags.map((tag) => {
        const meta = TAG_META[tag];
        const isActive = active.includes(tag);
        return (
          <button
            key={tag}
            onClick={() => toggle(tag)}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
              isActive
                ? "border-primary bg-primary text-on-primary"
                : "border-outline-variant/30 bg-surface-container text-on-surface-variant hover:border-primary/40"
            }`}
          >
            <span>{meta.emoji}</span>
            {meta.label}
          </button>
        );
      })}
      {active.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="inline-flex items-center gap-1 rounded-full border border-error/30 bg-error/5 px-3 py-1 text-xs font-semibold text-error transition-all hover:bg-error/10"
        >
          <X size={11} />
          Limpiar ({active.length})
        </button>
      )}
    </div>
  );
}
