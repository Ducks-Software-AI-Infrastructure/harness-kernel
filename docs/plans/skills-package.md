# Plano: Pacote de Skills para Harness Kernel

## Contexto

A ideia e criar um pacote `@harness-kernel/skills` fora do `core`, com um tipo
`HarnessSkill` e helpers para acoplar skills a agentes existentes.

Neste plano, uma skill nao e uma ferramenta executavel por si so. Ela e uma
capacidade procedural carregavel:

- declara quando deve ser usada;
- injeta prompt/instrucoes quando ativa;
- declara tools associadas;
- controla se essas tools podem executar antes da skill estar ativa;
- emite eventos e logs auditaveis sobre ativacao, bloqueio e desativacao.

O objetivo inicial e evitar uma mudanca estrutural no `core`. O pacote deve
usar os pontos de extensao existentes: `HarnessTool`, `HarnessContextProvider`,
`sharedState`, eventos customizados, logs customizados e `declaredEvents`.

## Decisao de Direcao

### Comecar com soft gate fora do core

No primeiro corte, tools de skill aparecem no catalogo do modo, mas sao
embrulhadas por um gate. Se o modelo chamar uma tool cuja skill ainda nao esta
ativa, o wrapper retorna uma resposta dizendo qual skill precisa ser ativada.

Isso atende ao fluxo desejado:

```text
LLM tenta usar tool da skill
  -> wrapper detecta skill inativa
  -> tool result informa "ative skill X primeiro"
  -> LLM chama activate_skill
  -> estado da sessao marca skill ativa
  -> proximo step recebe prompt da skill
  -> tool original passa a executar
```

Esse modelo nao exige mexer no `core`, porque:

- `mode.tools` ja aceita instancias de `HarnessTool`;
- `session.state` ja permite persistir estado arbitrario da sessao;
- `HarnessContextProvider` ja injeta contexto dinamico antes de cada chamada ao
  modelo;
- `session.events.emit()` ja permite eventos customizados;
- `session.log.emit()` ja permite logs customizados.

### Hard gate fica para uma fase posterior

Hard gate significa a tool so existir para o modelo depois da skill estar ativa.
Isso exigiria mudancas no `core` e no contrato de provider, porque hoje
`AgentSessionRunner.runTurn()` resolve as tools uma vez e `ModelPipeline.run()`
passa esse catalogo estatico ao provider.

Para hard gate, seria necessario recalcular tools por step, ou expor
`activeTools`/catalogo dinamico ao provider durante `prepareContext()`.

### Skill nao concede autoridade

Skill pode tornar uma tool disponivel do ponto de vista comportamental, mas nao
deve conceder permissao. A autoridade continua em:

- `tool.risk`;
- `tool.permissions`;
- `tool.requiresApproval`;
- `mode.toolApproval`;
- `approveTool()` do host;
- sandbox e storage configurados pelo host.

## Achados da Codebase Atual

### Tools sao resolvidas por modo

Arquivo: `packages/core/src/runtime/runner.ts`

- `runTurn()` chama `resolveTools()` antes de chamar `modelPipeline.run()`.
- `resolveTools()` percorre `mode.tools`.
- O catalogo de tools e estatico durante aquele `runTurn()`.
- `invokeTool()` tambem usa `resolveTools()`, entao uma tool precisa estar no
  modo para poder ser invocada por hooks, lifecycle ou tools.

Implicacao: pacote externo consegue adicionar gated tools ao modo, mas nao
consegue esconder/exibir tools dinamicamente sem cooperacao do `core`.

### Prompt dinamico ja existe via context provider

Arquivos:

- `packages/core/src/runtime/types/context.ts`
- `packages/core/src/runtime/runner.ts`

`HarnessContextProvider.render()` recebe `AgentReadSession` e pode ler
`session.state`. Isso e suficiente para um `SkillPromptProvider` renderizar:

- catalogo resumido de skills disponiveis;
- skills atualmente ativas;
- prompts completos das skills ativas;
- instrucao para chamar `activate_skill` antes de usar tools gated.

Como o provider AI SDK chama `prepareContext()` entre steps, uma skill ativada
por tool call pode afetar o system prompt no proximo step.

### Estado de skill pode viver em `sharedState`

Arquivo: `packages/core/src/runtime/types/sessions.ts`

`AgentActionSession.state.update()` faz patch superficial no estado. O pacote de
skills deve usar uma chave unica e configuravel, por padrao:

```ts
{
  skills: {
    active: {
      "github-pr-review": {
        key: "github-pr-review",
        activatedAt: "...",
        activatedByToolCallId: "...",
        reason: "..."
      }
    }
  }
}
```

Como `state.update()` nao faz merge profundo, helpers do pacote devem sempre ler
o estado atual, montar o novo objeto `skills` inteiro e fazer:

```ts
session.state.update({ skills: nextSkillsState });
```

### Eventos customizados podem ficar no pacote

Arquivos:

- `packages/core/src/runtime/events.ts`
- `packages/core/src/runtime/runner.ts`
- `packages/core/src/runtime/types/agent.ts`

Eventos customizados podem estender `HarnessEvent` fora do `core` e ser emitidos
via `session.events.emit()`. `declaredEvents` no `AgentDefinition` serve para
aparecer no manifesto, mas o runtime nao exige que o evento customizado esteja
declarado para gravar a timeline.

Recomendacao: o pacote deve exportar `skillEvents()` para facilitar:

```ts
defineAgent({
  declaredEvents: skillEvents(),
  ...
});
```

### Logs customizados tambem podem ficar no pacote

Arquivos:

- `packages/core/src/logging/types.ts`
- `packages/core/src/logging/logger.ts`
- `packages/core/src/runtime/types/sessions.ts`

`AgentLogSession.emit()` aceita qualquer `HarnessLogClass`. Logo o pacote pode
exportar logs como `SkillActivatedLog` e `SkillRequiredLog`.

Limite atual: `HarnessLogCategory` nao possui categoria `"skill"`. Fora do core,
os logs de skill devem usar categoria `"agent"` ou `"tool"`. Para primeira fase,
usar `"agent"` para eventos de skill e `"tool"` somente para wrappers de tool.

Se quisermos categoria nativa `"skill"`, ai sim precisa alterar o `core`.

### Erro `skill.required` nao existe no core

Arquivos:

- `packages/core/src/runtime/types/errors.ts`
- `packages/core/src/logging/tool-errors.ts`
- `packages/core/src/runtime/tool-executor.ts`

`HarnessErrorCode` nao tem `skill.required`. `createToolErrorResult()` tambem so
aceita os codigos de tool ja conhecidos. Alem disso, `ToolExecutor` converte
`result.metadata.errorCode` desconhecido para `"tool.failed"` quando `isError`
vem `true`.

Recomendacao para package-only:

- bloqueio por skill inativa nao deve usar `createToolErrorResult()`;
- por padrao, o wrapper deve retornar `AgentToolResult` sem `isError: true`;
- o resultado deve conter dados estruturados indicando `skill.required`;
- o pacote deve emitir `SkillRequiredEvent` e `SkillRequiredLog`.

Exemplo de resultado recomendado:

```ts
{
  content: "Tool 'reply_comment' requires activating skill 'github-pr-review' first. Call activate_skill with that key.",
  data: {
    ok: false,
    code: "skill.required",
    requiredSkill: "github-pr-review",
    toolName: "reply_comment"
  },
  metadata: {
    skillRequired: true,
    requiredSkill: "github-pr-review",
    originalToolName: "reply_comment"
  }
}
```

Isso evita marcar o run como erro tecnico quando o comportamento esperado e
ensinar o modelo a ativar a skill.

## API Alvo do Pacote

### Tipo principal

```ts
export interface HarnessSkill {
  key: string;
  label?: string;
  description: string;
  prompt?: string | SkillPromptResolver;
  tools?: HarnessTool[];
  metadata?: JsonObject;
}

export type SkillPromptResolver = (
  session: AgentReadSession,
  skill: HarnessSkill,
) => string | Promise<string>;
```

Decisao atual: skill nao declara `providers` proprios. Context providers
continuam pertencendo ao modo. O pacote exporta `skills.provider` para catalogo
e prompts ativos das skills, e esse provider deve ser acoplado em
`mode.providers`.

### Declaracao

```ts
export function defineSkill(input: HarnessSkillInput): HarnessSkill;
```

Responsabilidades:

- validar `key` nao vazio;
- impedir keys duplicadas em registry/helper;
- normalizar label quando ausente;
- preservar tools e prompt sem executar nada.

### Registry

```ts
export interface SkillRegistry {
  list(): HarnessSkill[];
  get(key: string): HarnessSkill | undefined;
  require(key: string): HarnessSkill;
  catalog(options?: SkillCatalogOptions): SkillCatalogEntry[];
  tools(): HarnessTool[];
}

export function createSkillRegistry(skills: HarnessSkill[]): SkillRegistry;
```

Responsabilidades:

- centralizar validacao de duplicidade;
- permitir helpers compartilharem a mesma lista;
- expor catalogo para provider, tools e testes.

### Estado e helpers de sessao

O pacote deve separar tres conceitos:

```text
available skills = skills declaradas no registry
active skills = skills ativadas no state da sessao
inactive skills = available - active
```

Helpers alvo:

```ts
export interface SkillState {
  active: Record<string, ActiveSkillState>;
}

export interface ActiveSkillState {
  key: string;
  activatedAt: string;
  activatedByToolCallId?: string;
  reason?: string;
}

export interface SkillCatalogEntry {
  key: string;
  label?: string;
  description: string;
  active?: boolean;
  toolNames?: string[];
  metadata?: JsonObject;
}

export function getSkillState(
  sessionOrState: AgentReadSession | AgentSharedState,
  options?: SkillStateOptions,
): SkillState;

export function setSkillState(
  session: AgentActionSession,
  state: SkillState,
  options?: SkillStateOptions,
): void;

export function listAvailableSkills(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillCatalogOptions,
): SkillCatalogEntry[];

export function listActiveSkills(
  sessionOrState: AgentReadSession | AgentSharedState,
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillCatalogOptions & SkillStateOptions,
): SkillCatalogEntry[];

export function listInactiveSkills(
  sessionOrState: AgentReadSession | AgentSharedState,
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillCatalogOptions & SkillStateOptions,
): SkillCatalogEntry[];

export function isSkillActive(
  sessionOrState: AgentReadSession | AgentSharedState,
  key: string,
  options?: SkillStateOptions,
): boolean;

export async function activateSkill(
  session: AgentActionSession,
  registry: SkillRegistry | HarnessSkill[],
  input: { key: string; reason?: string },
  options?: SkillToolOptions,
): Promise<SkillActivationResult>;

export async function deactivateSkill(
  session: AgentActionSession,
  registry: SkillRegistry | HarnessSkill[],
  input: { key: string; reason?: string },
  options?: SkillToolOptions,
): Promise<SkillDeactivationResult>;
```

Regras:

- `SkillRegistry.list()` e `listAvailableSkills()` retornam tudo que o agente
  declarou, independente da sessao.
- `listActiveSkills()` cruza registry com `session.state`; skill ativa que nao
  existe mais no registry deve aparecer apenas em helper diagnostico, nao no
  catalogo normal.
- `activateSkill()` e `deactivateSkill()` sao a unica implementacao da mutacao de
  state; `activate_skill` e `deactivate_skill` tools devem chamar esses helpers.
- `activateSkill()` deve emitir os mesmos eventos/logs da tool de ativacao.
- Helpers que recebem `AgentSharedState` sao state-only e nao emitem eventos/logs.
- `stateKey` continua configuravel e default `"skills"`.

Nao entra no MVP package-only:

```ts
session.skills.activate(...)
session.skills.available(...)
session.skills.active(...)
```

Essa API nativa exige alterar `@harness-kernel/core` e fica na fase 3.

### Provider de prompt

```ts
export function createSkillPromptProvider(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillPromptProviderOptions,
): HarnessContextProvider;
```

Render esperado:

- listar skills disponiveis de forma resumida usando `listAvailableSkills()`;
- listar quais estao ativas;
- incluir prompt completo somente das skills ativas;
- instruir que tools gated precisam de `activate_skill`;
- opcionalmente ocultar prompts inativos para economizar contexto.

Opcoes:

```ts
interface SkillPromptProviderOptions {
  stateKey?: string; // default: "skills"
  includeInactiveCatalog?: boolean; // default: true
  includeToolNames?: boolean; // default: true
  role?: HarnessRoleSelector; // default: systemRole
}
```

### Tools de controle

```ts
export function createSkillActivationTool(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillToolOptions,
): HarnessTool;

export function createSkillDeactivationTool(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillToolOptions,
): HarnessTool;

export function createSkillListTool(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillToolOptions,
): HarnessTool;
```

Schemas:

```ts
activate_skill({
  key: string,
  reason?: string
})

deactivate_skill({
  key: string,
  reason?: string
})

list_skills({
  includeTools?: boolean,
  includeInactive?: boolean
})
```

Comportamento:

- key desconhecida retorna resultado estruturado `skill.unknown`;
- ativacao idempotente retorna `alreadyActive: true`;
- desativacao idempotente retorna `alreadyInactive: true`;
- `list_skills` retorna catalogo de available/active/inactive skills para o LLM;
- altera `session.state`;
- emite evento customizado;
- emite log customizado.

### Wrappers de gated tools

```ts
export function createSkillGatedTools(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillGateOptions,
): HarnessTool[];
```

Comportamento:

- para cada tool declarada por uma skill, criar wrapper com o mesmo schema,
  risco, permissoes e approval policy da tool original;
- preservar `description`, adicionando a skill requerida;
- antes de executar, verificar estado de skill ativa;
- se skill inativa, retornar resultado `skill.required`;
- se skill ativa, delegar para `originalTool.execute(args, session)`.

Ponto de atencao: names de tools precisam continuar unicos no modo. Se duas
skills declararem uma tool com o mesmo `name`, o registry deve falhar cedo com
mensagem clara.

### Helper de montagem

Opcional, para ergonomia:

```ts
export function createSkillKit(skills: HarnessSkill[], options?: SkillKitOptions): {
  registry: SkillRegistry;
  provider: HarnessContextProvider;
  tools: HarnessTool[];
  events: HarnessEventClass[];
};
```

Uso esperado:

```ts
const skills = createSkillKit([githubSkill, docsSkill]);

class DevMode extends HarnessMode {
  prompt = "You are a coding agent.";
  providers = [skills.provider];
  tools = [new BashTool(), ...skills.tools];
}

export const agent = defineAgent({
  label: "Dev Agent",
  initialMode: devMode,
  modes: [devMode],
  declaredEvents: skills.events,
});
```

## Eventos Propostos

Os eventos devem viver em `packages/skills/src/events.ts`.

### `SkillActivationRequestedEvent`

Emitido quando `activate_skill` e chamado, antes de alterar estado.

Payload:

```ts
{
  key: string;
  reason?: string;
  known: boolean;
  alreadyActive: boolean;
}
```

Uso:

- auditoria;
- hooks que queiram aprovar/reagir a ativacoes;
- diagnostico quando o modelo pede uma skill inexistente.

### `SkillActivatedEvent`

Emitido quando uma skill fica ativa.

Payload:

```ts
{
  key: string;
  label?: string;
  reason?: string;
  alreadyActive: boolean;
  activatedByToolCallId?: string;
}
```

Observacao: se a skill ja estava ativa, pode emitir com `alreadyActive: true`
ou retornar apenas resultado de tool. A decisao deve ser explicita na
implementacao. Minha recomendacao: emitir sempre, porque idempotencia tambem e
um fato auditavel.

### `SkillDeactivatedEvent`

Emitido quando uma skill e desativada.

Payload:

```ts
{
  key: string;
  label?: string;
  reason?: string;
  alreadyInactive: boolean;
  deactivatedByToolCallId?: string;
}
```

### `SkillRequiredEvent`

Emitido quando uma gated tool e chamada sem a skill ativa.

Payload:

```ts
{
  key: string;
  label?: string;
  toolName: string;
  reason: "inactive" | "unknown";
}
```

Esse evento substitui a necessidade de `ErrorEvent` para o caso esperado de
roteamento de skill.

### `SkillToolDelegatedEvent`

Opcional. Emitido quando wrapper libera a execucao para a tool original.

Payload:

```ts
{
  key: string;
  toolName: string;
  originalToolType?: string;
}
```

Recomendacao: nao emitir no MVP para evitar ruido. `ToolStartEvent` e
`ToolEndEvent` ja cobrem a execucao.

## Logs Propostos

Os logs devem viver em `packages/skills/src/logs.ts`.

Como `HarnessLogCategory` nao tem `"skill"`, usar:

- categoria `"agent"` para ativacao/desativacao/requisicao;
- categoria `"tool"` para gated tool bloqueada, se quisermos correlacionar com
  uso de tool.

### `SkillActivationRequestedLog`

Campos:

```ts
{
  skillKey: string;
  known: boolean;
  alreadyActive: boolean;
  reason?: string;
}
```

Nivel:

- `info` quando conhecida;
- `warn` quando desconhecida.

### `SkillActivatedLog`

Campos:

```ts
{
  skillKey: string;
  label?: string;
  alreadyActive: boolean;
}
```

Nivel: `info`.

### `SkillDeactivatedLog`

Campos:

```ts
{
  skillKey: string;
  label?: string;
  alreadyInactive: boolean;
}
```

Nivel: `info`.

### `SkillRequiredLog`

Campos:

```ts
{
  skillKey: string;
  toolName: string;
  reason: "inactive" | "unknown";
}
```

Nivel: `warn`.

## Onde Acrescentar Arquivos

### Novo pacote

```text
packages/skills/
  package.json
  tsup.config.ts
  README.md
  src/
    index.ts
    skill.ts
    registry.ts
    state.ts
    provider.ts
    tools.ts
    events.ts
    logs.ts
    skill.test.ts
```

### Workspace e aliases

Arquivos a alterar:

- `tsconfig.base.json`
  - adicionar `@harness-kernel/skills`;
  - opcionalmente adicionar subpaths se existirem.

### Testes de exports e packaging

Arquivos a alterar:

- `scripts/package-exports.test.mjs`
  - incluir pacote `skills`;
  - importar `@harness-kernel/skills`.

- `scripts/consumer-pack.test.mjs`
  - incluir `packages/skills` no pack;
  - importar `@harness-kernel/skills`;
  - smoke test minimo com `defineSkill`.

### Docs publicas

Arquivos a criar depois do MVP:

```text
apps/site/src/content/docs/docs/packages/skills.md
apps/site/src/content/docs/docs/guides/skills.md
```

Assuntos:

- soft gate;
- ativacao por tool;
- shared state;
- eventos/logs;
- diferenca entre skill, mode e tool;
- quando hard gate exige core.

### Documentacao do pacote

Arquivos a criar/alterar no MVP:

```text
packages/skills/README.md
apps/site/src/content/docs/docs/packages/skills.md
apps/site/src/content/docs/docs/guides/skills.md
```

Arquivos a considerar se o pacote entrar nos templates ou overview:

```text
README.md
apps/site/src/content/docs/docs/introduction.md
apps/site/src/content/docs/docs/concepts/runtime-vs-agent.md
apps/site/src/content/docs/docs/concepts/package-boundaries.md
packages/create/templates/full/README.md
packages/create/templates/full/AGENT.md
```

Responsabilidades da documentacao:

- explicar que skill e capacidade procedural, nao execucao direta;
- explicar que skill ativa comportamento, mas approval continua no runtime;
- mostrar o fluxo `activate_skill -> prompt ativo -> gated tool executa`;
- diferenciar soft gate e hard gate;
- deixar claro que o MVP usa soft gate package-only;
- mostrar como declarar `declaredEvents: skills.events`;
- mostrar como acoplar `skills.provider` em `mode.providers`;
- mostrar como acoplar `skills.tools` em `mode.tools`;
- documentar helpers package-only:
  `listAvailableSkills()`, `listActiveSkills()`, `isSkillActive()`,
  `activateSkill()` e `deactivateSkill()`;
- documentar `list_skills` como tool opcional para o modelo consultar o catalogo;
- documentar a chave de estado default `skills` e como trocar `stateKey`;
- documentar que gated tool bloqueada nao deve ser tratada como erro tecnico de
  run no MVP;
- documentar duplicidade de tool names e comportamento de falha cedo;
- documentar que prompts de skills inativas devem aparecer apenas como catalogo
  resumido.

Exemplo minimo esperado no README do pacote:

```ts
import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { defineSkill, createSkillKit } from "@harness-kernel/skills";

const githubSkill = defineSkill({
  key: "github-pr-review",
  description: "Review GitHub pull requests and address review comments.",
  prompt: "Inspect unresolved comments before proposing code changes.",
  tools: [readPullRequestTool, listReviewCommentsTool],
});

const skills = createSkillKit([githubSkill]);

class DevMode extends HarnessMode {
  prompt = "You are a coding agent.";
  providers = [skills.provider];
  tools = [...skills.tools];
}

const devMode = new DevMode();

export const agent = defineAgent({
  label: "Dev Agent",
  initialMode: devMode,
  modes: [devMode],
  declaredEvents: skills.events,
});
```

O guia do site deve incluir uma secao de troubleshooting:

- "Tool requires activating skill first";
- "Skill prompt did not appear until the next step";
- "Duplicate toolName";
- "Why are inactive skill tools visible?";
- "When do I need core hard gate support?";

### Template de create

Opcional para segunda fase:

```text
packages/create/templates/full/src/skills/
```

Nao incluir no primeiro corte se isso aumentar muito o escopo.

## Mudancas no Core que Nao Entram no MVP

O pacote package-only deve evitar estas mudancas inicialmente.

### Manifesto nativo de skills

Hoje `HarnessAgentManifest` nao tem `skills`. Para listar skills no manifesto
oficial seria necessario alterar:

- `packages/core/src/runtime/types/manifest.ts`
- `packages/core/src/runtime/runner.ts`
- docs de manifest/API.

Alternativa package-only: expor um `list_skills` tool e documentar o catalogo no
`SkillPromptProvider`.

### Categoria de log `"skill"`

Hoje `HarnessLogCategory` nao inclui `"skill"`. Para categoria nativa:

- alterar `packages/core/src/logging/types.ts`;
- revisar sinks/docs se houver filtros por categoria;
- atualizar testes de normalize/logging.

Alternativa package-only: usar categoria `"agent"`.

### Error code `skill.required`

Hoje `HarnessErrorCode` e `ToolErrorCode` nao incluem `skill.required`. Para
erro nativo:

- alterar `packages/core/src/runtime/types/errors.ts`;
- alterar `packages/core/src/logging/tool-errors.ts`;
- alterar `toolResultErrorCode()` em
  `packages/core/src/runtime/tool-executor.ts`;
- atualizar docs de error policy.

Alternativa package-only: retornar resultado estruturado sem `isError: true` e
emitir `SkillRequiredEvent`.

### Hard gate de tool catalog

Para tools realmente sumirem/aparecerem do catalogo do modelo:

- alterar `ModelProviderPreparedContext` ou criar outro contrato de
  `prepareStep`;
- permitir `ModelPipeline` recalcular tools por step;
- alterar `packages/provider-ai-sdk/src/tool-loop.ts` para usar `activeTools` ou
  novo toolset por step;
- definir como outros providers recebem catalogo dinamico.

Alternativa package-only: soft gate.

### API `session.skills`

Uma API nativa como `session.skills.activate()` exigiria alterar:

- `packages/core/src/runtime/types/sessions.ts`;
- `AgentSessionRunner.buildReadSession()`;
- `AgentSessionRunner.buildActionSession()`;
- storage/snapshot se o estado nao ficar em `sharedState`.

Alternativa package-only: helpers que operam sobre `session.state`.

## Fluxos de Runtime

### Fluxo feliz

```text
User pede revisao de PR
  -> modelo ve catalogo resumido de skills
  -> modelo chama activate_skill({ key: "github-pr-review" })
  -> activation tool grava state.skills.active["github-pr-review"]
  -> emite SkillActivationRequestedEvent
  -> emite SkillActivatedEvent
  -> loga SkillActivatedLog
  -> proximo prepareContext inclui prompt da skill
  -> modelo chama list_pr_comments
  -> wrapper ve skill ativa
  -> delega para tool original
```

### Modelo chama tool antes da skill

```text
Modelo chama list_pr_comments
  -> wrapper ve skill inativa
  -> emite SkillRequiredEvent
  -> loga SkillRequiredLog
  -> retorna tool result com code "skill.required"
  -> modelo chama activate_skill
  -> proximo step usa prompt da skill
```

### Skill desconhecida

```text
Modelo chama activate_skill({ key: "unknown" })
  -> activation tool emite SkillActivationRequestedEvent known=false
  -> loga warn
  -> retorna lista de keys validas
```

### Approval continua intacto

```text
Skill ativa
  -> modelo chama tool gated
  -> wrapper delega para original
  -> ToolExecutor aplica requiresApproval/mode.toolApproval/host approveTool
  -> aprovacao negada continua sendo tool.approval.denied
```

## Riscos e Decisoes Abertas

### Tool visivel demais

Soft gate deixa tools de todas as skills visiveis para o modelo. Isso pode
aumentar ruido e prompt/tool overload.

Mitigacoes:

- descricoes de wrapper devem ser claras e curtas;
- provider deve listar skills e orientar ativacao;
- `createSkillGatedTools()` deve permitir filtrar skills por modo;
- hard gate pode virar fase 2.

### Resultado bloqueado como erro ou nao

Se `SkillRequired` vier com `isError: true`, o `ToolExecutor` vai tratar como
erro de tool e provavelmente emitir `ErrorEvent` com codigo `"tool.failed"`.

Decisao recomendada: nao usar `isError: true` no MVP. Usar evento/log proprio.

### Estado generico pode colidir

Como `sharedState` e livre, `skills` pode colidir com estado do agente.

Mitigacao:

- `stateKey` configuravel;
- default documentado;
- helpers puros `getSkillState()` e `setSkillState()`.

### Duplicidade de tool names

O `core` ja falha em `resolveTools()` quando ha names duplicados. O pacote deve
falhar antes, no registry, com erro mais explicativo:

```text
Duplicate skill tool name 'read_file' declared by skills 'a' and 'b'.
```

### Prompt de skill pode ser caro

Prompts ativos podem ficar longos.

Mitigacoes:

- `prompt` pode ser resolver dinamico;
- provider pode renderizar resumo de inativas e prompt completo so de ativas;
- opcao para limitar numero de skills ativas;
- logar quantidade de skills ativas quando renderizar, se necessario.

### Ativacao automatica

Nao colocar auto-select no primeiro corte. O modelo deve chamar
`activate_skill` explicitamente. Auto-select pode ser construido depois como
hook/tool/provider separado.

## Fases de Implementacao

### Fase 1: Package-only MVP

1. Criar `packages/skills`.
2. Implementar `defineSkill()`.
3. Implementar `SkillRegistry`.
4. Implementar helpers de state.
5. Implementar helpers de catalogo: available, active, inactive e active check.
6. Implementar `activateSkill()` e `deactivateSkill()`.
7. Implementar `SkillPromptProvider`.
8. Implementar `activate_skill`.
9. Implementar `list_skills`.
10. Implementar `createSkillGatedTools()`.
11. Implementar eventos customizados.
12. Implementar logs customizados usando categoria `"agent"`.
13. Adicionar testes unitarios do pacote.
14. Atualizar package exports e consumer pack tests.
15. Criar `packages/skills/README.md` com exemplo minimo.
16. Criar docs do site em `packages/skills.md`.
17. Criar guia do site em `guides/skills.md`.

### Fase 2: Ergonomia

1. Adicionar `createSkillKit()`.
2. Adicionar `deactivate_skill`, se nao entrar no MVP junto de
   `deactivateSkill()`.
3. Adicionar filtros ergonomicos no `list_skills`, se o catalogo basico nao for
   suficiente.
4. Adicionar exemplo em `examples/cli-harness` ou template `create`.
5. Atualizar docs de overview/concepts se skills virarem parte recomendada do
   fluxo de agente.

### Fase 3: Core opcional

Somente se o MVP provar necessidade:

1. `HarnessAgentManifest.skills`.
2. categoria de log `"skill"`.
3. error code `skill.required`.
4. hard gate de catalogo dinamico.
5. `session.skills`.

## Testes Necessarios

### Unitarios do pacote

- `defineSkill()` valida key.
- registry rejeita skill duplicada.
- registry rejeita tool name duplicado.
- state helpers preservam outras chaves do state.
- `listAvailableSkills()` lista todo o registry sem depender da sessao.
- `listActiveSkills()` retorna somente skills ativas e conhecidas no registry.
- `listInactiveSkills()` retorna available menos active.
- `isSkillActive()` funciona com `AgentReadSession` e com state cru.
- `activateSkill()` atualiza state, emite evento e log.
- `deactivateSkill()` atualiza state, emite evento e log.
- activation tool ativa skill conhecida.
- activation tool e idempotente.
- activation tool retorna erro estruturado para skill desconhecida.
- `list_skills` retorna available/active/inactive conforme opcoes.
- prompt provider inclui catalogo de inativas.
- prompt provider inclui prompt completo de ativas.
- gated tool bloqueia quando skill inativa.
- gated tool delega quando skill ativa.
- gated tool preserva schema/risk/permissions/requiresApproval.

### Integracao com core

- agente com skill package roda sem mudanca no core;
- `SkillActivatedEvent` aparece em `result.events`;
- `SkillRequiredEvent` aparece em `result.events`;
- logs customizados sao aceitos por `MemoryLogSink`;
- approval de tool original continua funcionando depois da delegacao.

### Consumer/package tests

- `@harness-kernel/skills` importa em ambiente externo;
- pacote publicado nao contem `workspace:`;
- smoke test usa `defineSkill()` e `createSkillKit()`.

## Criterios de Aceite

- Nao alterar `@harness-kernel/core` para o MVP, exceto se testes de packaging
  exigirem alias/export de pacote novo no monorepo.
- Um agente consegue declarar skills em arquivo proprio e acoplar
  `skills.provider` e `skills.tools` ao modo.
- Codigo do agente consegue listar skills disponiveis/ativas/inativas e ativar
  ou desativar uma skill explicitamente via helpers do pacote.
- O modelo recebe instrucao clara para ativar skill antes de usar tool gated.
- Chamada prematura de gated tool gera resultado util, evento e log, sem marcar
  erro tecnico de run.
- Ativar skill muda o prompt no step seguinte.
- Tool original executa com approval/risk/permissoes intactos.
- O pacote tem README, docs do site, guia de uso e teste unitario minimo.

## Resumo da Arquitetura

```text
@harness-kernel/skills
  defineSkill()
  createSkillRegistry()
  listAvailableSkills()
  listActiveSkills()
  activateSkill()
  deactivateSkill()
  createSkillPromptProvider()
  createSkillActivationTool()
  createSkillListTool()
  createSkillGatedTools()
  custom events
  custom logs

@harness-kernel/core
  continua dono de:
    mode.tools
    context providers
    shared state
    tool execution
    approvals
    event timeline
    logging sinks
    storage/snapshots

Skill ativa comportamento.
Approval autoriza execucao.
Tool executa acao.
```
