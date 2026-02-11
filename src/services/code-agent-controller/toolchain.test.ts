import { describe, expect, it } from "vitest";
import { buildToolchainCommands } from "./toolchain";

const spec = {
  runtime: { node: "18.16.0", pnpm: "8.15.4" },
};

describe("toolchain commands", () => {
  it("includes fnm install/use and pnpm prepare", () => {
    const commands = buildToolchainCommands(spec);
    const script = commands.join("\n");
    expect(script).toContain("fnm install");
    expect(script).toContain("fnm use");
    expect(script).toContain("corepack prepare pnpm@");
  });
});
