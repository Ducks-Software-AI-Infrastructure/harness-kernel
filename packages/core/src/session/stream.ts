import { randomId } from "../runtime/id.js";
import type { HarnessRunStream, HarnessStreamEvent, SendResult } from "./types.js";

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.values.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined as T, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value) return Promise.resolve({ value, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as T, done: true });
        return new Promise<IteratorResult<T>>((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

export interface HarnessRunStreamController {
  push(event: HarnessStreamEvent): void;
  close(): void;
}

export function createHarnessRunStream(
  start: (controller: HarnessRunStreamController) => Promise<SendResult>,
  cancel: (reason?: string) => Promise<void>,
): HarnessRunStream {
  const queue = new AsyncEventQueue<HarnessStreamEvent>();
  const controller: HarnessRunStreamController = {
    push: (event) => queue.push(event),
    close: () => queue.close(),
  };
  const result = start(controller).finally(() => queue.close());

  return {
    id: randomId(),
    result,
    cancel,
    [Symbol.asyncIterator]: () => queue[Symbol.asyncIterator](),
  };
}
