"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { BusinessReports } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import {
  ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, CheckCircle2,
  Clock, Download, RefreshCw, ShoppingBag, Truck, Users, Wallet, XCircle,
} from "lucide-react";

const DAY = 86_400_000;
const statusNames: Record<string, string> = {
  PENDING_PAYMENT: "Pendiente de pago", SCHEDULED: "Programado", RECEIVED: "Recibido",
  PREPARING: "En preparación", READY: "Listo", ON_THE_WAY: "En camino",
  DELIVERED: "Entregado", CANCELLED: "Cancelado",
};
const paymentNames: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia" };
const panel = "rounded-xl border border-outline-variant/20 bg-surface-container-high";
const input = "min-w-0 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-outline-variant/30 px-3 py-2.5 text-sm font-semibold transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";

function shift(date: string, offset: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + offset * DAY).toISOString().slice(0, 10);
}
function mexicoToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}
function dateLabel(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("es-MX", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}
function presetRange(preset: string) {
  const today = mexicoToday();
  const monthStart = today.slice(0, 7) + "-01";
  if (preset === "yesterday") return { dateFrom: shift(today, -1), dateTo: shift(today, -1) };
  if (preset === "month") return { dateFrom: monthStart, dateTo: today };
  if (preset === "lastMonth") {
    const end = shift(monthStart, -1);
    return { dateFrom: end.slice(0, 7) + "-01", dateTo: end };
  }
  return { dateFrom: shift(today, 1 - Number(preset)), dateTo: today };
}

export function ReportsView() {
  const token = getAdminToken();
  const [range, setRange] = useState(() => presetRange("7"));
  const [draft, setDraft] = useState(range);
  const [preset, setPreset] = useState("7");
  const [type, setType] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [formError, setFormError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const params = new URLSearchParams(range);
  if (type) params.set("type", type);
  if (paymentMethod) params.set("paymentMethod", paymentMethod);
  const query = params.toString();
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin-reports", query],
    queryFn: () => api.get<BusinessReports>("/api/admin/reports?" + query, token || undefined),
    refetchInterval: 60_000,
  });

  function choosePreset(value: string) {
    const next = presetRange(value);
    setPreset(value); setRange(next); setDraft(next); setFormError("");
  }
  function applyDates(event: React.FormEvent) {
    event.preventDefault();
    const days = (Date.parse(draft.dateTo) - Date.parse(draft.dateFrom)) / DAY + 1;
    if (!draft.dateFrom || !draft.dateTo || !Number.isFinite(days) || days < 1 || days > 366) {
      setFormError("Elige un período válido de 1 a 366 días."); return;
    }
    setFormError(""); setPreset("custom"); setRange({ ...draft });
  }
  async function exportCsv() {
    setExporting(true); setExportError("");
    try {
      const response = await fetch(
        (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001") + "/api/admin/reports/csv?" + query,
        { headers: { Authorization: "Bearer " + token } }
      );
      if (!response.ok) throw new Error("No se pudo exportar. Revisa tu sesión e inténtalo otra vez.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "pollon-" + range.dateFrom + "-" + range.dateTo + ".csv";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Error al exportar el reporte.");
    } finally { setExporting(false); }
  }
  const summary = data?.summary;
  const peak = data?.byHour.reduce<{ hour: number; orders: number } | null>(
    (best, row) => !best || row.orders > best.orders ? row : best, null
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-primary">Control del negocio</p>
          <h1 className="font-headline text-2xl font-black sm:text-3xl">Reportes y ventas</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Consulta el movimiento de tu negocio, período por período.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={() => refetch()} disabled={isFetching} aria-label="Actualizar reporte">
            <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} /> Actualizar
          </button>
          <button type="button" className={button} onClick={exportCsv} disabled={!data || exporting || isFetching}>
            <Download size={16} /> {exporting ? "Exportando…" : "Exportar período CSV"}
          </button>
        </div>
      </header>

      <section className={panel + " p-4 sm:p-5"} aria-label="Filtros del reporte">
        <div className="mb-4 flex flex-wrap gap-2">
          {[["1", "Hoy"], ["yesterday", "Ayer"], ["7", "7 días"], ["30", "30 días"], ["month", "Este mes"], ["lastMonth", "Mes anterior"]].map(([value, label]) => (
            <button key={value} type="button" onClick={() => choosePreset(value)} aria-pressed={preset === value}
              className={"rounded-lg px-3 py-2 text-xs font-bold transition-colors " + (preset === value ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-primary")}>
              {label}
            </button>
          ))}
        </div>
        <form onSubmit={applyDates} className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_1fr_1fr]">
          <label className="space-y-1.5 text-xs font-semibold text-on-surface-variant">Desde
            <input type="date" required value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} className={input} />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-on-surface-variant">Hasta
            <input type="date" required value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} className={input} />
          </label>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:brightness-110">Aplicar fechas</button>
          <label className="space-y-1.5 text-xs font-semibold text-on-surface-variant">Tipo de pedido
            <select aria-label="Tipo de pedido" value={type} onChange={(e) => setType(e.target.value)} className={input}>
              <option value="">Todos los pedidos</option><option value="DELIVERY">Envío a domicilio</option><option value="PICKUP">Recoger en sucursal</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-on-surface-variant">Método de pago
            <select aria-label="Método de pago" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={input}>
              <option value="">Todos los métodos</option><option value="CASH">Efectivo</option><option value="CARD">Tarjeta</option><option value="TRANSFER">Transferencia</option>
            </select>
          </label>
        </form>
        {formError && <p role="alert" className="mt-3 text-sm text-error">{formError}</p>}
        <p className="mt-4 flex items-center gap-2 text-xs text-on-surface-variant">
          <CalendarDays size={14} className="shrink-0 text-primary" />
          {dateLabel(range.dateFrom)} — {dateLabel(range.dateTo)} · Horario de México · Hasta 366 días por consulta
        </p>
      </section>

      {exportError && <p role="alert" className="text-sm text-error">{exportError}</p>}
      {error ? (
        <div role="alert" className={panel + " p-6"}>
          <p className="text-error">No se pudo cargar el reporte: {error.message}</p>
          <button type="button" onClick={() => refetch()} className={button + " mt-3"}>Reintentar</button>
        </div>
      ) : isLoading ? (
        <div role="status" aria-label="Cargando reporte" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-container" />)}
        </div>
      ) : data && summary && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
            <span>Comparado con {dateLabel(data.period.previousFrom)} — {dateLabel(data.period.previousTo)}</span>
            <span>{isFetching ? "Actualizando…" : "Actualización automática cada minuto"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Ventas confirmadas" value={formatCents(summary.periodRevenue)} icon={<Wallet size={18} />} change={summary.revenueChange} />
            <Metric label="Pedidos confirmados" value={String(summary.periodOrders)} icon={<ShoppingBag size={18} />} change={summary.ordersChange} />
            <Metric label="Ticket promedio" value={formatCents(summary.periodAvgTicket)} icon={<BarChart3 size={18} />} />
            <Metric label="Clientes compradores" value={String(summary.customers)} icon={<Users size={18} />} detail={summary.newCustomers + " primera compra · " + summary.returningCustomers + " recurrentes"} />
            <Metric label="Envíos / sucursal" value={summary.deliveryOrders + " / " + summary.pickupOrders} icon={<Truck size={18} />} />
            <Metric label="Entregados" value={String(summary.deliveredOrders)} icon={<CheckCircle2 size={18} />} />
            <Metric label="Pendientes de pago" value={String(summary.pendingOrders)} icon={<Clock size={18} />} detail="Fuera de ventas confirmadas" />
            <Metric label="Cancelados" value={String(summary.cancelledOrders)} icon={<XCircle size={18} />} detail={summary.cancellationRate.toFixed(1) + "% de confirmados + cancelados"} />
          </div>

          {summary.periodOrders === 0 && <p role="status" className={panel + " p-4 text-sm text-on-surface-variant"}>No hay ventas confirmadas con estos filtros. Puedes consultar pendientes y cancelaciones abajo o ampliar las fechas.</p>}

          <section className={panel + " p-4 sm:p-5"} aria-label="Evolución de ventas">
            <SectionTitle icon={<BarChart3 size={17} />} title="Evolución de ventas" note={data.period.days + " días · MXN"} />
            <RevenueChart reports={data.reports} />
          </section>

          <div className="grid gap-5 xl:grid-cols-3">
            <section className={panel + " p-5"}>
              <SectionTitle icon={<Wallet size={17} />} title="Desglose de venta" />
              <dl className="space-y-3 text-sm">
                {[["Productos y extras", summary.subtotal], ["Descuentos", -summary.discounts], ["Envíos", summary.deliveryFees], ["Propinas", summary.tips], ["Cargo de la app", summary.appFees]].map(([label, amount]) => (
                  <div key={String(label)} className="flex justify-between gap-3"><dt className="text-on-surface-variant">{label}</dt><dd className="font-semibold tabular-nums">{formatCents(Number(amount))}</dd></div>
                ))}
                <div className="flex justify-between gap-3 border-t border-outline-variant/20 pt-3 font-bold"><dt>Total confirmado</dt><dd className="text-secondary">{formatCents(summary.periodRevenue)}</dd></div>
                <div className="flex justify-between gap-3 text-on-surface-variant"><dt>Reembolsos registrados*</dt><dd>{formatCents(summary.refunds)}</dd></div>
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-on-surface-variant">Ventas de pedidos confirmados, según su fecha de creación. No equivalen a utilidad ni a dinero liquidado. *Reembolsos asociados a pedidos del período.</p>
            </section>
            <section className={panel + " p-5"}>
              <SectionTitle icon={<ShoppingBag size={17} />} title="Venta por método de pago" />
              <div className="space-y-4">
                {["CASH", "CARD", "TRANSFER"].map((method) => {
                  const row = data.payments.find((item) => item.method === method);
                  const amount = row?.revenue ?? 0;
                  return <div key={method}>
                    <div className="mb-1 flex justify-between gap-3 text-sm"><span>{paymentNames[method]}</span><strong className="tabular-nums">{formatCents(amount)}</strong></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-container"><div className="h-full rounded-full bg-primary" style={{ width: (summary.periodRevenue ? amount / summary.periodRevenue * 100 : 0) + "%" }} /></div>
                    <p className="mt-1 text-xs text-on-surface-variant">{row?.orders ?? 0} pedidos confirmados</p>
                  </div>;
                })}
              </div>
            </section>
            <section className={panel + " p-5"}>
              <SectionTitle icon={<Clock size={17} />} title="Estado de los pedidos" />
              <dl className="space-y-2.5 text-sm">
                {Object.entries(statusNames).map(([status, label]) => <div key={status} className="flex justify-between gap-2">
                  <dt className="text-on-surface-variant">{label}</dt><dd className={"font-bold tabular-nums " + (status === "CANCELLED" ? "text-error" : "")}>{data.statuses.find((row) => row.status === status)?.orders ?? 0}</dd>
                </div>)}
              </dl>
              <p className="mt-4 text-xs text-on-surface-variant">Estado actual de los pedidos creados en el período.</p>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className={panel + " overflow-hidden p-5"}>
              <SectionTitle icon={<ShoppingBag size={17} />} title="10 productos más vendidos" />
              {data.topProducts.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-xs text-on-surface-variant"><th className="pb-3 text-left font-medium">Producto</th><th className="pb-3 text-right font-medium">Unidades</th><th className="pb-3 text-right font-medium">Venta base</th></tr></thead>
                <tbody className="divide-y divide-outline-variant/10">{data.topProducts.map((product, i) => <tr key={product.id}>
                  <td className="py-2.5 pr-3"><span className="mr-2 text-xs text-primary">{i + 1}.</span>{product.name}</td>
                  <td className="py-2.5 pr-3 text-right font-bold tabular-nums">{product.units}</td><td className="py-2.5 text-right tabular-nums">{formatCents(product.grossRevenue)}</td>
                </tr>)}</tbody>
              </table></div> : <p className="py-8 text-center text-sm text-on-surface-variant">Sin productos vendidos en este período.</p>}
              <p className="mt-4 text-xs text-on-surface-variant">Venta base sin extras, descuentos ni envíos; puede diferir del total confirmado.</p>
            </section>
            <section className={panel + " p-5"}>
              <SectionTitle icon={<Clock size={17} />} title="Horarios con más pedidos" note="Horario de México" />
              <div className="mt-6 flex h-36 items-end gap-1" aria-label="Pedidos por hora">
                {Array.from({ length: 24 }, (_, hour) => {
                  const count = data.byHour.find((row) => row.hour === hour)?.orders ?? 0;
                  return <div key={hour} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={hour + ":00 · " + count + " pedidos"}>
                    <div className={"min-h-[2px] rounded-t " + (hour === peak?.hour ? "bg-secondary" : "bg-primary/50")} style={{ height: Math.max(2, count / (peak?.orders || 1) * 100) + "%" }} />
                    <span className="mt-1 text-center text-[9px] text-on-surface-variant">{hour % 3 === 0 ? hour + "h" : ""}</span>
                    <span className="sr-only">{hour}:00: {count} pedidos</span>
                  </div>;
                })}
              </div>
              <p className="mt-5 text-sm text-on-surface-variant">{peak ? "Mayor actividad: " + peak.hour + ":00–" + (peak.hour + 1) + ":00 · " + peak.orders + " pedidos." : "Sin pedidos confirmados en este período."}</p>
            </section>
          </div>

          <section className={panel + " overflow-hidden"}>
            <div className="flex flex-wrap items-center justify-between gap-2 p-5"><h2 className="font-headline font-bold">Desglose diario</h2><p className="text-xs text-on-surface-variant">Selecciona una fecha para ver ese día</p></div>
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <caption className="sr-only">Resultados por día del período seleccionado en horario de México</caption>
                <thead className="border-y border-outline-variant/15 bg-surface-container text-xs text-on-surface-variant"><tr>
                  {["Fecha", "Confirmados", "Venta", "Ticket", "Envíos", "Sucursal", "Cancelados", "Pendientes", "Clientes", "Primera compra"].map((label) => <th key={label} scope="col" className="px-4 py-3 text-left font-semibold">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-outline-variant/10">{data.reports.map((day) => <tr key={day.date} className="hover:bg-surface-container">
                  <td className="px-4 py-3"><button className="font-semibold text-primary hover:underline" onClick={() => { const next = { dateFrom: day.date, dateTo: day.date }; setRange(next); setDraft(next); setPreset("custom"); setFormError(""); }}>{dateLabel(day.date)}</button></td>
                  {[day.totalOrders, formatCents(day.totalRevenue), formatCents(day.avgTicket), day.deliveryOrders, day.pickupOrders, day.cancelledOrders, day.pendingOrders, day.customers, day.newCustomers].map((value, i) => <td key={i} className="px-4 py-3 tabular-nums">{value}</td>)}
                </tr>)}</tbody>
              </table>
            </div>
          </section>
          <p className="text-xs leading-relaxed text-on-surface-variant">“Primera compra” identifica la primera orden confirmada del cliente en todo su historial. Un cliente puede comprar varios días: los clientes diarios no se suman para calcular el total del período. La comparación usa el período anterior de igual duración; el día de hoy aún puede estar incompleto.</p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, icon, change, detail }: { label: string; value: string; icon: ReactNode; change?: number | null; detail?: string }) {
  return <div className={panel + " min-w-0 p-4"}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <span className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</span>
      {change !== undefined && <span title="Comparado con el período anterior" className={"inline-flex items-center text-xs font-bold " + (change === null ? "text-on-surface-variant" : change < 0 ? "text-error" : "text-emerald-400")}>
        {change === null ? "Sin base previa" : <>{change < 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{change > 0 ? "+" : ""}{change.toFixed(1)}%</>}
      </span>}
    </div>
    <p className="break-words font-headline text-xl font-black tabular-nums sm:text-2xl">{value}</p>
    <p className="mt-1 text-xs font-semibold text-on-surface-variant">{label}</p>
    {detail && <p className="mt-1 text-[11px] text-on-surface-variant">{detail}</p>}
  </div>;
}

function SectionTitle({ icon, title, note }: { icon: ReactNode; title: string; note?: string }) {
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-headline text-sm font-bold"><span className="text-primary">{icon}</span>{title}</h2>{note && <span className="text-xs text-on-surface-variant">{note}</span>}</div>;
}

function RevenueChart({ reports }: { reports: BusinessReports["reports"] }) {
  const days = [...reports].reverse();
  const max = Math.max(...days.map((day) => day.totalRevenue), 1);
  const x = (index: number) => days.length === 1 ? 500 : 12 + index / (days.length - 1) * 976;
  const y = (value: number) => 145 - value / max * 125;
  const points = days.map((day, i) => x(i) + "," + y(day.totalRevenue)).join(" ");
  return <div>
    <div className="mb-2 flex justify-between text-xs text-on-surface-variant"><span>Máximo diario: {formatCents(max === 1 ? 0 : max)}</span><span>Ventas confirmadas</span></div>
    <svg viewBox="0 0 1000 160" className="h-40 w-full text-primary" role="img" aria-label="Evolución diaria de ventas del período seleccionado">
      {[20, 82, 145].map((value) => <line key={value} x1="0" x2="1000" y1={value} y2={value} stroke="currentColor" opacity=".12" />)}
      <polygon points={x(0) + ",145 " + points + " " + x(days.length - 1) + ",145"} fill="currentColor" opacity=".08" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      {days.map((day, i) => <circle key={day.date} cx={x(i)} cy={y(day.totalRevenue)} r={days.length < 32 ? 4 : 2} fill="currentColor"><title>{dateLabel(day.date)}: {formatCents(day.totalRevenue)}</title></circle>)}
    </svg>
    <div className="flex justify-between text-xs text-on-surface-variant"><span>{dateLabel(days[0].date)}</span><span>{dateLabel(days[days.length - 1].date)}</span></div>
  </div>;
}
