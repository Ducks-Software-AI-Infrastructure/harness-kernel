import { rm } from "node:fs/promises";

await rm(new URL("../.astro/", import.meta.url), { recursive: true, force: true });
