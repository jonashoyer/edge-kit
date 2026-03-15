declare module 'ink' {
  import type { FC, PropsWithChildren, ReactElement } from 'react';

  export interface InkKey {
    ctrl?: boolean;
    downArrow?: boolean;
    escape?: boolean;
    return?: boolean;
    upArrow?: boolean;
  }

  export interface InkRenderOptions {
    exitOnCtrlC?: boolean;
    stderr?: NodeJS.WriteStream;
    stdin?: NodeJS.ReadStream;
    stdout?: NodeJS.WriteStream;
  }

  export interface InkRenderResult {
    unmount: () => void;
  }

  export const Box: FC<PropsWithChildren<Record<string, unknown>>>;
  export const Text: FC<
    PropsWithChildren<{
      bold?: boolean;
      color?: string;
      dimColor?: boolean;
    }>
  >;

  export const render: (
    node: ReactElement,
    options?: InkRenderOptions
  ) => InkRenderResult;
  export const useApp: () => {
    exit: () => void;
  };
  export const useInput: (
    handler: (input: string, key: InkKey) => void
  ) => void;
}

declare module 'ink-testing-library' {
  import type { ReactElement } from 'react';

  export const render: (node: ReactElement) => {
    lastFrame: () => string;
    stdin: {
      write: (input: string) => void;
    };
  };
}
