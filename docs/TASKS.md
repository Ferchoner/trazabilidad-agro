# TASKS

## Estados

- TODO
- IN_PROGRESS
- BLOCKED
- REVIEW
- DONE
- DEFERRED (fuera del MVP)

Las decisiones pendientes (P-xx) están en `PROGRESS.md`. Una tarea BLOCKED indica qué decisión la bloquea. Los casos de uso (UC-xxx) están en `REQUIREMENTS.md`. Ninguna tarea de las secciones 2 y 3 empieza antes de cerrar el Sprint 0.

## 1. Discovery and Architecture (Sprint 0)

| ID | Tarea | Estado | Depende de | Criterios de aceptación |
|---|---|---|---|---|
| T-001 | Definir stack | DONE (hosting con el primer cliente, ADR-0019) | — | Todas las filas de la tabla de stack en `PROJECT.md` con decisión y ADR; ADR-0007 Aceptada |
| T-002 | Definir actores y alcance del MVP | IN_PROGRESS | T-006 | `REQUIREMENTS.md` con actores, módulos, estados, permisos, casos de uso con criterios de aceptación, flujos, errores y RNF; alcance de `PROJECT.md` §3 aprobado |
| T-003 | Aprobar arquitectura | TODO | — | ADR-0009, 0010, 0011, 0012, 0013 y 0015 en estado Aceptada; `ARCHITECTURE.md` y `DOMAIN_MODEL.md` sin PENDIENTE de arquitectura |
| T-004 | Aprobar modelo de datos | TODO | T-003 | `DATABASE.md` con esquema, índices y restricciones; prueba de reconstrucción definida |
| T-005 | Aprobar contratos de la API | TODO | T-003 | `API_SPEC.md` con cada operación: ruta, permiso, request, response, errores e idempotencia |
| T-006 | Resolver contradicciones y ambigüedades | IN_PROGRESS | — | Los 18 huecos de `REQUIREMENTS.md` §10 cerrados con ADR, regla o P-xx con responsable |
| T-007 | Recorrer el kit del consultor con el caso Productor A | REVIEW | — | Cada documento del kit (Office) aplicado al caso; lista de mejoras a documentos, preguntas y prompts con prioridad; preguntas que faltan para cerrar P-13 a P-24; configuración inicial del productor derivada del diagnóstico (ADR-0015, ADR-0017) |
| T-008 | Prueba técnica en una PC básica | IN_PROGRESS | — | Prototipo desechable que demuestre en la PC mínima: registro idempotente, reconstrucción, captura sin conexión desde teléfono, sincronización entre dos nodos e importación del Excel del Productor A, con tiempos medidos. Antecedente: exploración en Python + SQLite (`spikes/prototipo-python-sqlite`, 12 pruebas). Falta rehacerla con NestJS: mismo código contra PostgreSQL y SQLite, instalación del nodo local en Windows 10 sin compilar, consumo de memoria y sincronización nodo–servidor |
| T-009 | Definir piloto y KPIs | TODO | T-007 | Operación del piloto acotada; KPIs de `kit_consultor/03` con línea base del Productor A y meta (P-24) |
| T-010 | Crear el repositorio y la CI mínima | IN_PROGRESS | T-001 | Repositorio con esta carpeta (ADR-0020), rama principal protegida y CI que corre pruebas y lint. La CI se activa con el primer proyecto de Node (T-100) |

## 2. Fundaciones técnicas (sin lógica de negocio)

| ID | Tarea | Estado | Depende de |
|---|---|---|---|
| T-100 | Proyecto base con configuración validada al arrancar y archivo de configuración por productor (ADR-0015) | TODO | T-001 |
| T-101 | Estructura de módulos y capas, con regla automática de límites | TODO | T-003 |
| T-102 | Almacén de eventos: UUID, huella, idempotencia, estados APLICADO/CONFLICTO/ANULADO | TODO | T-004 |
| T-103 | Proyecciones con aplicación incremental y reconstrucción determinista (ADR-0013) | TODO | T-102 |
| T-104 | Máquina de estados del lote configurable (ADR-0009) | TODO | T-102 |
| T-105 | Sincronización: cola del navegador, nodo a nodo y paquete por archivo | TODO | T-103 |
| T-106 | Respaldo automático, manual y restauración probada en local (fuera del sitio con el cliente, P-05) | TODO | T-100 |
| T-107 | Infraestructura de pruebas: unitarias, integración con base real, convergencia de dos nodos | TODO | T-100 |
| T-108 | Empaquetado e instalación en Windows sin conocimientos técnicos | TODO | T-001 |
| T-109 | Identidad local: usuarios, roles, permisos, sesiones (P-40) | TODO | T-100 |

## 3. Contextos de negocio

| ID | Tarea | Estado | Depende de |
|---|---|---|---|
| T-120 | Ubicaciones (UC-UBI-01) | TODO | T-103 |
| T-121 | Variedades y material vegetal (UC-CAT-01, 02) | TODO | T-103 |
| T-122 | Lotes: planificar, sembrar, etapas, cancelar (UC-LOT-01 a 03, 07) | TODO | T-104, T-120, T-121 |
| T-123 | Charolas e identificadores (UC-IDE-01, 02) | TODO | T-122 |
| T-124 | Transferencias, pérdidas y división con genealogía (UC-LOT-04 a 06) | TODO | T-123 |
| T-125 | Labores con intervalo de seguridad (UC-LAB-01, 02) | TODO | T-122 |
| T-126 | Inspección, cuarentena y calidad (UC-CAL-01 a 04) | TODO | T-122 |
| T-127 | Entregas y cierre (UC-ENT-01, 02) | TODO | T-125, T-126 |
| T-128 | Trazabilidad hacia atrás y hacia adelante (UC-TRZ-01, 02, UC-LOT-08) | TODO | T-124, T-127 |
| T-129 | Reportes y exportación CSV (UC-REP-01 a 03) | TODO | T-128 |
| T-130 | Importación de Excel con vista previa (UC-INT-01) | TODO | T-122, P-30 |
| T-131 | Etiquetas imprimibles (UC-IDE-03) | TODO | T-123 |
| T-132 | Interfaz de captura para PC y teléfono | TODO | T-105, T-109 |
| T-133 | Conflictos y anulaciones (UC-SYN-04, UC-EVT-01) | TODO | T-105 |

## 4. Kit del consultor

| ID | Tarea | Estado | Depende de |
|---|---|---|---|
| T-300 | Aplicar al kit (Office) las mejoras aprobadas de T-007 | TODO | T-007 |
| T-301 | Plantilla de configuración del productor que sale del diagnóstico | TODO | T-007, ADR-0015 |

## 5. Calidad

| ID | Tarea | Estado | Depende de |
|---|---|---|---|
| T-400 | Escenario de aceptación Productor A automatizado (importación, ciclo, brote, recall, conflicto sin conexión) | TODO | T-128, T-130 |
| T-401 | Prueba de rendimiento en la PC mínima con el volumen de P-04 | TODO | T-008, P-04 |
| T-402 | Despliegue del servidor para el primer cliente | DEFERRED (ADR-0019) | P-07 |
