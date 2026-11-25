/**
 * Skin-pack & telemetry contract shared by Browser Preview, Tauri v2, and PySide6 hosts.
 * Zero framework dependencies; ES2022 standard library only.
 */

export const PET_STATES = Object.freeze([
  'idle',
  'thinking',
  'working',
  'awaiting_approval',
  'redteam_alert',
  'error',
  'done',
  'dragging',
]);

/** Default fallback dialogue when a custom persona omits an event key. */
export const DEFAULT_LINES = Object.freeze({
  idle: ['在桌角候命，有调研卡壳随时敲我。'],
  thinking: ['正在对齐母洞察与抽样边界……'],
  working: ['后台节点跑起来了，我先替你盯着。'],
  awaiting_approval: ['卡在人工确认口了，批不批给句话。'],
  redteam_alert: ['先别急着导出，质控审阅发现这里有硬伤。'],
  error: ['上游卡住或触发限流了，等冷却还是查日志？'],
  done: ['这一波跑通收工，记得抽查附录脱敏。'],
  dragging: ['轻点拎，思路都快被晃散了。'],
  headpat: ['少摸头，多补几个控制变量。'],
  poke: ['我只是桌宠兼审计嘴替，不是许愿池。'],
  fileDrop: ['已收到拖入文件，准备送去预检入口扫一遍吗？'],
});

export function validateSkinManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Skin manifest must be a JSON object.');
  }
  if (raw.schema !== 'evix-pet-skin/v1') {
    throw new Error(`Unsupported skin schema: ${String(raw.schema)}`);
  }
  if (typeof raw.id !== 'string' || !/^[a-z0-9-]+$/u.test(raw.id)) {
    throw new Error('Skin id must match /^[a-z0-9-]+$/.');
  }
  if (raw.renderer !== 'vector-rig' && raw.renderer !== 'sprite-frames') {
    throw new Error(`Unsupported renderer mode: ${String(raw.renderer)}`);
  }
  if (raw.renderer === 'sprite-frames') {
    if (!raw.states || typeof raw.states !== 'object') {
      throw new Error('sprite-frames skin requires a states map.');
    }
    for (const [key, spec] of Object.entries(raw.states)) {
      if (!PET_STATES.includes(key)) {
        throw new Error(`Unknown state in skin manifest: ${key}`);
      }
      if (!spec || !Array.isArray(spec.frames) || spec.frames.some(f => typeof f !== 'string' || !f.trim())) {
        throw new Error(`State ${key} must provide a non-empty string[] frames list (or omit to fall back to vector-rig).`);
      }
    }
  }
  return raw;
}

/**
 * Merge a custom skin manifest & persona onto the built-in vector-rig defaults.
 * Missing sprite-frame states gracefully fall back to the vector skeleton.
 */
export function resolvePetSkin(manifest, persona = {}) {
  const valid = validateSkinManifest(manifest);
  const lines = {};
  for (const key of Object.keys(DEFAULT_LINES)) {
    const custom = persona?.lines?.[key];
    lines[key] = Array.isArray(custom) && custom.length ? custom.filter(Boolean) : [...DEFAULT_LINES[key]];
  }
  return {
    id: valid.id,
    name: valid.name || valid.id,
    renderer: valid.renderer,
    copyrightNotice: valid.copyrightNotice || 'local-custom-pack',
    canvasSize: valid.canvasSize || { width: 220, height: 240 },
    palette: {
      outline: '#18181B',
      fur: '#F8FAFC',
      furShadow: '#E2E8F0',
      muzzle: '#FFFFFF',
      nose: '#1E293B',
      collar: '#0F766E',
      tag: '#F59E0B',
      accent: '#10B981',
      alert: '#DC2626',
      glasses: '#18181B',
      ...(valid.palette || {}),
    },
    states: valid.states || {},
    persona: {
      displayName: persona?.displayName || valid.name || valid.id,
      tagline: persona?.tagline || '',
      lines,
    },
  };
}

/**
 * Map an EVI-X backend workflow snapshot / frontend full-report progress event
 * into a deterministic pet visual state + bubble payload.
 */
export function mapAgentEventToPetState(event) {
  if (!event || typeof event !== 'object') {
    return { state: 'idle', summary: '', quickActions: [] };
  }
  const status = String(event.status || '').toLowerCase();
  const detail = String(event.detail || event.summary || '').trim();
  const redteamHits = Array.isArray(event.redteamIssues) ? event.redteamIssues : [];
  const redteamCount =
    typeof event.redteamIssues === 'number' && Number.isFinite(event.redteamIssues)
      ? event.redteamIssues
      : redteamHits.length;

  if (status === 'dragging') {
    return { state: 'dragging', summary: detail, quickActions: [] };
  }
  if (redteamCount > 0 || status === 'redteam_alert') {
    return {
      state: 'redteam_alert',
      summary: detail || redteamHits[0] || `检测到 ${redteamCount} 处红队风险`,
      quickActions: [
        { id: 'open_blind', label: '定位盲区 /blind', command: '/blind' },
        { id: 'audit', label: '跑红队复检', command: '/audit' },
      ],
    };
  }
  if (status === 'awaiting_approval' || status === 'needs_input' || event.awaitingApproval) {
    return {
      state: 'awaiting_approval',
      summary: detail || `正在等待确认${event.awaitingApproval || '下一步节点'}`,
      quickActions: [
        { id: 'approve', label: '批准继续', command: '/approve' },
        { id: 'inspect', label: '查看详情', command: '/next' },
      ],
    };
  }
  if (status === 'failed' || status === 'blocked' || status === 'outcome_unknown' || status === 'error') {
    return {
      state: 'error',
      summary: detail || '上游执行中断或状态待核实',
      quickActions: [
        { id: 'retry_hint', label: '查看下一步', command: '/next' },
      ],
    };
  }
  if (status === 'completed' || status === 'ready' || status === 'done') {
    return {
      state: 'done',
      summary: detail || '当前阶段已跑通',
      quickActions: [
        { id: 'audit', label: '做交稿体检', command: '/audit' },
      ],
    };
  }
  if (status === 'thinking' || status === 'planning' || event.role === 'research') {
    return { state: 'thinking', summary: detail || '梳理研究框架中…', quickActions: [] };
  }
  if (status === 'running' || status === 'working' || status === 'streaming' || status === 'drafting') {
    return { state: 'working', summary: detail || '研究任务正在持续生成中…', quickActions: [] };
  }
  return { state: 'idle', summary: detail, quickActions: [] };
}

export const SLASH_COMMANDS = Object.freeze([
  { cmd: '/next', hint: '询问当前最该推进的下一步' },
  { cmd: '/blind', hint: '查看研究设计与数据质控盲区' },
  { cmd: '/audit', hint: '扫描当前草稿红队问题（因果/套话/页数）' },
  { cmd: '/approve', hint: '放行当前等待确认的审批节点' },
  { cmd: '/draft', hint: '按现有需求草拟问卷或补写当前章节' },
  { cmd: '/simulate', hint: '一键用教学模拟数据跑通全链路演示' },
]);
