"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

type Product = { id: string; name: string; variants: Array<{ label: string }> | null; active: boolean; soldOut: boolean };
type Link = { externalId: string; productId: string; variant: string | null };

export function WhatsAppCatalogLinks() {
  const token = getAdminToken() || undefined;
  const qc = useQueryClient();
  const [externalId, setExternalId] = useState("");
  const [productId, setProductId] = useState("");
  const [variant, setVariant] = useState("");
  const [source, setSource] = useState<Array<{ id: string; name: string }>>([]);
  const [notice, setNotice] = useState("");
  const query = useQuery({ queryKey: ["whatsapp-catalog-links"], queryFn: () => api.get<{ links: Link[]; products: Product[]; catalogUrl: string }>("/api/evolution/catalog/links", token) });
  const load = useMutation({ mutationFn: () => api.get<{ products: Array<{ id: string; name: string }> }>("/api/evolution/catalog/source", token),
    onSuccess: data => { setSource(data.products); setNotice("Selecciona un producto del catálogo y su equivalente en la app."); },
    onError: () => setNotice("No se pudo consultar WhatsApp. Puedes capturar el ID del producto manualmente.") });
  const save = useMutation({ mutationFn: () => api.put("/api/evolution/catalog/links", { externalId: externalId.trim(), productId, variant: variant || null }, token),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["whatsapp-catalog-links"] }); setNotice("Vínculo guardado."); setExternalId(""); },
    onError: () => setNotice("No se pudo guardar. Revisa el producto y su presentación.") });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/api/evolution/catalog/links/${encodeURIComponent(id)}`, token),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["whatsapp-catalog-links"] }); setNotice("Vínculo eliminado."); },
    onError: () => setNotice("No se pudo eliminar el vínculo.") });
  const selected = query.data?.products.find(p => p.id === productId);
  return <section className="mt-5 border-t border-outline-variant/20 pt-5">
    <h3 className="font-bold">Productos del catálogo de WhatsApp</h3>
    <p className="mt-1 text-sm text-on-surface-variant">Vincula cada producto con el de la app. Los precios y la disponibilidad se toman de la app; los productos sin vínculo requieren atención personal.</p>
    {query.isLoading && <p className="mt-3 text-sm">Cargando vínculos…</p>}
    {query.isError && <p role="alert" className="mt-3 text-sm text-error">No se pudieron cargar los vínculos.</p>}
    {query.data && <>
      <div className="my-3 flex flex-wrap gap-4 text-sm">
        <a href={query.data.catalogUrl} target="_blank" rel="noreferrer" className="text-primary underline">Abrir catálogo</a>
        <button type="button" disabled={load.isPending} onClick={() => load.mutate()} className="text-primary underline disabled:opacity-50">{load.isPending ? "Consultando…" : "Consultar productos de WhatsApp"}</button>
      </div>
      <form onSubmit={event => { event.preventDefault(); save.mutate(); }} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Producto de WhatsApp
          <input list="whatsapp-catalog-options" value={externalId} onChange={e => setExternalId(e.target.value)} placeholder="ID del producto del catálogo" required maxLength={100} className="mt-1 w-full rounded border border-outline-variant/30 bg-surface-container p-2" />
          <datalist id="whatsapp-catalog-options">{source.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</datalist>
        </label>
        <label className="text-sm">Producto en la app
          <select required value={productId} onChange={e => { setProductId(e.target.value); setVariant(""); }} className="mt-1 w-full rounded border border-outline-variant/30 bg-surface-container p-2">
            <option value="">Seleccionar producto</option>{query.data.products.map(p => <option key={p.id} value={p.id}>{p.name}{!p.active ? " (inactivo)" : p.soldOut ? " (agotado)" : ""}</option>)}
          </select>
        </label>
        <label className="text-sm">Presentación
          <select value={variant} onChange={e => setVariant(e.target.value)} className="mt-1 w-full rounded border border-outline-variant/30 bg-surface-container p-2">
            <option value="">Preguntar al cliente</option>{selected?.variants?.map(v => <option key={v.label} value={v.label}>{v.label}</option>)}
          </select>
        </label>
        <button disabled={save.isPending || !externalId.trim() || !productId} className="self-end rounded bg-primary p-2 font-bold text-on-primary disabled:opacity-50">{save.isPending ? "Guardando…" : "Guardar vínculo"}</button>
      </form>
      <ul className="mt-4 space-y-2 text-sm">{query.data.links.map(link => <li key={link.externalId} className="flex items-center justify-between gap-3 border-b border-outline-variant/15 py-2">
        <span>{source.find(p => p.id === link.externalId)?.name || link.externalId} → {query.data.products.find(p => p.id === link.productId)?.name || "Producto eliminado"}{link.variant ? ` · ${link.variant}` : ""}</span>
        <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(link.externalId)} className="text-error">Desvincular</button>
      </li>)}</ul>
      {!query.data.links.length && <p className="mt-3 text-sm text-on-surface-variant">Todavía no hay productos vinculados.</p>}
    </>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
  </section>;
}
