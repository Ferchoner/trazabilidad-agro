# DOMAIN MODEL

Estado: borrador del Sprint 0 (T-003). Los nombres de código están en inglés (P-32); las etiquetas en pantalla, en español.

## Mapa de contextos

| Contexto | Responsabilidad | Aggregates |
|---|---|---|
| Locations | Jerarquía física del productor | `Location` |
| Agronomy Catalog | Variedades y material vegetal | `Variety`, `PlantMaterial` |
| Lots | Ciclo de vida, cantidades, charolas y genealogía del lote | `Lot`, `Tray` |
| Identification | Códigos físicos asociados a entidades | `Identifier` |
| Crop Operations | Riego, fertilización, aplicaciones | (eventos sobre `Lot` o `Location`) |
| Quality | Inspección, cuarentena, control de calidad | (eventos sobre `Lot`) |
| Dispatch | Entregas a clientes del productor | (eventos sobre `Lot`) |
| Traceability Queries | Hacia atrás, hacia adelante, reportes | Solo lectura sobre proyecciones |
| Integration | Importación/exportación Excel y CSV | — |
| Sync | Cola, envío, recepción, conflictos entre nodos | `Node`, `SyncPeer` |
| Identity & Access | Usuarios, roles, permisos, sesiones | `User`, `Role` |
| Platform (transversal) | Almacén de eventos, proyecciones, reloj, respaldos, configuración | `EventStore` |

## Locations

`Location` (id, code, name, level, parentId). Niveles: CENTER, GREENHOUSE, SECTOR, TABLE (ADR-0003). Invariante: el padre es del nivel inmediato superior.

Eventos: `LocationCreated`. Pendiente: renombrar o desactivar ubicaciones.

## Agronomy Catalog

`Variety` (id, name). `PlantMaterial` (id, varietyId, origin, supplier, phytosanitaryDocument, receivedAt, quantity).

Eventos: `VarietyCreated`, `PlantMaterialRegistered`.

## Lots

`Lot` (id, folio, varietyId, plantMaterialId, parentId, stage, hold, plannedQty, initialQty, currentQty, lostQty, dispatchedQty, splitQty, sowingDate, locationId, safetyIntervalUntil, version).

`Tray` (id determinista por código, code, cavities, lotId, locationId).

Invariantes: BR-LOT-01 a BR-LOT-10, BR-CHA-01 a BR-CHA-03.

Eventos: `LotPlanned`, `LotSown`, `LotStageChanged`, `LotTransferred`, `LotSplit`, `LossRecorded`, `LotCancelled`, `LotClosed`.

## Identification

`Identifier` (code, technology, entityType, entityId). Una entidad tiene varios identificadores (ADR-0014).

Eventos: `IdentifierAssigned`. Los folios y códigos de charola y ubicación se registran como identificadores al crearse.

## Crop Operations

Eventos: `IrrigationRecorded`, `FertilizationRecorded`, `ApplicationRecorded` (con intervalo de seguridad). Sobre lote o ubicación (ADR-0012).

## Quality

Eventos: `InspectionRecorded`, `QuarantineStarted`, `QuarantineReleased`, `QualityCheckRecorded`.

## Dispatch

Eventos: `DispatchRecorded` (cliente, pedido, cantidad). Pedidos y reservas: Fase 4.

## Sync

`Node` (code, name). `SyncPeer` (url, lastSentSeq, lastSyncAt). Eventos de control: `EventVoided` (anulación, ADR-0011). Estados del evento: APPLIED, CONFLICT, VOIDED.

## Relaciones entre contextos

- Lots consulta Locations y Agronomy Catalog para validar referencias.
- Crop Operations y Quality se aplican sobre Lots; Quality bloquea Dispatch (cuarentena) y Crop Operations bloquea Dispatch (intervalo de seguridad).
- Traceability Queries lee todas las proyecciones; no escribe.
- Integration produce eventos de Locations, Agronomy Catalog y Lots; nunca escribe proyecciones directamente.
- Sync transporta eventos de todos los contextos sin interpretarlos.

## Forma del evento

```text
id               UUID generado en el dispositivo
type             p. ej. LotSown
entityType       lot | location | variety | material | tray | event
entityId         UUID
occurredAt       hora del dispositivo (UTC)
recordedAt       hora del nodo que lo recibió (UTC)
userId
deviceId
nodeOrigin
deviceSeq        secuencia creciente por dispositivo (ADR-0013)
locationId       opcional
payload          contenido del tipo y versión
payloadVersion
hash             huella del contenido para idempotencia
status           APPLIED | CONFLICT | VOIDED
```

Campos respecto al doc 06 de origen: se agregan `recordedAt`, `nodeOrigin`, `deviceSeq`, `payloadVersion`, `hash` y `status`; `sync_status` se reemplaza por `status` y por el registro de pares de sincronización.
