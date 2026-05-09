import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Aviso de privacidad · Pollón SJR",
};

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary"
      >
        <ArrowLeft size={14} /> Volver
      </Link>

      <h1 className="font-headline text-4xl font-extrabold uppercase tracking-tighter text-tertiary">
        Aviso de privacidad
      </h1>
      <p className="mt-2 text-sm text-on-surface-variant">
        Última actualización: mayo 2026
      </p>

      <div className="prose prose-invert mt-10 max-w-none space-y-6 text-on-surface">
        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            1. Quiénes somos
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Pollón SJR (en adelante &quot;Pollón&quot;) es responsable del
            tratamiento de los datos personales que nos proporcionas a través
            de esta plataforma. Operamos en San Juan del Río, Querétaro,
            México.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            2. Datos que recopilamos
          </h2>
          <ul className="list-disc pl-5 text-sm leading-relaxed text-on-surface-variant">
            <li>Nombre y teléfono para identificar tu pedido</li>
            <li>Dirección de entrega cuando eliges envío a domicilio</li>
            <li>Coordenadas geográficas para calcular tu zona de envío</li>
            <li>Historial de pedidos y preferencias del programa de lealtad</li>
            <li>Información de pago procesada por Mercado Pago (no almacenamos datos completos de tu tarjeta)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            3. Finalidades
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Usamos tus datos exclusivamente para procesar tus pedidos, entregar
            tu comida, gestionar el programa de lealtad y notificarte sobre el
            estado de tu pedido. No vendemos ni compartimos tu información
            personal con terceros con fines publicitarios.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            4. Tus derechos (ARCO)
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Tienes derecho de acceder, rectificar, cancelar u oponerte al
            tratamiento de tus datos. Para ejercerlos, escríbenos por WhatsApp
            o a nuestro correo.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-xl font-bold text-tertiary">
            5. Contacto
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Si tienes dudas sobre este aviso, escríbenos por WhatsApp al número
            de contacto publicado en la plataforma.
          </p>
        </section>
      </div>
    </main>
  );
}
