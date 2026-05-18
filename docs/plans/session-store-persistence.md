# Plano: SessionStore Persistente e Storage Centrado em Sessao

## Contexto

Hoje o `HarnessSessionStore` mantem sessoes ativas em memoria. O storage atual
persiste dados de um `run`, mas nao persiste o catalogo de sessoes. Isso significa
que, depois de reiniciar a aplicacao, o host nao consegue listar sessoes antigas
nem reabrir uma sessao pelo `sessionId` esperando que transcript, eventos,
snapshots e cursors sejam restaurados automaticamente.

O objetivo desta refatoracao e separar melhor tres responsabilidades:

- `SessionStore`: orquestra o ciclo de vida de sessoes ativas.
- `SessionStorage`: persiste e lista o catalogo de sessoes e runs.
- `RunStore`: persiste o estado restauravel de execucao.

## Problemas Atuais

- `HarnessSessionStoreImpl` usa apenas um `Map<string, HarnessSession>`.
- `list()` e sincrona, mas um store persistente precisa consultar I/O.
- `get()` nao diferencia sessao ativa em memoria de sessao persistida que precisaria
  ser hidratada.
- `delete(sessionId)` hoje significa fechar/remover da memoria, nao apagar dados persistidos.
- `AgentSessionRunner` cria `runId` aleatorio cedo demais para reabrir uma sessao existente.
- `HarnessRunStorage` abre por `runId`; ele nao consegue descobrir o ultimo run de uma sessao.
- `metrics` tem `saveMetrics()`, mas isso e dado de observabilidade, nao estado
  restauravel.
- `services` e um nome generico para dependencias do host; vamos tratar como `resources`.
- `workDir`, `initialMode`, `maxTurns`, `toolApprovalTimeoutMs` e `sessionTtlMs` misturam responsabilidades no config do store.

## Decisoes de Direcao

### Storage deve ser centrado em sessao

O catalogo persistente deve ser por `sessionId`. O `runId` continua existindo, mas
ele passa a ser uma entidade filha da sessao, nao a chave primaria do ciclo de vida.
O restore deve carregar o estado consolidado da sessao, nao "continuar o ultimo
run". Um novo input cria um novo run dentro da mesma sessao.

### Metrics pertencem a logging/telemetry

Metricas sao historico operacional de run. Elas nao devem fazer parte do contrato
restauravel de storage. O contrato legado pode manter `saveMetrics()` por
compatibilidade, mas o novo design deve emitir metricas via logging/telemetry.

### Fechar e deletar precisam ser operacoes diferentes

- `close(sessionId)`: descarrega uma sessao ativa da memoria.
- `delete(sessionId)`: apaga a sessao persistida e seus dados associados.

### APIs persistentes de leitura devem ser async

`list()` deve suportar storage remoto ou banco de dados. `get(sessionId)` fica
sincrono e retorna apenas sessao ativa em memoria; `getOrCreate(sessionId)` e o
caminho async que hidrata uma sessao persistida ou cria uma nova.

### `resources` substitui `services`

`resources` representa dependencias injetadas pelo host: clientes, repositorios,
cache, db, feature flags, etc. O agente deve depender de interfaces pequenas,
nao de infraestrutura crua quando possivel.

### Config do store deve conter apenas responsabilidades do host

- `initialMode` deve vir do `AgentDefinition`.
- `workDir` deve sair do store e ir para `sandbox`/ferramentas locais.
- politicas de aprovacao devem ficar em agent/mode/tool, nao no store.
- limites de execucao devem ficar em agent/mode, nao no store.
- TTL de sessao nao entra no novo design; o host descarrega sessoes explicitamente
  com `close(sessionId)` quando precisar.

## API Alvo do SessionStore

```ts
interface HarnessSessionStore {
  getOrCreate(sessionId?: string, options?: GetOrCreateSessionOptions): Promise<HarnessSession>;
  get(sessionId: string): HarnessSession | undefined;
  list(query?: SessionListQuery): Promise<SessionListResult>;

  close(sessionId: string): Promise<boolean>;
  delete(sessionId: string): Promise<boolean>;
  clearActive(): Promise<void>;
  closeAll(): Promise<void>;

  send(sessionId: string | undefined, input: string | HarnessUserInput, options?: SendOptions): Promise<SendResult>;
  stream(sessionId: string | undefined, input: string | HarnessUserInput, options?: StreamOptions): Promise<HarnessRunStream>;

  getPendingApprovals(sessionId?: string): ToolApprovalHandle[];
  approveTool(sessionId: string, approvalId: string): Promise<void>;
  denyTool(sessionId: string, approvalId: string, reason?: string): Promise<void>;
  getAgentManifest(sessionId: string): HarnessAgentManifest | undefined;
}
```

## API Alvo do Config

```ts
createHarnessSessionStore({
  agent: { definition },
  providers,
  defaultModel,

  storage,
  sandbox,
  logging,
  resources,
});
```

## Novos Tipos de Sessao

```ts
interface HarnessSessionSummary {
  sessionId: string;
  agentKey: string;
  createdAt: string;
  lastActiveAt: string;
  mode: string;
  latestRunId?: string;
  metadata?: Record<string, unknown>;
}

interface SessionListQuery {
  agentKey?: string;
  active?: boolean;
  limit?: number;
  cursor?: string;
}

interface SessionListResult {
  items: HarnessSessionSummary[];
  nextCursor?: string;
}
```

## Contrato de Persistencia Proposto

```ts
interface HarnessSessionStorage {
  readonly id: string;
  label?: string;

  init?(): Promise<void>;

  createSession(input: CreateStoredSessionInput): Promise<HarnessSessionSummary>;
  getSession(sessionId: string): Promise<HarnessSessionSummary | undefined>;
  listSessions(query?: SessionListQuery): Promise<SessionListResult>;
  touchSession(input: TouchStoredSessionInput): Promise<void>;
  deleteSession(sessionId: string): Promise<boolean>;

  createRun(input: CreateStoredRunInput): Promise<StoredRunSummary>;
  getLatestRun(sessionId: string): Promise<StoredRunSummary | undefined>;
  listRuns(sessionId: string): Promise<StoredRunSummary[]>;

  openRun(input: OpenRunStoreInput): Promise<HarnessRunStore> | HarnessRunStore;
}
```

`HarnessRunStorage` pode ser mantido como contrato legado/compatibilidade, mas o
store persistente deve depender de `HarnessSessionStorage`.

## Mudancas no `@harness-kernel/core`

1. Alterar `HarnessSessionStore` para APIs async onde houver I/O.
2. Separar `close(sessionId)` de `delete(sessionId)`.
3. Introduzir `HarnessSessionSummary`, `SessionListQuery` e tipos relacionados.
4. Introduzir `HarnessSessionStorage` ou contrato equivalente.
5. Adaptar `HarnessSessionStoreImpl` para:
   - consultar sessoes ativas primeiro;
   - consultar storage persistente depois;
   - criar registro persistente quando a sessao nao existir;
   - reidratar sessao existente antes de retornar.
6. Adaptar `createHarnessSession`/`AgentSessionRunner` para aceitar estado restaurado
   ou para pedir ao storage o estado por `sessionId`.
7. Renomear `services` para `resources` no config e nas sessions expostas ao agente.
8. Remover `workDir` do config principal.
9. Remover `initialMode` do config principal; usar `AgentDefinition.initialMode`.
10. Mover `toolApprovalTimeoutMs` para uma politica de approval/tool.
11. Remover `maxTurns` do config principal; usar defaults do agent/mode.
12. Remover `sessionTtlMs`; o host deve chamar `close(sessionId)`
    explicitamente para descarregar sessoes.
13. Remover metricas do novo contrato restauravel e emitir metricas via
    logging/telemetry.

## Mudancas no Storage Local/File

O pacote atual `@harness-kernel/storage-file` pode evoluir para implementar o novo
contrato de sessao persistente, mantendo compatibilidade com o contrato antigo.

Estrutura de arquivos sugerida:

```txt
.harness-kernel/
  sessions/
    index.json
    <sessionId>/
      session.json
      runs/
        <runId>/
          events.jsonl
          transcript.json
          cursors.json
          snapshots/
          context-snapshots/
```

Responsabilidades:

- `index.json` permite listar sessoes sem escanear toda a arvore.
- `session.json` guarda metadata e ponteiro para o ultimo run.
- `runs/<runId>` mantem o formato atual de estado restauravel.
- `metrics.json` pode continuar existindo apenas no contrato legado.
- `FileRunStorage` pode continuar existindo para compatibilidade.
- Um novo `FileSessionStorage` pode implementar o contrato novo.

## Mudancas Futuras no Storage Postgres

Depois da refatoracao do core, o pacote `@harness-kernel/storage-postgres` deve
implementar o contrato novo diretamente.

Tabelas conceituais:

- `harness_sessions`
- `harness_runs`
- `harness_transcript_messages`
- `harness_runtime_events`
- `harness_transcript_cursors` (`cursor_state` inclui branches)
- `harness_snapshots`
- `harness_context_snapshots`

Metricas e logs operacionais podem morar no mesmo banco, mas continuam sendo
responsabilidade do contrato de logging/telemetry, nao requisito para restaurar
sessao.

## Compatibilidade e Migracao

1. Manter `HarnessRunStorage` e `FileRunStorage` funcionando.
2. Adicionar o contrato novo de sessao.
3. Remover os campos antigos do config publico do store sem alias:
   - `services`
   - `workDir`
   - `initialMode`
   - `maxTurns`
   - `toolApprovalTimeoutMs`
   - `sessionTtlMs`
4. Atualizar docs e exemplos junto com as mudancas de API publica.

## Ordem de Execucao Sugerida

1. Refatorar tipos do `core` sem mudar comportamento.
2. Introduzir `resources` no lugar de `services`.
3. Introduzir `HarnessSessionStorage` e adaptador em memoria.
4. Tornar APIs do `HarnessSessionStore` async.
5. Separar `close` e `delete`.
6. Adaptar `AgentSessionRunner` para reidratar estado por sessao.
7. Implementar `FileSessionStorage`.
8. Mover metricas para logging/telemetry no novo fluxo.
9. Atualizar docs/testes do `core` e `storage-file`.
10. Implementar `storage-postgres` sobre o contrato novo.

## Criterios de Aceite

- Criar tres sessoes, fechar o processo e listar as tres sessoes ao reiniciar.
- Reabrir uma sessao pelo mesmo `sessionId` e recuperar transcript, eventos,
  snapshots, context snapshots e cursors.
- Fechar uma sessao ativa sem apagar dados persistidos.
- Deletar uma sessao e remover seus runs associados.
- `storage-file` continua compativel com o uso atual.
- `services` nao segue como alias; `resources` e o nome publico.
- O config novo do store nao inclui `workDir`, `initialMode`, `maxTurns`,
  `toolApprovalTimeoutMs`, `sessionTtlMs`, `approval` ou `runLimits`.
- O design nao acopla logging ao estado necessario para restaurar sessao.

## Decisoes Fechadas

- Restore carrega o estado consolidado da sessao.
- Runs sao historico de execucao dentro da sessao.
- Metricas pertencem a logging/telemetry, nao ao storage restauravel.
- Sessoes arquivadas ficam fora do v1.
- `listSessions()` usa paginacao por cursor com ordenacao estavel por
  `lastActiveAt desc, sessionId asc`.
- `get(sessionId)` retorna apenas sessao ativa; `getOrCreate(sessionId)` hidrata
  sessao persistida ou cria uma nova.
- `sessionTtlMs`, `approval` e `runLimits` nao entram no config novo.
