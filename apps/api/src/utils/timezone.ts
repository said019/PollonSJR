/**
 * TZ helpers — toda la operación de Pollón está en San Juan del Río, Querétaro.
 * México no usa DST desde 2022, así que UTC-6 fijo todo el año.
 *
 * Usar esto en cualquier endpoint que filtre por "día" en queries de Prisma,
 * para que "hoy" signifique "hoy en San Juan del Río" y no "hoy en UTC".
 */

export const MEXICO_TZ_OFFSET = "-06:00";

/**
 * "YYYY-MM-DD" del día actual en México (no UTC).
 */
export function mexicoTodayISO(): string {
  // toLocaleDateString con TZ explícita es lo más portable. en-CA da YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Mexico_City",
  });
}

/**
 * Rango [00:00:00, 23:59:59.999] de un día (YYYY-MM-DD) en TZ de México,
 * expresado como instantes UTC para usar en queries de Prisma.
 */
export function mexicoDayRange(date: string): { start: Date; end: Date } {
  return {
    start: new Date(`${date}T00:00:00.000${MEXICO_TZ_OFFSET}`),
    end: new Date(`${date}T23:59:59.999${MEXICO_TZ_OFFSET}`),
  };
}

/**
 * 00:00:00 de hoy en México, como Date (instante UTC).
 * Equivalente correcto de `today.setHours(0,0,0,0)` cuando lo que querés es
 * el comienzo del día Mexicano, no el del servidor (Railway = UTC).
 */
export function mexicoStartOfToday(): Date {
  return mexicoDayRange(mexicoTodayISO()).start;
}

/**
 * 00:00:00 de mañana en México, como Date.
 */
export function mexicoStartOfTomorrow(): Date {
  const today = mexicoStartOfToday();
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * 00:00:00 de hace N días en México, como Date.
 */
export function mexicoStartOfDaysAgo(days: number): Date {
  const today = mexicoStartOfToday();
  return new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
}
