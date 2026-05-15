import type { AgentActionSession } from "./sessions.js";
import type { HarnessEvent, HarnessEventClass } from "./events.js";
import { constructTypeOf } from "./naming.js";

export interface HarnessHookSummary {
  type: string;
  label: string;
  eventType: string;
  eventClassId: string;
}

export abstract class HarnessHook<TEvent extends HarnessEvent = HarnessEvent> {
  protected declare readonly __harnessHookBrand: true;

  label?: string;
  readonly eventClass?: HarnessEventClass<any, TEvent>;

  static for<TPayload, TEvent extends HarnessEvent<TPayload>>(
    eventClass: HarnessEventClass<TPayload, TEvent>,
  ): abstract new () => HarnessHook<TEvent> {
    abstract class BoundHarnessHook extends HarnessHook<TEvent> {
      override readonly eventClass: HarnessEventClass<any, TEvent> = eventClass;
    }
    return BoundHarnessHook;
  }

  get type(): string {
    return constructTypeOf(this);
  }

  abstract onActive(session: AgentActionSession, event: TEvent): void | Promise<void>;
}

export type HarnessHookEventClass<TEvent extends HarnessEvent = HarnessEvent> = abstract new () => HarnessHook<TEvent>;
