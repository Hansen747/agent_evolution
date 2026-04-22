import type { OpenClawPluginApi } from "openclaw/plugin-sdk/channel-entry-contract";
import { agentevoPlugin } from "./src/channel.js";
import { setAgentevoRuntime } from "./src/runtime.js";

export default {
  id: "agentevo",
  name: "AgentEvolution",
  description: "AgentEvolution platform channel plugin",

  register(api: OpenClawPluginApi) {
    setAgentevoRuntime(api.runtime as any);
    api.registerChannel({ plugin: agentevoPlugin as any });
  },
};
