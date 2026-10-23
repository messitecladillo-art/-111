export const CONTROL_CAPABILITIES = {
  registryRead: true,
  registryCreate: true,
  evaluateGate: false,
  advanceControlStatus: false,
  handoff: false,
  executorConnected: false,
  reason: "control_plane_unavailable",
  message:
    "可信 agentctl 执行器尚未连接；网页仅登记和读取项目，不判定 Gate、不推进阶段、不签发交接结论。",
} as const;
