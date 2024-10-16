type TemplateLiteralFn = (...args: any[]) => string;

export class NamespaceComposer<T extends Record<string, string | TemplateLiteralFn>> {
  constructor(private definitions: T) { }

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
    params: any[]
  ): string {
    return template(...params);
  }
}


/*
const manager = new NamespaceComposer({
  user: 'users',
  userSession: (userId: string) => `session:user:${userId}`,
  documentChunk: (documentId: string, chunkNumber: number) => `chunk:${documentId}:${chunkNumber}`,
  profile: (userId: string) => `profiles:${userId}`,
  image: (userId: string, imageId: string) => `images:${userId}:${imageId}`,
  object: (params: { type: string, id: string }) => `objects:${params.type}:${params.id}`,
});

// Type-safe usage examples
const userKey = manager.key('user');
const userSessionKey = manager.key('userSession', 'user123');
const documentChunkKey = manager.key('documentChunk', 'doc456', 1);
const profileKey = manager.key('profile', 'user789');
const imageKey = manager.key('image', 'user101', 'img202');
const objectKey = manager.key('object', { type: 'user', id: 'user123' });

// This will cause a TypeScript error due to incorrect parameters
// manager.key('userSession', 123);
*/