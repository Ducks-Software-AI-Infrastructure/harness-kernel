import { HarnessEvent } from "./types.js";
import { s } from "../schema/index.js";

export class RunStartEvent extends HarnessEvent<{
  agentKey: string;
  modeId: string;
  workDir: string;
  outputDir?: string;
}> {
  static override type = "run:start";
  static override schema = s.object({
    agentKey: s.string().min(1),
    modeId: s.string().min(1),
    workDir: s.string(),
    outputDir: s.string().optional(),
  });
}

export class TurnStartEvent extends HarnessEvent<{
  turnId: string;
  input: string;
}> {
  static override type = "turn:start";
  static override schema = s.object({
    turnId: s.string().min(1),
    input: s.string(),
  });
}

export class ContextReadyEvent extends HarnessEvent<{
  snapshotId: string;
  providerCount: number;
  contributionCount: number;
}> {
  static override type = "context:ready";
  static override schema = s.object({
    snapshotId: s.string().min(1),
    providerCount: s.number().int().min(0),
    contributionCount: s.number().int().min(0),
  });
}

export class ModelBeforeEvent extends HarnessEvent<{
  model: string;
  messageCount: number;
}> {
  static override type = "model:before";
  static override schema = s.object({
    model: s.string().min(1),
    messageCount: s.number().int().min(0),
  });
}

export class ModelAfterEvent extends HarnessEvent<{
  model: string;
  content: string;
  usage?: unknown;
  finishReason?: string;
}> {
  static override type = "model:after";
  static override schema = s.object({
    model: s.string().min(1),
    content: s.string(),
    usage: s.unknown().optional(),
    finishReason: s.string().optional(),
  });
}

export class ToolStartEvent extends HarnessEvent<{
  id: string;
  name: string;
  args: unknown;
}> {
  static override type = "tool:start";
  static override schema = s.object({
    id: s.string().min(1),
    name: s.string().min(1),
    args: s.unknown(),
  });
}

export class ToolEndEvent extends HarnessEvent<{
  id: string;
  name: string;
  durationMs: number;
  result: unknown;
}> {
  static override type = "tool:end";
  static override schema = s.object({
    id: s.string().min(1),
    name: s.string().min(1),
    durationMs: s.number().min(0),
    result: s.unknown(),
  });
}

export class TurnEndEvent extends HarnessEvent<{
  turnId: string;
  finalAnswer: string;
}> {
  static override type = "turn:end";
  static override schema = s.object({
    turnId: s.string().min(1),
    finalAnswer: s.string(),
  });
}

export class RunEndEvent extends HarnessEvent<{
  metrics: unknown;
  finalAnswer: string;
}> {
  static override type = "run:end";
  static override schema = s.object({
    metrics: s.unknown(),
    finalAnswer: s.string(),
  });
}

export class ErrorEvent extends HarnessEvent<{
  message: string;
  recoverable?: boolean;
  details?: unknown;
}> {
  static override type = "error";
  static override schema = s.object({
    message: s.string(),
    recoverable: s.boolean().optional(),
    details: s.unknown().optional(),
  });
}

export class MessageStartEvent extends HarnessEvent<{
  role: string;
}> {
  static override type = "message:start";
  static override schema = s.object({
    role: s.string().min(1),
  });
}

export class MessageDeltaEvent extends HarnessEvent<{
  role: "assistant";
  text: string;
}> {
  static override type = "message:delta";
  static override schema = s.object({
    role: s.literal("assistant"),
    text: s.string(),
  });
}

export class MessageEndEvent extends HarnessEvent<{
  message: unknown;
}> {
  static override type = "message:end";
  static override schema = s.object({
    message: s.unknown(),
  });
}

export class ToolApprovalRequestedEvent extends HarnessEvent<{
  id: string;
  name: string;
  args: unknown;
  modeId?: string;
  risk?: string;
  permissions?: unknown[];
}> {
  static override type = "tool:approval_requested";
  static override schema = s.object({
    id: s.string().min(1),
    name: s.string().min(1),
    args: s.unknown(),
    modeId: s.string().optional(),
    risk: s.string().optional(),
    permissions: s.array(s.unknown()).optional(),
  });
}

export class ToolApprovalResolvedEvent extends HarnessEvent<{
  id: string;
  name: string;
  args: unknown;
  decision: "approved" | "denied";
  modeId?: string;
}> {
  static override type = "tool:approval_resolved";
  static override schema = s.object({
    id: s.string().min(1),
    name: s.string().min(1),
    args: s.unknown(),
    decision: s.enum(["approved", "denied"] as const),
    modeId: s.string().optional(),
  });
}

export class ModeChangedEvent extends HarnessEvent<{
  previousMode: string;
  mode: string;
  input?: unknown;
}> {
  static override type = "mode:changed";
  static override schema = s.object({
    previousMode: s.string().min(1),
    mode: s.string().min(1),
    input: s.unknown().optional(),
  });
}

export class SnapshotCreatedEvent extends HarnessEvent<{
  snapshot: unknown;
}> {
  static override type = "snapshot:created";
  static override schema = s.object({
    snapshot: s.unknown(),
  });
}

export class SnapshotRestoredEvent extends HarnessEvent<{
  snapshot: unknown;
}> {
  static override type = "snapshot:restored";
  static override schema = s.object({
    snapshot: s.unknown(),
  });
}

export class SnapshotDeletedEvent extends HarnessEvent<{
  snapshot: unknown;
}> {
  static override type = "snapshot:deleted";
  static override schema = s.object({
    snapshot: s.unknown(),
  });
}

export class TranscriptCursorChangedEvent extends HarnessEvent<{
  previousCursor: unknown;
  cursor: unknown;
}> {
  static override type = "transcript:cursor_changed";
  static override schema = s.object({
    previousCursor: s.unknown(),
    cursor: s.unknown(),
  });
}

export const runtimeEventClasses = [
  RunStartEvent,
  TurnStartEvent,
  ContextReadyEvent,
  ModelBeforeEvent,
  ModelAfterEvent,
  ToolStartEvent,
  ToolEndEvent,
  TurnEndEvent,
  RunEndEvent,
  ErrorEvent,
  MessageStartEvent,
  MessageDeltaEvent,
  MessageEndEvent,
  ToolApprovalRequestedEvent,
  ToolApprovalResolvedEvent,
  ModeChangedEvent,
  SnapshotCreatedEvent,
  SnapshotRestoredEvent,
  SnapshotDeletedEvent,
  TranscriptCursorChangedEvent,
];
