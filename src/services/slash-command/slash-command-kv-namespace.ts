import { NamespaceComposer } from "../../composers/namespace-composer";

export const slashCommandKvNamespace = new NamespaceComposer({
  command: (commandId: string) => `cmd:${commandId}`,
  request: (requestId: string) => `cmd:req:${requestId}`,
});
