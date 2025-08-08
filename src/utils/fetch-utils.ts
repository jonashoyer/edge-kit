
export interface FetchExtOptions {
  url: string;
  init?: RequestInit;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  backoff?: "exponential" | "none";
}

export const fetchExt = async ({
  url,
  init,
  timeout = 10000,
  retries = 0,
  retryDelay = 500,
  backoff = "exponential",
}: FetchExtOptions) => {

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const signal = controller.signal;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      return await fetch(url, { signal, ...init });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Fetch request timed out');
      }

      if (i < retries) {
        const delay = backoff === "exponential" ? retryDelay * Math.pow(2, i) : retryDelay;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error('Failed after multiple retries');
};