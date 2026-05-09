import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Información de alérgenos · Pollón SJR",
};

const ALLERGENS = [
  {
    name: "Gluten",
    products: "Pollo empanizado, hamburguesas, bisquets, papas fritas",
  },
  {
    name: "Lácteos",
    products: "Bisquets, salsas cremosas, malteadas, queso de las hamburguesas",
  },
  {
    name: "Huevo",
    products: "Pollo empanizado, panes de hamburguesa, salsas",
  },
  {
    name: "Soya",
    products: "Salsas, marinadas, aderezos",
  },
];

export default function AlergenosPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary"
      >
        <ArrowLeft size={14} /> Volver
      </Link>

      <h1 className="font-headline text-4xl font-extrabold uppercase tracking-tighter text-tertiary">
        Información de alérgenos
      </h1>
      <p className="mt-2 text-sm text-on-surface-variant">
        Última actualización: mayo 2026
      </p>

      <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <p className="text-sm text-on-surface">
            <strong className="text-amber-500">Importante:</strong> nuestra
            cocina maneja todos estos alérgenos en el mismo espacio. No podemos
            garantizar ausencia total de contaminación cruzada. Si tienes una
            alergia severa, consúltanos antes de pedir.
          </p>
        </div>
      </div>

      <div className="mt-10 space-y-4">
        {ALLERGENS.map((a) => (
          <div
            key={a.name}
            className="rounded-2xl border border-outline-variant/15 bg-surface-container p-5"
          >
            <h2 className="font-headline text-lg font-bold uppercase tracking-tight text-tertiary">
              {a.name}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
              {a.products}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-sm text-on-surface-variant">
        Para preguntas específicas sobre ingredientes de un producto, escríbenos
        por WhatsApp antes de hacer tu pedido. Estamos para ayudarte.
      </p>
    </main>
  );
}
