import { describe, expect, test } from "bun:test";
import {
  signAccessToken,
  signCustomerToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../lib/jwt.js";

describe("signAccessToken / verifyAccessToken", () => {
  test("roundtrip preserva os campos do payload", async () => {
    const payload = {
      sub: "user-123",
      org: "org-456",
      role: "admin",
      branches: ["branch-1", "branch-2"],
    };
    const token = await signAccessToken(payload);
    const verified = await verifyAccessToken(token);

    expect(verified.sub).toBe(payload.sub);
    expect(verified.org).toBe(payload.org);
    expect(verified.role).toBe(payload.role);
  });

  test("retorna um JWT válido com 3 partes", async () => {
    const token = await signAccessToken({ sub: "u", org: "o", role: "staff", branches: [] });
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
  });

  test("token expirado/inválido lança erro", async () => {
    await expect(verifyAccessToken("invalid.token.here")).rejects.toThrow();
  });
});

describe("signRefreshToken / verifyRefreshToken", () => {
  test("roundtrip preserva o sub", async () => {
    const token = await signRefreshToken({ sub: "user-789" });
    const verified = await verifyRefreshToken(token);
    expect(verified.sub).toBe("user-789");
  });
});

describe("signCustomerToken", () => {
  test("token inclui role customer e dados da sessão", async () => {
    const payload = { sub: "session-id", org: "org-1", branch: "branch-1", table: "T5" };
    const token = await signCustomerToken(payload);
    const verified = await verifyAccessToken(token);

    expect(verified.role).toBe("customer");
    expect(verified.sub).toBe(payload.sub);
    expect(verified.branch).toBe(payload.branch);
    expect(verified.table).toBe(payload.table);
  });
});
