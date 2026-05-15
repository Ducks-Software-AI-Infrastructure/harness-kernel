export interface AiSdkFinishInfo {
  usage: unknown;
  finishReason?: string;
}

export function finishInfoFromStreamPart(part: unknown): AiSdkFinishInfo | undefined {
  if (!part || typeof part !== "object" || (part as { type?: unknown }).type !== "finish") return undefined;
  const finish = part as { totalUsage?: unknown; finishReason?: string };
  return {
    usage: finish.totalUsage,
    finishReason: finish.finishReason,
  };
}
