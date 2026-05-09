"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents, CATEGORY_LABELS } from "@pollon/utils";
import {
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Trash2,
  Eye,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { useState } from "react";

interface Variant {
  label: string;
  price: number;
}

interface Modifier {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: { label: string; price: number }[];
  sortOrder: number;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  emoji: string | null;
  imageUrl: string | null;
  active: boolean;
  soldOut: boolean;
  sortOrder: number;
  variants: Variant[] | null;
  tags?: string[];
  modifiers?: Modifier[];
}

const TAG_OPTIONS: { value: string; label: string; emoji: string }[] = [
  { value: "vegetariano", label: "Vegetariano", emoji: "🥬" },
  { value: "vegano", label: "Vegano", emoji: "🌱" },
  { value: "picante", label: "Picante", emoji: "🌶️" },
  { value: "muy_picante", label: "Muy picante", emoji: "🔥" },
  { value: "sin_gluten", label: "Sin gluten", emoji: "🌾" },
  { value: "sin_lactosa", label: "Sin lactosa", emoji: "🥛" },
  { value: "saludable", label: "Saludable", emoji: "💪" },
  { value: "kids", label: "Niños", emoji: "🧒" },
  { value: "para_compartir", label: "Compartir", emoji: "👥" },
  { value: "nuevo", label: "Nuevo", emoji: "✨" },
];

const CATEGORIES = Object.keys(CATEGORY_LABELS);

export function MenuManager() {
  const token = getAdminToken();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => api.get<Product[]>("/api/admin/products", token || undefined),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: boolean }) =>
      api.patch(`/api/admin/products/${id}`, { [field]: value }, token || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-products"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/admin/products/${id}`, token || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-products"] }),
    onError: (err: any) => alert(err.message || "Error al eliminar"),
  });

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Gestión de Menú</h1>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-semibold"
        >
          <Plus size={18} /> Nuevo producto
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-8">
            <h2 className="text-lg font-bold mb-3">
              {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category}
            </h2>
            <div className="bg-surface-container-high rounded-xl border border-outline-variant/20 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-container border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold">Producto</th>
                    <th className="text-left p-3 font-semibold">Precio</th>
                    <th className="text-left p-3 font-semibold">Variantes</th>
                    <th className="text-center p-3 font-semibold">Activo</th>
                    <th className="text-center p-3 font-semibold">Agotado</th>
                    <th className="text-center p-3 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((p) => (
                    <tr key={p.id} className={!p.active ? "opacity-50" : ""}>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-lg">
                              {p.emoji ?? "🍗"}
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{p.name}</p>
                            {p.description && (
                              <p className="text-xs text-on-surface-variant line-clamp-1">{p.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-semibold">{formatCents(p.price)}</td>
                      <td className="p-3 text-xs text-on-surface-variant">
                        {p.variants && p.variants.length > 0
                          ? `${p.variants.length}`
                          : "—"}
                        {p.modifiers && p.modifiers.length > 0 && (
                          <span className="ml-2 text-tertiary">
                            +{p.modifiers.length} mod
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() =>
                            toggleMut.mutate({ id: p.id, field: "active", value: !p.active })
                          }
                          className={p.active ? "text-green-500" : "text-outline-variant"}
                        >
                          {p.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() =>
                            toggleMut.mutate({ id: p.id, field: "soldOut", value: !p.soldOut })
                          }
                          className={p.soldOut ? "text-error" : "text-outline-variant"}
                        >
                          {p.soldOut ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center gap-1.5">
                          <button
                            onClick={() => setPreviewProduct(p)}
                            aria-label="Vista previa"
                            className="p-1.5 rounded-md text-on-surface-variant hover:bg-surface-variant hover:text-tertiary"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setEditing(p);
                              setShowForm(true);
                            }}
                            aria-label="Editar"
                            className="p-1.5 rounded-md text-primary hover:bg-primary/10"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `¿Eliminar "${p.name}"? Solo se puede eliminar si no tiene pedidos asociados. Si tiene historial, mejor desactívalo.`
                                )
                              ) {
                                deleteMut.mutate(p.id);
                              }
                            }}
                            aria-label="Eliminar"
                            disabled={deleteMut.isPending}
                            className="p-1.5 rounded-md text-on-surface-variant hover:bg-error/10 hover:text-error disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {showForm && (
        <ProductFormModal
          product={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["admin-products"] });
          }}
        />
      )}

      {previewProduct && (
        <PreviewModal
          product={previewProduct}
          onClose={() => setPreviewProduct(null)}
        />
      )}
    </div>
  );
}

function ProductFormModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const token = getAdminToken();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [emoji, setEmoji] = useState(product?.emoji || "🍗");
  const [price, setPrice] = useState(
    product ? (product.price / 100).toString() : ""
  );
  const [category, setCategory] = useState(
    product?.category || (CATEGORIES[0] || "POLLO_FRITO")
  );
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || "");
  const [variants, setVariants] = useState<Variant[]>(
    product?.variants ?? []
  );
  const [tags, setTags] = useState<string[]>(product?.tags ?? []);
  const [modifiers, setModifiers] = useState<Modifier[]>(
    product?.modifiers ?? []
  );

  const handleAddVariant = () =>
    setVariants((vs) => [...vs, { label: "", price: 0 }]);
  const handleRemoveVariant = (i: number) =>
    setVariants((vs) => vs.filter((_, j) => j !== i));
  const handleVariantChange = (i: number, patch: Partial<Variant>) =>
    setVariants((vs) =>
      vs.map((v, j) => (j === i ? { ...v, ...patch } : v))
    );

  const handleAddModifier = () =>
    setModifiers((ms) => [
      ...ms,
      {
        id: `new-${Date.now()}`,
        name: "",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        options: [{ label: "", price: 0 }],
        sortOrder: ms.length,
      },
    ]);

  const handleRemoveModifier = async (mod: Modifier) => {
    if (!product) {
      setModifiers((ms) => ms.filter((m) => m.id !== mod.id));
      return;
    }
    if (mod.id.startsWith("new-")) {
      setModifiers((ms) => ms.filter((m) => m.id !== mod.id));
      return;
    }
    if (!confirm(`¿Eliminar el modificador "${mod.name}"?`)) return;
    await api.delete(`/api/admin/modifiers/${mod.id}`, token || undefined);
    setModifiers((ms) => ms.filter((m) => m.id !== mod.id));
    qc.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const cleanVariants = variants
        .filter((v) => v.label.trim())
        .map((v) => ({
          label: v.label.trim(),
          price: Math.max(0, Math.round(v.price)),
        }));

      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        price: Math.round(parseFloat(price || "0") * 100),
        category,
        emoji: emoji || undefined,
        imageUrl: imageUrl.trim() || null,
        variants: cleanVariants.length > 0 ? cleanVariants : null,
        tags,
      };

      let savedProductId = product?.id;
      if (product) {
        await api.patch(`/api/admin/products/${product.id}`, body, token || undefined);
      } else {
        const created = await api.post<{ id: string }>(
          "/api/admin/products",
          body,
          token || undefined
        );
        savedProductId = created.id;
      }

      // Save modifiers
      if (savedProductId) {
        for (const mod of modifiers) {
          const cleanOpts = mod.options
            .filter((o) => o.label.trim())
            .map((o) => ({
              label: o.label.trim(),
              price: Math.max(0, Math.round(o.price)),
            }));
          if (!mod.name.trim() || cleanOpts.length === 0) continue;
          const payload = {
            name: mod.name.trim(),
            required: mod.required,
            minSelect: mod.minSelect,
            maxSelect: mod.maxSelect,
            options: cleanOpts,
            sortOrder: mod.sortOrder,
          };
          if (mod.id.startsWith("new-")) {
            await api.post(
              `/api/admin/products/${savedProductId}/modifiers`,
              payload,
              token || undefined
            );
          } else {
            await api.patch(
              `/api/admin/modifiers/${mod.id}`,
              payload,
              token || undefined
            );
          }
        }
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative flex flex-col bg-surface-container-high rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden border border-outline-variant/20"
      >
        <div className="flex items-center justify-between border-b border-outline-variant/15 px-5 py-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              {product ? "Editando" : "Nuevo"}
            </span>
            <h2 className="text-lg font-bold">
              {product ? product.name : "Nuevo producto"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg border border-outline-variant/20 p-2 text-on-surface-variant hover:bg-surface-variant"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <div className="grid grid-cols-[60px_1fr] gap-3">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
              placeholder="🍗"
              className="rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-center text-2xl"
              aria-label="Emoji"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del producto"
              required
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm"
            />
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            rows={2}
            className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm resize-none"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                Precio (MXN)
              </label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="120"
                required
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] || c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
              URL de imagen
            </label>
            <div className="relative">
              <ImageIcon
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 pl-9 text-sm"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
              Etiquetas (filtros del cliente)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TAG_OPTIONS.map((opt) => {
                const isActive = tags.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setTags((prev) =>
                        isActive
                          ? prev.filter((t) => t !== opt.value)
                          : [...prev, opt.value]
                      )
                    }
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      isActive
                        ? "border-primary bg-primary text-on-primary"
                        : "border-outline-variant/30 bg-surface-container text-on-surface-variant hover:border-primary/40"
                    }`}
                  >
                    <span>{opt.emoji}</span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Variants */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                Variantes (ej: chico, mediano, grande)
              </label>
              <button
                type="button"
                onClick={handleAddVariant}
                className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary"
              >
                <Plus size={12} /> Agregar
              </button>
            </div>
            <div className="space-y-2">
              {variants.length === 0 && (
                <p className="rounded-lg border border-dashed border-outline-variant/30 p-3 text-center text-xs text-on-surface-variant">
                  Sin variantes. El producto se vende a precio único.
                </p>
              )}
              {variants.map((v, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_120px_auto] items-center gap-2 rounded-xl border border-outline-variant/15 bg-surface p-2.5"
                >
                  <input
                    value={v.label}
                    onChange={(e) =>
                      handleVariantChange(i, { label: e.target.value })
                    }
                    placeholder="Chica"
                    className="rounded-md border border-outline-variant/25 bg-surface-container px-2 py-1.5 text-sm"
                  />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">
                      ¢
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={v.price}
                      onChange={(e) =>
                        handleVariantChange(i, {
                          price: parseInt(e.target.value || "0", 10),
                        })
                      }
                      placeholder="9000"
                      className="w-full rounded-md border border-outline-variant/25 bg-surface-container px-5 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveVariant(i)}
                    aria-label="Eliminar variante"
                    className="rounded-md p-1.5 text-on-surface-variant hover:bg-error/10 hover:text-error"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-on-surface-variant/70">
              El precio está en centavos. 9000 = $90.00
            </p>
          </div>

          {/* Modifiers */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                Modificadores (ej: extras, niveles de picante)
              </label>
              <button
                type="button"
                onClick={handleAddModifier}
                className="inline-flex items-center gap-1 rounded-lg bg-tertiary/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-tertiary"
              >
                <Plus size={12} /> Agregar grupo
              </button>
            </div>
            <div className="space-y-3">
              {modifiers.map((mod, mIdx) => (
                <ModifierEditor
                  key={mod.id}
                  modifier={mod}
                  onChange={(patch) =>
                    setModifiers((ms) =>
                      ms.map((m, j) => (j === mIdx ? { ...m, ...patch } : m))
                    )
                  }
                  onRemove={() => handleRemoveModifier(mod)}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-outline-variant/15 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-outline-variant/25 px-4 py-2 text-sm font-semibold text-on-surface-variant"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {product ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModifierEditor({
  modifier,
  onChange,
  onRemove,
}: {
  modifier: Modifier;
  onChange: (patch: Partial<Modifier>) => void;
  onRemove: () => void;
}) {
  const updateOpt = (i: number, patch: Partial<{ label: string; price: number }>) => {
    onChange({
      options: modifier.options.map((o, j) => (j === i ? { ...o, ...patch } : o)),
    });
  };
  const addOpt = () =>
    onChange({ options: [...modifier.options, { label: "", price: 0 }] });
  const removeOpt = (i: number) =>
    onChange({ options: modifier.options.filter((_, j) => j !== i) });

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={modifier.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nombre del grupo (ej: Extras)"
          className="flex-1 rounded-md border border-outline-variant/25 bg-surface-container px-2 py-1.5 text-sm font-semibold"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Eliminar grupo"
          className="rounded-md p-1.5 text-on-surface-variant hover:bg-error/10 hover:text-error"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-3 items-center gap-2 text-[11px]">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={modifier.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="h-3 w-3 accent-primary"
          />
          Obligatorio
        </label>
        <label className="flex items-center gap-1.5">
          Mín
          <input
            type="number"
            min={0}
            value={modifier.minSelect}
            onChange={(e) =>
              onChange({ minSelect: parseInt(e.target.value || "0", 10) })
            }
            className="w-12 rounded-md border border-outline-variant/25 bg-surface-container px-1 py-0.5 text-center text-xs"
          />
        </label>
        <label className="flex items-center gap-1.5">
          Máx
          <input
            type="number"
            min={1}
            value={modifier.maxSelect}
            onChange={(e) =>
              onChange({
                maxSelect: Math.max(1, parseInt(e.target.value || "1", 10)),
              })
            }
            className="w-12 rounded-md border border-outline-variant/25 bg-surface-container px-1 py-0.5 text-center text-xs"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        {modifier.options.map((o, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_100px_auto] items-center gap-2"
          >
            <input
              value={o.label}
              onChange={(e) => updateOpt(i, { label: e.target.value })}
              placeholder="Queso extra"
              className="rounded-md border border-outline-variant/25 bg-surface-container px-2 py-1 text-xs"
            />
            <input
              type="number"
              min={0}
              value={o.price}
              onChange={(e) =>
                updateOpt(i, { price: parseInt(e.target.value || "0", 10) })
              }
              placeholder="¢"
              className="rounded-md border border-outline-variant/25 bg-surface-container px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => removeOpt(i)}
              aria-label="Eliminar opción"
              className="rounded p-1 text-on-surface-variant hover:bg-error/10 hover:text-error"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addOpt}
          className="inline-flex items-center gap-1 rounded-md bg-surface-container px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary"
        >
          <Plus size={10} /> Agregar opción
        </button>
      </div>
    </div>
  );
}

function PreviewModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-surface-container-high shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm"
        >
          <X size={14} />
        </button>
        <div className="aspect-[4/3] bg-surface flex items-center justify-center">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-7xl">{product.emoji ?? "🍗"}</span>
          )}
        </div>
        <div className="p-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            {CATEGORY_LABELS[product.category as keyof typeof CATEGORY_LABELS] ||
              product.category}
          </span>
          <h3 className="mt-1 text-lg font-extrabold text-tertiary">
            {product.name}
          </h3>
          {product.description && (
            <p className="mt-1 text-sm text-on-surface-variant">
              {product.description}
            </p>
          )}
          <p className="mt-3 text-2xl font-extrabold text-primary">
            {formatCents(product.price)}
          </p>
          {product.variants && product.variants.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Variantes
              </p>
              {product.variants.map((v, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5 text-xs"
                >
                  <span>{v.label}</span>
                  <span className="font-bold text-primary">
                    {formatCents(v.price)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {product.modifiers && product.modifiers.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Modificadores
              </p>
              {product.modifiers.map((m) => (
                <div key={m.id} className="rounded-lg bg-surface p-2 text-xs">
                  <p className="font-semibold">
                    {m.name}{" "}
                    {m.required && (
                      <span className="text-[9px] text-error">obligatorio</span>
                    )}
                  </p>
                  <p className="text-on-surface-variant">
                    {m.options.map((o) => o.label).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {!product.active && (
              <span className="rounded-md bg-error/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-error">
                Inactivo
              </span>
            )}
            {product.soldOut && (
              <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                Agotado
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
