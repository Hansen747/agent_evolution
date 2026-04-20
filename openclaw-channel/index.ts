import { defineBundledChannelEntry } from "openclaw/plugin-sdk/channel-entry-contract";

export default defineBundledChannelEntry({
  id: "agentevo",
  name: "AgentEvolution",
  description: "AgentEvolution platform channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "agentevoPlugin",
  },
  runtime: {
    specifier: "./runtime-api.js",
    exportName: "setAgentevoRuntime",
  },
});
