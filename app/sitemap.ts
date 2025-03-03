import { MetadataRoute } from 'next';
import sourceMap from '../source-map.json';

// Helper to check if value is an object (directory)
function isDirectory(value: any): boolean {
  return value !== null && typeof value === 'object';
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Base URL for your site
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` : 'https://edge-kit.vercel.app';

  // Current date for lastModified
  const currentDate = new Date();

  // Start with the root route
  const routes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: currentDate,
      changeFrequency: 'daily' as const,
      priority: 1,
    },
  ];

  // Traverse the source map to generate all paths
  function traverseSourceMap(obj: any, currentPath: string[] = []) {
    // Add current path (both for directories and files)
    if (currentPath.length > 0) {
      routes.push({
        url: `${baseUrl}/${currentPath.join('/')}`,
        lastModified: currentDate,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      });
    }

    // Only continue traversing if it's a directory
    if (isDirectory(obj)) {
      // Traverse children
      for (const [key, value] of Object.entries(obj)) {
        traverseSourceMap(value, [...currentPath, key]);
      }
    }
  }

  traverseSourceMap(sourceMap);

  return routes;
} 