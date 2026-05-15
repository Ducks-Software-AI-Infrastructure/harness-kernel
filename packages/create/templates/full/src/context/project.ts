import { HarnessContextProvider } from "@harness-kernel/core/agent/context";
import type { AgentReadSession } from "@harness-kernel/core/agent/session";

class ProjectContextProvider extends HarnessContextProvider {
  label = "Project";
  priority = 10;

  render(session: AgentReadSession) {
    const state = session.state.get();
    const notes = Array.isArray(state.notes) ? state.notes : [];
    return [
      `Agent: ${session.agentKey}`,
      `Mode: ${session.mode.current().type}`,
      `Work directory: ${session.workDir}`,
      notes.length ? `Notes:\n${notes.map((note) => `- ${note}`).join("\n")}` : "Notes: none",
    ].join("\n");
  }
}

export const projectContextProvider = new ProjectContextProvider();
