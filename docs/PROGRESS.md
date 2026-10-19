# PROJECT PROGRESS

## Current Phase

Sprint 0 — Discovery and Architecture, desde el 2026-10-18 (`SPRINT.md`). Sin código de producto.

## Completed

- [x] Documentación de origen analizada (`analisis/analisis_documentacion.md`)
- [x] Kit del consultor v0.1 en Office (ADR-0002, ADR-0016)
- [x] Alcance operativo y jerarquía de ubicación (ADR-0003)
- [x] Lote como unidad central (ADR-0004)
- [x] Eventos inmutables como fuente de verdad (ADR-0005)
- [x] Offline desde el diseño (ADR-0006)
- [x] Identificación independiente de la tecnología (ADR-0014)
- [x] Esqueleto de gobierno tomado de base-shop (ADR-0018)
- [x] Stack: TypeScript y NestJS (ADR-0007)
- [x] Base de datos híbrida: PostgreSQL en servidor externo, una base por productor, y SQLite en nodo local (ADR-0007, ADR-0008)
- [x] Hosting y servidor se deciden con el primer cliente; mientras tanto, solo entorno local (ADR-0019)
- [x] Un solo repositorio: `Ferchoner/trazabilidad-agro` (ADR-0020)

## In Progress

- T-002 Actores y alcance del MVP (borrador en `REQUIREMENTS.md`)
- T-006 Contradicciones y ambigüedades (18 huecos mapeados)
- T-008 Prueba técnica: rehacer la exploración en NestJS con PostgreSQL y SQLite
- T-010 Repositorio creado y documentación subida; falta la CI (con T-100) y proteger `main`

## Next

- T-007 Recorrer el kit con el caso Productor A
- Aprobar las ADR en estado Propuesta (T-003)

## Fuera del MVP

Pedidos y reservas (Fase 4), insumos (Fase 3), conectores ERP/SAP (Fase 5), RFID/IoT (Fase 6).

## Blocked

Nada bloqueado.

## Pending Decisions

### Stack e infraestructura

| ID | Decisión | Bloquea | Responsable |
|---|---|---|---|
| P-04 | PC mínima: sistema operativo, RAM, navegador; volumen por temporada; usuarios simultáneos | T-001, T-401 | Fernando / diagnóstico |
| P-06 | HTTPS en la red local para PWA instalable y cámara como lector | T-132 | Equipo |
| P-08 | Conexión nodo local–servidor: autenticación del nodo y frecuencia de sincronización (TLS y dominio, con el cliente) | T-105 | Equipo |

### Se deciden con el primer cliente (ADR-0019)

No bloquean el Sprint 0.

| ID | Decisión |
|---|---|
| P-05 | Respaldo fuera del sitio y procedimiento de restauración en el servidor |
| P-07 | Proveedor del servidor externo, región, tamaño y costo mensual |

### Dominio (se confirman con cada productor, doc 02 del kit)

| ID | Decisión | Bloquea |
|---|---|---|
| P-10 | Estado del lote en tres ejes (ADR-0009) | T-104 |
| P-11 | Formato del folio y código de nodo visible (ADR-0010) | T-122 |
| P-12 | Resolución de conflictos: quién y cómo (ADR-0013) | T-133 |
| P-13 | Relación lote–charola: uno a muchos, mezcla | T-123 |
| P-14 | Trazabilidad a nivel lote, charola o ambos; etiquetado de charolas | T-123 |
| P-15 | Fusión de lotes, trasplante y cambio de charola | T-124 |
| P-16 | Unidad de conteo de plántula | T-122 |
| P-17 | Criterios de paso entre etapas | T-104 |
| P-18 | Matriz de permisos: liberación, anulación, calidad | T-109 |
| P-19 | Normativa y certificaciones (SENASICA, GlobalG.A.P., exportación) | T-125 |
| P-20 | Origen del material vegetal y certificado fitosanitario | T-121 |
| P-21 | Reconciliación inventario operativo vs. financiero | Fase 4 |
| P-22 | Reservas y pedidos en el MVP o en Fase 4 | T-127 |
| P-23 | Reportes mínimos del MVP | T-129 |
| P-24 | KPIs del piloto y metas | T-009 |

### API e integración

| ID | Decisión | Bloquea |
|---|---|---|
| P-30 | Importación: plantilla nuestra o mapear el Excel de cada productor | T-130 |
| P-31 | Prefijo, versionado y formato de errores de la API | T-005 |
| P-32 | Idioma de código y nombres técnicos (propuesta: inglés, como base-shop; interfaz en español) | T-101 |

### Seguridad

| ID | Decisión | Bloquea |
|---|---|---|
| P-40 | Autenticación local (PIN o contraseña) y clave de sincronización | T-109 |
| P-41 | Datos personales: aviso y conservación | T-127 |

### Decisiones cerradas

| ID | Decisión | Cierre |
|---|---|---|
| P-01 | Stack | TypeScript y NestJS (ADR-0007), 2026-10-18 |
| P-03 | Despliegue y motor | Híbrido: servidor PostgreSQL con una base por productor y nodo local SQLite (ADR-0007, ADR-0008), 2026-10-19 |
| P-02 | Repositorio | Uno solo: `Ferchoner/trazabilidad-agro` en GitHub (ADR-0020), 2026-10-19 |

## Notas

- La exploración técnica (`spikes/prototipo-python-sqlite`) se hizo antes de abrir el Sprint 0. Aporta evidencia para ADR-0007, ADR-0010 y ADR-0013 (encontró el problema de orden con eventos de la misma hora) y no es código de producto.
