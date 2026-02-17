type TemplateLiteralFn = (...args: never[]) => string;

export class NamespaceComposer<
  T extends Record<string, string | TemplateLiteralFn>,
> {
  private readonly definitions: T;
  constructor(definitions: T) {
    this.definitions = definitions;
  }

  key<K extends keyof T>(
    key: K,
    ...params: T[K] extends TemplateLiteralFn ? Parameters<T[K]> : []
  ): string {
    const definition = this.definitions[key];
    if (typeof definition === 'string') {
      return definition;
    }
    return this.resolveTemplateLiteral(definition, params);
  }

  private resolveTemplateLiteral(
    template: TemplateLiteralFn,
    params: never[]
  ): string {
    return template(...params);
  }
}

/*
// KV namespace composer example
const kvNamespace = new NamespaceComposer({
  user: 'users',
  userSession: (userId: string) => `session:user:${userId}`,
  documentChunk: (documentId: string, chunkNumber: number) => `chunk:${documentId}:${chunkNumber}`,
  profile: (userId: string) => `profiles:${userId}`,
  image: (userId: string, imageId: string) => `images:${userId}:${imageId}`,
  object: (params: { type: string, id: string }) => `objects:${params.type}:${params.id}`,
});

// Type-safe usage examples
const userKey = kvNamespace.key('user');
const userSessionKey = kvNamespace.key('userSession', 'user123');
const documentChunkKey = kvNamespace.key('documentChunk', 'doc456', 1);
const profileKey = kvNamespace.key('profile', 'user789');
const imageKey = kvNamespace.key('image', 'user101', 'img202');
const objectKey = kvNamespace.key('object', { type: 'user', id: 'user123' });

// This will cause a TypeScript error due to incorrect parameters
// kvNamespace.key('userSession', 123);
*/

/*
// Web Router namespace composer example

const pathNamespace = new NamespaceComposer({
  home: '/',
  user: (userId: string) => `/users/${userId}`,
  article: (articleId: string) => `/articles/${articleId}`,
  login: '/login',
  logout: '/logout',
});
*/
