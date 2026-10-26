"use client";

import { useId } from 'react';
import styles from './TourAtmosphere.module.css';

// These woven surfaces are a conceptual light field, never a chart or a result.
const GOLD_RIBBON = 'M-190 828C25 900 151 744 247 523C337 315 497 236 661 303C831 373 854 523 1045 417C1221 319 1271 109 1454 33L1477 120C1320 176 1274 393 1085 495C864 615 805 462 648 398C504 339 390 408 307 587C207 805 65 982-191 921Z';
const TEAL_RIBBON = 'M-186 303C20 143 224 164 402 320C577 474 642 674 841 676C1050 678 1216 523 1408 546L1405 635C1214 611 1050 774 827 757C600 740 541 529 364 382C210 255 26 229-173 401Z';
const BLUE_RIBBON = 'M261 1165C317 968 457 903 641 874C825 845 943 918 1104 823C1243 741 1275 613 1459 592L1459 672C1304 684 1269 819 1130 900C948 1006 822 928 655 961C475 997 395 1046 344 1197Z';

const GOLD_STRANDS = Array.from({ length: 27 }, (_, index) => {
  const t = index / 26;
  return `M-190 ${828 + t * 93}C${25 + t * 40} ${900 + t * 82} ${151 + t * 56} ${744 + t * 61} ${247 + t * 60} ${523 + t * 64}C${337 + t * 53} ${315 + t * 93} ${497 + t * 7} ${236 + t * 103} ${661 - t * 13} ${303 + t * 95}C${831 - t * 26} ${373 + t * 89} ${854 + t * 10} ${523 + t * 92} ${1045 + t * 40} ${417 + t * 78}C${1221 + t * 53} ${319 + t * 74} ${1271 + t * 49} ${109 + t * 67} ${1454 + t * 23} ${33 + t * 87}`;
});

const TEAL_STRANDS = Array.from({ length: 24 }, (_, index) => {
  const t = index / 23;
  return `M${-186 + t * 13} ${303 + t * 98}C${20 + t * 6} ${143 + t * 86} ${224 - t * 14} ${164 + t * 91} ${402 - t * 38} ${320 + t * 62}C${577 - t * 36} ${474 + t * 55} ${642 - t * 42} ${674 + t * 66} ${841 - t * 14} ${676 + t * 81}C1050 ${678 + t * 96} ${1216 - t * 2} ${523 + t * 88} ${1408 - t * 3} ${546 + t * 89}`;
});

const BLUE_STRANDS = Array.from({ length: 16 }, (_, index) => {
  const t = index / 15;
  return `M${261 + t * 83} ${1165 + t * 32}C${317 + t * 78} ${968 + t * 78} ${457 + t * 18} ${903 + t * 94} ${641 + t * 14} ${874 + t * 87}C${825 - t * 3} ${845 + t * 83} ${943 + t * 5} ${918 + t * 88} ${1104 + t * 26} ${823 + t * 77}C${1243 + t * 26} ${741 + t * 78} ${1275 + t * 29} ${613 + t * 71} 1459 ${592 + t * 80}`;
});

const CROSS_THREADS = Array.from({ length: 16 }, (_, index) => {
  const y = 326 + index * 23;
  return `M${151 + index * 32} ${y + 286}C${291 + index * 27} ${y - 157} ${737 + index * 9} ${y - 173} ${1041 + index * 13} ${y - 386}`;
});

const GLINTS = [
  { x: 232, y: 677, scale: .8, tone: 'gold' },
  { x: 370, y: 370, scale: .55, tone: 'teal' },
  { x: 660, y: 331, scale: .55, tone: 'gold' },
  { x: 957, y: 484, scale: .7, tone: 'teal' },
  { x: 1112, y: 313, scale: 1, tone: 'gold' },
  { x: 957, y: 890, scale: .7, tone: 'blue' },
] as const;

/** Continuous, decorative silk-and-light terrain behind the product tour. */
export default function TourAtmosphere({ className }: { className: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ref = (name: string) => `tour-${name}-${id}`;
  const url = (name: string) => `url(#${ref(name)})`;

  return <svg className={`${className} ${styles.atmosphere}`} viewBox="0 0 1200 1000" fill="none" aria-hidden="true" focusable="false" data-visual="woven-light">
    <defs>
      <linearGradient id={ref('gold-silk')} x1="113" y1="850" x2="1244" y2="142" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F4B942" stopOpacity="0" />
        <stop offset=".17" stopColor="#F4B942" stopOpacity=".11" />
        <stop offset=".35" stopColor="#F4B942" stopOpacity=".28" />
        <stop offset=".58" stopColor="#0A1F33" stopOpacity=".14" />
        <stop offset=".77" stopColor="#F4B942" stopOpacity=".29" />
        <stop offset="1" stopColor="#F4B942" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={ref('gold-thread')} x1="70" y1="816" x2="1233" y2="138" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F4B942" stopOpacity="0" />
        <stop offset=".15" stopColor="#F4B942" stopOpacity=".4" />
        <stop offset=".34" stopColor="#F7F4ED" stopOpacity=".62" />
        <stop offset=".5" stopColor="#F4B942" stopOpacity=".25" />
        <stop offset=".7" stopColor="#F4B942" stopOpacity=".85" />
        <stop offset=".87" stopColor="#F7F4ED" stopOpacity=".66" />
        <stop offset="1" stopColor="#F4B942" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={ref('teal-silk')} x1="68" y1="235" x2="1290" y2="700" gradientUnits="userSpaceOnUse">
        <stop stopColor="#00B3A4" stopOpacity="0" />
        <stop offset=".2" stopColor="#00B3A4" stopOpacity=".24" />
        <stop offset=".46" stopColor="#0A1F33" stopOpacity=".08" />
        <stop offset=".68" stopColor="#00B3A4" stopOpacity=".28" />
        <stop offset=".88" stopColor="#2367E8" stopOpacity=".16" />
        <stop offset="1" stopColor="#00B3A4" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={ref('teal-thread')} x1="35" y1="253" x2="1317" y2="700" gradientUnits="userSpaceOnUse">
        <stop stopColor="#00B3A4" stopOpacity="0" />
        <stop offset=".19" stopColor="#00B3A4" stopOpacity=".75" />
        <stop offset=".36" stopColor="#E7EEF3" stopOpacity=".34" />
        <stop offset=".53" stopColor="#00B3A4" stopOpacity=".16" />
        <stop offset=".7" stopColor="#00B3A4" stopOpacity=".66" />
        <stop offset=".87" stopColor="#2367E8" stopOpacity=".68" />
        <stop offset="1" stopColor="#2367E8" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={ref('blue-silk')} x1="379" y1="1030" x2="1330" y2="655" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2367E8" stopOpacity="0" />
        <stop offset=".3" stopColor="#2367E8" stopOpacity=".12" />
        <stop offset=".68" stopColor="#2367E8" stopOpacity=".25" />
        <stop offset="1" stopColor="#00B3A4" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={ref('blue-thread')} x1="367" y1="1040" x2="1317" y2="642" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2367E8" stopOpacity="0" />
        <stop offset=".25" stopColor="#2367E8" stopOpacity=".2" />
        <stop offset=".58" stopColor="#2367E8" stopOpacity=".7" />
        <stop offset=".83" stopColor="#E7EEF3" stopOpacity=".4" />
        <stop offset="1" stopColor="#00B3A4" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={ref('orbit')} x1="461" y1="136" x2="1260" y2="590" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F4B942" stopOpacity="0" />
        <stop offset=".25" stopColor="#F4B942" stopOpacity=".47" />
        <stop offset=".5" stopColor="#E7EEF3" stopOpacity=".16" />
        <stop offset=".73" stopColor="#00B3A4" stopOpacity=".6" />
        <stop offset="1" stopColor="#2367E8" stopOpacity="0" />
      </linearGradient>
      <radialGradient id={ref('gold-bloom')}>
        <stop stopColor="#F4B942" stopOpacity=".24" />
        <stop offset=".3" stopColor="#F4B942" stopOpacity=".09" />
        <stop offset="1" stopColor="#F4B942" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={ref('teal-bloom')}>
        <stop stopColor="#00B3A4" stopOpacity=".21" />
        <stop offset=".4" stopColor="#00B3A4" stopOpacity=".08" />
        <stop offset="1" stopColor="#00B3A4" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={ref('blue-bloom')}>
        <stop stopColor="#2367E8" stopOpacity=".19" />
        <stop offset="1" stopColor="#2367E8" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={ref('prism')} x1="986" y1="120" x2="1125" y2="300" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F4B942" stopOpacity=".42" />
        <stop offset=".45" stopColor="#E7EEF3" stopOpacity=".12" />
        <stop offset=".63" stopColor="#00B3A4" stopOpacity=".31" />
        <stop offset="1" stopColor="#2367E8" stopOpacity=".09" />
      </linearGradient>
      <linearGradient id={ref('feather-x')}>
        <stop stopColor="white" stopOpacity="0" />
        <stop offset=".12" stopColor="white" />
        <stop offset=".84" stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={ref('feather-y')} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="white" stopOpacity="0" />
        <stop offset=".15" stopColor="white" />
        <stop offset=".85" stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
      <mask id={ref('edge-y')} x="0" y="0" width="1200" height="1000" maskUnits="userSpaceOnUse">
        <rect width="1200" height="1000" fill={url('feather-y')} />
      </mask>
      <mask id={ref('edge')} x="0" y="0" width="1200" height="1000" maskUnits="userSpaceOnUse">
        <rect width="1200" height="1000" fill={url('feather-x')} mask={url('edge-y')} />
      </mask>
      <clipPath id={ref('gold-clip')}><path d={GOLD_RIBBON} /></clipPath>
    </defs>

    <g mask={url('edge')}>
      <g className={styles.bloom} data-layer="light-volumes">
        <ellipse cx="360" cy="585" rx="348" ry="275" fill={url('gold-bloom')} />
        <ellipse cx="1010" cy="271" rx="368" ry="288" fill={url('gold-bloom')} />
        <ellipse cx="785" cy="765" rx="520" ry="298" fill={url('teal-bloom')} />
        <ellipse cx="1070" cy="745" rx="340" ry="370" fill={url('blue-bloom')} />
      </g>

      <g className={styles.blueWeave} data-layer="blue-silk">
        <path d={BLUE_RIBBON} fill={url('blue-silk')} />
        <g stroke={url('blue-thread')} strokeWidth=".65">
          {BLUE_STRANDS.map((path, index) => <path key={index} d={path} opacity={index % 4 === 0 ? .9 : .48} />)}
        </g>
      </g>

      <g className={styles.orbitalField} data-layer="orbital-field">
        <g transform="rotate(-27 885 410)" stroke={url('orbit')}>
          <ellipse cx="885" cy="410" rx="475" ry="246" strokeWidth=".8" />
          <ellipse cx="885" cy="410" rx="451" ry="233" strokeWidth=".55" opacity=".45" />
          <ellipse cx="885" cy="410" rx="407" ry="210" strokeWidth=".65" opacity=".6" />
          <ellipse cx="885" cy="410" rx="333" ry="171" strokeWidth=".5" opacity=".35" />
          <ellipse cx="885" cy="410" rx="487" ry="252" strokeWidth="1" strokeDasharray=".5 16" strokeLinecap="round" opacity=".6" />
          <ellipse className={styles.orbitalTrace} cx="885" cy="410" rx="475" ry="246" pathLength="1000" strokeWidth="1.6" strokeDasharray="9 180 64 747" opacity=".82" />
          <path d="M410 410H429M1341 410H1360M885 150V168M885 652V670" strokeWidth=".9" opacity=".7" />
        </g>
      </g>

      <g className={styles.tealWeave} data-layer="teal-silk">
        <path d={TEAL_RIBBON} fill={url('teal-silk')} />
        <g stroke={url('teal-thread')} strokeLinecap="round">
          {TEAL_STRANDS.map((path, index) => <path key={index} d={path} strokeWidth={index % 6 === 0 ? 1.05 : .55} opacity={index % 6 === 0 ? .88 : .5} />)}
          <path d={TEAL_STRANDS[3]} strokeWidth="2.1" opacity=".28" />
          <path className={styles.threadTrace} d={TEAL_STRANDS[1]} pathLength="1000" strokeWidth="1.3" strokeDasharray="1 140 34 825" opacity=".95" />
        </g>
      </g>

      <g className={styles.goldWeave} data-layer="gold-silk">
        <path d={GOLD_RIBBON} fill={url('gold-silk')} />
        <g stroke={url('gold-thread')} strokeLinecap="round">
          {GOLD_STRANDS.map((path, index) => <path key={index} d={path} strokeWidth={index % 7 === 0 ? 1.15 : .55} opacity={index % 7 === 0 ? .95 : .52} />)}
          <path d={GOLD_STRANDS[1]} strokeWidth="2.6" opacity=".22" />
          <path d={GOLD_STRANDS[25]} strokeWidth="1.4" opacity=".72" />
          <path className={styles.threadTraceReverse} d={GOLD_STRANDS[0]} pathLength="1000" strokeWidth="1.8" strokeDasharray="14 250 50 686" opacity=".9" />
        </g>
        <g clipPath={url('gold-clip')} stroke={url('gold-thread')} strokeWidth=".45" opacity=".17">
          {CROSS_THREADS.map((path, index) => <path key={index} d={path} />)}
        </g>
      </g>

      <g className={styles.prism} data-layer="prismatic-light">
        <path d="M1020 108L1112 212L1055 345L970 228Z" fill={url('prism')} />
        <path d="M1020 108L1036 226L1055 345M970 228L1036 226L1112 212" stroke={url('orbit')} strokeWidth=".8" opacity=".55" />
        <path d="M1020 108L1112 212L1055 345L970 228Z" stroke={url('prism')} strokeWidth=".7" />
        <path d="M1036 226L1207 79M1036 226L1295 257M1036 226L1199 408" stroke={url('orbit')} strokeWidth=".65" opacity=".48" />
      </g>

      <g className={styles.glints} data-layer="light-glints">
        {GLINTS.map(({ x, y, scale, tone }) => {
          const color = tone === 'gold' ? '#F4B942' : tone === 'teal' ? '#00B3A4' : '#2367E8';
          return <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${scale})`}>
            <path d="M0-13C1-3 3-1 13 0C3 1 1 3 0 13C-1 3-3 1-13 0C-3-1-1-3 0-13Z" fill={color} opacity=".56" />
            <circle r="2.1" fill="#F7F4ED" opacity=".82" />
            <circle r="7" stroke={color} strokeWidth=".6" opacity=".25" />
          </g>;
        })}
      </g>
    </g>
  </svg>;
}
