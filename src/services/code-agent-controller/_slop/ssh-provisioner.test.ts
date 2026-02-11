import { describe, expect, it, vi } from "vitest";

import type { EnvInjector } from "./env-injector";
import { SshProvisioner } from "./ssh-provisioner";

const createExecutor = () => {
  const exec = vi.fn(async () => ({ stdout: "ok", stderr: "", exitCode: 0 }));
  return { exec };
};

describe("SshProvisioner", () => {
  it("runs provisioning commands in order", async () => {
    const executor = createExecutor();
    const envInjector = {
      decryptPayload: vi.fn(async () => ({ API_KEY: "test" })),
      formatEnvFile: vi.fn(() => "API_KEY=test"),
    } as unknown as EnvInjector;

    const provisioner = new SshProvisioner({
      executor,
      envInjector,
      repoPath: "/repo",
    });

    await provisioner.prepareRepo({ repoUrl: "repo", branch: "main" });
    await provisioner.installDependencies({ repoUrl: "repo", branch: "main" });
    await provisioner.bootDevcontainer({ repoUrl: "repo", branch: "main" });
    await provisioner.injectEnv({ envPayload: "encrypted" });

    const calls = executor.exec.mock.calls.map((call) => call[0]);
    expect(calls[0]).toContain("git");
    expect(calls[1]).toContain("pnpm install");
    expect(calls[2]).toContain("devcontainer up");
    expect(calls[3]).toContain("cat > .env");
  });
});
