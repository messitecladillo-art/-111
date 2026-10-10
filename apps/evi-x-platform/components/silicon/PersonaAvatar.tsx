import { FIGURE_PALETTE, HAIR_TONES, type Appearance } from '@/lib/silicon/persona';

/** Flat front view of a stage figure, for lists, the inspector and the no-WebGL fallback. Decorative: callers label it. */
export default function PersonaAvatar({ appearance, size = 48, className }: { appearance: Appearance; size?: number; className?: string }) {
  const body = FIGURE_PALETTE[appearance.hue % FIGURE_PALETTE.length];
  const hair = HAIR_TONES[appearance.hair % HAIR_TONES.length];
  const scarf = FIGURE_PALETTE[(appearance.hue + 3) % FIGURE_PALETTE.length];
  const h = appearance.height;
  return <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="59" rx="15" ry="3.2" fill="currentColor" opacity=".16"/>
    <g transform={`translate(32 59) scale(${h}) translate(-32 -59)`}>
      {appearance.accessory === 'backpack' && <rect x="20" y="33" width="24" height="18" rx="4" fill={body} style={{ filter: 'brightness(.55)' }}/>}
      <path d="M21 58c0-4 1.5-6 3.2-9 1.4-3.2 2-8 2.6-13 .5-3 2.4-5 5.2-5s4.7 2 5.2 5c.6 5 1.2 9.8 2.6 13 1.7 3 3.2 5 3.2 9Z" fill={body}/>
      <path d="M24.5 40c-2 3-3.4 6-3.6 9M39.5 40c2 3 3.4 6 3.6 9" stroke={body} strokeWidth="3.6" strokeLinecap="round" fill="none" style={{ filter: 'brightness(.82)' }}/>
      {appearance.accessory === 'scarf' && <><rect x="25.5" y="29.5" width="13" height="4.4" rx="2.2" fill={scarf}/><rect x="33.5" y="31" width="3.6" height="9" rx="1.6" fill={scarf}/></>}
      {appearance.accessory === 'satchel' && <><path d="M26 31 40 47" stroke="#8a5a3c" strokeWidth="1.6"/><rect x="37" y="44" width="8" height="6.5" rx="1.4" fill="#8a5a3c"/></>}
      <path d="M32 11.5 41 16.8v10.4L32 32.5l-9-5.3V16.8Z" fill={`color-mix(in srgb, ${body} 26%, #fff)`}/>
      <path d="M32 11.5 41 16.8 32 22 23 16.8Z" fill="#fff" opacity=".45"/>
      <path d="M32 22v10.5M23 16.8 32 22l9-5.2" stroke="#0a1f33" strokeOpacity=".12" strokeWidth=".7" fill="none"/>
      <path d="M22.6 18.6c.4-5.4 4.4-8.6 9.4-8.6s9 3.2 9.4 8.6c-2.6-2.4-5.8-3.6-9.4-3.6s-6.8 1.2-9.4 3.6Z" fill={hair}/>
      <circle cx="28.6" cy="23.6" r="1.35" fill="#0a1f33"/><circle cx="35.4" cy="23.6" r="1.35" fill="#0a1f33"/>
      {appearance.accessory === 'glasses' && <g stroke="#0a1f33" strokeWidth="1.1" fill="none"><circle cx="28.6" cy="23.6" r="2.9"/><circle cx="35.4" cy="23.6" r="2.9"/><path d="M31.5 23.4h1"/></g>}
      {appearance.hat === 'cap' && <path d="M22.4 17.4c.6-5 4.6-8 9.6-8s9 3 9.6 8Zm16 0h7.2c.6 0 .6 1.4 0 1.4H38Z" fill={body} style={{ filter: 'brightness(.6)' }}/>}
      {appearance.hat === 'beret' && <ellipse cx="33" cy="12.6" rx="10.4" ry="3.6" transform="rotate(-8 33 12.6)" fill="#2b3a55"/>}
      {appearance.hat === 'hardhat' && <><path d="M22.4 17c.5-5.2 4.6-8.4 9.6-8.4s9.1 3.2 9.6 8.4Z" fill="#f4b942"/><rect x="19.4" y="16.4" width="25.2" height="2" rx="1" fill="#f4b942"/><rect x="31" y="8.6" width="2" height="8" fill="#d99a24"/></>}
      {appearance.hat === 'bucket' && <><path d="M25 16.5 26 10h12l1 6.5Z" fill="#cbbd93"/><path d="M20 18.8 25 16h14l5 2.8Z" fill="#b9aa7e"/></>}
      {appearance.hat === 'top' && <><rect x="26" y="3.6" width="12" height="12.4" rx="1.2" fill="#151b24"/><rect x="21.4" y="15.4" width="21.2" height="2" rx="1" fill="#151b24"/></>}
    </g>
  </svg>;
}
