import { describe, expect, test } from "bun:test";
import {
  formatPhoneForUsBranch,
  formatUsPhone,
  isValidInternationalPhone,
  isValidPhoneForUsBranch,
  isValidUsPhone,
  usPhoneDigits,
  usesUsPhoneFormat,
} from "@restai/config";

describe("formatUsPhone", () => {
  test("masks progressively while typing", () => {
    expect(["5", "508", "5089", "508963", "50896348", "5089634871"].map(formatUsPhone)).toEqual([
      "(5",
      "(508",
      "(508) 9",
      "(508) 963",
      "(508) 963-48",
      "(508) 963-4871",
    ]);
  });

  test("handles pasted country code and extra digits", () => {
    expect(formatUsPhone("+1 508 963 4871")).toBe("(508) 963-4871");
    expect(formatUsPhone("15089634871")).toBe("(508) 963-4871");
    expect(formatUsPhone("50896348711234")).toBe("(508) 963-4871");
    expect(formatUsPhone("")).toBe("");
  });
});

describe("isValidUsPhone", () => {
  test("accepts exactly 10 digits, with or without formatting / country code", () => {
    expect(isValidUsPhone("(508) 963-4871")).toBe(true);
    expect(isValidUsPhone("5089634871")).toBe(true);
    expect(isValidUsPhone("15089634871")).toBe(true);
  });

  test("rejects real bad inputs seen in production", () => {
    for (const bad of ["774707723", "508381816", "123", "151 Pilgrim Ave", "(508) 963-487", "", null]) {
      expect(isValidUsPhone(bad)).toBe(false);
    }
  });

  test("rejects area codes that start with 0 or 1", () => {
    expect(isValidUsPhone("0089634871")).toBe(false);
  });

  test("rejects more than 10 digits instead of silently truncating", () => {
    expect(isValidUsPhone("50896348711234")).toBe(false);
  });
});

describe("international numbers (Brazil etc.)", () => {
  test("mask keeps a +55 number intact instead of cutting it to 10 digits", () => {
    expect(formatUsPhone("+5533987156910")).toBe("+55 (33) 98715-6910");
    expect(formatUsPhone("+553387156910")).toBe("+55 (33) 8715-6910");
    expect(formatUsPhone("+55")).toBe("+55");
    expect(formatUsPhone("+55 33")).toBe("+55 (33");
    expect(formatUsPhone("+351912345678")).toBe("+351912345678");
  });

  test("+1 is still treated as a US number", () => {
    expect(formatUsPhone("+1 508 963 4871")).toBe("(508) 963-4871");
  });

  test("valid international: 12-15 digits not starting with 1, with or without +", () => {
    expect(isValidInternationalPhone("+55 (33) 98715-6910")).toBe(true);
    expect(isValidInternationalPhone("5533987156910")).toBe(true); // how saved customers are stored
    expect(isValidInternationalPhone("55339871569")).toBe(false); // 11 digits
    expect(isValidInternationalPhone("5089634871")).toBe(false);
  });

  test("a saved 13-digit BR number is NOT mistaken for a truncated US number", () => {
    expect(isValidUsPhone("5533987156910")).toBe(false);
    expect(isValidPhoneForUsBranch("5533987156910")).toBe(true);
  });

  test("US branch still rejects the real bad inputs", () => {
    for (const bad of ["774707723", "508381816", "123", "151 Pilgrim Ave", ""]) {
      expect(isValidPhoneForUsBranch(bad)).toBe(false);
    }
  });

  test("formatPhoneForUsBranch formats saved US and BR numbers, leaves invalid ones alone", () => {
    expect(formatPhoneForUsBranch("5089634871")).toBe("(508) 963-4871");
    expect(formatPhoneForUsBranch("5533987156910")).toBe("+55 (33) 98715-6910");
    expect(formatPhoneForUsBranch("774707723")).toBe("774707723");
  });
});

describe("usPhoneDigits / usesUsPhoneFormat", () => {
  test("strips the leading 1 and caps at 10 digits", () => {
    expect(usPhoneDigits("+1 (508) 963-4871")).toBe("5089634871");
  });

  test("only country code 1 uses the US format", () => {
    expect(usesUsPhoneFormat("1")).toBe(true);
    expect(usesUsPhoneFormat("+1")).toBe(true);
    expect(usesUsPhoneFormat("55")).toBe(false);
    expect(usesUsPhoneFormat(undefined)).toBe(false);
  });
});
