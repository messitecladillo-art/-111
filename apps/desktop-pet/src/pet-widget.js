import {
  DEFAULT_LINES,
  PET_STATES,
  SLASH_COMMANDS,
  mapAgentEventToPetState,
} from './pet-contract.js';
import {
  petRigCss,
  renderPetFrameOrVector,
  renderVectorRigSvg,
} from './vector-rig.js';

const STATE_LABELS = Object.freeze({
  idle: '待命',
  thinking: '推演中',
  working: '撰写中',
  awaiting_approval: '待确认',
  redteam_alert: '红队告警',
  error: '异常中断',
  done: '已完成',
  dragging: '拎起来了',
});

function pickLine(linesMap, key) {
  const pool = linesMap?.[key] || DEFAULT_LINES[key] || DEFAULT_LINES.idle;
  if (Array.isArray(pool) && pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (typeof pool === 'string' && pool.trim()) {
    return pool;
  }
  return DEFAULT_LINES.idle[0];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function resolveSpriteFrameUrl(framePath, { spriteBaseUrl = '', frameObjectUrls = null } = {}) {
  const normalized = String(framePath || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized) return '';
  if (frameObjectUrls && typeof frameObjectUrls === 'object') {
    if (frameObjectUrls[normalized]) return frameObjectUrls[normalized];
    const baseName = normalized.split('/').pop();
    if (baseName && frameObjectUrls[baseName]) return frameObjectUrls[baseName];
  }
  if (/^(https?:|data:|blob:|asset:|tauri:)/i.test(normalized)) {
    return normalized;
  }
  const prefix = String(spriteBaseUrl || '').replace(/\/+$/, '');
  return prefix ? `${prefix}/${normalized}` : normalized;
}

export function filterSlashCommands(query) {
  const text = String(query || '').trimStart();
  if (!text.startsWith('/')) return [];
  const token = text.split(/\s+/)[0].toLowerCase();
  return SLASH_COMMANDS.filter((item) => item.cmd.toLowerCase().startsWith(token));
}

export function petWidgetCss(rootSelector = '.evix-pet-shell') {
  return `
${petRigCss(`${rootSelector} .evix-pet-rig`)}

${rootSelector} {
  --pet-ink: #18181b;
  --pet-surface: #ffffff;
  --pet-surface-muted: #f4f4f5;
  --pet-border: #18181b;
  --pet-accent: #0f766e;
  --pet-alert: #dc2626;
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  color: var(--pet-ink);
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

${rootSelector}[data-desktop-mode="true"] {
  background: transparent;
}

${rootSelector} .evix-pet-bubble {
  position: relative;
  max-width: 280px;
  min-width: 196px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 2px solid var(--pet-border);
  background: var(--pet-surface);
  box-shadow: 0 8px 20px rgba(24, 24, 27, 0.14);
  font-size: 12.5px;
  line-height: 1.45;
  transition: opacity 160ms ease, transform 160ms ease;
  z-index: 4;
}

${rootSelector} .evix-pet-bubble.is-hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(6px) scale(0.97);
}

${rootSelector} .evix-pet-bubble::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -8px;
  width: 12px;
  height: 12px;
  background: var(--pet-surface);
  border-right: 2px solid var(--pet-border);
  border-bottom: 2px solid var(--pet-border);
  transform: translateX(-50%) rotate(45deg);
}

${rootSelector} .evix-pet-bubble[data-tone="alert"] {
  border-color: var(--pet-alert);
}

${rootSelector} .evix-pet-bubble[data-tone="alert"]::after {
  border-color: var(--pet-alert);
}

${rootSelector} .evix-pet-bubble-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

${rootSelector} .evix-pet-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: var(--pet-surface-muted);
  color: var(--pet-ink);
}

${rootSelector} .evix-pet-badge[data-state="awaiting_approval"],
${rootSelector} .evix-pet-badge[data-state="done"] {
  background: #ccfbf1;
  color: #115e59;
}

${rootSelector} .evix-pet-badge[data-state="redteam_alert"],
${rootSelector} .evix-pet-badge[data-state="error"] {
  background: #fee2e2;
  color: #991b1b;
}

${rootSelector} .evix-pet-bubble-close {
  border: 0;
  background: transparent;
  color: #71717a;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

${rootSelector} .evix-pet-bubble-close:hover {
  background: var(--pet-surface-muted);
  color: var(--pet-ink);
}

${rootSelector} .evix-pet-bubble-text {
  margin: 0;
  word-break: break-word;
}

${rootSelector} .evix-pet-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

${rootSelector} .evix-pet-pill {
  border: 1.5px solid var(--pet-border);
  background: var(--pet-surface);
  color: var(--pet-ink);
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease;
}

${rootSelector} .evix-pet-pill:hover {
  background: var(--pet-ink);
  color: #ffffff;
  transform: translateY(-1px);
}

${rootSelector} .evix-pet-stage {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  padding: 4px;
  cursor: grab;
  transition: transform 140ms ease, outline-color 140ms ease;
}

${rootSelector} .evix-pet-stage.is-dragging {
  cursor: grabbing;
}

${rootSelector} .evix-pet-stage.is-happy-bounce {
  animation: evixPetReactionPop 360ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes evixPetReactionPop {
  0% { transform: scale(1); }
  38% { transform: scale(1.06, 0.94) translateY(3px); }
  72% { transform: scale(0.97, 1.04) translateY(-5px); }
  100% { transform: scale(1); }
}

${rootSelector} .evix-pet-stage.is-file-over {
  outline: 2.5px dashed var(--pet-accent);
  outline-offset: 4px;
  background: rgba(15, 118, 110, 0.08);
}

${rootSelector} .evix-pet-drop-hint {
  position: absolute;
  inset: auto 8px 8px 8px;
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--pet-accent);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease;
}

${rootSelector} .evix-pet-stage.is-file-over .evix-pet-drop-hint {
  opacity: 1;
}

${rootSelector} .evix-pet-sprite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

${rootSelector} .evix-pet-sprite img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

${rootSelector} .evix-pet-hud {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1.5px solid var(--pet-border);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(24, 24, 27, 0.08);
}

${rootSelector} .evix-pet-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #71717a;
}

${rootSelector} .evix-pet-dot[data-state="thinking"],
${rootSelector} .evix-pet-dot[data-state="working"] {
  background: #0f766e;
}

${rootSelector} .evix-pet-dot[data-state="awaiting_approval"],
${rootSelector} .evix-pet-dot[data-state="done"] {
  background: #10b981;
}

${rootSelector} .evix-pet-dot[data-state="redteam_alert"],
${rootSelector} .evix-pet-dot[data-state="error"] {
  background: #dc2626;
}

${rootSelector} .evix-pet-cmd-toggle {
  border: 0;
  background: var(--pet-surface-muted);
  color: var(--pet-ink);
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
}

${rootSelector} .evix-pet-cmd-toggle:hover {
  background: var(--pet-ink);
  color: #ffffff;
}

${rootSelector} .evix-pet-cmdbar {
  width: 288px;
  padding: 8px;
  border-radius: 14px;
  border: 2px solid var(--pet-border);
  background: var(--pet-surface);
  box-shadow: 0 12px 28px rgba(24, 24, 27, 0.16);
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 5;
}

${rootSelector} .evix-pet-cmdbar[hidden] {
  display: none;
}

${rootSelector} .evix-pet-cmd-files {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

${rootSelector} .evix-pet-file-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 6px;
  background: #f0fdfa;
  border: 1px solid #99f6e4;
  color: #115e59;
  font-size: 10.5px;
  font-weight: 600;
}

${rootSelector} .evix-pet-file-chip button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0 2px;
  font-weight: 700;
}

${rootSelector} .evix-pet-cmd-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

${rootSelector} .evix-pet-cmd-input {
  flex: 1;
  min-width: 0;
  border: 1.5px solid #d4d4d8;
  border-radius: 9px;
  padding: 6px 9px;
  font-size: 12px;
  font-family: inherit;
  color: var(--pet-ink);
  background: #fafafa;
  outline: none;
}

${rootSelector} .evix-pet-cmd-input:focus {
  border-color: var(--pet-accent);
  background: #ffffff;
}

${rootSelector} .evix-pet-cmd-submit {
  border: 0;
  border-radius: 9px;
  padding: 6px 11px;
  font-size: 12px;
  font-weight: 700;
  background: var(--pet-ink);
  color: #ffffff;
  cursor: pointer;
}

${rootSelector} .evix-pet-cmd-submit:hover {
  background: var(--pet-accent);
}

${rootSelector} .evix-pet-slash-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 150px;
  overflow-y: auto;
}

${rootSelector} .evix-pet-slash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  border: 0;
  border-radius: 7px;
  padding: 5px 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 11.5px;
  color: var(--pet-ink);
}

${rootSelector} .evix-pet-slash-item:hover,
${rootSelector} .evix-pet-slash-item.is-active {
  background: #f0fdfa;
  color: #115e59;
}

${rootSelector} .evix-pet-slash-hint {
  color: #71717a;
  font-size: 10.5px;
}
`;
}

function ensureWidgetStyles() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('style[data-evix-pet-style="true"]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-evix-pet-style', 'true');
  style.textContent = petWidgetCss('.evix-pet-shell');
  document.head.appendChild(style);
}

export function createDesktopPetWidget(options = {}) {
  const {
    container,
    skin: initialSkin,
    spriteBaseUrl: initialSpriteBaseUrl = '',
    frameObjectUrls: initialFrameObjectUrls = null,
    initialState = 'idle',
    desktopMode: initialDesktopMode = false,
    allowFreeMove = true,
    autoInjectStyles = true,
    onCommand = null,
    onAction = null,
    onStateChange = null,
    onMove = null,
    onFilesDrop = null,
  } = options;

  if (!container) {
    throw new Error('createDesktopPetWidget requires a container element');
  }
  if (!initialSkin) {
    throw new Error('createDesktopPetWidget requires a resolved skin');
  }

  if (autoInjectStyles) {
    ensureWidgetStyles();
  }

  let skin = initialSkin;
  let spriteBaseUrl = initialSpriteBaseUrl;
  let frameObjectUrls = initialFrameObjectUrls;
  let state = PET_STATES.includes(initialState) ? initialState : 'idle';
  let stateBeforeDrag = state;
  let desktopMode = Boolean(initialDesktopMode);
  let commandBarOpen = false;
  let attachedFiles = [];
  let bubbleTimer = null;
  let spriteTimer = null;
  let reactionTimer = null;
  let activeSlashIndex = 0;
  let currentOffset = { x: 0, y: 0 };

  const root = document.createElement('div');
  root.className = 'evix-pet-shell';
  root.setAttribute('data-desktop-mode', String(desktopMode));
  root.innerHTML = `
    <div class="evix-pet-bubble is-hidden" role="status" aria-live="polite">
      <div class="evix-pet-bubble-head">
        <span class="evix-pet-badge" data-state="${escapeHtml(state)}">${escapeHtml(STATE_LABELS[state] || state)}</span>
        <button type="button" class="evix-pet-bubble-close" title="收起气泡" aria-label="收起气泡">×</button>
      </div>
      <p class="evix-pet-bubble-text"></p>
      <div class="evix-pet-actions" hidden></div>
    </div>
    <div class="evix-pet-stage" title="点击互动 · 双击唤出指令栏 · 拖拽移动">
      <div class="evix-pet-avatar-slot"></div>
      <div class="evix-pet-drop-hint">放开手，交给 EVI-X 处理</div>
    </div>
    <div class="evix-pet-hud">
      <span class="evix-pet-dot" data-state="${escapeHtml(state)}"></span>
      <span class="evix-pet-hud-name"></span>
      <span class="evix-pet-hud-state">${escapeHtml(STATE_LABELS[state] || state)}</span>
      <button type="button" class="evix-pet-cmd-toggle" title="快捷键 Ctrl+Alt+B" aria-label="打开或收起快捷指令栏">/</button>
    </div>
    <form class="evix-pet-cmdbar" hidden>
      <div class="evix-pet-cmd-files" hidden></div>
      <div class="evix-pet-cmd-row">
        <input class="evix-pet-cmd-input" type="text" aria-label="快捷指令输入" placeholder="输入研究指令或键入 / 查看快捷命令…" autocomplete="off" />
        <button class="evix-pet-cmd-submit" type="submit">发送</button>
      </div>
      <div class="evix-pet-slash-list" hidden></div>
    </form>
  `;

  container.innerHTML = '';
  container.appendChild(root);

  const bubbleEl = root.querySelector('.evix-pet-bubble');
  const badgeEl = root.querySelector('.evix-pet-badge');
  const bubbleCloseBtn = root.querySelector('.evix-pet-bubble-close');
  const bubbleTextEl = root.querySelector('.evix-pet-bubble-text');
  const actionsEl = root.querySelector('.evix-pet-actions');
  const stageEl = root.querySelector('.evix-pet-stage');
  const avatarSlotEl = root.querySelector('.evix-pet-avatar-slot');
  const dotEl = root.querySelector('.evix-pet-dot');
  const hudNameEl = root.querySelector('.evix-pet-hud-name');
  const hudStateEl = root.querySelector('.evix-pet-hud-state');
  const cmdToggleBtn = root.querySelector('.evix-pet-cmd-toggle');
  const cmdBarEl = root.querySelector('.evix-pet-cmdbar');
  const cmdFilesEl = root.querySelector('.evix-pet-cmd-files');
  const cmdInputEl = root.querySelector('.evix-pet-cmd-input');
  const slashListEl = root.querySelector('.evix-pet-slash-list');

  function clearSpriteTicker() {
    if (spriteTimer) {
      clearInterval(spriteTimer);
      spriteTimer = null;
    }
  }

  function clearBubbleTimer() {
    if (bubbleTimer) {
      clearTimeout(bubbleTimer);
      bubbleTimer = null;
    }
  }

  function renderAvatar() {
    clearSpriteTicker();
    avatarSlotEl.innerHTML = renderPetFrameOrVector({
      state,
      skin,
      spriteBaseUrl,
      className: 'evix-pet-rig',
    });

    const spriteEl = avatarSlotEl.querySelector('.evix-pet-sprite');
    if (!spriteEl) return;

    const imgEl = spriteEl.querySelector('img');
    let frames = [];
    try {
      frames = JSON.parse(spriteEl.dataset.frames || '[]');
    } catch {
      frames = [];
    }

    const resolvedFrames = frames
      .map((f) => resolveSpriteFrameUrl(f, { spriteBaseUrl, frameObjectUrls }))
      .filter(Boolean);

    const fallbackToVector = () => {
      clearSpriteTicker();
      avatarSlotEl.innerHTML = renderVectorRigSvg({
        state,
        skin,
        className: 'evix-pet-rig',
      });
    };

    if (!imgEl || resolvedFrames.length === 0) {
      fallbackToVector();
      return;
    }

    let frameIdx = 0;
    imgEl.onerror = () => {
      fallbackToVector();
    };
    imgEl.src = resolvedFrames[0];

    if (resolvedFrames.length > 1) {
      const fps = Math.max(1, Math.min(24, Number(spriteEl.dataset.fps || 4)));
      spriteTimer = setInterval(() => {
        frameIdx = (frameIdx + 1) % resolvedFrames.length;
        imgEl.src = resolvedFrames[frameIdx];
      }, Math.round(1000 / fps));
    }
  }

  function renderHud() {
    const label = STATE_LABELS[state] || state;
    badgeEl.textContent = label;
    badgeEl.setAttribute('data-state', state);
    dotEl.setAttribute('data-state', state);
    hudNameEl.textContent = skin.persona?.displayName || skin.name || skin.id;
    hudStateEl.textContent = label;
  }

  function renderFilesBar() {
    if (attachedFiles.length === 0) {
      cmdFilesEl.innerHTML = '';
      cmdFilesEl.hidden = true;
      return;
    }
    cmdFilesEl.hidden = false;
    cmdFilesEl.innerHTML = attachedFiles
      .map(
        (file, idx) => `
          <span class="evix-pet-file-chip" title="${escapeHtml(file.name)}">
            <span>${escapeHtml(file.name)}</span>
            <button type="button" data-remove-file="${idx}" aria-label="移除文件">×</button>
          </span>
        `,
      )
      .join('');
  }

  function renderSlashSuggestions() {
    const matches = filterSlashCommands(cmdInputEl.value);
    if (matches.length === 0) {
      slashListEl.hidden = true;
      slashListEl.innerHTML = '';
      activeSlashIndex = 0;
      return;
    }
    if (activeSlashIndex >= matches.length) {
      activeSlashIndex = 0;
    }
    slashListEl.hidden = false;
    slashListEl.innerHTML = matches
      .map(
        (item, idx) => `
          <button
            type="button"
            class="evix-pet-slash-item ${idx === activeSlashIndex ? 'is-active' : ''}"
            data-cmd="${escapeHtml(item.cmd)}"
          >
            <strong>${escapeHtml(item.cmd)}</strong>
            <span class="evix-pet-slash-hint">${escapeHtml(item.hint)}</span>
          </button>
        `,
      )
      .join('');
  }

  function say(text, { durationMs = 4500, actions = [], tone = 'neutral' } = {}) {
    clearBubbleTimer();
    bubbleTextEl.textContent = text || pickLine(skin.persona?.lines, state);
    bubbleEl.setAttribute('data-tone', tone);
    bubbleEl.classList.remove('is-hidden');

    if (Array.isArray(actions) && actions.length > 0) {
      actionsEl.hidden = false;
      actionsEl.innerHTML = actions
        .map(
          (act) => `
            <button
              type="button"
              class="evix-pet-pill"
              data-action-id="${escapeHtml(act.id || '')}"
              data-action-cmd="${escapeHtml(act.command || '')}"
            >${escapeHtml(act.label || act.command || '执行')}</button>
          `,
        )
        .join('');
    } else {
      actionsEl.hidden = true;
      actionsEl.innerHTML = '';
    }

    if (durationMs > 0) {
      bubbleTimer = setTimeout(() => {
        bubbleEl.classList.add('is-hidden');
      }, durationMs);
    }
  }

  function hideBubble() {
    clearBubbleTimer();
    bubbleEl.classList.add('is-hidden');
  }

  function triggerBounce() {
    if (reactionTimer) clearTimeout(reactionTimer);
    stageEl.classList.remove('is-happy-bounce');
    // Force reflow so rapid clicks replay animation cleanly
    void stageEl.offsetWidth;
    stageEl.classList.add('is-happy-bounce');
    reactionTimer = setTimeout(() => {
      stageEl.classList.remove('is-happy-bounce');
    }, 380);
  }

  function setState(
    nextState,
    {
      summary = '',
      quickActions = [],
      lineOverride = '',
      persistBubble = false,
      silent = false,
      source = 'api',
    } = {},
  ) {
    if (!PET_STATES.includes(nextState)) return state;
    const prevState = state;
    state = nextState;
    renderHud();
    renderAvatar();

    if (!silent) {
      const text = lineOverride || summary || pickLine(skin.persona?.lines, nextState);
      const isAlert = nextState === 'redteam_alert' || nextState === 'error';
      const keepOpen =
        persistBubble ||
        nextState === 'awaiting_approval' ||
        nextState === 'redteam_alert' ||
        nextState === 'error';
      say(text, {
        durationMs: keepOpen ? 0 : 4500,
        actions: quickActions,
        tone: isAlert ? 'alert' : 'neutral',
      });
    }

    if (prevState !== nextState && typeof onStateChange === 'function') {
      onStateChange({ prevState, nextState, source });
    }
    return state;
  }

  function applyAgentEvent(event) {
    const mapped = mapAgentEventToPetState(event);
    const personaLine = pickLine(skin.persona?.lines, mapped.state);
    const composedText = mapped.summary
      ? `${mapped.summary} — ${personaLine}`
      : personaLine;
    return setState(mapped.state, {
      lineOverride: composedText,
      quickActions: mapped.quickActions,
      source: 'agent_event',
    });
  }

  function setSkin(
    newSkin,
    { spriteBaseUrl: nextBaseUrl, frameObjectUrls: nextObjectUrls } = {},
  ) {
    if (!newSkin) return;
    skin = newSkin;
    if (nextBaseUrl !== undefined) spriteBaseUrl = nextBaseUrl;
    if (nextObjectUrls !== undefined) frameObjectUrls = nextObjectUrls;
    renderHud();
    renderAvatar();
    say(
      skin.persona?.tagline || pickLine(skin.persona?.lines, state),
      { durationMs: 3600 },
    );
  }

  function openCommandBar(prefill = null) {
    commandBarOpen = true;
    cmdBarEl.hidden = false;
    if (typeof prefill === 'string') {
      cmdInputEl.value = prefill;
    }
    renderFilesBar();
    renderSlashSuggestions();
    cmdInputEl.focus();
  }

  function closeCommandBar() {
    commandBarOpen = false;
    cmdBarEl.hidden = true;
    slashListEl.hidden = true;
  }

  function toggleCommandBar() {
    if (commandBarOpen) closeCommandBar();
    else openCommandBar();
  }

  function setDesktopMode(enabled) {
    desktopMode = Boolean(enabled);
    root.setAttribute('data-desktop-mode', String(desktopMode));
  }

  async function submitCommand(rawInput) {
    const text = String(rawInput || '').trim();
    if (!text && attachedFiles.length === 0) return;
    const filesSnapshot = [...attachedFiles];
    attachedFiles = [];
    cmdInputEl.value = '';
    renderFilesBar();
    renderSlashSuggestions();

    const parsedCommand = text.startsWith('/') ? text.split(/\s+/)[0] : '';
    setState('thinking', {
      lineOverride: text
        ? `收到“${text}”，正在派发给证见执行…`
        : `已收到 ${filesSnapshot.length} 份文件，正在分析…`,
      durationMs: 3600,
      source: 'command',
    });

    if (typeof onCommand === 'function') {
      await onCommand({
        command: parsedCommand,
        raw: text,
        files: filesSnapshot,
        state,
      });
    }
  }

  // Hit-zone + pointer dragging handling
  let pointerState = null;

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('button, input, form, .evix-pet-bubble')) return;
    const hitTarget = event.target.closest('[data-hit]');
    pointerState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      dragging: false,
      hitZone: hitTarget ? hitTarget.getAttribute('data-hit') : 'body',
    };
    stageEl.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;
    const totalDx = event.clientX - pointerState.startX;
    const totalDy = event.clientY - pointerState.startY;
    const stepDx = event.clientX - pointerState.lastX;
    const stepDy = event.clientY - pointerState.lastY;
    pointerState.lastX = event.clientX;
    pointerState.lastY = event.clientY;

    if (!pointerState.dragging && Math.hypot(totalDx, totalDy) >= 5) {
      pointerState.dragging = true;
      stateBeforeDrag = state === 'dragging' ? 'idle' : state;
      stageEl.classList.add('is-dragging');
      setState('dragging', { persistBubble: false, source: 'drag' });
    }

    if (pointerState.dragging) {
      if (typeof onMove === 'function') {
        onMove({
          dx: stepDx,
          dy: stepDy,
          totalDx,
          totalDy,
          pointerEvent: event,
        });
      }
      if (allowFreeMove) {
        currentOffset.x += stepDx;
        currentOffset.y += stepDy;
        root.style.transform = `translate(${currentOffset.x}px, ${currentOffset.y}px)`;
      }
    }
  };

  const handlePointerUp = (event) => {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;
    const wasDragging = pointerState.dragging;
    const hitZone = pointerState.hitZone;
    pointerState = null;
    stageEl.classList.remove('is-dragging');
    stageEl.releasePointerCapture?.(event.pointerId);

    if (wasDragging) {
      setState(stateBeforeDrag, { silent: true, source: 'drag_end' });
      hideBubble();
      return;
    }

    // Normal click interaction
    triggerBounce();
    if (hitZone === 'head') {
      say(pickLine(skin.persona?.lines, 'headpat'), { durationMs: 3500 });
    } else if (hitZone === 'prop') {
      say(pickLine(skin.persona?.lines, state), {
        durationMs: 4200,
        actions: [{ id: 'open_cmd', label: '打开指令栏', command: '' }],
      });
    } else {
      say(pickLine(skin.persona?.lines, 'poke'), { durationMs: 3500 });
    }
  };

  const handleDblClick = () => {
    toggleCommandBar();
  };

  // Drag & drop files onto pet stage
  const handleDragOver = (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    stageEl.classList.add('is-file-over');
  };

  const handleDragLeave = () => {
    stageEl.classList.remove('is-file-over');
  };

  const handleDrop = (event) => {
    event.preventDefault();
    stageEl.classList.remove('is-file-over');
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length === 0) return;

    attachedFiles = [
      ...attachedFiles,
      ...files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
        file,
      })),
    ];

    const dropLine = pickLine(skin.persona?.lines, 'fileDrop');
    say(`${dropLine}（已挂载 ${files.length} 份文件）`, {
      durationMs: 5500,
      actions: [
        { id: 'draft', label: '纳入写作上下文', command: '/draft' },
        { id: 'audit', label: '做红队体检', command: '/audit' },
      ],
    });
    openCommandBar();
    if (typeof onFilesDrop === 'function') {
      onFilesDrop(files, dropLine);
    }
  };

  // Bubble + HUD + Command bar events
  const handleBubbleClick = (event) => {
    if (event.target === bubbleCloseBtn) {
      hideBubble();
      return;
    }
    const pill = event.target.closest('.evix-pet-pill');
    if (!pill) return;
    const actionId = pill.getAttribute('data-action-id') || '';
    const actionCmd = pill.getAttribute('data-action-cmd') || '';

    if (actionId === 'open_cmd') {
      openCommandBar();
      return;
    }

    if (typeof onAction === 'function') {
      onAction({
        action: { id: actionId, label: pill.textContent, command: actionCmd },
        state,
      });
    }

    if (actionCmd) {
      submitCommand(actionCmd);
    }
  };

  const handleCmdToggle = () => toggleCommandBar();

  const handleFilesBarClick = (event) => {
    const btn = event.target.closest('button[data-remove-file]');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-remove-file'));
    attachedFiles = attachedFiles.filter((_, i) => i !== idx);
    renderFilesBar();
  };

  const handleCmdInput = () => {
    activeSlashIndex = 0;
    renderSlashSuggestions();
  };

  const handleCmdKeyDown = (event) => {
    const matches = filterSlashCommands(cmdInputEl.value);
    if (event.key === 'Escape') {
      closeCommandBar();
      return;
    }
    if (matches.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeSlashIndex = (activeSlashIndex + 1) % matches.length;
      renderSlashSuggestions();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeSlashIndex = (activeSlashIndex - 1 + matches.length) % matches.length;
      renderSlashSuggestions();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      cmdInputEl.value = `${matches[activeSlashIndex].cmd} `;
      renderSlashSuggestions();
    }
  };

  const handleSlashClick = (event) => {
    const item = event.target.closest('.evix-pet-slash-item');
    if (!item) return;
    const cmd = item.getAttribute('data-cmd') || '';
    cmdInputEl.value = `${cmd} `;
    renderSlashSuggestions();
    cmdInputEl.focus();
  };

  const handleCmdSubmit = (event) => {
    event.preventDefault();
    const matches = filterSlashCommands(cmdInputEl.value);
    if (matches.length > 0 && cmdInputEl.value.trim() === '/') {
      cmdInputEl.value = `${matches[activeSlashIndex].cmd} `;
      renderSlashSuggestions();
      return;
    }
    submitCommand(cmdInputEl.value);
  };

  const handleGlobalKeyDown = (event) => {
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      toggleCommandBar();
    }
  };

  stageEl.addEventListener('pointerdown', handlePointerDown);
  stageEl.addEventListener('pointermove', handlePointerMove);
  stageEl.addEventListener('pointerup', handlePointerUp);
  stageEl.addEventListener('pointercancel', handlePointerUp);
  stageEl.addEventListener('dblclick', handleDblClick);
  stageEl.addEventListener('dragover', handleDragOver);
  stageEl.addEventListener('dragleave', handleDragLeave);
  stageEl.addEventListener('drop', handleDrop);

  bubbleEl.addEventListener('click', handleBubbleClick);
  cmdToggleBtn.addEventListener('click', handleCmdToggle);
  cmdFilesEl.addEventListener('click', handleFilesBarClick);
  cmdInputEl.addEventListener('input', handleCmdInput);
  cmdInputEl.addEventListener('keydown', handleCmdKeyDown);
  slashListEl.addEventListener('click', handleSlashClick);
  cmdBarEl.addEventListener('submit', handleCmdSubmit);
  document.addEventListener('keydown', handleGlobalKeyDown);

  renderHud();
  renderAvatar();
  say(skin.persona?.tagline || pickLine(skin.persona?.lines, state), {
    durationMs: 3600,
  });

  return {
    root,
    setState,
    applyAgentEvent,
    setSkin,
    say,
    hideBubble,
    openCommandBar,
    closeCommandBar,
    toggleCommandBar,
    setDesktopMode,
    resetPosition() {
      currentOffset = { x: 0, y: 0 };
      root.style.transform = '';
    },
    getSnapshot() {
      return {
        state,
        skinId: skin.id,
        desktopMode,
        commandBarOpen,
        attachedFilesCount: attachedFiles.length,
        offset: { ...currentOffset },
      };
    },
    destroy() {
      clearSpriteTicker();
      clearBubbleTimer();
      if (reactionTimer) clearTimeout(reactionTimer);
      stageEl.removeEventListener('pointerdown', handlePointerDown);
      stageEl.removeEventListener('pointermove', handlePointerMove);
      stageEl.removeEventListener('pointerup', handlePointerUp);
      stageEl.removeEventListener('pointercancel', handlePointerUp);
      stageEl.removeEventListener('dblclick', handleDblClick);
      stageEl.removeEventListener('dragover', handleDragOver);
      stageEl.removeEventListener('dragleave', handleDragLeave);
      stageEl.removeEventListener('drop', handleDrop);
      bubbleEl.removeEventListener('click', handleBubbleClick);
      cmdToggleBtn.removeEventListener('click', handleCmdToggle);
      cmdFilesEl.removeEventListener('click', handleFilesBarClick);
      cmdInputEl.removeEventListener('input', handleCmdInput);
      cmdInputEl.removeEventListener('keydown', handleCmdKeyDown);
      slashListEl.removeEventListener('click', handleSlashClick);
      cmdBarEl.removeEventListener('submit', handleCmdSubmit);
      document.removeEventListener('keydown', handleGlobalKeyDown);
      container.innerHTML = '';
    },
  };
}
