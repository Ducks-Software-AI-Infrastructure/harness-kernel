---
title: "@harness-kernel/storage-postgres"
description: Postgres-backed session storage for Harness Kernel.
---

`@harness-kernel/storage-postgres` provides `PostgresSessionStorage`, a session-centric storage backend for hosts that want durable sessions in Postgres.

```ts
import { PostgresSessionStorage, migrations } from "@harness-kernel/storage-postgres";

const storage = new PostgresSessionStorage({ client: pool });

for (const migration of migrations) {
  await pool.query(migration.sql);
}
```

The runtime host attaches it to the session store:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  storage,
});
```

The package expects the host to own the Postgres pool/client lifecycle. Tests that require a real database run only when `HARNESS_KERNEL_POSTGRES_URL` is configured.
