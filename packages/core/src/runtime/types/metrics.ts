import type { HarnessErrorShape } from "./errors.js";

export interface ToolCallMetric {
  name: string;
  count: number;
  errorCount: number;
  totalDurationMs: number;
}

export interface RunMetrics {
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  turnCount: number;
  messageCount: number;
  eventCount: number;
  toolCallCount: number;
  finalMode?: string;
  tools: Record<string, ToolCallMetric>;
  errors: HarnessErrorShape[];
  usage?: unknown;
}
