// Formatos de etiqueta (ADR-0023). Aparte para que la proyección los valide sin ciclos.

export interface LabelFormat {
  code: string;
  label: string;
  /** Tamaño de una etiqueta en milímetros. */
  widthMm: number;
  heightMm: number;
  /** Etiquetas por hoja: 1 en térmica, 10 en carta. */
  perSheet: number;
}

/** Los cuatro formatos aprobados por Fernando el 2026-10-23 (PLAN-T-013 §6). */
export const LABEL_FORMATS: LabelFormat[] = [
  { code: 'T100X50', label: 'Térmica 100 × 50 mm', widthMm: 100, heightMm: 50, perSheet: 1 },
  { code: 'R80', label: 'Rollo térmico 80 mm', widthMm: 80, heightMm: 50, perSheet: 1 },
  { code: 'R58', label: 'Rollo térmico 58 mm', widthMm: 58, heightMm: 40, perSheet: 1 },
  {
    code: 'CARTA',
    label: 'Hoja carta, 10 etiquetas de 4 × 2 pulgadas',
    widthMm: 101.6,
    heightMm: 50.8,
    perSheet: 10,
  },
];

export const MAX_COPIES = 50;
