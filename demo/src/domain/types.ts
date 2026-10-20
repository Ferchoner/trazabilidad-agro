// Tipos del dominio del demo (ADR-0021). Nombres de código en inglés, etiquetas en español (P-32).

export type LocationLevel = 'CENTER' | 'GREENHOUSE' | 'SECTOR' | 'TABLE';
export const LEVEL_ORDER: LocationLevel[] = ['CENTER', 'GREENHOUSE', 'SECTOR', 'TABLE'];

/** Etapas que el núcleo conoce; las intermedias las define cada productor (ADR-0009, ADR-0015). */
export const CORE_STAGES = {
  planned: 'PLANIFICADO',
  sown: 'SEMBRADO',
  ready: 'LISTO_VENTA',
  closed: 'CERRADO',
  lost: 'PERDIDO',
  cancelled: 'CANCELADO',
} as const;
export const TERMINAL_STAGES: string[] = ['CERRADO', 'PERDIDO', 'CANCELADO'];

export type Hold = 'LIBRE' | 'EN_CUARENTENA';
export type Commercial = 'DISPONIBLE' | 'PARCIALMENTE_VENDIDO' | 'VENDIDO';
export type EventStatus = 'APPLIED' | 'CONFLICT' | 'VOIDED';

export type EventType =
  | 'LocationCreated'
  | 'VarietyCreated'
  | 'PlantMaterialRegistered'
  | 'ProductRegistered'
  | 'LotPlanned'
  | 'LotSown'
  | 'LotStageChanged'
  | 'LotTransferred'
  | 'LossRecorded'
  | 'LotCancelled'
  | 'LotClosed'
  | 'ApplicationRecorded'
  | 'FertilizationRecorded'
  | 'InspectionRecorded'
  | 'QuarantineStarted'
  | 'QuarantineReleased'
  | 'DispatchRecorded'
  | 'EventVoided';

export type EntityType =
  'location' | 'variety' | 'material' | 'product' | 'lot' | 'dispatch' | 'event';

/** Forma del evento de DOMAIN_MODEL.md. El estado (status) se deriva al aplicar. */
export interface TraceEvent {
  id: string;
  type: EventType;
  entityType: EntityType;
  entityId: string;
  /** Hora del dispositivo, UTC ISO. */
  occurredAt: string;
  /** Fecha de la operación (YYYY-MM-DD) si no es la del momento; null si se desconoce (BR-EVT-06). */
  operatedAt: string | null;
  /** Hora del nodo que lo recibió, UTC ISO. */
  recordedAt: string;
  userId: string;
  deviceId: string;
  nodeOrigin: string;
  deviceSeq: number;
  locationId: string | null;
  payload: Record<string, unknown>;
  payloadVersion: number;
  hash: string;
}

export interface StageConfig {
  code: string;
  label: string;
  next: string[];
  setBy: string[];
  criterion?: string;
}

export interface ProducerConfig {
  producer: {
    name: string;
    nodeCode: string;
    folioPrefix: string;
    folioDigits: number;
    lastExcelFolio: number;
    timeZone: string;
  };
  levels: Record<LocationLevel, string>;
  stages: StageConfig[];
  roles: Record<string, { label: string; can: string[] }>;
  users: { id: string; name: string; roles: string[] }[];
  lossCauses: string[];
  importLossCause: string;
  inspectionResults: Record<string, string>;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  level: LocationLevel;
  parentId: string | null;
}

export interface Variety {
  id: string;
  name: string;
}

export interface PlantMaterial {
  id: string;
  varietyId: string;
  origin: string;
  supplier: string | null;
  document: string | null;
}

export interface Product {
  id: string;
  name: string;
  activeIngredient: string;
  /** null = intervalo de seguridad desconocido (BR-LAB-02). */
  safetyIntervalDays: number | null;
}

export interface LotLoss {
  eventId: string;
  quantity: number;
  cause: string;
  date: string | null;
}

export interface LotDispatch {
  eventId: string;
  dispatchId: string;
  customer: string;
  order: string;
  quantity: number;
  date: string;
}

export interface LotApplication {
  eventId: string;
  productId: string;
  date: string;
  /** Fecha hasta la que no se entrega; null si el intervalo es desconocido. */
  until: string | null;
}

export interface Lot {
  id: string;
  folio: string;
  varietyId: string;
  plantMaterialId: string | null;
  stage: string;
  hold: Hold;
  holdReason: string | null;
  plannedQty: number;
  initialQty: number;
  currentQty: number;
  lostQty: number;
  dispatchedQty: number;
  trays: number;
  cavities: number;
  plannedAt: string | null;
  sowingDate: string | null;
  endedAt: string | null;
  locationId: string | null;
  /** Ubicaciones en el tiempo, por fecha de la operación (BR-LOT-11). */
  locationHistory: { locationId: string; from: string; eventId: string }[];
  losses: LotLoss[];
  dispatches: LotDispatch[];
  applications: LotApplication[];
  /** Eventos directos del lote y de sus ubicaciones (ADR-0012), en orden de aplicación. */
  eventIds: string[];
}

export interface DispatchRecord {
  id: string;
  eventId: string;
  customer: string;
  order: string;
  date: string;
  lines: { lotId: string; quantity: number }[];
}

export interface TraceState {
  locations: Map<string, Location>;
  varieties: Map<string, Variety>;
  materials: Map<string, PlantMaterial>;
  products: Map<string, Product>;
  lots: Map<string, Lot>;
  folios: Map<string, string>;
  dispatches: Map<string, DispatchRecord>;
  /** Último consecutivo de folio usado (ADR-0010: los nuevos siguen al último del Excel). */
  lastFolioNumber: number;
  events: Map<string, TraceEvent>;
  status: Map<string, { status: EventStatus; code?: string; reason?: string; voidedBy?: string }>;
  /** Orden de aplicación (ADR-0013). */
  order: string[];
}

export function emptyState(config: ProducerConfig): TraceState {
  return {
    locations: new Map(),
    varieties: new Map(),
    materials: new Map(),
    products: new Map(),
    lots: new Map(),
    folios: new Map(),
    dispatches: new Map(),
    lastFolioNumber: config.producer.lastExcelFolio,
    events: new Map(),
    status: new Map(),
    order: [],
  };
}
