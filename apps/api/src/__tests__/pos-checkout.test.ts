import { describe, expect, test } from "bun:test";
import { getPosCheckoutMissing, splitPosCheckoutMissing, type PosCheckoutState } from "@restai/config";

const complete: PosCheckoutState = {
  cartCount: 2,
  orderType: "delivery",
  customerName: "Ana",
  customerInfoOptional: false,
  deliveryAddress: "12 Main St",
  needsCity: true,
  deliveryCity: "Worcester",
  needsFee: true,
  feeReady: true,
  paymentMethod: "zelle",
  phoneInvalid: false,
};

describe("getPosCheckoutMissing", () => {
  test("nothing missing when everything is filled", () => {
    expect(getPosCheckoutMissing(complete)).toEqual([]);
  });

  test("lists what is missing, in filling order", () => {
    expect(
      getPosCheckoutMissing({
        ...complete,
        customerName: "",
        deliveryAddress: "",
        deliveryCity: null,
        paymentMethod: "",
        phoneInvalid: true,
      }),
    ).toEqual(["nome do cliente", "telefone válido", "endereço", "cidade do frete", "forma de pagamento"]);
  });

  test("asks for the city first, and only then for the fee quote", () => {
    expect(getPosCheckoutMissing({ ...complete, deliveryCity: null })).toEqual(["cidade do frete"]);
    expect(getPosCheckoutMissing({ ...complete, needsCity: false, feeReady: false })).toEqual([
      "cotação do frete",
    ]);
  });

  test("pickup does not need address, city or fee", () => {
    expect(
      getPosCheckoutMissing({
        ...complete,
        orderType: "takeout",
        deliveryAddress: "",
        deliveryCity: null,
        feeReady: false,
      }),
    ).toEqual([]);
  });

  test("customer name is optional for fair checkout orgs", () => {
    expect(getPosCheckoutMissing({ ...complete, customerName: "", customerInfoOptional: true })).toEqual([]);
    expect(getPosCheckoutMissing({ ...complete, customerName: "   " })).toEqual(["nome do cliente"]);
  });

  test("empty cart", () => {
    expect(getPosCheckoutMissing({ ...complete, cartCount: 0 })).toEqual(["itens"]);
  });
});

describe("splitPosCheckoutMissing (tab warning dots)", () => {
  test("customer tab gets name/phone/address/city/fee, order tab gets items/payment", () => {
    expect(
      splitPosCheckoutMissing([
        "itens",
        "nome do cliente",
        "telefone válido",
        "endereço",
        "cidade do frete",
        "cotação do frete",
        "forma de pagamento",
      ]),
    ).toEqual({
      customer: ["nome do cliente", "telefone válido", "endereço", "cidade do frete", "cotação do frete"],
      order: ["itens", "forma de pagamento"],
    });
  });

  test("nothing missing → both tabs clean", () => {
    expect(splitPosCheckoutMissing([])).toEqual({ customer: [], order: [] });
  });
});
