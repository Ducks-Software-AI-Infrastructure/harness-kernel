---
title: Kernel Map
description: A compact map of agent space, runtime host ownership, and the core kernel boundary.
---

The kernel map is a compact view of the main coupling boundary. Agent space owns reusable behavior. The runtime host owns infrastructure and operational policy. `@harness-kernel/core` is the contract layer between them.

<div class="kernel-map-doc" aria-label="Agent behavior and runtime host boundary map">
  <section class="kernel-map-zone">
    <p class="kernel-map-label">agent space</p>
    <div class="kernel-map-chips">
      <span>modes</span>
      <span>tools</span>
      <span>hooks</span>
      <span>roles</span>
      <span>context</span>
      <span>events</span>
    </div>
  </section>
  <div class="kernel-map-core">
    <span aria-hidden="true"></span>
    <strong>@harness-kernel/core</strong>
    <span aria-hidden="true"></span>
  </div>
  <section class="kernel-map-zone runtime">
    <p class="kernel-map-label">runtime host</p>
    <div class="kernel-map-chips">
      <span>providers</span>
      <span>storage</span>
      <span>sandbox</span>
      <span>approvals</span>
      <span>logging</span>
      <span>sessions</span>
    </div>
  </section>
</div>

Use this map when deciding where a dependency belongs:

- If it changes what the agent is or how it behaves, keep it in agent space.
- If it changes how the application runs, observes, persists, approves, or isolates the agent, keep it in the runtime host.
- If it is a shared contract between those sides, keep it in `@harness-kernel/core` or a public subpath.

Next: [Runtime vs Agent](../runtime-vs-agent/) and [Package Boundaries](../package-boundaries/).
