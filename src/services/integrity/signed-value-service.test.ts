import { describe, expect, it } from "vitest";
import { SignedValueService } from "./signed-value-service";

describe("SignedValueService", () => {
  const service = new SignedValueService();
  const secret = "test-secret-key";

  describe("sign", () => {
    it("should sign a string value", async () => {
      const value = "admin-id-123";
      const signed = await service.sign(value, secret);

      expect(signed).toHaveProperty("algorithm", "HMAC-SHA256");
      expect(signed).toHaveProperty("value", value);
      expect(signed).toHaveProperty("signature");
      expect(signed.signature).toBeTruthy();
    });

    it("should sign a number value", async () => {
      const value = 42;
      const signed = await service.sign(value, secret);

      expect(signed.algorithm).toBe("HMAC-SHA256");
      expect(signed.value).toBe(value);
      expect(signed.signature).toBeTruthy();
    });

    it("should sign an object value", async () => {
      const value = { id: "admin-1", role: "superuser" };
      const signed = await service.sign(value, secret);

      expect(signed.algorithm).toBe("HMAC-SHA256");
      expect(signed.value).toEqual(value);
      expect(signed.signature).toBeTruthy();
    });

    it("should sign an array value", async () => {
      const value = ["admin-1", "admin-2", "admin-3"];
      const signed = await service.sign(value, secret);

      expect(signed.algorithm).toBe("HMAC-SHA256");
      expect(signed.value).toEqual(value);
      expect(signed.signature).toBeTruthy();
    });

    it("should generate different signatures for different values", async () => {
      const signed1 = await service.sign("value1", secret);
      const signed2 = await service.sign("value2", secret);

      expect(signed1.signature).not.toBe(signed2.signature);
    });

    it("should generate different signatures for different secrets", async () => {
      const value = "same-value";
      const signed1 = await service.sign(value, "secret1");
      const signed2 = await service.sign(value, "secret2");

      expect(signed1.signature).not.toBe(signed2.signature);
    });
  });

  describe("verify", () => {
    it("should verify a valid signature", async () => {
      const value = "test-value";
      const signed = await service.sign(value, secret);

      const isValid = await service.verify(signed, secret);
      expect(isValid).toBe(true);
    });

    it("should reject with wrong secret", async () => {
      const value = "test-value";
      const signed = await service.sign(value, secret);

      const isValid = await service.verify(signed, "wrong-secret");
      expect(isValid).toBe(false);
    });

    it("should reject tampered value", async () => {
      const value = "test-value";
      const signed = await service.sign(value, secret);

      // Tamper with the value
      const tampered = {
        ...signed,
        value: "tampered-value",
      };

      const isValid = await service.verify(tampered, secret);
      expect(isValid).toBe(false);
    });

    it("should reject tampered signature", async () => {
      const value = "test-value";
      const signed = await service.sign(value, secret);

      // Tamper with the signature
      const tampered = {
        ...signed,
        signature: "fake-signature",
      };

      const isValid = await service.verify(tampered, secret);
      expect(isValid).toBe(false);
    });

    it("should verify objects correctly", async () => {
      const value = { id: "admin-1", role: "superuser", active: true };
      const signed = await service.sign(value, secret);

      const isValid = await service.verify(signed, secret);
      expect(isValid).toBe(true);
    });

    it("should verify arrays correctly", async () => {
      const value = ["id1", "id2", "id3"];
      const signed = await service.sign(value, secret);

      const isValid = await service.verify(signed, secret);
      expect(isValid).toBe(true);
    });

    it("should reject invalid SignedValue format", async () => {
      const invalid = { algorithm: "HMAC-SHA256", value: "test" };
      const isValid = await service.verify(invalid as never, secret);
      expect(isValid).toBe(false);
    });

    it("should reject null value", async () => {
      const isValid = await service.verify(null as never, secret);
      expect(isValid).toBe(false);
    });

    it("should reject non-object", async () => {
      const isValid = await service.verify("not-an-object" as never, secret);
      expect(isValid).toBe(false);
    });

    it("should handle JSON stringification edge cases", async () => {
      const value = { a: 1, b: 2 }; // Object property order matters in JSON
      const signed = await service.sign(value, secret);

      // Verify with same object
      let isValid = await service.verify(signed, secret);
      expect(isValid).toBe(true);

      // Tamper by changing a property
      const tampered = {
        ...signed,
        value: { a: 1, b: 3 }, // Changed b: 2 to b: 3
      };
      isValid = await service.verify(tampered, secret);
      expect(isValid).toBe(false);
    });
  });

  describe("round-trip", () => {
    it("should complete a full sign/verify cycle", async () => {
      const value = {
        adminIds: ["id1", "id2"],
        permissions: ["read", "write"],
      };
      const signed = await service.sign(value, secret);
      const isValid = await service.verify(signed, secret);

      expect(isValid).toBe(true);
      expect(signed.value).toEqual(value);
    });

    it("should handle various types consistently", async () => {
      const testValues = [
        "string",
        42,
        3.14,
        true,
        false,
        null,
        { key: "value" },
        [1, 2, 3],
        { nested: { object: true } },
        ["array", "of", "strings"],
      ];

      for (const value of testValues) {
        const signed = await service.sign(value, secret);
        const isValid = await service.verify(signed, secret);
        expect(isValid).toBe(true);
      }
    });
  });
});
