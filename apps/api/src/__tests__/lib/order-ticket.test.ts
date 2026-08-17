import { describe, expect, test } from "bun:test";
import {
  formatOrderTicketText,
  resolveOrderTicketBranchLabel,
} from "../../lib/order-ticket.js";

describe("resolveOrderTicketBranchLabel", () => {
  test("usa order_ticket_label das settings", () => {
    expect(
      resolveOrderTicketBranchLabel("Açai House Wonsocket", {
        order_ticket_label: "woonsocket",
      }),
    ).toBe("WOONSOCKET");
  });

  test("deriva do nome da filial", () => {
    expect(resolveOrderTicketBranchLabel("Açai House Worcester")).toBe(
      "WORCESTER",
    );
    expect(resolveOrderTicketBranchLabel("Açai House Wonsocket")).toBe(
      "WONSOCKET",
    );
  });
});

describe("formatOrderTicketText", () => {
  test("inclui filial no título", () => {
    const text = formatOrderTicketText({
      orderNumber: 32,
      branchLabel: "WORCESTER",
      customerName: "Ivan Seifert",
      deliveryPhone: "11941696922",
      deliveryAddress: "Jaceguava\n3866\nBalneário São José",
      paymentMethod: "zelle",
      total: 2300,
      currency: "USD",
      items: [
        {
          name: "Copo 24oz",
          quantity: 1,
          modifiers: [
            { name: "Paçoca" },
            { name: "Nutella" },
            { name: "Leite condensado" },
          ],
        },
      ],
    });

    expect(text.startsWith("*ORDEM WORCESTER #32*")).toBe(true);
    expect(text).toContain("Cliente: Ivan Seifert");
    expect(text).toContain("1x Copo 24oz");
    expect(text).toContain("Pagamento: Zelle");
  });

  test("mostra nota de fidelidade no item resgatado", () => {
    const text = formatOrderTicketText({
      orderNumber: 50,
      items: [
        {
          name: "Copo 16oz",
          quantity: 1,
          discount_reason: "Fidelidade - cartão físico",
          modifiers: [{ name: "Nutella" }],
        },
        {
          name: "Copo 16oz",
          quantity: 1,
          modifiers: [{ name: "Morango" }],
        },
      ],
    });

    const loyaltyLineIdx = text.indexOf("♥ Fidelidade - cartão físico");
    expect(loyaltyLineIdx).toBeGreaterThan(-1);
    // Only the first item carries the note, not the second.
    expect(text.split("♥").length - 1).toBe(1);
  });
});
