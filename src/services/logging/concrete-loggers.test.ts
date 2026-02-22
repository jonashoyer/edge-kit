import { beforeEach, describe, expect, it, vi } from 'vitest';

const ingestMock = vi.fn();
vi.mock('@axiomhq/js', () => {
  return {
    Axiom: vi.fn(() => ({
      ingest: ingestMock,
    })),
  };
});

const pinoLevelMocks = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
const pinoTransportMock = vi.fn(() => ({ mockedTransport: true }));
const pinoMock = vi.fn(() => pinoLevelMocks);
vi.mock('pino', () => {
  const fn = ((...args: unknown[]) => pinoMock(...args)) as unknown as {
    (...args: unknown[]): unknown;
    transport: typeof pinoTransportMock;
  };
  fn.transport = pinoTransportMock;
  return {
    default: fn,
  };
});

describe('concrete loggers', () => {
  beforeEach(() => {
    ingestMock.mockReset();
    pinoTransportMock.mockReset();
    pinoMock.mockReset();
    pinoLevelMocks.debug.mockReset();
    pinoLevelMocks.info.mockReset();
    pinoLevelMocks.warn.mockReset();
    pinoLevelMocks.error.mockReset();
  });

  it('ConsoleLogger supports all levels and normalizes metadata', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { ConsoleLogger } = await import('./console-logger');
      const logger = new ConsoleLogger();

      logger.debug('debug.event', { payload: { id: '1' } });
      logger.info('info.event');
      logger.warn('warn.event');
      logger.error('error.event', { err: new Error('boom') });

      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      debugSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('AxiomLogger supports both constructor forms and all log levels', async () => {
    const { AxiomLogger } = await import('./axiom-logger');

    const loggerFromOptions = new AxiomLogger({
      token: 'token-1',
      dataset: 'dataset-1',
    });
    const loggerFromPositional = new AxiomLogger('token-2', 'dataset-2');

    loggerFromOptions.debug('debug.event', { payload: { id: '1' } });
    loggerFromOptions.info('info.event');
    loggerFromPositional.warn('warn.event');
    loggerFromPositional.error('error.event');

    expect(ingestMock).toHaveBeenCalledTimes(4);
    expect(ingestMock.mock.calls[0]?.[0]).toBe('dataset-1');
    expect(ingestMock.mock.calls[2]?.[0]).toBe('dataset-2');
  });

  it('AxiomPinoLogger supports all levels and normalized metadata', async () => {
    const { AxiomPinoLogger } = await import('./axiom-pino-logger');
    const logger = new AxiomPinoLogger({
      dataset: 'dataset',
      token: 'token',
    });

    logger.debug('debug.event', { payload: { id: '1' } });
    logger.info('info.event');
    logger.warn('warn.event');
    logger.error('error.event');

    expect(pinoTransportMock).toHaveBeenCalledTimes(1);
    expect(pinoMock).toHaveBeenCalledTimes(1);
    expect(pinoLevelMocks.debug).toHaveBeenCalledTimes(1);
    expect(pinoLevelMocks.info).toHaveBeenCalledTimes(1);
    expect(pinoLevelMocks.warn).toHaveBeenCalledTimes(1);
    expect(pinoLevelMocks.error).toHaveBeenCalledTimes(1);
  });
});
