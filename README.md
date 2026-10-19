# Plataforma de trazabilidad de plántula de fresa

Traceability Core basado en eventos para productores de plántula de fresa en invernadero: lotes, charolas, ubicaciones, labores, calidad, genealogía, inventario operativo y entregas, con operación sin conexión desde el diseño y convivencia con Excel o ERP.

## Estado

Sprint 0 — Discovery and Architecture, en curso desde el 2026-10-18. No hay código de producto: primero se aprueban requisitos, arquitectura, modelo de datos y contratos (ver `docs/SPRINT.md`). Stack decidido: TypeScript con NestJS, PostgreSQL en un servidor externo con una base por productor y SQLite en el nodo local sin Internet (ADR-0007, ADR-0008).

Existe una exploración técnica previa (`spikes/prototipo-python-sqlite/` en la carpeta compartida del proyecto), hecha antes de abrir el Sprint 0. No es código de producto: sirvió como evidencia para ADR-0010 y ADR-0013, y T-008 la rehace con NestJS.

## Relación con el resto del proyecto

Este repositorio contiene solo la plataforma (ADR-0020). Lo demás vive en la carpeta compartida del proyecto, fuera de Git:

| Carpeta | Qué es | Formato |
|---|---|---|
| `README.md`, `docs/01–13` | Documentación de origen: metodología y plataforma de referencia | Markdown (no se edita desde aquí) |
| `analisis/` | Análisis de la documentación de origen (huecos 1–18) | Markdown |
| `kit_consultor/` | Kit del equipo consultor para la Fase 0 (diagnóstico) | Word, Excel y PowerPoint en `office/`; fuente `.md` interna |
| `spikes/` | Exploraciones técnicas desechables | Código de prueba, no de producto |

## Documentación

La fuente de verdad del proyecto está en `docs/`:

| Documento | Contenido |
|---|---|
| `PROJECT.md` | Visión, alcance del MVP, stack y caso de prueba controlado |
| `REQUIREMENTS.md` | Actores, módulos, estados, permisos, casos de uso, errores y ambigüedades |
| `BUSINESS_RULES.md` | Reglas de negocio con su fuente |
| `DOMAIN_MODEL.md` | Contextos, aggregates y eventos |
| `ARCHITECTURE.md` | Arquitectura, eventos, offline y convenciones técnicas |
| `DATABASE.md` | Modelo de datos (borrador) |
| `API_SPEC.md` | Contratos de la API (borrador) |
| `SECURITY.md` | Seguridad |
| `DECISIONS.md` | Registro de decisiones (ADR) |
| `TASKS.md`, `PROGRESS.md` | Plan de trabajo, estado y decisiones pendientes (P-xx) |
| `SPRINT.md` | Sprint actual y reviews de los anteriores |
| `CHANGELOG.md` | Cambios registrados |
| `DEVELOPMENT_GUIDE.md` | Flujo de trabajo y convenciones |
| `AI_WORKFLOW.md`, `TEAM_GUIDE.md` | Trabajo con IA y con el equipo |

## Flujo de trabajo

GitHub Flow: una rama corta por tarea y pull request hacia `main`. El código llegará en `apps/api`, `apps/web` y `packages/contracts` (T-100). Las instrucciones para trabajar con Claude Code están en `CLAUDE.md`.
