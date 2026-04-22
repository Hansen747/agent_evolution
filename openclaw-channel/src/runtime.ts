let runtime: any = null;

export function setAgentevoRuntime(rt: any): void {
  runtime = rt;
}

export function getAgentevoRuntime(): any {
  if (!runtime) {
    throw new Error("AgentEvo runtime not initialized");
  }
  return runtime;
}
