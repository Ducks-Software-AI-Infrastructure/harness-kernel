import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessContextProvider } from "@harness-kernel/core/agent/context";
import { ModelAfterEvent } from "@harness-kernel/core/agent/event";
import { HarnessHook } from "@harness-kernel/core/agent/hook";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { HarnessRole, NativeRoles, RoleTargets } from "@harness-kernel/core/agent/role";
import type { AgentActionSession, AgentReadSession } from "@harness-kernel/core/agent/session";
import { HarnessTool } from "@harness-kernel/core/agent/tool";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import type {
  HarnessModelProvider,
  ModelInfo,
  ModelProviderInfo,
  ModelProviderRunInput,
  ModelProviderRunResult,
} from "@harness-kernel/core/runner/model-provider";
import { NoopSandbox } from "@harness-kernel/core/runner/sandbox";
import { MemorySessionStorage } from "@harness-kernel/core/runner/storage";
import { s, type InferInput } from "@harness-kernel/core/schema";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { FileSessionStorage } from "@harness-kernel/storage-file";
import { createCoreTools } from "@harness-kernel/tools-node";

class ChatMode extends HarnessMode {
  prompt = "Reply with a short answer.";
}

const chatMode = new ChatMode();

const agent = defineAgent({
  key: "my-agent",
  label: "My Agent",
  initialMode: chatMode,
  modes: [chatMode],
});

class EchoProvider implements HarnessModelProvider {
  namespace = "echo";

  async run(input: ModelProviderRunInput): Promise<ModelProviderRunResult> {
    const last = input.messages.at(-1);
    return { content: `echo: ${String(last?.content ?? "")}` };
  }
}

export async function coreOnlyGuide(): Promise<void> {
  const store = await createHarnessSessionStore({
    agent: { definition: agent },
    providers: [new EchoProvider()],
    defaultModel: "echo/basic",
    storage: new MemorySessionStorage(),
    sandbox: new NoopSandbox(),
  });

  await store.send("demo", "hello");
  await store.close();
}

export class LocalProvider implements HarnessModelProvider {
  namespace = "local";
  id = "local-dev";

  getInfo(): ModelProviderInfo {
    return { id: this.id, label: "Local Dev Provider", provider: this.namespace };
  }

  getModels(): ModelInfo[] {
    return [{ id: "small", label: "Small local model" }];
  }

  supportsRole(roleId: string): boolean {
    return ["system", "user", "assistant", "tool"].includes(roleId);
  }

  async run(input: ModelProviderRunInput): Promise<ModelProviderRunResult> {
    const prepared = await input.prepareContext();
    const last = prepared.messages.at(-1);
    return {
      content: `local(${input.model}): ${String(last?.content ?? "")}`,
      usage: { messageCount: prepared.messages.length },
    };
  }
}

const rememberSchema = s.object({
  note: s.string().min(1),
});

type RememberInput = InferInput<typeof rememberSchema>;

class RememberNoteTool extends HarnessTool<RememberInput, { count: number }> {
  name = "remember_note";
  description = "Remember a note in shared state.";
  schema = rememberSchema;
  risk = "write" as const;
  requiresApproval = true;

  async execute(args: RememberInput, session: AgentActionSession) {
    const input = rememberSchema.parse(args);
    const state = session.state.get();
    const notes = Array.isArray(state.notes) ? state.notes : [];
    const next = [...notes, input.note];
    session.state.update({ notes: next });
    return {
      content: `Remembered ${input.note}`,
      data: { count: next.length },
      metadata: { stateKey: "notes" },
    };
  }
}

class NotesContext extends HarnessContextProvider<{ max?: number }> {
  label = "Notes Context";

  render(session: AgentReadSession, options: { max?: number } = {}) {
    const stateNotes = session.state.get().notes;
    const notes = Array.isArray(stateNotes) ? stateNotes.map(String) : [];
    const max = options.max ?? 5;
    if (!notes.length) return null;
    return `Known notes:\n${notes.slice(-max).join("\n")}`;
  }
}

class NotesMode extends HarnessMode {
  tools = [new RememberNoteTool()];
  providers = [new NotesContext().with({ max: 3 })];
}

class CriticRole extends HarnessRole {
  label = "Critic";
  name = "critic";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.User;
  description = "A review-oriented user message.";
}

class LastModelOutputHook extends HarnessHook.for(ModelAfterEvent) {
  async onActive(session: AgentActionSession, event: ModelAfterEvent) {
    session.state.update({
      lastModel: event.payload.model,
      lastAnswerLength: event.payload.content.length,
    });
  }
}

export const behaviorAgent = defineAgent({
  key: "behavior-agent",
  label: "Behavior Agent",
  initialMode: new NotesMode(),
  modes: [new NotesMode()],
  roles: [new CriticRole()],
  hooks: [new LastModelOutputHook()],
});

export async function openAIGuide(): Promise<void> {
  const store = await createHarnessSessionStore({
    agent: { definition: agent },
    providers: [new OpenAIProvider()],
    defaultModel: "openai/gpt-5.1-mini",
    storage: new FileSessionStorage(),
    sandbox: new LocalSandbox({ workDir: "." }),
  });

  await store.close();
}

class CliMode extends HarnessMode {
  prompt = "Use local tools only when they are needed.";
  tools = createCoreTools();
}

export const cliAgent = defineAgent({
  key: "cli-agent",
  label: "CLI Agent",
  initialMode: new CliMode(),
  modes: [new CliMode()],
});
