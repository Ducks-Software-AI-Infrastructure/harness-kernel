import { randomId } from "./id.js";
import type {
  AgentMessage,
  AgentMessageRole,
  EventCursor,
  HarnessEvent,
  HarnessEventRecord,
  TranscriptBranch,
  TranscriptCursor,
  TranscriptQuery,
  TranscriptSeekTarget,
} from "./types.js";

const rootBranchId = "main";

function nowIso(): string {
  return new Date().toISOString();
}

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createTranscriptCursor(input?: {
  branchId?: string;
  headMessageId?: string;
  seq?: number;
}): TranscriptCursor {
  return {
    id: randomId(),
    branchId: input?.branchId ?? rootBranchId,
    headMessageId: input?.headMessageId,
    seq: input?.seq ?? 0,
    updatedAt: nowIso(),
  };
}

function createEventCursor(input?: {
  branchId?: string;
  headEventId?: string;
  seq?: number;
}): EventCursor {
  return {
    id: randomId(),
    branchId: input?.branchId ?? rootBranchId,
    headEventId: input?.headEventId,
    seq: input?.seq ?? 0,
    updatedAt: nowIso(),
  };
}

export interface TranscriptRoleInfo {
  authorRole?: string;
  roleType?: string;
}

export class TranscriptManager {
  private messages: AgentMessage[] = [];
  private messageSeq = 0;
  private transcriptCursor: TranscriptCursor = createTranscriptCursor();
  private eventCursor: EventCursor = createEventCursor();
  private readonly branches = new Map<string, TranscriptBranch>([
    [rootBranchId, { id: rootBranchId, createdAt: nowIso() }],
  ]);

  get count(): number {
    return this.messages.length;
  }

  get activeTranscriptCursor(): TranscriptCursor {
    return this.transcriptCursor;
  }

  get activeEventCursor(): EventCursor {
    return this.eventCursor;
  }

  get allMessages(): AgentMessage[] {
    return this.messages;
  }

  get allBranches(): TranscriptBranch[] {
    return [...this.branches.values()];
  }

  addBranches(branches: TranscriptBranch[]): void {
    for (const branch of branches) {
      if (!this.branches.has(branch.id)) this.branches.set(branch.id, cloneJSON(branch));
    }
  }

  loadTranscript(messages: AgentMessage[]): void {
    if (messages.length === 0) return;
    this.messages = cloneJSON(messages);
    this.messageSeq = Math.max(0, ...messages.map((message) => message.seq));
  }

  loadCursors(input: {
    transcriptCursor: TranscriptCursor;
    eventCursor: EventCursor;
    branches?: TranscriptBranch[];
    eventExists(headEventId: string): boolean;
  }): void {
    this.addBranches(input.branches ?? []);
    const transcriptHead = input.transcriptCursor.headMessageId;
    const eventHead = input.eventCursor.headEventId;
    if (!transcriptHead || this.messages.some((message) => message.id === transcriptHead)) {
      this.transcriptCursor = cloneJSON(input.transcriptCursor);
    }
    if (!eventHead || input.eventExists(eventHead)) {
      this.eventCursor = cloneJSON(input.eventCursor);
    }
  }

  restoreCursors(input: {
    transcriptCursor: TranscriptCursor;
    eventCursor: EventCursor;
    branches?: TranscriptBranch[];
  }): void {
    this.addBranches(input.branches ?? []);
    this.transcriptCursor = cloneJSON(input.transcriptCursor);
    this.eventCursor = cloneJSON(input.eventCursor);
  }

  appendMessage(input: {
    role: AgentMessageRole;
    content: unknown;
    modeId?: string;
    turnId?: string;
    metadata?: Record<string, unknown>;
    roleInfo?: TranscriptRoleInfo;
    id?: string;
    branchId?: string;
    createdAt?: string;
    hidden?: boolean;
  }): AgentMessage {
    const branchId = input.branchId ?? this.transcriptCursor.branchId;
    const message: AgentMessage = {
      id: input.id ?? randomId(),
      seq: ++this.messageSeq,
      branchId,
      parentMessageId: this.transcriptCursor.headMessageId,
      role: input.role,
      authorRole: input.roleInfo?.authorRole,
      roleType: input.roleInfo?.roleType,
      content: input.content,
      createdAt: input.createdAt ?? nowIso(),
      modeId: input.modeId,
      turnId: input.turnId,
      hidden: input.hidden,
      eventCursor: cloneJSON(this.eventCursor),
      metadata: input.metadata,
    };
    this.messages.push(message);
    this.transcriptCursor = createTranscriptCursor({
      branchId,
      headMessageId: message.id,
      seq: message.seq,
    });
    return message;
  }

  markMessageEventCursor(messageId: string): boolean {
    const message = this.messages.find((candidate) => candidate.id === messageId);
    if (!message) return false;
    message.eventCursor = cloneJSON(this.eventCursor);
    return true;
  }

  ensureBranchForAppend(): void {
    const cursor = this.transcriptCursor;
    const latest = this.branchLatestMessage(cursor.branchId);
    if (!latest || latest.id === cursor.headMessageId) return;

    const branchId = randomId();
    const branch: TranscriptBranch = {
      id: branchId,
      createdAt: nowIso(),
      parentBranchId: cursor.branchId,
      parentMessageId: cursor.headMessageId,
      parentMessageSeq: cursor.seq,
      parentEventSeq: this.eventCursor.seq,
    };
    this.branches.set(branchId, branch);
    this.transcriptCursor = createTranscriptCursor({
      branchId,
      headMessageId: cursor.headMessageId,
      seq: cursor.seq,
    });
    this.eventCursor = createEventCursor({
      branchId,
      headEventId: this.eventCursor.headEventId,
      seq: this.eventCursor.seq,
    });
  }

  ensureBranchForEventAppend(latestEvent: HarnessEvent | undefined): void {
    if (!latestEvent || latestEvent.record.seq <= this.eventCursor.seq) return;

    const branchId = randomId();
    const branch: TranscriptBranch = {
      id: branchId,
      createdAt: nowIso(),
      parentBranchId: this.eventCursor.branchId,
      parentMessageId: this.transcriptCursor.headMessageId,
      parentMessageSeq: this.transcriptCursor.seq,
      parentEventSeq: this.eventCursor.seq,
    };
    this.branches.set(branchId, branch);
    this.transcriptCursor = createTranscriptCursor({
      branchId,
      headMessageId: this.transcriptCursor.headMessageId,
      seq: this.transcriptCursor.seq,
    });
    this.eventCursor = createEventCursor({
      branchId,
      headEventId: this.eventCursor.headEventId,
      seq: this.eventCursor.seq,
    });
  }

  advanceEventCursor(record: HarnessEventRecord): void {
    this.eventCursor = createEventCursor({
      branchId: record.branchId,
      headEventId: record.id,
      seq: record.seq,
    });
  }

  filter(options?: TranscriptQuery, currentTurnId?: string): AgentMessage[] {
    const activeIds = options?.includeInactive ? undefined : this.activeMessageIds();
    let messages = activeIds
      ? this.messages.filter((message) => activeIds.has(message.id))
      : [...this.messages];
    if (!options?.includeHidden) messages = messages.filter((message) => !message.hidden);
    if (options?.beforeCurrentTurn && currentTurnId) {
      messages = messages.filter((message) => message.turnId !== currentTurnId);
    }
    if (options?.roles?.length) {
      const allowed = new Set(options.roles);
      messages = messages.filter((message) => allowed.has(message.role));
    }
    messages.sort((a, b) => a.seq - b.seq);
    if (typeof options?.limit === "number" && options.limit > 0) messages = messages.slice(-options.limit);
    return messages;
  }

  resolveSeekTarget(target: TranscriptSeekTarget): {
    transcriptCursor: TranscriptCursor;
    eventCursor: EventCursor;
  } {
    if (target === "start") {
      return {
        transcriptCursor: createTranscriptCursor({ branchId: rootBranchId, seq: 0 }),
        eventCursor: createEventCursor({ branchId: rootBranchId, seq: 0 }),
      };
    }

    if (target === "latest") {
      const transcriptCursor = this.latestCursorForBranch(this.transcriptCursor.branchId);
      const head = transcriptCursor.headMessageId
        ? this.messages.find((message) => message.id === transcriptCursor.headMessageId)
        : undefined;
      return {
        transcriptCursor,
        eventCursor: head ? this.eventCursorForMessage(head) : this.eventCursor,
      };
    }

    if ("messageId" in target) {
      const message = this.messages.find((candidate) => candidate.id === target.messageId);
      if (!message) throw new Error(`Transcript message '${target.messageId}' was not found.`);
      return {
        transcriptCursor: createTranscriptCursor({
          branchId: message.branchId,
          headMessageId: message.id,
          seq: message.seq,
        }),
        eventCursor: this.eventCursorForMessage(message),
      };
    }

    const head = target.cursor.headMessageId
      ? this.messages.find((message) => message.id === target.cursor.headMessageId)
      : undefined;
    return {
      transcriptCursor: cloneJSON(target.cursor),
      eventCursor: head ? this.eventCursorForMessage(head) : createEventCursor({
        branchId: target.cursor.branchId,
        seq: 0,
      }),
    };
  }

  applyResolvedSeek(resolved: { transcriptCursor: TranscriptCursor; eventCursor: EventCursor }): void {
    this.transcriptCursor = resolved.transcriptCursor;
    this.eventCursor = resolved.eventCursor;
  }

  activeEventSegments(cursor: EventCursor = this.eventCursor): Map<string, number> {
    const segments = new Map<string, number>();
    let branchId: string | undefined = cursor.branchId;
    let maxSeq = cursor.seq;

    while (branchId) {
      const existing = segments.get(branchId);
      segments.set(branchId, existing === undefined ? maxSeq : Math.max(existing, maxSeq));
      const branch = this.branches.get(branchId);
      if (!branch?.parentBranchId) break;
      branchId = branch.parentBranchId;
      maxSeq = branch.parentEventSeq ?? 0;
    }

    return segments;
  }

  private activeMessageIds(cursor: TranscriptCursor = this.transcriptCursor): Set<string> {
    const byId = new Map(this.messages.map((message) => [message.id, message]));
    const active = new Set<string>();
    let current = cursor.headMessageId ? byId.get(cursor.headMessageId) : undefined;
    while (current) {
      if (current.seq > cursor.seq) break;
      active.add(current.id);
      current = current.parentMessageId ? byId.get(current.parentMessageId) : undefined;
    }
    return active;
  }

  private branchLatestMessage(branchId: string): AgentMessage | undefined {
    let latest: AgentMessage | undefined;
    for (const message of this.messages) {
      if (message.branchId !== branchId) continue;
      if (!latest || message.seq > latest.seq) latest = message;
    }
    return latest;
  }

  private eventCursorForMessage(message: AgentMessage): EventCursor {
    return message.eventCursor
      ? cloneJSON(message.eventCursor)
      : createEventCursor({
          branchId: message.branchId,
          seq: this.eventCursor.seq,
          headEventId: this.eventCursor.headEventId,
        });
  }

  private latestCursorForBranch(branchId: string): TranscriptCursor {
    const latest = this.branchLatestMessage(branchId);
    const branch = this.branches.get(branchId);
    return createTranscriptCursor({
      branchId,
      headMessageId: latest?.id ?? branch?.parentMessageId,
      seq: latest?.seq ?? branch?.parentMessageSeq ?? 0,
    });
  }
}
