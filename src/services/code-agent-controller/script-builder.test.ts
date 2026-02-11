import { describe, expect, it } from "vitest";
import { buildProvisionScript } from "./script-builder";

const spec = {
  runtime: { node: "18.16.0" },
  setupCommands: ["pnpm install"],
};

describe("provision script builder", () => {
  it("orders clone before toolchain setup", () => {
    const lines = buildProvisionScript({
      jobId: "job-1",
      repoUrl: "https://github.com/org/repo.git",
      branch: "main",
      workspaceRoot: "/workspaces",
      configOverride: spec,
      envPayload: { NODE_ENV: "test" },
    });
    const cloneIndex = lines.findIndex((line) => line.includes("git clone"));
    const fnmIndex = lines.findIndex((line) => line.includes("fnm install"));
    expect(cloneIndex).toBeGreaterThan(-1);
    expect(fnmIndex).toBeGreaterThan(-1);
    expect(cloneIndex).toBeLessThan(fnmIndex);
  });

  it("supports empty workspaces when allowed", () => {
    const lines = buildProvisionScript({
      jobId: "job-empty",
      workspaceRoot: "/workspaces",
      configOverride: spec,
      allowEmptyWorkspace: true,
    });
    const hasClone = lines.some((line) => line.includes("git clone"));
    const hasRunrc = lines.some((line) => line.includes(".agent-runrc.json"));
    expect(hasClone).toBe(false);
    expect(hasRunrc).toBe(true);
  });
});
