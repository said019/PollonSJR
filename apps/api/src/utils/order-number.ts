/** Genera número de pedido secuencial basado en el día */
let counter = 4000;

export function generateOrderNumber(): number {
  counter += 1;
  return counter;
}

export function resetCounter(lastNumber: number) {
  counter = lastNumber;
}
