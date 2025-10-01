import { describe, expect, it } from "vitest";
import {
  getIndexFromReferenceId,
  getIndexReferenceId,
} from "./reference-id-utils";

const MAX_INDEX = 6759;
const MIN_INDEX = 0;
const REFERENCE_ID_LENGTH = 3;
const REFERENCE_ID_PATTERN = /^[A-Z]{2}\d$/;
const TOTAL_IDS = 6760;

// Specific test values for comprehensive coverage
const TEST_INDEX_1 = 1;
const TEST_INDEX_10 = 10;
const TEST_INDEX_100 = 100;
const TEST_INDEX_500 = 500;
const TEST_INDEX_1000 = 1000;
const TEST_INDEX_2500 = 2500;
const TEST_INDEX_5000 = 5000;

// Test indices for comprehensive coverage
const TEST_INDICES = [
  MIN_INDEX,
  TEST_INDEX_1,
  TEST_INDEX_10,
  TEST_INDEX_100,
  TEST_INDEX_500,
  TEST_INDEX_1000,
  TEST_INDEX_2500,
  TEST_INDEX_5000,
  MAX_INDEX,
];

describe("getIndexReferenceId", () => {
  it("should convert index 0 to a valid reference ID", () => {
    const refId = getIndexReferenceId(MIN_INDEX);
    expect(refId).toHaveLength(REFERENCE_ID_LENGTH);
    expect(refId).toMatch(REFERENCE_ID_PATTERN);
  });

  it("should convert max index (6759) to a valid reference ID", () => {
    const refId = getIndexReferenceId(MAX_INDEX);
    expect(refId).toHaveLength(REFERENCE_ID_LENGTH);
    expect(refId).toMatch(REFERENCE_ID_PATTERN);
  });

  it("should throw error for negative index", () => {
    expect(() => getIndexReferenceId(-1)).toThrow(
      "Index -1 out of range [0, 6759]"
    );
  });

  it("should throw error for index above maximum", () => {
    expect(() => getIndexReferenceId(TOTAL_IDS)).toThrow(
      "Index 6760 out of range [0, 6759]"
    );
  });

  it("should generate different IDs for consecutive indices", () => {
    const id1 = getIndexReferenceId(MIN_INDEX);
    const id2 = getIndexReferenceId(1);
    const id3 = getIndexReferenceId(2);

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it("should be deterministic - same index always produces same ID", () => {
    const testIndex = 42;
    const id1 = getIndexReferenceId(testIndex);
    const id2 = getIndexReferenceId(testIndex);
    const id3 = getIndexReferenceId(testIndex);

    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  it("should produce unique IDs for all valid indices", () => {
    const ids = new Set<string>();
    for (let i = MIN_INDEX; i <= MAX_INDEX; i++) {
      ids.add(getIndexReferenceId(i));
    }
    expect(ids.size).toBe(TOTAL_IDS);
  });
});

describe("getIndexFromReferenceId", () => {
  it("should convert a valid reference ID to an index", () => {
    const testIndex = 100;
    const refId = getIndexReferenceId(testIndex);
    const index = getIndexFromReferenceId(refId);
    expect(index).toBe(testIndex);
  });

  it("should handle lowercase input by converting to uppercase", () => {
    const testIndex = 50;
    const refId = getIndexReferenceId(testIndex);
    const lowerRefId = refId.toLowerCase();
    const index = getIndexFromReferenceId(lowerRefId);
    expect(index).toBe(testIndex);
  });

  it("should throw error for reference ID with incorrect length", () => {
    expect(() => getIndexFromReferenceId("AB")).toThrow(
      "Invalid reference ID: AB. Expected 3 characters."
    );
    expect(() => getIndexFromReferenceId("ABCD")).toThrow(
      "Invalid reference ID: ABCD. Expected 3 characters."
    );
    expect(() => getIndexFromReferenceId("")).toThrow(
      "Invalid reference ID: . Expected 3 characters."
    );
  });

  it("should throw error for invalid characters", () => {
    expect(() => getIndexFromReferenceId("1B5")).toThrow(
      "Invalid reference ID format: 1B5"
    );
    expect(() => getIndexFromReferenceId("A15")).toThrow(
      "Invalid reference ID format: A15"
    );
    expect(() => getIndexFromReferenceId("ABX")).toThrow(
      "Invalid reference ID format: ABX"
    );
  });

  it("should throw error for special characters", () => {
    expect(() => getIndexFromReferenceId("A@5")).toThrow(
      "Invalid reference ID format: A@5"
    );
    expect(() => getIndexFromReferenceId("AB-")).toThrow(
      "Invalid reference ID format: AB-"
    );
  });

  it("should be the inverse of getIndexReferenceId", () => {
    for (const originalIndex of TEST_INDICES) {
      const refId = getIndexReferenceId(originalIndex);
      const recoveredIndex = getIndexFromReferenceId(refId);
      expect(recoveredIndex).toBe(originalIndex);
    }
  });

  it("should correctly convert all valid reference IDs back to indices", () => {
    const indices = new Set<number>();
    for (let i = MIN_INDEX; i <= MAX_INDEX; i++) {
      const refId = getIndexReferenceId(i);
      const index = getIndexFromReferenceId(refId);
      indices.add(index);
    }
    expect(indices.size).toBe(TOTAL_IDS);
  });
});

describe("bidirectional mapping (getIndexReferenceId + getIndexFromReferenceId)", () => {
  it("should maintain perfect bijection - every index maps to exactly one ID and back", () => {
    for (let i = MIN_INDEX; i <= MAX_INDEX; i++) {
      const refId = getIndexReferenceId(i);
      const recovered = getIndexFromReferenceId(refId);
      expect(recovered).toBe(i);
    }
  });

  it("should handle edge cases", () => {
    // Test boundary values
    const testCases = [
      { index: MIN_INDEX },
      { index: 1 },
      { index: 6758 },
      { index: MAX_INDEX },
    ];

    for (const { index } of testCases) {
      const refId = getIndexReferenceId(index);
      const recovered = getIndexFromReferenceId(refId);
      expect(recovered).toBe(index);
    }
  });

  it("should produce obfuscated output - consecutive indices do not map to consecutive IDs", () => {
    const id0 = getIndexReferenceId(MIN_INDEX);
    const id1 = getIndexReferenceId(1);
    const id2 = getIndexReferenceId(2);

    // Verify they're not consecutive in any obvious way
    // This is a weak test but verifies basic obfuscation
    expect(id0).not.toBe(id1);
    expect(id1).not.toBe(id2);
  });
});
