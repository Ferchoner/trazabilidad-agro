// Revisión de filas del Excel del productor con las reglas de importación (BR-INT-01 a 05).
// El demo no importa archivos (T-130): muestra qué pasaría con el Excel 2026 del Productor A.

import { ProducerConfig } from './types';

export interface ExcelRow {
  row: number;
  folio: string | null;
  variety: string | null;
  greenhouse: string | null;
  sector: string | null;
  table: string | null;
  sowingDate: string | null;
  trays: number | null;
  cavities: number | null;
  planted: number | null;
  supplier: string | null;
  loss: string | null;
  notes: string | null;
}

export interface RowCheck {
  row: number;
  folio: string | null;
  variety: string | null;
  result: 'OK' | 'ADVERTENCIA' | 'ERROR';
  messages: { level: 'ERROR' | 'ADVERTENCIA'; text: string; rule: string }[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function checkExcelRows(
  rows: ExcelRow[],
  knownVarieties: string[],
  config: ProducerConfig,
): RowCheck[] {
  const seen = new Map<string, number>();
  const varieties = new Map(knownVarieties.map((v) => [v.toLowerCase(), v]));
  return rows.map((r) => {
    const messages: RowCheck['messages'] = [];
    const err = (text: string, rule: string) => messages.push({ level: 'ERROR', text, rule });
    const warn = (text: string, rule: string) =>
      messages.push({ level: 'ADVERTENCIA', text, rule });

    if (!r.folio) err('Sin folio.', 'BR-INT-02');
    else if (seen.has(r.folio))
      err(`Folio repetido (ya está en la fila ${seen.get(r.folio)}).`, 'BR-INT-02');
    else seen.set(r.folio, r.row);

    const raw = r.variety ?? '';
    const known = varieties.get(raw.trim().toLowerCase());
    if (!raw.trim()) err('Sin variedad.', 'BR-INT-02');
    else if (!known) err(`Variedad desconocida: "${raw}".`, 'BR-INT-02');
    else if (known !== raw)
      warn(`Variedad escrita como "${raw}"; se toma como ${known}.`, 'Configuración');

    if (r.sowingDate === null)
      warn('Sin fecha de siembra: el lote queda Planificado.', 'BR-INT-03');
    else if (!DATE_RE.test(r.sowingDate))
      err(`Fecha de siembra ilegible: "${r.sowingDate}".`, 'Configuración');

    if (!r.table) warn('Sin mesa: el lote se ubica en el sector.', 'Configuración');
    if (!r.planted) err('Sin cantidad sembrada.', 'BR-INT-02');
    else if (r.trays && r.cavities && r.planted > r.trays * r.cavities) {
      err(
        `Más plantas (${r.planted}) que cavidades (${r.trays} × ${r.cavities} = ${r.trays * r.cavities}).`,
        'BR-INT-02',
      );
    }
    if (!r.supplier) warn('Sin proveedor: el origen del material queda PENDIENTE.', 'BR-MAT-01');
    if (r.loss) {
      warn(
        `Merma "${r.loss}" sin causa ni fecha: entra con la causa "${config.importLossCause}" y sin fecha.`,
        'BR-INT-05',
      );
    }
    const result = messages.some((m) => m.level === 'ERROR')
      ? 'ERROR'
      : messages.length
        ? 'ADVERTENCIA'
        : 'OK';
    return { row: r.row, folio: r.folio, variety: r.variety, result, messages };
  });
}
