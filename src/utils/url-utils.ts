export const getVercelBaseUrl = () => {
  if (typeof window !== 'undefined') return ''; // browser should use relative url
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`; // SSR should use vercel url

  return 'http://localhost:3000'; // dev SSR should use localhost
};

export const getUrlDomain = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

const QUERY_HASH_REGEX = /\/?((\?|#).*)?$/;

export const urlStripQueryHash = (url: string) =>
  url.replace(QUERY_HASH_REGEX, '');

export const getHostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

// New function
export const isValidUrl = (url: string): boolean => URL.canParse(url);

// New function
export const getQueryParams = (url: string): Record<string, string> => {
  const params = new URLSearchParams(new URL(url).search);
  return Object.fromEntries(params.entries());
};
