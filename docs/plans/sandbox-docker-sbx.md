# Plano: Sandbox Docker com Docker Sandboxes (`sbx`)

## Contexto

Hoje o Harness Kernel tem uma abstracao pequena de sandbox:

- `HarnessSandbox.open(input)`.
- `HarnessSandboxSession.exec(input)`.
- `HarnessSandboxSession.close?()`.

O pacote `@harness-kernel/sandbox-local` implementa essa interface executando
`bash -lc` no host, dentro de um `workDir`. Isso e util para desenvolvimento
local, mas nao e isolamento forte para codigo nao confiavel.

A direcao combinada e adicionar um pacote `@harness-kernel/sandbox-docker`
baseado em Docker Sandboxes (`sbx`), usando o agente `shell`. O Harness continua
sendo o runtime de IA; o `sbx` vira apenas a maquina isolada onde os tools rodam.

## Decisoes

### Persistencia e por sessao

Sim: o sandbox persistente deve ser por `sessionId`.

Cada sessao do Harness deve mapear para no maximo um sandbox `sbx` ativo/parado.
Isso evita que duas conversas compartilhem caches, processos, instalacoes,
containers internos ou estado de filesystem fora do workspace.

Nome do sandbox:

```ts
const sandboxName = `${namePrefix}-${hash(sessionId).slice(0, 16)}`;
```

Defaults:

- `namePrefix`: `"harness"`.
- `hash`: SHA-256 em hex, calculado em cima do `sessionId`.
- Nao expor `name` fixo na v1, para evitar colisao acidental entre sessoes.

### Dois niveis de persistencia

O pacote deve suportar dois modos:

```ts
type DockerSandboxPersistence = "workspace" | "sandbox";
```

- `workspace`: default. Ao fechar, remove o sandbox. As mudancas no workspace
  continuam salvas porque o diretorio do projeto e montado do host.
- `sandbox`: ao fechar, para/pausa o sandbox. Ao reabrir a mesma sessao, reusa
  a mesma maquina, preservando pacotes instalados, caches, Docker daemon interno,
  configuracoes e arquivos fora do workspace.

`save()` nao entra na v1. Salvar checkpoint/template, como `sbx save`, e outro
caso de uso: criar uma imagem reutilizavel a partir de um sandbox configurado.
A v1 resolve apenas continuar a mesma sessao depois.

### Arquivos de entrada por sessao

Agentes podem precisar consultar arquivos salvos pelo Harness, como PDFs,
datasets, anexos de usuario ou documentos de referencia.

O caminho preferido e montar diretorios do host no sandbox, nao copiar os mesmos
arquivos a cada abertura. Como o `sbx` monta workspaces por passthrough, qualquer
arquivo novo gravado no diretorio montado no host aparece no sandbox.

Casos suportados:

- PDFs fixos para todas as sessoes: configurar `extraWorkspaces` estaticos.
- PDFs/anexos por sessao: configurar `extraWorkspaces` dinamicos a partir do
  `sessionId`, usando um segmento seguro derivado de hash em vez do `sessionId`
  cru no path.
- PDFs somente leitura: montar com `readOnly: true`.
- PDFs que o sandbox tambem pode atualizar: montar com `readOnly: false`, mas
  apenas quando isso for intencional.

Quando um workspace extra declarar `envName`, todo `exec()` deve receber essa
variavel apontando para o path absoluto montado. Exemplo: `HARNESS_FILES_DIR`
apontando para o diretorio de PDFs daquela sessao.

### `close` e `delete` precisam chegar ao sandbox

Hoje `HarnessSandboxSession.close()` nao sabe por que esta sendo chamado. Para
persistencia correta, o core deve diferenciar:

- `store.close(sessionId)`: descarrega da memoria.
- `store.delete(sessionId)`: apaga a sessao e deve destruir o sandbox associado.

Nova intencao:

```ts
type SandboxCloseReason = "close" | "delete";

interface SandboxCloseInput {
  reason: SandboxCloseReason;
}
```

Comportamento esperado:

| Operacao | `workspace` | `sandbox` |
| --- | --- | --- |
| `store.close(sessionId)` | `sbx rm --force <name>` | `sbx stop <name>` |
| `store.delete(sessionId)` | `sbx rm --force <name>` | `sbx rm --force <name>` |

Se a sessao ja estiver inativa e o host chamar `store.delete(sessionId)`, o store
deve poder pedir ao sandbox provider para destruir o recurso por `sessionId`,
mesmo sem uma `HarnessSandboxSession` aberta.

## Hardening antes do publish

- `extraWorkspaces` relativo e resolvido dentro do workspace principal e nao
  pode escapar com `..`. `extraWorkspaces` absoluto continua permitido como
  configuracao explicita/trusted do host.
- Exemplos de path por sessao usam `dockerSandboxSessionSegment(sessionId)`, um
  helper baseado em hash, para nao interpolar `sessionId` cru em paths.
- `namePrefix` e validado antes de chamar `sbx`: deve ser um segmento lower-case
  com letras, digitos e hifens, curto o suficiente para o nome final.
- `envName` em mounts extras e validado como nome de variavel de ambiente antes
  de chamar `sbx`.
- Timeout de `exec()` envia `SIGTERM` ao processo local de `sbx exec`; se ele nao
  fechar em `1000ms`, envia `SIGKILL`.
- `open()` continua usando `sbx ls -q`, mas trata erro de "already exists" no
  `sbx create shell` como reuso seguro para corridas entre processos.
- `HarnessSessionStoreImpl` lembra `sessionId -> sandbox` enquanto o store esta
  vivo. Depois de `close(sessionId)`, um `delete(sessionId)` posterior usa o
  sandbox lembrado; se nao houver lembranca, usa `config.sandbox` como fallback.
- Nao ha registry persistente novo nesta rodada. Apos restart, se a sessao usou
  sandbox override nao persistido, o host deve configurar o sandbox correto ou
  reabrir a sessao com override antes de deletar.
- `NoopSandbox`, `LocalSandbox` e `DockerSandbox` sao os alvos atuais. Providers
  futuros como E2B, Daytona ou Modal provavelmente precisarao persistir um
  `sandboxHandle`, porque usam IDs opacos.

## API Alvo

### Core

```ts
export interface HarnessSandboxOpenInput {
  sessionId: string;
  runId: string;
  agentKey: string;
  workDir: string;
  outputDir?: string;
  resources: Record<string, unknown>;
}

export interface SandboxCloseInput {
  reason: "close" | "delete";
}

export interface SandboxDestroyInput {
  sessionId: string;
  agentKey?: string;
  workDir?: string;
}

export abstract class HarnessSandbox {
  abstract readonly id: string;
  label?: string;

  abstract open(input: HarnessSandboxOpenInput): Promise<HarnessSandboxSession> | HarnessSandboxSession;

  destroy?(input: SandboxDestroyInput): Promise<void> | void;
}

export abstract class HarnessSandboxSession {
  abstract readonly id: string;
  abstract readonly workDir: string;

  abstract exec(input: SandboxExecInput): Promise<SandboxExecResult>;

  close?(input?: SandboxCloseInput): Promise<void>;
}
```

`destroy()` e opcional para compatibilidade. Sandboxes que nao persistem estado
podem ignorar.

### Package `@harness-kernel/sandbox-docker`

```ts
export interface DockerSandboxWorkspaceMount {
  hostPath: string;
  readOnly?: boolean;
  envName?: string;
}

export interface DockerSandboxOptions {
  sbxPath?: string;
  workspace?: {
    hostPath?: string;
    readOnly?: boolean;
  };
  extraWorkspaces?:
    | DockerSandboxWorkspaceMount[]
    | ((input: HarnessSandboxOpenInput) => DockerSandboxWorkspaceMount[] | Promise<DockerSandboxWorkspaceMount[]>);
  persistence?: "workspace" | "sandbox";
  namePrefix?: string;
  template?: string;
  kits?: string[];
  branch?: string | "auto";
  cpus?: number;
  memory?: string;
  env?: Record<string, string>;
  defaultTimeoutMs?: number;
}
```

Exemplo:

```ts
import { DockerSandbox, dockerSandboxSessionSegment } from "@harness-kernel/sandbox-docker";

const sandbox = new DockerSandbox({
  persistence: "sandbox",
  workspace: { hostPath: process.cwd() },
  extraWorkspaces: ({ sessionId }) => [
    {
      hostPath: `.harness-kernel/sessions/${dockerSandboxSessionSegment(sessionId)}/files`,
      readOnly: true,
      envName: "HARNESS_FILES_DIR",
    },
  ],
  cpus: 4,
  memory: "8g",
});
```

## Comportamento do `sandbox-docker`

### Abertura

1. Resolver `workspace.hostPath ?? input.workDir`.
2. Montar workspace principal no mesmo path absoluto do host, seguindo o padrao
   do `sbx`.
3. Resolver `extraWorkspaces` estaticos ou dinamicos.
4. Montar `extraWorkspaces`; quando `readOnly` for true, passar `:ro`.
   Diretorios relativos devem ser resolvidos a partir do workspace principal.
   Diretorios relativos que escapem com `..` devem ser rejeitados. Diretorios
   absolutos sao aceitos como configuracao explicita/trusted.
   Diretorios que nao existem devem ser criados pelo host antes do `sbx create`.
   Para entradas read-only, o host cria o diretorio, mas o sandbox nao pode
   escrever nele.
5. Calcular `sandboxName` a partir do `sessionId`.
6. Verificar existencia com `sbx ls --json` ou `sbx ls -q`.
7. Se nao existir, criar:

```bash
sbx create shell \
  --name <sandboxName> \
  --cpus <cpus> \
  --memory <memory> \
  --template <template> \
  --kit <kit> \
  <workspace> <extraWorkspace...>
```

8. Retornar uma `DockerSandboxSession` com `id = sandboxName`.

Se `sbx create shell` falhar com "already exists", tratar como reuso seguro.

### Execucao

`exec()` deve chamar `sbx exec`:

```bash
sbx exec \
  --workdir <cwd> \
  --env KEY=VALUE \
  <sandboxName> \
  bash -lc <command>
```

Regras:

- `cwd` deve ser resolvido dentro do workspace principal, como o local sandbox
  ja faz hoje.
- `env` deve combinar `DockerSandboxOptions.env`, variaveis derivadas de mounts
  com `envName` e `SandboxExecInput.env`, nessa ordem.
- `stdin` deve ser escrito no processo filho.
- `timeoutMs` deve mandar `SIGTERM` para o processo local do `sbx exec`, mandar
  `SIGKILL` apos `1000ms` se ele nao fechar, e retornar `timedOut: true`.
- `stdout`, `stderr`, `exitCode`, `signal` e `durationMs` seguem o contrato atual.
- Se o sandbox estiver parado, `sbx exec` deve inicia-lo automaticamente.

### Fechamento

```ts
close({ reason: "close" })
```

- `persistence: "workspace"`: `sbx rm --force <sandboxName>`.
- `persistence: "sandbox"`: `sbx stop <sandboxName>`.

```ts
close({ reason: "delete" })
```

- Sempre `sbx rm --force <sandboxName>`.

`destroy({ sessionId })` deve calcular o mesmo nome deterministico e executar
`sbx rm --force <sandboxName>`, ignorando erro de "not found".

## Mudancas no Core

1. Alterar `HarnessSandboxSession.close()` para receber `SandboxCloseInput`
   opcional, mantendo compatibilidade com implementacoes antigas.
2. Alterar `SandboxManager.close(reason)` para repassar o motivo ao sandbox.
3. Alterar `HarnessSession.close(input?)` internamente para aceitar
   `reason: "close" | "delete"`.
4. Alterar `HarnessSessionStoreImpl.close(sessionId)` para fechar com
   `reason: "close"`.
5. Alterar `HarnessSessionStoreImpl.delete(sessionId)` para:
   - se a sessao estiver ativa, fechar com `reason: "delete"`;
   - se nao estiver ativa, chamar `destroy?.({ sessionId })` no sandbox lembrado
     para a sessao, ou em `config.sandbox` como fallback;
   - depois apagar a sessao do storage.
6. Manter `LocalSandbox` compativel: ele pode ignorar `reason`, porque nao ha
   maquina persistente para preservar alem do workspace local.

## O que o usuario pode configurar

V1 deve expor apenas configuracoes que fazem sentido para `sbx`:

- `persistence`: `"workspace"` ou `"sandbox"`.
- `workspace.hostPath`: diretorio principal montado.
- `workspace.readOnly`: montar o workspace principal como read-only quando
  suportado.
- `extraWorkspaces`: diretorios adicionais estaticos ou por sessao, com suporte
  a read-only e `envName` para expor paths como `HARNESS_FILES_DIR`.
- `cpus` e `memory`: recursos do sandbox.
- `template`: imagem/template `sbx`.
- `kits`: kits declarativos do `sbx`.
- `branch`: branch/worktree mode do `sbx`.
- `env`: variaveis de ambiente para comandos.
- `defaultTimeoutMs`: timeout default de execucao.
- `sbxPath`: caminho do binario `sbx`.

Nao expor na v1:

- `image` generico de Docker comum.
- `networkMode`, `capDrop`, `privileged`, `seccomp`, `runtime`.
- `dockerode`.
- `save()`/snapshot/template generation.

Essas opcoes pertencem a um backend de container Docker puro ou a uma fase futura.
O backend desta fase e Docker Sandboxes.

## Testes

### Core

- `store.close(sessionId)` chama `session.close({ reason: "close" })`.
- `store.delete(sessionId)` chama `session.close({ reason: "delete" })` quando
  ativa.
- `store.delete(sessionId)` chama `sandbox.destroy({ sessionId })` quando a sessao
  nao esta ativa.
- Implementacoes antigas de sandbox continuam funcionando com `close()` sem args.

### Sandbox Docker unitario

Mockar `child_process.spawn` e validar:

- nome deterministico por `sessionId`;
- `sbx create shell` com workspace e extra workspaces;
- `sbx exec` com `--workdir`, `--env` e `bash -lc`;
- `extraWorkspaces` dinamico recebe `sessionId` e exporta variaveis `envName`;
- `extraWorkspaces` relativo valido e resolvido dentro do workspace principal;
- `extraWorkspaces` relativo com `..` e rejeitado antes de chamar `sbx`;
- `extraWorkspaces` absoluto e aceito como configuracao explicita/trusted;
- `envName` invalido e rejeitado antes de chamar `sbx`;
- `namePrefix` invalido e rejeitado antes de chamar `sbx`;
- erro "already exists" em `sbx create shell` e tratado como reuso seguro;
- `close` em modo `workspace` chama `sbx rm --force`;
- `close` em modo `sandbox` chama `sbx stop`;
- `delete` sempre chama `sbx rm --force`;
- `destroy({ sessionId })` remove o nome deterministico sem sessao aberta;
- timeout retorna `timedOut: true`, envia `SIGTERM` e faz fallback para
  `SIGKILL` quando o processo local de `sbx exec` nao fecha.

### Integracao opcional

Rodar apenas quando `sbx version` funcionar:

- criar sandbox, escrever arquivo no workspace, fechar, confirmar arquivo no host;
- com `persistence: "sandbox"`, instalar/criar estado fora do workspace, fechar,
  reabrir mesma sessao e confirmar estado;
- chamar `store.delete(sessionId)` e confirmar que o sandbox desaparece de
  `sbx ls -q`.

## Referencias

- Docker Sandboxes usage: https://docs.docker.com/ai/sandboxes/usage/
- Docker Sandboxes architecture: https://docs.docker.com/ai/sandboxes/architecture/
- `sbx create shell`: https://docs.docker.com/reference/cli/sbx/create/shell/
- `sbx exec`: https://docs.docker.com/reference/cli/sbx/exec/
- `sbx stop`: https://docs.docker.com/reference/cli/sbx/stop/
- `sbx rm`: https://docs.docker.com/reference/cli/sbx/rm/
- E2B persistence: https://e2b.dev/docs/sandbox/persistence
- Modal sandboxes: https://modal.com/docs/guide/sandboxes
- Codex resume: https://developers.openai.com/codex/cli/features
