export abstract class Singleton {
  private static instance: unknown;

  protected constructor() {
    if (Singleton.instance) {
      throw new Error("You can't call new() on a Singleton class");
    }
  }

}
