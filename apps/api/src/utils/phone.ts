/**
 * Teléfonos de clientes.
 *
 * Regla de almacenamiento (elegida para NO migrar los datos existentes):
 *   - México  → 10 dígitos, tal como se guardaba antes ("4421234567").
 *   - Otros   → clave de país + número nacional ("16165946000" para EE. UU.).
 *
 * Como el nacional mexicano son exactamente 10 dígitos y cualquier extranjero
 * lleva su clave delante, las dos formas nunca se confunden y la columna
 * `phone` sigue siendo única sin cambiar el esquema.
 *
 * Nació de un caso real: una clienta con WhatsApp de EE. UU. no podía entrar a
 * la app porque sólo se aceptaban 10 dígitos mexicanos, y el código se enviaba
 * a un número mexicano que no era suyo.
 */

export const MX = "52";

/** Sólo dígitos. */
export function soloDigitos(valor: string): string {
  return (valor || "").replace(/\D/g, "");
}

/**
 * Normaliza lo que escribió el cliente a la forma que guardamos.
 * `cc` es la clave de país elegida en la app ("52", "1", …).
 * Devuelve null si no parece un teléfono válido.
 */
export function normalizarTelefono(valor: string, cc: string = MX): string | null {
  const d = soloDigitos(valor);
  const clave = soloDigitos(cc) || MX;

  if (!d) return null;

  if (clave === MX) {
    // México: guardamos los 10 nacionales. Aceptamos que venga con 52 o 521.
    let nac = d;
    if (nac.startsWith("521") && nac.length === 13) nac = nac.slice(3);
    else if (nac.startsWith("52") && nac.length === 12) nac = nac.slice(2);
    return nac.length === 10 ? nac : null;
  }

  // Extranjero: clave + nacional. Aceptamos que ya venga con la clave.
  const nac = d.startsWith(clave) ? d.slice(clave.length) : d;
  if (nac.length < 6 || nac.length > 14) return null;
  return `${clave}${nac}`;
}

/** ¿El número guardado es mexicano? (10 dígitos = sí) */
export function esMexicano(guardado: string): boolean {
  return soloDigitos(guardado).length === 10;
}

/**
 * Forma internacional para WhatsApp (sin "+").
 * México: 52 + los 10. Extranjero: ya lo trae.
 */
export function aInternacional(guardado: string): string {
  const d = soloDigitos(guardado);
  return esMexicano(d) ? `${MX}${d}` : d;
}

/** Cómo mostrarlo a una persona: "+52 442 123 4567". */
export function paraMostrar(guardado: string): string {
  const d = soloDigitos(guardado);
  if (esMexicano(d)) return `+52 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return `+${d}`;
}
