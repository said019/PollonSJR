import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Términos y condiciones · Pollón SJR",
};

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary"
      >
        <ArrowLeft size={14} /> Volver
      </Link>

      <h1 className="font-headline text-4xl font-extrabold uppercase tracking-tighter text-tertiary">
        Términos y condiciones
      </h1>
      <p className="mt-2 text-sm text-on-surface-variant">
        Última actualización: mayo 2026
      </p>

      <div className="mt-10 space-y-6 text-on-surface">
        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            1. Pedidos
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Al realizar un pedido aceptas el precio mostrado al momento de
            confirmar. Una vez confirmado y pagado, el pedido entra en
            preparación.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            2. Cancelaciones
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Puedes cancelar tu pedido sin costo mientras esté en estado
            &quot;Pago pendiente&quot; o &quot;Recibido&quot;. Una vez que pasa
            a &quot;Preparando&quot;, no es posible cancelar porque la comida
            ya está en cocina.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            3. Tiempos de entrega
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Los tiempos mostrados son estimados. Pueden variar por carga de
            cocina, condiciones climáticas o tráfico. No nos responsabilizamos
            por demoras causadas por factores externos.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            4. Pagos
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Aceptamos pagos con tarjeta vía Mercado Pago, efectivo a la entrega
            y transferencia SPEI. Los pagos con tarjeta están sujetos a las
            políticas de Mercado Pago.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            5. Programa de lealtad
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Acumulas una compra entregada en tu tarjeta digital por cada pedido
            completado. Al juntar 5 compras, recibes un producto gratis. La
            recompensa vence a los 6 meses si no se canjea.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            6. Suspensión de cuenta
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Nos reservamos el derecho de suspender cuentas con uso indebido,
            pedidos fraudulentos o comportamiento abusivo hacia el equipo o
            repartidores.
          </p>
        </section>
      </div>
    </main>
  );
}
