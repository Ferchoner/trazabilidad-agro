// Codificador Code 128 de la interfaz (public/codigo128.js, ADR-0023).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Code128 = require('../public/codigo128.js') as {
  values(text: string): number[];
  modules(text: string): string;
  svg(text: string, opts?: { moduleMm?: number; heightMm?: number }): string;
};

/** Decodificador independiente: lee anchos de barras y espacios del patrón de módulos. */
function decode(bits: string): string {
  const runs: number[] = [];
  let i = 0;
  while (i < bits.length) {
    let j = i;
    while (j < bits.length && bits[j] === bits[i]) j++;
    runs.push(j - i);
    i = j;
  }
  // Tabla estándar de anchos (barra, espacio, ...) de los valores 0..106.
  const widths = PATTERNS.map((p) => p.split('').map(Number));
  const symbols: number[] = [];
  let k = 0;
  while (k < runs.length) {
    const take = symbols.length > 0 && runs.length - k === 7 ? 7 : 6;
    const chunk = runs.slice(k, k + take).join('');
    const value = widths.findIndex((w) => w.join('') === chunk);
    if (value < 0) throw new Error(`Símbolo ilegible en ${k}`);
    symbols.push(value);
    k += take;
  }
  const [start, ...rest] = symbols;
  expect(start).toBe(104);
  const stop = rest.pop();
  expect(stop).toBe(106);
  const check = rest.pop()!;
  const sum = rest.reduce((a, v, idx) => a + v * (idx + 1), start);
  expect(sum % 103).toBe(check);
  return rest.map((v) => String.fromCharCode(v + 32)).join('');
}

// ISO/IEC 15417, anchos de los 107 símbolos (el 106 es el stop de 7 elementos).
const PATTERNS =
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(
    ' ',
  );

describe('Code 128 (juego B)', () => {
  it('calcula el dígito verificador módulo 103', () => {
    // 104 + 1·44 (L) + 2·13 (-) + 3·16 (0) + 4·24 (8) + 5·18 (2) + 6·18 (2) = 516; 516 mod 103 = 1
    expect(Code128.values('L-0822')).toEqual([104, 44, 13, 16, 24, 18, 18, 1, 106]);
  });

  it('el patrón impreso se decodifica de vuelta al folio y a la tabla', () => {
    for (const code of ['L-0822', 'L-0812', 'INV1-A-M1', 'INV2-B-M3']) {
      expect(decode(Code128.modules(code))).toBe(code);
    }
  });

  it('mide 11 módulos por carácter más arranque, verificador y paro', () => {
    expect(Code128.modules('L-0822')).toHaveLength(11 * 8 + 13);
  });

  it('genera SVG con barras y tamaño en milímetros', () => {
    const svg = Code128.svg('L-0822', { moduleMm: 0.5, heightMm: 12 });
    expect(svg).toMatch(/^<svg[^>]+width="60\.5mm"[^>]+height="12mm"/);
    expect(svg).toContain('<rect');
  });

  it('rechaza caracteres fuera del juego B', () => {
    expect(() => Code128.values('L-08ñ')).toThrow();
    expect(() => Code128.values('')).toThrow();
  });
});
