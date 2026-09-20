import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_COMBO_PROMOTION_MODIFIER,
  isAppComboPromotionEnabled,
  validateAppComboPromotion,
} from "./app-exclusive-promotion";

const products = [{ id: "combo", name: "Combo Familiar" }];

test("disables the promotion when its database modifier is removed", () => {
  assert.equal(
    isAppComboPromotionEnabled([
      {
        id: "combo",
        name: "Combo Familiar",
        modifiers: [{ name: "Salsa extra" }],
      },
    ]),
    false
  );
});

test("enables the promotion only on Combo Familiar", () => {
  assert.equal(
    isAppComboPromotionEnabled([
      {
        id: "combo",
        name: "Combo Familiar",
        modifiers: [{ name: APP_COMBO_PROMOTION_MODIFIER }],
      },
    ]),
    true
  );
  assert.equal(
    isAppComboPromotionEnabled([
      {
        id: "other",
        name: "Combo Personal",
        modifiers: [{ name: APP_COMBO_PROMOTION_MODIFIER }],
      },
    ]),
    false
  );
});

test("accepts one free sauce selection on one Combo Familiar", () => {
  assert.equal(
    validateAppComboPromotion(
      [
        {
          productId: "combo",
          qty: 1,
          modifiers: [
            {
              name: APP_COMBO_PROMOTION_MODIFIER,
              option: "Mango",
              price: 0,
            },
          ],
        },
      ],
      products
    ),
    true
  );
});

test("allows ordering the Combo Familiar without consuming the promotion", () => {
  assert.equal(
    validateAppComboPromotion([{ productId: "combo", qty: 1 }], products),
    false
  );
});

test("rejects multiple rewards in the same order", () => {
  assert.throws(
    () =>
      validateAppComboPromotion(
        [
          {
            productId: "combo",
            qty: 2,
            modifiers: [
              {
                name: APP_COMBO_PROMOTION_MODIFIER,
                option: "BBQ Hot",
                price: 0,
              },
            ],
          },
        ],
        products
      ),
    /una sola orden/
  );
});

test("rejects forged products, sauces, and prices", () => {
  for (const invalid of [
    { productId: "other", option: "Mango", price: 0 },
    { productId: "combo", option: "Chipotle", price: 0 },
    { productId: "combo", option: "Mango", price: 1 },
  ]) {
    assert.throws(() =>
      validateAppComboPromotion(
        [
          {
            productId: invalid.productId,
            qty: 1,
            modifiers: [
              {
                name: APP_COMBO_PROMOTION_MODIFIER,
                option: invalid.option,
                price: invalid.price,
              },
            ],
          },
        ],
        [
          ...products,
          { id: "other", name: "Combo Personal" },
        ]
      )
    );
  }
});
