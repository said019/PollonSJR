const norm = (text: string) => text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^[¿¡]+/, "").trim();

// A delivery reference is not verified coordinates, coverage or a full address.
export function isDeliveryReference(text: string) {
  return /^(?:al? |a la |es en |es para |para entregar en |mandalo a |envialo a |calle |avenida |colonia )/.test(norm(text)) &&
    /\b(?:hotel|calle|avenida|colonia|fraccionamiento|domicilio|direccion|numero)\b/.test(norm(text));
}
export function repeatsImageReference(text: string) {
  return /^(?:(?:quiero|mandame|me mandas|me puede mandar|me puedes mandar|dame|si|pues)\s+)*(?:esa|esta|la misma|esa misma|esa mero|ya te dije|la que te mande|la de la (?:foto|imagen)|la foto|la imagen)(?:\s+(?:promo(?:cion)?|con papas|por favor|de la (?:foto|imagen)))*[.!?¿¡\s]*$/.test(norm(text));
}
