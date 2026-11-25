/**
 * Articulated bold-ink SVG vector skeleton & hybrid sprite-frame fallback renderer.
 * Designed for transparent always-on-top overlays (Tauri/PySide6) and web panels alike.
 */

import { PET_STATES } from './pet-contract.js';

export function petRigCss(rootSelector = '.evix-pet-rig') {
  return `
${rootSelector} {
  display: block;
  overflow: visible;
  user-select: none;
  -webkit-user-select: none;
}
${rootSelector} [data-bone="tail"] {
  transform-box: fill-box;
  transform-origin: 15% 75%;
  animation: evix-pet-tail 2.4s ease-in-out infinite;
}
${rootSelector} [data-bone="torso"] {
  transform-box: fill-box;
  transform-origin: 50% 90%;
  animation: evix-pet-breathe 3.2s ease-in-out infinite;
}
${rootSelector} [data-bone="head"] {
  transform-box: fill-box;
  transform-origin: 50% 85%;
  animation: evix-pet-head-idle 3.2s ease-in-out infinite;
}
${rootSelector} [data-bone="eyelids"] {
  transform-box: fill-box;
  transform-origin: 50% 0%;
  animation: evix-pet-blink 4.8s ease-in-out infinite;
}
${rootSelector} [data-bone="ear-left"],
${rootSelector} [data-bone="ear-right"] {
  transform-box: fill-box;
  transform-origin: 50% 10%;
}
${rootSelector} [data-bone="fx"] {
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: evix-pet-float 2s ease-in-out infinite;
}

/* State-specific bone kinetics */
${rootSelector}[data-state="working"] [data-bone="arm-left"] {
  transform-box: fill-box;
  transform-origin: 85% 20%;
  animation: evix-pet-type 0.28s steps(2, end) infinite;
}
${rootSelector}[data-state="working"] [data-bone="arm-right"] {
  transform-box: fill-box;
  transform-origin: 15% 20%;
  animation: evix-pet-type 0.28s steps(2, end) infinite reverse;
}
${rootSelector}[data-state="working"] [data-bone="head"] {
  animation: evix-pet-nod 0.56s ease-in-out infinite;
}
${rootSelector}[data-state="thinking"] [data-bone="head"] {
  animation: evix-pet-tilt 2.6s ease-in-out infinite;
}
${rootSelector}[data-state="thinking"] [data-bone="ear-right"] {
  animation: evix-pet-ear-twitch 2.6s ease-in-out infinite;
}
${rootSelector}[data-state="redteam_alert"] [data-bone="torso"],
${rootSelector}[data-state="error"] [data-bone="torso"] {
  animation: evix-pet-alert-pulse 1.1s ease-in-out infinite;
}
${rootSelector}[data-state="redteam_alert"] [data-bone="head"] {
  animation: evix-pet-shake 0.7s ease-in-out 1;
}
${rootSelector}[data-state="awaiting_approval"] [data-bone="prop"] {
  transform-box: fill-box;
  transform-origin: 50% 90%;
  animation: evix-pet-bob-fast 1.2s ease-in-out infinite;
}
${rootSelector}[data-state="done"] [data-bone="torso"] {
  animation: evix-pet-celebrate 0.9s ease-in-out infinite;
}
${rootSelector}[data-state="dragging"] [data-bone="shadow"] {
  opacity: 0.25;
  transform: scale(0.75);
}
${rootSelector}[data-state="dragging"] [data-bone="torso"] {
  animation: evix-pet-dangle 0.5s ease-in-out infinite;
}
${rootSelector}[data-state="dragging"] [data-bone="legs"] {
  transform-box: fill-box;
  transform-origin: 50% 0%;
  animation: evix-pet-kick 0.35s ease-in-out infinite;
}

@keyframes evix-pet-breathe {
  0%, 100% { transform: translateY(0) scaleY(1); }
  50% { transform: translateY(1.5px) scaleY(0.985); }
}
@keyframes evix-pet-head-idle {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(1.8px) rotate(1.2deg); }
}
@keyframes evix-pet-tail {
  0%, 100% { transform: rotate(-6deg); }
  50% { transform: rotate(10deg); }
}
@keyframes evix-pet-blink {
  0%, 92%, 100% { transform: scaleY(0.05); opacity: 0; }
  95%, 97% { transform: scaleY(1); opacity: 1; }
}
@keyframes evix-pet-type {
  0% { transform: translateY(0) rotate(-4deg); }
  100% { transform: translateY(5px) rotate(6deg); }
}
@keyframes evix-pet-nod {
  0%, 100% { transform: translateY(2px) rotate(-1.5deg); }
  50% { transform: translateY(4px) rotate(1.5deg); }
}
@keyframes evix-pet-tilt {
  0%, 100% { transform: rotate(-5deg) translateY(0); }
  50% { transform: rotate(-8deg) translateY(1px); }
}
@keyframes evix-pet-ear-twitch {
  0%, 75%, 100% { transform: rotate(0deg); }
  82% { transform: rotate(-12deg); }
  90% { transform: rotate(4deg); }
}
@keyframes evix-pet-alert-pulse {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2.5px); }
}
@keyframes evix-pet-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px) rotate(-2deg); }
  75% { transform: translateX(4px) rotate(2deg); }
}
@keyframes evix-pet-bob-fast {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-4px) rotate(2deg); }
}
@keyframes evix-pet-celebrate {
  0%, 100% { transform: translateY(0) scale(1); }
  45% { transform: translateY(-6px) scale(1.015); }
}
@keyframes evix-pet-dangle {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}
@keyframes evix-pet-kick {
  0%, 100% { transform: rotate(-8deg); }
  50% { transform: rotate(8deg); }
}
@keyframes evix-pet-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
`.trim();
}

function renderEyesAndBrows(state, p) {
  // Expressive eye/brow variations inspired by clean bold-ink comic minimalism
  if (state === 'redteam_alert') {
    return `
      <path d="M84 62 Q92 56 100 62" fill="none" stroke="${p.outline}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M114 62 Q122 56 130 62" fill="none" stroke="${p.outline}" stroke-width="2.6" stroke-linecap="round"/>
      <ellipse cx="93" cy="70" rx="7" ry="6.5" fill="#FFFFFF" stroke="${p.outline}" stroke-width="2.6"/>
      <ellipse cx="121" cy="70" rx="7" ry="6.5" fill="#FFFFFF" stroke="${p.outline}" stroke-width="2.6"/>
      <line x1="86" y1="68" x2="100" y2="68" stroke="${p.outline}" stroke-width="2.5"/>
      <line x1="114" y1="68" x2="128" y2="68" stroke="${p.outline}" stroke-width="2.5"/>
      <circle cx="94" cy="72" r="2.2" fill="${p.outline}"/>
      <circle cx="122" cy="72" r="2.2" fill="${p.outline}"/>
    `;
  }
  if (state === 'done') {
    return `
      <path d="M86 71 Q93 63 100 71" fill="none" stroke="${p.outline}" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M114 71 Q121 63 128 71" fill="none" stroke="${p.outline}" stroke-width="3.2" stroke-linecap="round"/>
    `;
  }
  const pupilY = state === 'working' ? 72.5 : state === 'thinking' ? 68.5 : 70.5;
  const pupilXOffset = state === 'thinking' ? -1.5 : 0;
  return `
    <g data-bone="eyes">
      <path d="M85 ${state === 'thinking' ? 60 : 62} L99 ${state === 'error' ? 59 : 61}" fill="none" stroke="${p.outline}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M115 ${state === 'error' ? 59 : 61} L129 ${state === 'thinking' ? 57 : 62}" fill="none" stroke="${p.outline}" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="93" cy="70.5" rx="6.8" ry="7.2" fill="#FFFFFF" stroke="${p.outline}" stroke-width="2.6"/>
      <ellipse cx="121" cy="70.5" rx="6.8" ry="7.2" fill="#FFFFFF" stroke="${p.outline}" stroke-width="2.6"/>
      <circle cx="${94 + pupilXOffset}" cy="${pupilY}" r="2.3" fill="${p.outline}"/>
      <circle cx="${122 + pupilXOffset}" cy="${pupilY}" r="2.3" fill="${p.outline}"/>
      <g data-bone="eyelids">
        <ellipse cx="93" cy="70.5" rx="6.5" ry="7" fill="${p.fur}"/>
        <ellipse cx="121" cy="70.5" rx="6.5" ry="7" fill="${p.fur}"/>
      </g>
    </g>
  `;
}

function renderMouth(state, p) {
  switch (state) {
    case 'done':
      return `<path d="M98 99 Q110 109 124 98" fill="none" stroke="${p.outline}" stroke-width="2.8" stroke-linecap="round"/>`;
    case 'redteam_alert':
      return `<path d="M97 103 Q106 97 115 103 Q120 106 125 101" fill="none" stroke="${p.outline}" stroke-width="2.8" stroke-linecap="round"/>`;
    case 'error':
      return `<ellipse cx="111" cy="103" rx="5.5" ry="4" fill="#FEE2E2" stroke="${p.outline}" stroke-width="2.6"/>`;
    case 'dragging':
      return `<path d="M100 104 Q111 97 121 104" fill="none" stroke="${p.outline}" stroke-width="2.8" stroke-linecap="round"/>`;
    default:
      return `<path d="M99 101 Q112 104 123 99" fill="none" stroke="${p.outline}" stroke-width="2.6" stroke-linecap="round"/>`;
  }
}

function renderPropAndFx(state, p) {
  switch (state) {
    case 'working':
      return {
        arms: `
          <path data-bone="arm-left" d="M77 148 Q66 164 88 171" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-left" d="M77 148 Q66 164 88 171" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 148 Q152 164 130 171" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 148 Q152 164 130 171" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
        `,
        prop: `
          <g data-bone="prop" data-hit="prop" style="cursor:pointer">
            <rect x="74" y="167" width="72" height="24" rx="5" fill="#334155" stroke="${p.outline}" stroke-width="3"/>
            <rect x="82" y="152" width="56" height="17" rx="3" fill="#F8FAFC" stroke="${p.outline}" stroke-width="2.6"/>
            <line x1="89" y1="158" x2="128" y2="158" stroke="#94A3B8" stroke-width="2.2" stroke-linecap="round"/>
            <line x1="89" y1="163" x2="117" y2="163" stroke="${p.accent}" stroke-width="2.2" stroke-linecap="round"/>
            <rect x="82" y="173" width="56" height="10" rx="2" fill="#CBD5E1" stroke="${p.outline}" stroke-width="2"/>
          </g>
        `,
        fx: `
          <g data-bone="fx">
            <circle cx="166" cy="46" r="4" fill="${p.accent}"/>
            <circle cx="178" cy="56" r="3" fill="${p.tag}"/>
          </g>
        `,
      };
    case 'awaiting_approval':
      return {
        arms: `
          <path data-bone="arm-left" d="M78 148 Q64 166 78 178" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-left" d="M78 148 Q64 166 78 178" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 146 Q168 138 181 122" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 146 Q168 138 181 122" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
        `,
        prop: `
          <g data-bone="prop" data-hit="prop" style="cursor:pointer">
            <line x1="182" y1="138" x2="182" y2="96" stroke="${p.outline}" stroke-width="3.5" stroke-linecap="round"/>
            <rect x="159" y="74" width="46" height="28" rx="6" fill="${p.collar}" stroke="${p.outline}" stroke-width="2.8"/>
            <text x="182" y="93" text-anchor="middle" font-size="13" font-weight="700" fill="#FFFFFF">待批准</text>
          </g>
        `,
        fx: '',
      };
    case 'redteam_alert':
      return {
        arms: `
          <path data-bone="arm-left" d="M78 146 Q56 124 72 92" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-left" d="M78 146 Q56 124 72 92" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 148 Q162 162 154 176" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 148 Q162 162 154 176" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
        `,
        prop: '',
        fx: `
          <g data-bone="fx">
            <circle cx="164" cy="48" r="15" fill="${p.alert}" stroke="${p.outline}" stroke-width="2.8"/>
            <text x="164" y="54" text-anchor="middle" font-size="18" font-weight="900" fill="#FFFFFF">!</text>
          </g>
        `,
      };
    case 'error':
      return {
        arms: `
          <path data-bone="arm-left" d="M78 148 Q58 156 54 142" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-left" d="M78 148 Q58 156 54 142" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 148 Q162 154 166 136" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 148 Q162 154 166 136" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
        `,
        prop: `
          <g data-bone="prop" data-hit="prop" style="cursor:pointer">
            <line x1="166" y1="134" x2="177" y2="119" stroke="${p.outline}" stroke-width="3.5" stroke-linecap="round"/>
            <circle cx="184" cy="109" r="12" fill="#E0F2FE" fill-opacity="0.7" stroke="${p.outline}" stroke-width="3"/>
          </g>
        `,
        fx: `
          <g data-bone="fx">
            <path d="M153 45 Q159 55 153 60 Q147 55 153 45Z" fill="#38BDF8" stroke="${p.outline}" stroke-width="2"/>
          </g>
        `,
      };
    case 'thinking':
      return {
        arms: `
          <path data-bone="arm-left" d="M78 148 Q64 166 78 178" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-left" d="M78 148 Q64 166 78 178" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 148 Q154 132 131 111" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 148 Q154 132 131 111" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
        `,
        prop: '',
        fx: `
          <g data-bone="fx">
            <circle cx="164" cy="48" r="14" fill="#FFFFFF" stroke="${p.outline}" stroke-width="2.6"/>
            <text x="164" y="54" text-anchor="middle" font-size="16" font-weight="800" fill="${p.collar}">?</text>
          </g>
        `,
      };
    case 'done':
      return {
        arms: `
          <path data-bone="arm-left" d="M78 148 Q64 166 78 178" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-left" d="M78 148 Q64 166 78 178" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 146 Q162 138 170 116" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 146 Q162 138 170 116" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
        `,
        prop: `
          <g data-bone="prop" data-hit="prop" style="cursor:pointer">
            <polygon points="158,92 184,92 171,108" fill="#A7F3D0" stroke="${p.outline}" stroke-width="2.6" stroke-linejoin="round"/>
            <line x1="171" y1="108" x2="171" y2="122" stroke="${p.outline}" stroke-width="2.6"/>
            <line x1="163" y1="122" x2="179" y2="122" stroke="${p.outline}" stroke-width="2.6" stroke-linecap="round"/>
          </g>
        `,
        fx: `
          <g data-bone="fx">
            <path d="M54 50 L57 58 L65 61 L57 64 L54 72 L51 64 L43 61 L51 58 Z" fill="${p.tag}" stroke="${p.outline}" stroke-width="1.6"/>
            <path d="M168 42 L170 47 L175 49 L170 51 L168 56 L166 51 L161 49 L166 47 Z" fill="${p.accent}" stroke="${p.outline}" stroke-width="1.4"/>
          </g>
        `,
      };
    case 'dragging':
      return {
        arms: `
          <path data-bone="arm-left" d="M78 146 Q56 156 54 172" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-left" d="M78 146 Q56 156 54 172" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 146 Q164 156 166 172" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 146 Q164 156 166 172" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
        `,
        prop: '',
        fx: '',
      };
    case 'idle':
    default:
      return {
        arms: `
          <path data-bone="arm-left" d="M78 148 Q64 166 78 178" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-left" d="M78 148 Q64 166 78 178" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 148 Q161 154 166 138" fill="none" stroke="${p.outline}" stroke-width="11" stroke-linecap="round"/>
          <path data-bone="arm-right" d="M141 148 Q161 154 166 138" fill="none" stroke="${p.fur}" stroke-width="5.5" stroke-linecap="round"/>
        `,
        prop: `
          <g data-bone="prop" data-hit="prop" style="cursor:pointer">
            <polygon points="155,118 179,118 167,132" fill="#E0F2FE" stroke="${p.outline}" stroke-width="2.5" stroke-linejoin="round"/>
            <line x1="167" y1="132" x2="167" y2="143" stroke="${p.outline}" stroke-width="2.5"/>
            <line x1="160" y1="143" x2="174" y2="143" stroke="${p.outline}" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="169" cy="121" r="2.2" fill="${p.accent}"/>
          </g>
        `,
        fx: '',
      };
  }
}

export function renderVectorRigSvg({ state = 'idle', skin, className = 'evix-pet-rig' }) {
  const safeState = PET_STATES.includes(state) ? state : 'idle';
  const p = skin.palette;
  const { arms, prop, fx } = renderPropAndFx(safeState, p);
  const glasses = skin.features?.glasses !== false
    ? `
      <g data-bone="glasses">
        <rect x="81" y="61" width="24" height="19" rx="5" fill="none" stroke="${p.glasses}" stroke-width="2.8"/>
        <rect x="109" y="61" width="24" height="19" rx="5" fill="none" stroke="${p.glasses}" stroke-width="2.8"/>
        <line x1="105" y1="70" x2="109" y2="70" stroke="${p.glasses}" stroke-width="2.8"/>
        <line x1="75" y1="68" x2="81" y2="69" stroke="${p.glasses}" stroke-width="2.5"/>
      </g>
    `
    : '';
  const collar = skin.features?.collar !== false
    ? `
      <g data-bone="collar">
        <path d="M84 123 Q110 131 136 123 L138 134 Q110 142 82 134 Z" fill="${p.collar}" stroke="${p.outline}" stroke-width="2.8" stroke-linejoin="round"/>
        <circle cx="110" cy="142" r="7" fill="${p.tag}" stroke="${p.outline}" stroke-width="2.4"/>
        <text x="110" y="145" text-anchor="middle" font-size="8" font-weight="800" fill="${p.outline}">E</text>
      </g>
    `
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 240" width="${skin.canvasSize?.width || 220}" height="${skin.canvasSize?.height || 240}" class="${className}" data-state="${safeState}" role="img" aria-label="${skin.persona?.displayName || skin.name}">
  <ellipse data-bone="shadow" cx="110" cy="218" rx="54" ry="11" fill="#0F172A" fill-opacity="0.14"/>
  <g data-bone="tail">
    <path d="M78 182 Q52 174 48 152 Q58 160 80 171 Z" fill="${p.fur}" stroke="${p.outline}" stroke-width="3.2" stroke-linejoin="round"/>
  </g>
  <g data-bone="legs">
    <path d="M90 192 L88 214 Q95 218 103 214 L103 194" fill="${p.fur}" stroke="${p.outline}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M117 194 L117 214 Q125 218 132 214 L130 192" fill="${p.fur}" stroke="${p.outline}" stroke-width="3.2" stroke-linejoin="round"/>
  </g>
  <g data-bone="torso" data-hit="body" style="cursor:grab">
    <path d="M84 126 Q73 162 78 194 Q110 202 142 194 Q147 162 136 126 Z" fill="${p.fur}" stroke="${p.outline}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M96 142 Q110 147 124 142 Q127 168 122 189 Q110 192 98 189 Q93 168 96 142 Z" fill="${p.furShadow}" fill-opacity="0.55"/>
    ${collar}
    ${arms}
  </g>
  <g data-bone="head" data-hit="head" style="cursor:pointer">
    <path data-bone="ear-left" d="M76 58 Q61 62 63 87 Q71 91 79 79 Z" fill="${p.furShadow}" stroke="${p.outline}" stroke-width="3.2" stroke-linejoin="round"/>
    <path data-bone="ear-right" d="M141 58 Q156 62 154 87 Q146 91 138 79 Z" fill="${p.furShadow}" stroke="${p.outline}" stroke-width="3.2" stroke-linejoin="round"/>
    <ellipse cx="109" cy="82" rx="35" ry="42" fill="${p.fur}" stroke="${p.outline}" stroke-width="3.2"/>
    <path d="M100 80 Q138 76 148 92 Q146 111 108 111 Q93 108 94 94 Z" fill="${p.muzzle}" stroke="${p.outline}" stroke-width="3.2" stroke-linejoin="round"/>
    <ellipse cx="145" cy="87" rx="8.5" ry="6.2" fill="${p.nose}" stroke="${p.outline}" stroke-width="2.4"/>
    <ellipse cx="147" cy="85" rx="2.5" ry="1.4" fill="#FFFFFF" fill-opacity="0.5"/>
    ${renderEyesAndBrows(safeState, p)}
    ${glasses}
    ${renderMouth(safeState, p)}
  </g>
  ${prop}
  ${fx}
</svg>`;
}

/** Render either custom sprite frames for a state (if present) or fall back to the vector skeleton. */
export function renderPetFrameOrVector({ state = 'idle', skin, spriteBaseUrl = '', className = 'evix-pet-rig' }) {
  const safeState = PET_STATES.includes(state) ? state : 'idle';
  const spec = skin.renderer === 'sprite-frames' ? skin.states?.[safeState] : null;
  if (spec && Array.isArray(spec.frames) && spec.frames.length > 0) {
    const firstSrc = spriteBaseUrl ? `${spriteBaseUrl.replace(/\/$/, '')}/${spec.frames[0]}` : spec.frames[0];
    const framesAttr = JSON.stringify(
      spec.frames.map(f => (spriteBaseUrl ? `${spriteBaseUrl.replace(/\/$/, '')}/${f}` : f)),
    ).replaceAll('"', '&quot;');
    const w = skin.canvasSize?.width || 220;
    const h = skin.canvasSize?.height || 240;
    return `<div class="${className} evix-pet-sprite" data-state="${safeState}" data-fps="${Number(spec.fps || 6)}" data-frames="${framesAttr}" style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;"><img src="${firstSrc}" alt="${skin.persona?.displayName || skin.name}" style="max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;user-select:none;" /></div>`;
  }
  return renderVectorRigSvg({ state: safeState, skin, className });
}
