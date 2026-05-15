# Harness Kernel Positioning

Harness Kernel is a programmable runtime for app-embedded agents.

It gives you modes, state, events, hooks, tools, approvals, sessions, streaming,
and storage. You choose the control model: graph, state machine, router,
pipeline, supervisor, or conversational agent.

## Short Pitch

Harness Kernel is an app-first runtime for packaging custom agent behavior with
state, modes, tools, approvals, transcripts, events, streaming, storage, and
provider-agnostic model providers.

It does not force a graph DSL. Workflows can be modeled through programmable
modes, controlled tool transitions, runtime policies, state, and events.

## Why Use Harness Kernel

Use Harness Kernel when you want:

- infrastructure for building your own AI harness inside an app, not a prebuilt
  coding agent experience;
- an agent behavior package that can run in a CLI, web app, desktop app, or
  backend service;
- app-owned model provider, credentials, approval policy, storage, and UI;
- sessions with state, transcript cursors, events, snapshots, approvals, and streaming;
- workflows modeled as graphs, state machines, routers, pipelines, supervisors,
  or free-form conversational agents;
- runtime policies enforced with tools and hooks instead of a fixed workflow DSL.

## Control Model

In graph-first frameworks, the graph defines execution.

In Harness Kernel, agent modes define behavior and runtime policies enforce execution.

For example, a workflow can be represented as:

```text
route -> research -> write -> review -> done
```

But Harness Kernel does not require that to be declared as a static graph. You can enforce
the same flow with:

- a transition tool that validates allowed mode changes;
- `session.mode.switch(...)` for controlled transitions;
- state fields such as `workflow.currentStep`, `workflow.nextMode`, and
  `workflow.errors`;
- hooks on `TurnEndEvent`, `ToolEndEvent`, or `ModeChangedEvent`;
- domain events for audit and observability.

This makes the runtime formal when you need it and flexible when you do not.

## Market Comparison

### LangGraph

LangGraph is a graph-first agent runtime and low-level orchestration framework
for reliable complex tasks. It is a strong fit when you want explicit nodes,
edges, conditional routing, and workflow structure.

Harness Kernel overlaps with some workflow use cases, but approaches them differently.
Harness Kernel uses programmable modes, hooks, state, tools, and events rather than making
the graph the central abstraction.

Use LangGraph when the graph itself is the product contract. Use Harness Kernel when the
agent package, app integration, approval policy, session API, and runtime
observability are the product contract.

Source: <https://www.langchain.com/langgraph>

### Pi Coding Agent / pi-agents

Pi is close in spirit in one important way: it exposes an SDK for embedding a
coding agent in custom applications, custom UIs, automated workflows, and
sub-agent tooling. The Pi SDK documentation explicitly lists custom UI use cases
for web, desktop, and mobile.

The natural web architecture for Pi is a backend Node process using the Pi SDK
and streaming events to a frontend. The SDK works with sessions, cwd, local
resources, tools, credentials, and coding-agent capabilities, so it is not simply
a browser-only UI library.

The `pi-agents` package adds agent orchestration inside Pi, including workflows
defined as JSON graphs with nodes such as `spawn`, `sequence`, `fork`, `join`,
and `loop`.

Harness Kernel is similar in being app-embeddable, but its center of gravity is
different:

- Pi is a customizable coding-agent product/runtime.
- Harness Kernel is infrastructure for building custom AI harnesses inside your own app.

Harness Kernel is framed as a provider-agnostic harness for custom agent behavior
packages. The app supplies the model provider, storage policy, approvals,
session lifecycle, and UI.

Source: <https://pi.dev/docs/latest/sdk>  
Source: <https://pi.dev/packages/pi-agents>

### OpenAI Agents SDK

OpenAI Agents SDK is a code-first framework for agents with tools,
orchestration, handoffs, guardrails, human review, tracing, and state. It is a
strong choice when you want the OpenAI agent model and ecosystem.

Harness Kernel is more neutral. It keeps model calls behind `HarnessModelProvider`, so the
same agent package can run with OpenAI, local models, or a custom model
provider.

Source: <https://developers.openai.com/api/docs/guides/agents>  
Source: <https://openai.github.io/openai-agents-js/guides/agents/>

### Pydantic AI

Pydantic AI is a Python agent framework focused on production-grade applications
and workflows, with a strong type-safety and validation story.

Harness Kernel is TypeScript-first and centered on runtime embedding: modes, sessions,
events, approvals, storage, and model providers. It can still use schema
validation through tool/event schemas, but it is not trying to be the Pydantic
ecosystem for agents.

Source: <https://pydantic.dev/docs/ai/overview/>

### Mastra

Mastra is one of the closest projects in the TypeScript ecosystem. It is an
all-in-one framework for building AI-powered applications and agents, with
agents, workflows, memory, integrations, evaluation, and observability.

Mastra is open-core: the repository says the core framework and most of the
codebase are open source under Apache-2.0, while directories named `ee/` are
source-available under a Mastra Enterprise License.

Harness Kernel should not try to out-framework Mastra feature-for-feature. The sharper
position is narrower:

- Mastra is a broader TypeScript framework for AI applications and agents.
- Harness Kernel is a focused harness/runtime layer for app-owned agents: sessions,
  modes, state, tools, approvals, events, streaming, transcripts, snapshots,
  storage, and pluggable model providers.

Source: <https://github.com/mastra-ai/mastra>

### Vercel AI SDK

Vercel AI SDK is best thought of as model/provider/UI streaming infrastructure.
It is useful inside a runner or model provider.

Harness Kernel should not compete with it directly. Harness Kernel owns the agent runtime surface:
sessions, state, tools, approvals, events, transcripts, storage, and app control.

## Positioning Line

```text
Harness Kernel is a programmable, app-first runtime for custom agents. It gives
you sessions, state, modes, tools, approvals, events, streaming, and storage,
while letting you choose the control model and the model provider.
```

## Taglines

- Bring your own workflow: graph, router, state machine, pipeline, or agent loop.
- Agent behavior packages for real applications.
- Formal when you need it, flexible when you do not.
- Modes are execution states. Hooks are policies. Events are the audit trail.
- Provider-agnostic agent runtime for app-owned agents.
