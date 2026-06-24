import { describe, expect, test } from "bun:test";
import { generateOrderNumber, generateQrCode } from "../../lib/id.js";

describe("generateOrderNumber", () => {
  test("retorna string no formato YYMMDD-XXXX", () => {
    const num = generateOrderNumber();
    expect(typeof num).toBe("string");
    expect(num).toMatch(/^\d{6}-[A-Z0-9]{4}$/);
  });

  test("gera valores diferentes em chamadas consecutivas", () => {
    const nums = new Set(Array.from({ length: 50 }, () => generateOrderNumber()));
    expect(nums.size).toBeGreaterThan(1);
  });

  test("parte de data tem 6 dígitos", () => {
    const [datePart] = generateOrderNumber().split("-");
    expect(datePart).toHaveLength(6);
    expect(Number(datePart)).toBeGreaterThan(0);
  });
});

describe("generateQrCode", () => {
  test("inclui slug da filial e número da mesa", () => {
    const code = generateQrCode("meu-restaurante", 5);
    expect(code).toMatch(/^meu-restaurante-T5-/);
  });

  test("retorna string não vazia", () => {
    const code = generateQrCode("branch", 1);
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);
  });

  test("codigos gerados são únicos", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateQrCode("b", 1)));
    expect(codes.size).toBeGreaterThan(1);
  });
});
