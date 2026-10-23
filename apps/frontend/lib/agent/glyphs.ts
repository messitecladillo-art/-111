/** The character grammar of the agent shell: illumination bars and braille micro-charts, drawn from real scores. */

const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/**
 * A score in [0, 1] as a row of cells: ▓ a lit cell, ▒ half lit, ░ a glimmer, · dark.
 * Only a room whose every check passed is drawn solid (█): full light means verified, never "nearly".
 */
export function lightBar(score: number, cells = 4): string {
  const value = unit(score);
  if (value >= 1) return '█'.repeat(cells);
  const lit = value * cells;
  return Array.from({ length: cells }, (_, i) => {
    const fill = Math.max(0, Math.min(1, lit - i));
    return fill >= 0.875 ? '▓' : fill >= 0.5 ? '▒' : fill > 0 ? '░' : '·';
  }).join('');
}

/** Dots from the bottom of each braille column: left column 7·3·2·1, right column 8·6·5·4. */
const LEFT = [0x40, 0x04, 0x02, 0x01], RIGHT = [0x80, 0x20, 0x10, 0x08];
/** Values in [0, 1] as a braille sparkline, two values to a character, four dots of height each. */
export function brailleBars(values: readonly number[]): string {
  const dots = (value: number | undefined) => value === undefined ? 0 : Math.round(unit(value) * 4);
  let out = '';
  for (let i = 0; i < values.length; i += 2) {
    let code = 0x2800;
    for (let k = 0; k < dots(values[i]); k++) code |= LEFT[k];
    for (let k = 0; k < dots(values[i + 1]); k++) code |= RIGHT[k];
    out += String.fromCharCode(code);
  }
  return out;
}

export const percent = (score: number) => `${Math.round(unit(score) * 100)}%`;
