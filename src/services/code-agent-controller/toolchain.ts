import type { JobSpec } from "./types";

export function buildToolchainCommands(spec: JobSpec): string[] {
  const commands: string[] = [];
  commands.push("export HOME=\"${HOME:-/root}\"");
  commands.push("export FNM_DIR=\"$HOME/.local/share/fnm\"");
  commands.push("if [ -s \"$FNM_DIR/fnm\" ]; then export PATH=\"$FNM_DIR:$PATH\"; fi");
  commands.push('eval "$(fnm env --shell bash)"');
  commands.push(`fnm install ${shellEscape(spec.runtime.node)}`);
  commands.push(`fnm use ${shellEscape(spec.runtime.node)}`);
  commands.push("corepack enable");
  if (spec.runtime.pnpm) {
    commands.push(
      `corepack prepare pnpm@${shellEscape(spec.runtime.pnpm)} --activate`
    );
  }
  return commands;
}

export function buildToolchainCommandsFromFile(path: string): string[] {
  return [
    "export HOME=\"${HOME:-/root}\"",
    "export FNM_DIR=\"$HOME/.local/share/fnm\"",
    "if [ -s \"$FNM_DIR/fnm\" ]; then export PATH=\"$FNM_DIR:$PATH\"; fi",
    'eval "$(fnm env --shell bash)"',
    `node_version=$(jq -r '.runtime.node // empty' ${path})`,
    "if [ -z \"$node_version\" ]; then echo 'Missing runtime.node' >&2; exit 1; fi",
    "fnm install \"$node_version\"",
    "fnm use \"$node_version\"",
    "corepack enable",
    `pnpm_version=$(jq -r '.runtime.pnpm // empty' ${path})`,
    "if [ -n \"$pnpm_version\" ]; then corepack prepare \"pnpm@$pnpm_version\" --activate; fi",
  ];
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/gu, "'\"'\"'")}'`;
}
