import { describe, expect, test } from "bun:test";
import { renderWhatsAppTemplate } from "../../lib/whatsapp-messages.js";

describe("renderWhatsAppTemplate", () => {
  test("preserva linhas em branco do template", () => {
    const template = ["Linha 1", "", "Linha 2", "", "Linha 3"].join("\n");
    const result = renderWhatsAppTemplate(template, {});

    expect(result).toBe("Linha 1\n\nLinha 2\n\nLinha 3");
  });

  test("remove linha só com variável vazia", () => {
    const template = ["Olá", "{endereco_bloco}", "Tchau"].join("\n");
    const result = renderWhatsAppTemplate(template, { endereco_bloco: "" });

    expect(result).toBe("Olá\nTchau");
  });

  test("substitui variáveis mantendo espaçamento", () => {
    const template = [
      "🌿 Olá, {cliente}!",
      "",
      "Pedido #{pedido}",
      "",
      "Total: {total}",
    ].join("\n");

    const result = renderWhatsAppTemplate(template, {
      cliente: "Ivan",
      pedido: "2",
      total: "R$ 34,41",
    });

    expect(result).toBe(
      ["🌿 Olá, Ivan!", "", "Pedido #2", "", "Total: R$ 34,41"].join("\n"),
    );
  });
});
