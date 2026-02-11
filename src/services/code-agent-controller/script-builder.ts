import type { JobSpec } from "./types";
import { buildToolchainCommandsFromFile, shellEscape } from "./toolchain";

export interface ProvisionScriptParams {
  jobId: string;
  repoUrl?: string;
  branch?: string;
  workspaceRoot: string;
  configOverride?: JobSpec;
  envPayload?: Record<string, string>;
  allowEmptyWorkspace?: boolean;
}

export function buildProvisionScript(params: ProvisionScriptParams): string[] {
  const workspacePath = `${params.workspaceRoot}/${params.jobId}`;
  const script: string[] = ["set -eu", `rm -rf ${workspacePath}`];
  script.push(`mkdir -p ${workspacePath}`);
  script.push(`cd ${workspacePath}`);
  if (params.repoUrl) {
    if (!params.branch) {
      throw new Error("branch is required when repoUrl is provided");
    }
    script.push(
      `git clone --depth 1 --branch ${shellEscape(
        params.branch
      )} ${shellEscape(params.repoUrl)} .`
    );
  } else if (!params.allowEmptyWorkspace) {
    throw new Error("repoUrl is required unless allowEmptyWorkspace is true");
  }
  if (params.configOverride) {
    script.push("cat > .agent-runrc.json <<'EOF'");
    script.push(JSON.stringify(params.configOverride, null, 2));
    script.push("EOF");
  }
  script.push("if [ ! -f .agent-runrc.json ]; then echo 'Missing .agent-runrc.json' >&2; exit 1; fi");
  script.push(...buildToolchainCommandsFromFile(".agent-runrc.json"));
  script.push("printf '' > .env");
  script.push(
    "jq -r '.env // {} | to_entries[] | \"\\(.key)=\\(.value)\"' .agent-runrc.json >> .env"
  );
  if (params.envPayload && Object.keys(params.envPayload).length > 0) {
    for (const [key, value] of Object.entries(params.envPayload)) {
      script.push(
        `printf '%s\\n' ${shellEscape(`${key}=${value}`)} >> .env`
      );
    }
  }
  script.push("if jq -e '.setupCommands' .agent-runrc.json >/dev/null; then");
  script.push("  jq -r '.setupCommands[]' .agent-runrc.json | while read -r cmd; do");
  script.push("    if [ -n \"$cmd\" ]; then eval \"$cmd\"; fi");
  script.push("  done");
  script.push("fi");
  return script;
}

export function buildExecuteScript(params: {
  workspaceRoot: string;
  jobId: string;
  command: string;
}): string[] {
  const workspacePath = `${params.workspaceRoot}/${params.jobId}`;
  return [
    "set -eu",
    `cd ${workspacePath}`,
    "if [ -f .env ]; then set -o allexport; . ./.env; set +o allexport; fi",
    "if [ -f .agent-runrc.json ]; then",
    ...buildToolchainCommandsFromFile(".agent-runrc.json").map(
      (line) => `  ${line}`
    ),
    "fi",
    params.command,
  ];
}

export function buildTeardownScript(params: {
  workspaceRoot: string;
  jobId: string;
}): string[] {
  const workspacePath = `${params.workspaceRoot}/${params.jobId}`;
  return ["set -eu", `rm -rf ${workspacePath}`];
}
