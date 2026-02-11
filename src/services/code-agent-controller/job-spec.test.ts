import { describe, expect, it } from "vitest";
import { parseJobSpec, parseJobSpecJson } from "./job-spec";

describe("job spec parser", () => {
  it("parses a valid job spec", () => {
    const spec = parseJobSpec({
      runtime: { node: "18.16.0", pnpm: "8.15.4" },
      env: { NODE_ENV: "test" },
      setupCommands: ["pnpm install"],
    });
    expect(spec.runtime.node).toBe("18.16.0");
    expect(spec.runtime.pnpm).toBe("8.15.4");
    expect(spec.env?.NODE_ENV).toBe("test");
  });

  it("rejects missing node runtime", () => {
    expect(() =>
      parseJobSpec({
        runtime: { pnpm: "8.15.4" },
      })
    ).toThrow();
  });

  it("parses JSON payload", () => {
    const spec = parseJobSpecJson(
      JSON.stringify({ runtime: { node: "20.11.1" } })
    );
    expect(spec.runtime.node).toBe("20.11.1");
  });
});
