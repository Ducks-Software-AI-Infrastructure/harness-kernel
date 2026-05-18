# @harness-kernel/storage-postgres

Postgres-backed `HarnessSessionStorage` for Harness Kernel.

```ts
import { PostgresSessionStorage, migrations } from "@harness-kernel/storage-postgres";

for (const migration of migrations) {
  await pool.query(migration.sql);
}

const storage = new PostgresSessionStorage({ client: pool });
```

The host owns the Postgres client or pool lifecycle. Real database tests run only when `HARNESS_KERNEL_POSTGRES_URL` is set.
