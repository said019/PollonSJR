const REJECT_MESSAGES: Record<
  string,
  { message: string; action: "retry" | "alternate" | "bank" | "none" }
> = {
  cc_rejected_insufficient_amount: {
    message: "Fondos insuficientes. Verifica tu saldo o usa otra tarjeta.",
    action: "alternate",
  },
  cc_rejected_bad_filled_security_code: {
    message:
      "Código de seguridad incorrecto. Revisa los 3 dígitos al reverso de tu tarjeta.",
    action: "retry",
  },
  cc_rejected_bad_filled_date: {
    message:
      "La fecha de vencimiento es incorrecta. Revísala e intenta de nuevo.",
    action: "retry",
  },
  cc_rejected_bad_filled_other: {
    message:
      "Algunos datos de tu tarjeta están incorrectos. Revísalos e intenta de nuevo.",
    action: "retry",
  },
  cc_rejected_card_disabled: {
    message: "Tu tarjeta está deshabilitada. Contacta a tu banco.",
    action: "alternate",
  },
  cc_rejected_call_for_authorize: {
    message:
      "Tu banco necesita que autorices este pago. Llama al número de atrás de tu tarjeta.",
    action: "bank",
  },
  cc_rejected_duplicated_payment: {
    message: "Ya se procesó un pago igual. Revisa tu historial de pedidos.",
    action: "none",
  },
  cc_rejected_high_risk: {
    message:
      "El pago fue rechazado por seguridad. Intenta pagar en efectivo o con OXXO.",
    action: "alternate",
  },
  cc_rejected_other_reason: {
    message: "No pudimos procesar el pago. Intenta con otro método.",
    action: "alternate",
  },
};

export function getRejectMessage(statusDetail: string) {
  return (
    REJECT_MESSAGES[statusDetail] ?? {
      message:
        "No pudimos procesar el pago. Intenta con otra tarjeta o paga en efectivo.",
      action: "alternate" as const,
    }
  );
}
