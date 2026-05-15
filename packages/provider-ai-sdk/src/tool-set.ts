import { jsonSchema, type ToolSet } from "ai";
import { normalizeSchema, type ModelProviderRunInput } from "@harness-kernel/core";

function toolJsonSchema(toolName: string, schema: unknown) {
  const normalized = normalizeSchema(schema);
  if (!normalized.toJsonSchema) {
    throw new Error(
      `Tool '${toolName}' uses a ${normalized.source} schema that cannot be converted to JSON Schema. `
        + "Use @harness-kernel/core/schema, pass JSON Schema, or provide toJsonSchema().",
    );
  }
  return normalized.toJsonSchema();
}

export function buildAiTools(input: ModelProviderRunInput): ToolSet {
  const tools: Record<string, any> = {};
  for (const tool of input.tools) {
    tools[tool.name] = {
      description: tool.description,
      inputSchema: jsonSchema(toolJsonSchema(tool.name, tool.inputSchema)),
      execute: async (args: unknown, options?: { toolCallId?: string }) => {
        const result = await input.executeTool(tool, args, options?.toolCallId);
        return result.data ?? result.content;
      },
    };
  }
  return tools as ToolSet;
}
