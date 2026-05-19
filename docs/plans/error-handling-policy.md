# Plano: Tratamento de Erros e Error Policy

## Contexto

O harness ja trata erros em varios pontos, mas o contrato ainda e mais
"capturar, logar, emitir algo e relancar" do que uma politica uniforme de erro.
Hoje existem pecas boas:

- `AgentToolResult.isError` para erro recuperavel de ferramenta.
- `ToolErrorPayload` para alguns erros estruturados de tool/sandbox.
- `ErrorEvent` para registrar erros na timeline.
- `HarnessSessionStatus.lastError` para expor a ultima falha da sessao.
- `RunFailedLog`, `ModelCallFailedLog`, `ToolFailedLog`,
  `ContextProviderFailedLog`, `StorageWriteFailedLog` e
  `SandboxExecFailedLog` para observabilidade operacional.

O problema e que essas pecas nao usam uma taxonomia comum. Erros de modelo,
contexto, storage, abort e runtime viram principalmente `message`, `stack` e
`cause`. Alem disso, falhas fatais nao possuem um evento terminal proprio de
run, e `metrics` finais so sao persistidas no caminho de sucesso.

## Achados da Codebase Atual

- `packages/core/src/session/session.ts` converte excecoes em
  `HarnessErrorShape` local via `toErrorShape()`, atualiza status, emite stream
  event `{ type: "error" }`, flush logs e relanca.
- `packages/core/src/runtime/runner.ts` captura erro de run apenas para
  `RunFailedLog` e relanca; `RunEndEvent` e `saveMetrics()` existem so no
  caminho de sucesso.
- `packages/core/src/runtime/model-pipeline.ts` captura erro de provider,
  adiciona `message` em `metrics.errors`, loga `ModelCallFailedLog`, emite
  `ErrorEvent` e relanca.
- `packages/core/src/runtime/tool-executor.ts` ja trata tool failures como
  recuperaveis: cria `AgentToolResult.isError`, adiciona tool result ao
  transcript, emite `ToolEndEvent` e retorna ao modelo.
- `packages/core/src/session/status.ts` muda fase para `error` quando observa
  `ErrorEvent`, mas guarda apenas `{ message }` nesse caminho.
- `packages/core/src/session/event-hub.ts` hidrata eventos de runtime para
  stream, mas nao existe evento terminal de falha de run para hidratar.
- `packages/core/src/session/queue.ts` considera `RunEndEvent` como terminal
  para limpar triggers pendentes; falha de run ainda nao tem evento equivalente.
- `packages/core/src/logging/normalize.ts` reconhece `Error` em campos de log e
  gera `HarnessLogRecord.error`, mas esse shape ainda nao tem `code`,
  `category`, `severity` ou `recoverable`.
- `packages/core/src/runtime/types/metrics.ts` guarda `errors: string[]`, sem
  codigo ou categoria.
- Docs e templates ja reforcam que logging, storage, sandbox, providers,
  approvals, resources, streaming e ciclo de vida pertencem ao runtime host.

## Decisoes de Direcao

### `errorPolicy` pertence ao runtime

O `errorPolicy` principal deve ficar no host/runtime, via `HarnessAppConfig`, nao
no `AgentDefinition`.

Motivo: as decisoes centrais sao operacionais e dependem do ambiente que esta
rodando o agente:

- expor ou esconder stack traces;
- sanitizar payloads enviados por stream/API;
- fechar ou manter a sessao apos erro fatal;
- configurar retry/backoff de model provider;
- decidir nivel de logging;
- classificar timeout, rate limit e falhas transientes;
- definir comportamento diferente em dev/prod.

Isso segue a fronteira ja documentada no projeto: o agente empacota
comportamento, enquanto o host possui providers, storage, sandboxing, approvals,
logging, resources, streaming e ciclo de vida da sessao.

### O agent pode declarar semantica local, mas nao politica global

O agent/mode/tool/context pode declarar hints locais como "este contexto e
opcional" ou "esta ferramenta retorna erro para o modelo". A politica final
continua sendo aplicada pelo runtime.

Exemplos de hints possiveis:

- `HarnessContextProvider.required?: boolean`
- `HarnessMode.contextFailure?: "fail" | "warn-and-skip"`
- helper para tools retornarem erro estruturado sem montar payload manualmente

Esses hints nao devem decidir se stack e exposto, se ha retry global, ou se a
sessao fecha apos erro fatal.

### Um erro canonico deve alimentar evento, status, stream, metricas e log

Todo erro fatal ou recuperavel deve passar por normalizacao para um shape comum.
Esse shape deve ser a fonte para:

- `ErrorEvent`
- futuro `RunFailedEvent`
- `HarnessSessionStatus.lastError`
- evento de stream `{ type: "error" }`
- `RunMetrics.errors`
- `HarnessLogRecord.error` e campos dos logs de falha

### Evento e log tem responsabilidades diferentes

Evento e timeline do agente/sessao. Log e diagnostico operacional.

Assim, o mesmo erro normalizado deve gerar duas visoes:

- visao publica/sanitizada para evento, status e stream;
- visao interna/completa para logs, respeitando redaction.

Falha em sink de logging deve continuar sem afetar execucao.

### Tool error recuperavel nao deve derrubar o run

O comportamento atual de ferramentas deve ser preservado:

- schema invalido vira `AgentToolResult.isError`;
- aprovacao negada vira `AgentToolResult.isError`;
- excecao em `tool.execute()` vira `AgentToolResult.isError`;
- o modelo recebe o resultado e pode tentar se recuperar.

Esse caminho deve usar a mesma taxonomia de erro, mas nao deve produzir
`RunFailedEvent`.

### Erro fatal deve ser terminal e explicito

Erro fatal deve encerrar o run atual com:

- `ErrorEvent` com erro canonico;
- `RunFailedEvent` com erro e metricas finais;
- `RunFailedLog`;
- `HarnessSessionStatus.phase = "error"`;
- `HarnessSessionStatus.lastError` preenchido;
- `stream.result`/`send()` rejeitando com erro original ou erro normalizado;
- stream emitindo evento de erro antes de fechar.

Depois disso, a sessao permanece reutilizavel por padrao. O proximo `send()`
inicia novo run e limpa `lastError` em `RunStartEvent`. O runtime pode optar por
fechar sessoes em erro fatal via `errorPolicy.closeSessionOnFatal`.

### Abort/cancelamento deve ser separado de erro inesperado

`AbortSignal` hoje tende a virar `Error("Run aborted.")`. O novo contrato deve
classificar isso como `run.aborted` ou `run.cancelled`, com severidade menor que
erro inesperado. `send()` ainda pode rejeitar, mas logs e metricas nao devem
tratar cancelamento voluntario como falha interna.

## API Alvo

### Erro canonico

```ts
export type HarnessErrorCategory =
  | "run"
  | "model"
  | "tool"
  | "context"
  | "storage"
  | "sandbox"
  | "approval"
  | "runtime";

export type HarnessErrorSeverity = "warn" | "error" | "fatal";

export type HarnessErrorCode =
  | "run.failed"
  | "run.aborted"
  | "model.failed"
  | "model.rate_limited"
  | "model.timeout"
  | "tool.failed"
  | "tool.args.invalid_schema"
  | "tool.approval.denied"
  | "context.provider.failed"
  | "storage.write_failed"
  | "sandbox.exec.failed"
  | "runtime.failed";

export interface HarnessErrorShape {
  code: HarnessErrorCode;
  message: string;
  publicMessage?: string;
  category: HarnessErrorCategory;
  severity: HarnessErrorSeverity;
  recoverable: boolean;
  source?: HarnessEventSource;
  name?: string;
  stack?: string;
  cause?: unknown;
  details?: unknown;
}
```

Compatibilidade: `message`, `name`, `stack` e `cause` continuam existindo. O
runtime deve sempre produzir `code`, `category`, `severity` e `recoverable`, mas
a migracao pode manter campos novos como opcionais no primeiro passo se isso
reduzir quebra para consumidores existentes.

### Politica de erro do runtime

```ts
export interface HarnessRetryPolicy {
  attempts?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
}

export interface HarnessErrorPolicy {
  exposeInternalErrors?: boolean;
  includeStackInStatus?: boolean;
  closeSessionOnFatal?: boolean;
  contextFailure?: "fail" | "warn-and-skip";
  retry?: {
    model?: HarnessRetryPolicy;
    storage?: HarnessRetryPolicy;
  };
  classify?(
    error: unknown,
    context: HarnessErrorContext,
  ): Partial<HarnessErrorShape> | undefined;
}
```

Uso no host:

```ts
createHarnessSessionStore({
  agent,
  providers,
  defaultModel,
  storage,
  sandbox,
  logging,
  errorPolicy: {
    exposeInternalErrors: false,
    closeSessionOnFatal: false,
    retry: {
      model: { attempts: 2, backoffMs: 500 },
    },
  },
});
```

Defaults propostos:

- `exposeInternalErrors: false`
- `includeStackInStatus: false`
- `closeSessionOnFatal: false`
- `contextFailure: "fail"`
- sem retry automatico se nao configurado

### Eventos

Atualizar `ErrorEvent` para usar o erro canonico:

```ts
export class ErrorEvent extends HarnessEvent<{
  error: HarnessErrorShape;
  message: string;
  code?: HarnessErrorCode;
  recoverable?: boolean;
}> {}
```

Adicionar evento terminal:

```ts
export class RunFailedEvent extends HarnessEvent<{
  error: HarnessErrorShape;
  metrics: RunMetrics;
  finalAnswer?: string;
}> {
  static override type = "run:failed";
}
```

`RunEndEvent` continua representando sucesso. `RunFailedEvent` representa
termino com falha. Isso evita depender de `ErrorEvent` como evento terminal.

### Stream

Adicionar evento de stream explicito:

```ts
type HarnessStreamEvent =
  | { type: "run.failed"; error: HarnessErrorShape; metrics: RunMetrics }
  | { type: "error"; error: HarnessErrorShape }
  // eventos existentes
```

`run.failed` vem da timeline do runner. `error` continua sendo o evento de
compatibilidade da sessao/API.

### Logs

Logs de falha devem receber erro normalizado, nao apenas `unknown`:

```ts
export class RunFailedLog extends HarnessLog<{
  error: HarnessErrorShape;
  internalError?: unknown;
}> {}
```

O `HarnessLogRecord.error` deve aceitar `code`, `category`, `severity` e
`recoverable`, alem de `name`, `message` e `stack`.

## Fluxos Alvo

### Sucesso

1. `RunStartEvent`
2. turn/model/tool events
3. `RunEndEvent`
4. `RunCompletedLog`
5. `saveMetrics(metrics)`
6. stream emite `run.completed`

### Erro fatal de model provider

1. provider lanca erro ou stream emite parte `error`
2. erro e normalizado como `model.failed`, `model.timeout` ou
   `model.rate_limited`
3. `ModelCallFailedLog`
4. runner emite `ErrorEvent`
5. runner finaliza metricas
6. runner emite `RunFailedEvent`
7. runner tenta persistir transcript/eventos/metricas finais
8. sessao muda para fase `error`
9. stream emite `run.failed` e `error`
10. `send()`/`stream.result` rejeita

### Erro fatal de context provider requerido

1. provider lanca erro durante build de contexto
2. erro e normalizado como `context.provider.failed`
3. `ContextProviderFailedLog`
4. runner emite `ErrorEvent` e `RunFailedEvent`
5. sessao entra em erro

Se o provider ou modo declarar contexto opcional e a politica permitir:

1. erro e normalizado como `context.provider.failed`
2. `ContextProviderFailedLog` com severidade `warn`
3. contexto e ignorado
4. run continua

### Erro recuperavel de tool

1. `ToolStartEvent`
2. tool falha ou argumentos invalidos
3. erro e normalizado como `tool.*`
4. `ToolFailedLog`
5. `ToolEndEvent` com `AgentToolResult.isError`
6. modelo recebe o resultado
7. run continua

### Abort/cancelamento

1. `AbortSignal` aborta o run
2. erro e normalizado como `run.aborted`
3. `RunFailedEvent` ou futuro `RunAbortedEvent` registra termino nao bem-sucedido
4. severidade `warn`
5. `send()` rejeita com erro de abort

Na primeira implementacao, usar `RunFailedEvent` com `code: "run.aborted"` e
suficiente. Um `RunAbortedEvent` separado pode ficar para evolucao futura se a
UI precisar distinguir terminalmente.

## Mapa da Codebase Impactada

### Core: novos tipos e normalizacao

- `packages/core/src/runtime/types/errors.ts`
  - novo arquivo para `HarnessErrorShape`, `HarnessErrorCode`,
    `HarnessErrorCategory`, `HarnessErrorSeverity`, `HarnessErrorPolicy`,
    `HarnessRetryPolicy` e `HarnessErrorContext`.
- `packages/core/src/runtime/types/index.ts`
  - exportar tipos de erro.
- `packages/core/src/runtime/errors.ts`
  - novo helper `normalizeHarnessError(error, context, policy)`;
  - novo helper `sanitizeHarnessError(error, policy)`;
  - classificadores padrao para abort, model timeout/rate limit, storage,
    context, sandbox e runtime.
- `packages/core/src/session/types.ts`
  - adicionar `errorPolicy?: HarnessErrorPolicy` em `HarnessAppConfig`;
  - substituir/expandir `HarnessErrorShape` atual pelo shape canonico;
  - adicionar stream event `run.failed`.
- `packages/core/src/runtime/types/agent.ts`
  - passar `errorPolicy?: HarnessErrorPolicy` para `AgentSessionRunnerOptions`;
  - nao adicionar `errorPolicy` em `AgentDefinition`.

### Core: eventos e lifecycle

- `packages/core/src/runtime/events.ts`
  - atualizar schema de `ErrorEvent`;
  - adicionar `RunFailedEvent`;
  - incluir `RunFailedEvent` em `runtimeEventClasses`.
- `packages/core/src/runtime/runner.ts`
  - centralizar emissao fatal de `ErrorEvent` e `RunFailedEvent` no catch do
    run;
  - finalizar `metrics.completedAt`, `durationMs`, `finalMode` e `errors`
    tambem em falha;
  - tentar persistir metricas finais em falha;
  - evitar duplicar `ErrorEvent` fatal em camadas internas;
  - classificar abort como `run.aborted`;
  - propagar `errorPolicy` para `ModelPipeline`, `ToolExecutor`,
    `RunStorageCoordinator` e `SandboxManager` quando necessario.
- `packages/core/src/runtime/model-pipeline.ts`
  - trocar erro fatal emitido localmente por normalizacao/log e relancamento, ou
    marcar quando ja houve `ErrorEvent`;
  - aplicar retry de model provider em fase futura.
- `packages/core/src/runtime/tool-executor.ts`
  - usar erro canonico para `tool.args.invalid_schema`,
    `tool.approval.denied`, `tool.failed`;
  - manter retorno recuperavel por `AgentToolResult.isError`.
- `packages/core/src/runtime/storage-coordinator.ts`
  - normalizar/logar `storage.write_failed`;
  - decidir como persistir falha quando o proprio storage esta falhando.
- `packages/core/src/runtime/sandbox-manager.ts`
  - normalizar/logar `sandbox.exec.failed` em excecoes de sandbox.

### Core: sessao, stream e fila

- `packages/core/src/session/session.ts`
  - substituir `toErrorShape()` por normalizador canonico;
  - aplicar `errorPolicy` na versao exposta pelo stream/status;
  - respeitar `closeSessionOnFatal`;
  - manter `send()` rejeitando em erro fatal.
- `packages/core/src/session/status.ts`
  - preencher `lastError` com erro canonico;
  - tratar `RunFailedEvent` como terminal de erro;
  - limpar `lastError` em `RunStartEvent`.
- `packages/core/src/session/event-hub.ts`
  - hidratar `RunFailedEvent` para stream event `run.failed`;
  - continuar emitindo `event` generico.
- `packages/core/src/session/queue.ts`
  - tratar `RunFailedEvent` como evento terminal que limpa triggers pendentes,
    igual `RunEndEvent`.
- `packages/core/src/session/store.ts`
  - mergear `errorPolicy` no `getOrCreate(..., overrides)`.

### Core: logging

- `packages/core/src/logging/types.ts`
  - expandir `HarnessLogError` com `code`, `category`, `severity`,
    `recoverable`.
- `packages/core/src/logging/normalize.ts`
  - reconhecer `HarnessErrorShape` alem de `Error`;
  - redigir campos sensiveis em `details`/`cause`.
- `packages/core/src/logging/redaction.ts`
  - garantir sanitizacao de erro canonico.
- `packages/core/src/logging/runtime-logs.ts`
  - trocar campos `error: unknown` por erro canonico quando aplicavel;
  - manter `internalError?: unknown` para stack/cause completos nos logs.
- `packages/core/src/logging/tool-errors.ts`
  - alinhar `ToolErrorCode` ao subset de `HarnessErrorCode`;
  - considerar helper `createToolErrorResult()`.
- `packages/core/src/exports/runner/logging.ts`
  - exportar novos tipos/helpers publicos de erro se fizer sentido.

### Exports publicos

- `packages/core/src/index.ts`
- `packages/core/src/exports/runner.ts`
- `packages/core/src/exports/agent/session.ts`
- `packages/core/src/exports/agent/event.ts`
- `packages/core/src/exports/runner/event.ts`

Esses arquivos precisam exportar `RunFailedEvent`, os novos tipos de erro e os
helpers que forem parte da API publica.

### Providers e tools

- `packages/provider-ai-sdk/src/tool-loop.ts`
  - mapear partes `error` da stream para erro normalizavel;
  - preservar abort como `run.aborted`;
  - em fase futura, permitir retry no runtime em torno de `provider.run`.
- `packages/tools-node/src/sandbox-result.ts`
  - passar a criar payloads alinhados ao erro canonico.
- `packages/tools-node/src/bash.ts`
- `packages/tools-node/src/files.ts`
  - trocar criacao manual de erro por helper estruturado se criado.

### Storage packages

- `packages/storage-file/src/index.ts`
- `packages/storage-postgres/src/index.ts`

Verificar se `saveMetrics()` e `recordEvent()` suportam registrar falha final.
Nao deve haver migracao obrigatoria de schema se `RunFailedEvent` entrar no
mesmo stream de eventos existente, mas docs e testes precisam confirmar.

### Templates e exemplos

- `packages/create/templates/one-file/run.ts`
  - imprimir `event.error.code` quando stream emitir erro;
  - demonstrar `errorPolicy` basico no runtime host.
- `packages/create/templates/full/src/run.ts`
  - idem.
- `packages/create/templates/full/AGENT.md`
  - reforcar que error policy e runtime-owned.
- `examples/cli-harness/src/run.ts`
- `examples/web-harness/src/server.ts`
- `examples/support-harness/src/run.ts`

Atualizar exemplos para mostrar erro estruturado sem colocar politica no
`defineAgent`.

## Documentacao Impactada

### Manuais

- `README.md`
  - adicionar `errorPolicy` na lista de responsabilidades host-owned;
  - mostrar exemplo curto de configuracao.
- `apps/site/src/content/docs/docs/runtime/sessions.md`
  - documentar `lastError`, fase `error`, reutilizacao de sessao apos falha e
    comportamento de `send()`.
- `apps/site/src/content/docs/docs/runtime/streaming.md`
  - documentar `run.failed` e `error`.
- `apps/site/src/content/docs/docs/runtime/logging.md`
  - explicar relacao evento vs log;
  - explicar sanitizacao e redaction.
- `apps/site/src/content/docs/docs/runtime/model-providers.md`
  - documentar classificacao de erros de provider e retry futuro.
- `apps/site/src/content/docs/docs/runtime/storage.md`
  - documentar persistencia de metricas/eventos em falha.
- `apps/site/src/content/docs/docs/runtime/session-store.md`
  - documentar `errorPolicy` em `HarnessAppConfig`.
- `apps/site/src/content/docs/docs/agent/tools.md`
  - explicar erro recuperavel de tool e helper de tool error.
- `apps/site/src/content/docs/docs/agent/context-providers.md`
  - explicar contexto requerido/opcional se o hint for implementado.
- `apps/site/src/content/docs/docs/guides/custom-tool.md`
  - exemplo de retorno `isError`.
- `apps/site/src/content/docs/docs/guides/context-provider.md`
  - exemplo de provider opcional.
- `apps/site/src/content/docs/docs/guides/testing-agents.md`
  - exemplos de testes para erro fatal e erro recuperavel.

### API Reference

Os arquivos em `apps/site/src/content/docs/docs/api/reference/**` sao gerados por
Typedoc. Depois da implementacao, rodar:

```bash
pnpm docs:api
```

e revisar as paginas geradas para:

- `HarnessErrorShape`
- `HarnessErrorPolicy`
- `ErrorEvent`
- `RunFailedEvent`
- `HarnessSessionStatus`
- `HarnessStreamEvent`
- `ToolErrorPayload`

## Testes Necessarios

### Unitarios

- `normalizeHarnessError()`:
  - `Error` generico vira `runtime.failed`;
  - abort vira `run.aborted`;
  - timeout/rate limit de provider vira codigo especifico quando possivel;
  - policy `classify()` sobrescreve classificacao padrao;
  - `sanitizeHarnessError()` remove stack/details quando policy nao permite.
- logging normalize/redaction:
  - `HarnessLogRecord.error` inclui codigo;
  - campos sensiveis de `details`/`cause` sao redigidos.

### Session/runtime

- provider falhando:
  - `send()` rejeita;
  - stream emite `run.failed` e `error`;
  - status fica `phase = "error"`;
  - `lastError.code = "model.failed"` ou equivalente;
  - `RunFailedEvent` aparece em `events`;
  - metricas finais incluem erro e duracao.
- context provider requerido falhando:
  - run falha com `context.provider.failed`.
- context provider opcional falhando:
  - run continua quando policy permite.
- tool lancando excecao:
  - run nao falha;
  - tool result tem `isError: true`;
  - erro aparece como `tool.failed`;
  - modelo recebe output de tool.
- tool schema invalido:
  - codigo `tool.args.invalid_schema`;
  - `invalidFields` preservado.
- approval negada/timeout:
  - codigo `tool.approval.denied`;
  - run continua.
- abort:
  - codigo `run.aborted`;
  - severidade `warn`;
  - nao classificar como falha interna inesperada.
- fila:
  - `RunFailedEvent` limpa pending send triggers igual `RunEndEvent`.

### Storage

- `saveMetrics()` e chamado no caminho de falha quando storage esta saudavel.
- se `recordEvent(RunFailedEvent)` falhar por storage, o erro de storage e
  logado sem mascarar indevidamente a causa original do run.

### Export/consumer

- atualizar `scripts/package-exports.test.mjs` e
  `scripts/consumer-pack.test.mjs` se novos entrypoints ou exports publicos forem
  adicionados.

## Ordem de Implementacao

### Fase 1: contrato e observabilidade

1. Criar tipos de erro canonico e normalizador.
2. Adicionar `errorPolicy` em `HarnessAppConfig`.
3. Atualizar `ErrorEvent`.
4. Adicionar `RunFailedEvent`.
5. Atualizar status, stream, queue e logs para usar o erro canonico.
6. Persistir metricas finais em falha.
7. Atualizar testes de session/runtime/logging.

Essa fase nao precisa implementar retry.

### Fase 2: ergonomia para agent authors

1. Adicionar helper para retorno de erro de tool.
2. Adicionar hint de contexto opcional/requerido.
3. Atualizar docs e templates de agentes.

### Fase 3: retry e politica avancada

1. Implementar retry/backoff para model provider no runtime.
2. Definir se storage retry entra no core ou fica para host wrappers.
3. Melhorar classificadores de provider especificos sem acoplar o core a SDKs.

## Riscos e Cuidados

- Evitar evento duplicado de erro fatal. A recomendacao e centralizar
  `ErrorEvent` fatal no `AgentSessionRunner.run()` e deixar camadas internas
  logarem/relancarem. Tool errors recuperaveis podem continuar emitindo erro
  recuperavel.
- Nao vazar stack/details por stream em producao. Default deve ser sanitizado.
- Manter compatibilidade de `message` em `HarnessErrorShape` e `ErrorEvent`.
- `RunFailedEvent` deve ser terminal para fila e UI, mas nao deve substituir
  `ErrorEvent`; os dois tem funcoes diferentes.
- O core deve continuar sem dependencia externa.
- Retry nao deve repetir tool calls automaticamente sem desenho separado. A
  primeira politica de retry deve mirar model provider antes da execucao de
  ferramentas ou apenas em erros claramente seguros.

## Perguntas em Aberto

Nao ha pergunta bloqueante para iniciar a implementacao em fases.

Pontos para decidir durante a implementacao:

- manter `code` opcional por uma versao para compatibilidade, ou tornar
  obrigatorio imediatamente;
- usar somente `RunFailedEvent` para abort na primeira fase, ou criar tambem
  `RunAbortedEvent`;
- nome final do hint de contexto: `required`, `optional` ou `failureMode`;
- se `retry.storage` fica no core agora ou apenas no desenho para uma fase
  posterior.
