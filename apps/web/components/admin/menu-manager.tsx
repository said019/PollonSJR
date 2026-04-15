"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import { CATEGORY_LABELS } from "@pollon/utils";
import { Plus, Pencil, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { useState } from "react";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  imageUrl: string | null;
  active: boolean;
  soldOut: boolean;
  sortOrder: number;
  variants: { label: string; price: number }[];
}

export function MenuManager() {
  const token = getAdminToken();
  const qc = useQueryClient();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => api.get<Product[]>("/api/admin/products", token || undefined),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: boolean }) =>
      api.patch(`/api/admin/products/${id}`, { [field]: value }, token || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-products"] }),
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
            setEditingProduct(null);
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
                          {p.imageUrl && (
                            <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
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
                      <td className="p-3 text-center">
                        <button
                          onClick={() => toggleMut.mutate({ id: p.id, field: "active", value: !p.active })}
                          className={p.active ? "text-green-500" : "text-outline-variant"}
                        >
                          {p.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => toggleMut.mutate({ id: p.id, field: "soldOut", value: !p.soldOut })}
                          className={p.soldOut ? "text-error" : "text-outline-variant"}
                        >
                          {p.soldOut ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            setEditingProduct(p);
                            setShowForm(true);
                          }}
                          className="text-primary"
                        >
                          <Pencil size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Product form modal */}
      {showForm && (
        <ProductFormModal
          product={editingProduct}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["admin-products"] });
          }}
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
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [price, setPrice] = useState(product ? (product.price / 100).toString() : "");
  const [category, setCategory] = useState(product?.category || "POLLOS");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const body = {
        name,
        description: description || null,
        price: Math.round(parseFloat(price) * 100),
        category,
        imageUrl: imageUrl || null,
      };

      if (product) {
        await api.patch(`/api/admin/products/${product.id}`, body, token || undefined);
      } else {
        await api.post("/api/admin/products", body, token || undefined);
      }
      onSaved();
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative bg-surface-container-high rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
        <h2 className="text-lg font-bold">{product ? "Editar producto" : "Nuevo producto"}</h2>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del producto"
          required
          className="w-full border rounded-xl p-3 text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          rows={2}
          className="w-full border rounded-xl p-3 text-sm resize-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Precio MXN"
            required
            className="border rounded-xl p-3 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border rounded-xl p-3 text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="URL de imagen (opcional)"
          className="w-full border rounded-xl p-3 text-sm"
        />

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 border py-2 rounded-xl text-sm">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-primary text-on-primary py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
