import { randomId } from "./id.js";
import { eventType } from "./constructs.js";
import { ModelBeforeEvent } from "./events.js";
import {
  ContextConsume,
  ContextScopes,
  type ContextContribution,
  type ContextContributionInput,
  type ContextEntry,
  type ContextEntryFilter,
  type ContextProviderSummary,
  type ContextRegistrationOptions,
  type ContextSnapshot,
  type HarnessEventClass,
  type HarnessEventRecord,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ContextRegistry {
  private snapshots: ContextSnapshot[] = [];
  private currentSnapshot: ContextSnapshot | undefined;
  private entries: ContextEntry[] = [];

  get current(): ContextSnapshot | undefined {
    return this.currentSnapshot;
  }

  get allEntries(): ContextEntry[] {
    return this.entries;
  }

  restore(input: { entries: ContextEntry[]; snapshot?: ContextSnapshot }): void {
    this.entries = cloneJSON(input.entries);
    this.currentSnapshot = input.snapshot ? cloneJSON(input.snapshot) : undefined;
  }

  recordSnapshot(snapshot: ContextSnapshot): void {
    this.currentSnapshot = snapshot;
    this.snapshots.push(snapshot);
  }

  loadSnapshots(snapshots: ContextSnapshot[]): void {
    this.snapshots = cloneJSON(snapshots);
    this.currentSnapshot = this.snapshots.at(-1);
  }

  filter(filter?: ContextEntryFilter): ContextEntry[] {
    let entries = [...this.entries];
    if (filter?.id) entries = entries.filter((entry) => entry.id === filter.id);
    if (filter?.scope) entries = entries.filter((entry) => entry.scope === filter.scope);
    if (filter?.consume) entries = entries.filter((entry) => entry.consume === filter.consume);
    if (filter?.providerId) entries = entries.filter((entry) => entry.contribution.providerId === filter.providerId);
    if (filter?.role) entries = entries.filter((entry) => entry.contribution.authorRole === filter.role || entry.contribution.role === filter.role);
    if (filter?.on) {
      const on = eventType(filter.on);
      entries = entries.filter((entry) => entry.on === on);
    }
    return entries;
  }

  entriesFor(eventClass: HarnessEventClass, runId: string, turnId?: string): ContextEntry[] {
    const on = eventType(eventClass);
    return this.entries.filter((entry) =>
      this.isActive(entry, runId, turnId) && (entry.on === on || entry.activatedAt !== undefined)
    );
  }

  activateFor(eventClass: HarnessEventClass, record: HarnessEventRecord, runId: string, turnId?: string): void {
    const on = eventType(eventClass);
    this.entries = this.entries.map((entry) => {
      if (entry.on !== on || entry.activatedAt !== undefined || !this.isActive(entry, runId, turnId)) return entry;
      return {
        ...entry,
        activatedAt: record.at,
        activatedByEventId: record.id,
        activatedByEventType: record.type,
      };
    });
  }

  consume(entries: ContextEntry[]): void {
    const consumed = new Set(entries.filter((entry) => entry.consume === ContextConsume.Once).map((entry) => entry.id));
    if (!consumed.size) return;
    this.entries = this.entries.filter((entry) => !consumed.has(entry.id));
  }

  expireScope(scope: ContextScopes, turnId?: string): void {
    this.entries = this.entries.filter((entry) => {
      if (entry.scope !== scope) return true;
      if (scope === ContextScopes.Turn && turnId) return entry.turnId !== turnId;
      return false;
    });
  }

  addContribution(input: {
    contribution: ContextContribution;
    options?: ContextRegistrationOptions;
    runId: string;
    turnId?: string;
    modeId: string;
  }): ContextEntry {
    const options = input.options ?? {};
    const entry: ContextEntry = {
      id: options.id ?? randomId(),
      scope: options.scope ?? ContextScopes.Run,
      on: eventType(options.on ?? ModelBeforeEvent),
      consume: options.consume ?? ContextConsume.Once,
      createdAt: nowIso(),
      runId: input.runId,
      turnId: input.turnId,
      modeId: input.modeId,
      contribution: input.contribution,
      metadata: options.metadata,
    };

    if (options.replace) {
      this.entries = this.entries.filter((candidate) => candidate.id !== entry.id);
    } else if (this.entries.some((candidate) => candidate.id === entry.id)) {
      throw new Error(`Context entry '${entry.id}' already exists. Use replace: true to overwrite it.`);
    }

    this.entries.push(entry);
    return cloneJSON(entry);
  }

  remove(id: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return this.entries.length !== before;
  }

  clear(filter?: ContextEntryFilter): number {
    const targets = new Set(this.filter(filter).map((entry) => entry.id));
    this.entries = this.entries.filter((entry) => !targets.has(entry.id));
    return targets.size;
  }

  normalizeProviderInput(
    input: ContextContributionInput,
    options: ContextRegistrationOptions | undefined,
    provider: ContextProviderSummary | undefined,
    normalize: (
      input: ContextContributionInput,
      context: { providerId?: string; providerLabel?: string },
    ) => ContextContribution,
    runId: string,
    turnId: string | undefined,
    modeId: string,
  ): ContextEntry {
    return this.addContribution({
      contribution: normalize(input, {
        providerId: provider?.type,
        providerLabel: provider?.label,
      }),
      options,
      runId,
      turnId,
      modeId,
    });
  }

  private isActive(entry: ContextEntry, runId: string, turnId?: string): boolean {
    if (entry.scope === ContextScopes.Session) return true;
    if (entry.scope === ContextScopes.Run) return entry.runId === runId;
    if (entry.scope === ContextScopes.Turn) return entry.turnId === turnId;
    return false;
  }
}
