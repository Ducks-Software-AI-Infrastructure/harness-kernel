import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  site: "https://ducks-software-ai-infrastructure.github.io",
  base: isGitHubPages ? "/harness-kernel" : "/",
  integrations: [
    starlight({
      title: "Harness Kernel",
      logo: {
        src: "./src/assets/harness-kernel-logo.png",
        alt: "Harness Kernel",
      },
      customCss: ["/src/styles/starlight.css"],
      components: {
        ThemeProvider: "./src/components/DarkDefaultThemeProvider.astro",
      },
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/Ducks-Software-AI-Infrastructure/harness-kernel" },
      ],
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Introduction", slug: "docs/introduction" },
            { label: "Getting Started", slug: "docs/getting-started" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Runtime vs Agent", slug: "docs/concepts/runtime-vs-agent" },
            { label: "Kernel Map", slug: "docs/concepts/kernel-map" },
            { label: "Execution Lifecycle", slug: "docs/concepts/execution-lifecycle" },
            { label: "Package Boundaries", slug: "docs/concepts/package-boundaries" },
            { label: "Model Resolution", slug: "docs/concepts/model-resolution" },
          ],
        },
        {
          label: "Agent Space",
          items: [
            { label: "Define an Agent", slug: "docs/agent/define-agent" },
            { label: "Modes", slug: "docs/agent/modes" },
            { label: "Tools", slug: "docs/agent/tools" },
            { label: "Context Providers", slug: "docs/agent/context-providers" },
            { label: "Roles", slug: "docs/agent/roles" },
            { label: "Hooks", slug: "docs/agent/hooks" },
            { label: "Events", slug: "docs/agent/events" },
            { label: "Shared State", slug: "docs/agent/shared-state" },
          ],
        },
        {
          label: "Runtime Host",
          items: [
            { label: "Session Store", slug: "docs/runtime/session-store" },
            { label: "Sessions", slug: "docs/runtime/sessions" },
            { label: "Model Providers", slug: "docs/runtime/model-providers" },
            { label: "Storage", slug: "docs/runtime/storage" },
            { label: "Sandbox", slug: "docs/runtime/sandbox" },
            { label: "Approvals", slug: "docs/runtime/approvals" },
            { label: "Logging", slug: "docs/runtime/logging" },
            { label: "Services", slug: "docs/runtime/services" },
            { label: "Streaming", slug: "docs/runtime/streaming" },
          ],
        },
        {
          label: "Schema",
          items: [
            { label: "Overview", slug: "docs/schema/overview" },
            { label: "Tool Schemas", slug: "docs/schema/tool-schemas" },
            { label: "JSON Schema", slug: "docs/schema/json-schema" },
            { label: "Zod Compatibility", slug: "docs/schema/zod-compatibility" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Core-only Agent", slug: "docs/guides/core-only-agent" },
            { label: "OpenAI Agent", slug: "docs/guides/openai-agent" },
            { label: "Custom Model Provider", slug: "docs/guides/custom-model-provider" },
            { label: "Testing Agents", slug: "docs/guides/testing-agents" },
            { label: "Custom Tool", slug: "docs/guides/custom-tool" },
            { label: "Custom Role", slug: "docs/guides/custom-role" },
            { label: "Custom Hook", slug: "docs/guides/custom-hook" },
            { label: "Context Provider", slug: "docs/guides/context-provider" },
            { label: "Tool Approval", slug: "docs/guides/tool-approval" },
            { label: "File Storage", slug: "docs/guides/file-storage" },
            { label: "Local Sandbox", slug: "docs/guides/local-sandbox" },
            { label: "CLI Agent", slug: "docs/guides/cli-agent" },
            { label: "Web App Session", slug: "docs/guides/web-app-session" },
          ],
        },
        {
          label: "Packages",
          items: [
            { label: "Core", slug: "docs/packages/core" },
            { label: "Provider OpenAI", slug: "docs/packages/provider-openai" },
            { label: "Provider AI SDK", slug: "docs/packages/provider-ai-sdk" },
            { label: "Storage File", slug: "docs/packages/storage-file" },
            { label: "Sandbox Local", slug: "docs/packages/sandbox-local" },
            { label: "Tools Node", slug: "docs/packages/tools-node" },
            { label: "Logging File", slug: "docs/packages/logging-file" },
            { label: "Create", slug: "docs/packages/create" },
          ],
        },
        {
          label: "API",
          items: [
            { label: "API Guide", slug: "docs/api" },
            { label: "Reference", slug: "docs/api/reference" },
          ],
        },
      ],
    }),
  ],
});
