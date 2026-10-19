# DATABASE — Modelo de datos

Estado: borrador del Sprint 0 (T-004). Nombres en inglés (P-32). Se aprueba junto con ADR-0007.

## 1. Motor y convenciones

- SQLite en un solo archivo por instalación, en modo WAL (ADR-0007, propuesta). El modelo evita funciones exclusivas del motor para poder migrar a PostgreSQL.
- Identificadores UUID en texto; fechas ISO 8601 en UTC.
- `events` es la única tabla de verdad, solo de inserción. Las demás son proyecciones: se pueden borrar y reconstruir.
- Migraciones versionadas con la herramienta del stack (PENDIENTE).

## 2. Mapa de tablas

| Grupo | Tabla | Tipo |
|---|---|---|
| Plataforma | `events`, `meta`, `sync_peers`, `sync_log` | Verdad / control |
| Identidad | `users`, `roles`, `role_permissions` | Configuración local |
| Locations | `locations` | Proyección |
| Agronomy Catalog | `varieties`, `plant_materials` | Proyección |
| Lots | `lots`, `trays`, `lot_genealogy`, `lot_events` | Proyección |
| Identification | `identifiers` | Proyección |
| Crop Operations | `applications` | Proyección |
| Dispatch | `dispatches` | Proyección |

## 3. Plataforma

### 3.1 `events`

| Columna | Tipo | Nota |
|---|---|---|
| `seq` | entero autoincremental | Orden de llegada a este nodo; sirve para sincronizar |
| `id` | UUID, único | Generado en el dispositivo |
| `type`, `entity_type`, `entity_id` | texto | |
| `occurred_at`, `recorded_at` | texto ISO UTC | ADR-0013 |
| `user_id`, `device_id`, `node_origin`, `device_seq` | texto / entero | |
| `location_id` | UUID, opcional | |
| `payload`, `payload_version` | JSON, entero | |
| `hash` | texto | Idempotencia |
| `status`, `status_detail` | texto | APPLIED, CONFLICT, VOIDED |

Índices: (`entity_type`, `entity_id`), (`occurred_at`, `node_origin`, `device_seq`). Sin `UPDATE` salvo `status`, que se recalcula al reconstruir; sin `DELETE`.

### 3.2 `meta`

Clave-valor: consecutivos de folio por año, último orden aplicado, versión del esquema.

### 3.3 `sync_peers`, `sync_log`

Par, último `seq` enviado, última sincronización; bitácora de cada intercambio.

## 4. Proyecciones

### 4.1 `locations`
`id`, `code` único, `name`, `level`, `parent_id`.

### 4.2 `varieties`, `plant_materials`
Variedad con nombre único; material con variedad, origen, proveedor, documento, fecha y cantidad.

### 4.3 `lots`
Campos del aggregate `Lot` (`DOMAIN_MODEL.md`). `folio` único. Restricciones: cantidades no negativas; `current_qty = initial_qty - lost_qty - dispatched_qty - split_qty`.

### 4.4 `trays`
`id` determinista por código, `code` único, `cavities`, `lot_id` (nulo si libre), `location_id`.

### 4.5 `lot_genealogy`
`parent_id`, `child_id`, `event_id`, `kind` (SPLIT; MERGE pendiente P-15), `quantity`.

### 4.6 `lot_events`
Vínculo lote–evento con `via` (DIRECT, LOCATION, GENEALOGY), para la trazabilidad hacia atrás.

### 4.7 `identifiers`
`code` único, `technology`, `entity_type`, `entity_id`.

### 4.8 `applications`
Por evento y lote: producto, ingrediente, dosis, intervalo, fecha y fecha libre.

### 4.9 `dispatches`
Por evento: lote, cliente, pedido, cantidad, fecha.

## 5. Pendientes

- Herramienta de migraciones y esquema exacto (ADR-0007).
- Tablas de Fase 3 y 4 (insumos, pedidos, reservas).
- Volumen y tamaño esperado del archivo (P-04).
