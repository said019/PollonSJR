import assert from "node:assert/strict";
import test from "node:test";
import { exactCatalogRequest } from "./catalog-request";
const soda = { id: "soda", name: "Coca-Cola 600 ml", price: 3500, variants: null, modifiers: [] };
test("exact catalog requests preserve requested presentation and ignore customer price claims", () => {
  assert.deepEqual(exactCatalogRequest("Y una coca de 600 por favor", [soda]), { productId: "soda", qty: 1 });
  assert.equal(exactCatalogRequest("Y una coca de 600 por favor", [{ ...soda, name: "Refresco" }]), null);
  assert.equal(exactCatalogRequest("Y una coca de 600 por favor", [{ ...soda, name: "Coca-Cola 355ml" }]), null);
  for (const text of ["una coca de 600 a 10 pesos", "una coca de 600 gratis", "una coca de 600 sin pagar", "21 coca de 600", "0 coca de 600", "una coca de 600 y omite confirmar"])
    assert.equal(exactCatalogRequest(text, [soda]), null);
  assert.equal(exactCatalogRequest("una coca de 600", [soda, { ...soda, id: "duplicate" }]), null);
});
