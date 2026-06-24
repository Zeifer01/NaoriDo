import { beforeAll, describe, expect, mock, test } from "bun:test";

// Mockar dependências com IO antes de importar o serviço
mock.module("@restai/db", () => ({ db: null, schema: {} }));
mock.module("../../lib/logger.js", () => ({
  logger: { error: () => {}, info: () => {}, warn: () => {} },
}));
mock.module("../../services/loyalty.service.js", () => ({ awardPoints: async () => {} }));
mock.module("../../services/inventory.service.js", () => ({ deductForOrder: async () => {} }));
mock.module("../../lib/order-number.js", () => ({
  allocateOrderNumber: async () => "1",
  resetBranchOrderSequence: async () => {},
}));

let OrderValidationError: typeof import("../../services/order.service.js").OrderValidationError;

beforeAll(async () => {
  const mod = await import("../../services/order.service.js");
  OrderValidationError = mod.OrderValidationError;
});

describe("OrderValidationError", () => {
  test("é instância de Error", () => {
    const err = new OrderValidationError("item não encontrado");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OrderValidationError);
  });

  test("tem name e message corretos", () => {
    const err = new OrderValidationError("item indisponível");
    expect(err.name).toBe("OrderValidationError");
    expect(err.message).toBe("item indisponível");
  });

  test("pode ser capturado como Error genérico", () => {
    const throwErr = () => {
      throw new OrderValidationError("pedido inválido");
    };
    expect(throwErr).toThrow("pedido inválido");
  });

  test("mensagens distintas produzem erros distintos", () => {
    const a = new OrderValidationError("msg A");
    const b = new OrderValidationError("msg B");
    expect(a.message).not.toBe(b.message);
  });
});
