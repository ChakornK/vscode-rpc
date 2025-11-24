export abstract class EventEmitter {
  #listeners: Map<string, CallableFunction[]> = new Map();

  on(event: string, callback: (...args: any[]) => void): void {
    const eventListeners = this.#listeners.get(event);
    if (!eventListeners) {
      this.#listeners.set(event, [callback]);
    } else {
      eventListeners?.push(callback);
    }
  }

  emit(event: string, ...args: any[]): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}
