import React from 'react';
import { notFound } from 'next/navigation';
import sourceMap from '../../source-map.json';
import pkg from '../../package.json';


export const dynamic = 'force-static';
export const runtime = 'edge'

// Helper to check if value is an object (directory)
function isDirectory(value: any): boolean {
  return value !== null && typeof value === 'object';
}

// Helper to get nested value from path
function getNestedValue(obj: any, path: string[]): any {
  let current = obj;
  for (const segment of path) {
    if (!current[segment]) return null;
    current = current[segment];
  }
  return current;
}

export async function generateMetadata({ params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path || [];
  return {
    title: `${pkg.name} - ${path.length === 0 ? 'Source Explorer' : path.join('/')}`
  };
}

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path ?? [];
  const pathValue = getNestedValue(sourceMap, path);

  // If path doesn't exist
  if (!pathValue) {
    return notFound();
  }

  // Check if there's a markdown file in this directory
  // let markdownContent = null;
  // if (isDirectory(currentPath) && currentPath['README.md']) {
  //   markdownContent = currentPath['README.md'];
  // } else if (!isDirectory(currentPath) && path[path.length - 1].endsWith('.md')) {
  //   markdownContent = currentPath;
  // }

  const docs = isDirectory(pathValue)
    ? Object.entries(pathValue)
      .filter(([name]) => name.endsWith('.md'))
      .sort(([nameA], [nameB]) => {
        // Make README.md always come first
        if (nameA === 'README.md') return -1;
        if (nameB === 'README.md') return 1;
        return nameA.localeCompare(nameB);
      })
    : [];

  const pathName = '/' + path.join('/');

  return (
    <div>
      <h1>
        {pathName}
      </h1>

      {/* Display markdown content if available */}
      {docs.map(([name, content]) => (
        <section key={name}>
          <h2>{name}</h2>
          <pre>{content as string}</pre>
        </section>
      ))}


      {/* Display directory structure */}
      {isDirectory(pathValue) && (
        <div>
          <ul>
            {/* {path.length > 0 && (
              <li>
                <a href={`/${path.slice(0, -1).join('/')}`}>
                  ../{path.slice(0, -1).join('/')}
                </a>
              </li>
            )} */}

            {Object.entries(pathValue).map(([name, content]) => (
              <li key={name}>
                <a
                  href={`/${[...path, name].join('/')}`}
                >
                  {/* {isDirectory(content) ? '📁 ' : '📄 '} */}
                  {name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Display source code */}
      {!isDirectory(pathValue) &&
        <code>
          {pathValue as string}
        </code>
      }
    </div>
  );
}

export async function generateStaticParams() {
  // const sourceMap = await getSourceMap();
  const paths: { path: string[] }[] = [];

  function traverseSourceMap(obj: any, currentPath: string[] = []) {
    // Add current path (both for directories and files)
    paths.push({ path: currentPath });

    // Only continue traversing if it's a directory
    if (isDirectory(obj)) {
      // Traverse children
      for (const [key, value] of Object.entries(obj)) {
        traverseSourceMap(value, [...currentPath, key]);
      }
    }
  }

  traverseSourceMap(sourceMap);
  return paths;
}