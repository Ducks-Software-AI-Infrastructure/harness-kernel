import type { EventCursor } from "./events.js";
import type { JsonObject } from "./json.js";

export type AgentMessageRole = "system" | "user" | "assistant" | "tool" | "event" | (string & {});

export interface AgentMessage {
  id: string;
  seq: number;
  branchId: string;
  parentMessageId?: string;
  role: AgentMessageRole;
  authorRole?: string;
  roleType?: string;
  content: unknown;
  createdAt: string;
  modeId?: string;
  turnId?: string;
  hidden?: boolean;
  toolName?: string;
  toolCallId?: string;
  eventCursor?: EventCursor;
  metadata?: JsonObject;
}

export interface TranscriptQuery {
  limit?: number;
  includeHidden?: boolean;
  includeInactive?: boolean;
  beforeCurrentTurn?: boolean;
  roles?: AgentMessageRole[];
}

export interface TranscriptCursor {
  id: string;
  branchId: string;
  headMessageId?: string;
  seq: number;
  updatedAt: string;
}

export type TranscriptSeekTarget =
  | "latest"
  | "start"
  | { messageId: string }
  | { cursor: TranscriptCursor };

export interface TranscriptBranch {
  id: string;
  createdAt: string;
  parentBranchId?: string;
  parentMessageId?: string;
  parentMessageSeq?: number;
  parentEventSeq?: number;
  metadata?: JsonObject;
}
