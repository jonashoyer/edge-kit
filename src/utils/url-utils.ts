export const getVercelBaseUrl = () => {
  if (typeof window !== "undefined") return ""; // browser should use relative url
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`; // SSR should use vercel url

  return `http://localhost:3000`; // dev SSR should use localhost
};

export const getUrlDomain = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

export const urlStripQueryHash = (url: string) => {
  return url.replace(/\/?((\?|#).*)?$/, '');
}

export const getHostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

// New function
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

// New function
export const getQueryParams = (url: string): Record<string, string> => {
  const params = new URLSearchParams(new URL(url).search);
  return Object.fromEntries(params.entries());
}
