// Código de barras Code 128, juego B (ISO/IEC 15417), en SVG. Sin dependencias ni Internet
// (ADR-0023). Lo usan la interfaz (window.Code128) y las pruebas (module.exports).
'use strict';

(function (root) {
  // Anchos barra-espacio de los valores 0..106; el 106 (paro) tiene 7 elementos.
  const WIDTHS =
    '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(
      ' ',
    );
  const START_B = 104;
  const STOP = 106;
  /** Zona en blanco a cada lado, en módulos (mínimo de la norma: 10). */
  const QUIET = 10;

  /** Valores de símbolo: arranque, datos, verificador módulo 103 y paro. */
  function values(text) {
    const s = String(text ?? '');
    if (s.length === 0) throw new Error('El código está vacío.');
    const data = [...s].map((ch) => {
      const c = ch.charCodeAt(0);
      if (ch.length !== 1 || c < 32 || c > 126) throw new Error(`Carácter no válido: ${ch}`);
      return c - 32;
    });
    const check = data.reduce((sum, v, i) => sum + v * (i + 1), START_B) % 103;
    return [START_B, ...data, check, STOP];
  }

  /** Patrón de módulos: "1" barra, "0" espacio, sin zona en blanco. */
  function modules(text) {
    return values(text)
      .map((v) =>
        WIDTHS[v]
          .split('')
          .map((w, i) => (i % 2 === 0 ? '1' : '0').repeat(Number(w)))
          .join(''),
      )
      .join('');
  }

  /** Ancho total en módulos, con zona en blanco. */
  function width(text) {
    return modules(text).length + 2 * QUIET;
  }

  /** SVG con medidas en milímetros para imprimir a escala 100 %. */
  function svg(text, opts) {
    const moduleMm = opts?.moduleMm ?? 0.5;
    const heightMm = opts?.heightMm ?? 12;
    const bits = modules(text);
    const total = bits.length + 2 * QUIET;
    let rects = '';
    let x = 0;
    while (x < bits.length) {
      if (bits[x] === '1') {
        let w = 1;
        while (bits[x + w] === '1') w++;
        rects += `<rect x="${x + QUIET}" y="0" width="${w}" height="1"/>`;
        x += w;
      } else x++;
    }
    const mm = (n) => `${Math.round(n * 1000) / 1000}mm`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${mm(total * moduleMm)}" height="${mm(heightMm)}" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Código de barras ${String(text).replace(/[&<>"']/g, '')}"><rect x="0" y="0" width="${total}" height="1" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  }

  const api = { values, modules, width, svg, QUIET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Code128 = api;
})(typeof window !== 'undefined' ? window : globalThis);
