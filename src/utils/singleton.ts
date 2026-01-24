/**
 * Abstract base class for Singleton pattern.
 * Prevents direct instantiation via `new`.
 * Extend this class to implement singletons (though dependency injection is preferred).
 */
export abstract class Singleton {
  private static instance: unknown;

  protected constructor() {
    if (Singleton.instance) {
      throw new Error("You can't call new() on a Singleton class");
    }
  }
}
