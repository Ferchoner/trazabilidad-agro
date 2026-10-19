# SPRINT

## Sprint actual

### Sprint 0 — Discovery and Architecture (desde 2026-10-18)

**Goal:** definir requisitos, stack, arquitectura, modelo de datos y contratos de la API, y validar el paquete completo con el caso Productor A, antes de implementar funcionalidades. **Tareas:** T-001 a T-010.

#### Entregables

| Entregable | Estado | Referencia |
|---|---|---|
| Esqueleto de gobierno (CLAUDE.md, docs/, ADR, P-xx, tareas) | DONE | ADR-0018 |
| Especificación técnica | Borrador | T-002, `REQUIREMENTS.md` |
| Contradicciones y ambigüedades | En curso | T-006 |
| Stack aprobado: TypeScript, NestJS, PostgreSQL en servidor y SQLite local | DONE | T-001, ADR-0007, ADR-0008 |
| Arquitectura y dominio aprobados | Pendiente | T-003 |
| Modelo de datos aprobado | Pendiente | T-004 |
| Contratos de la API aprobados | Pendiente | T-005 |
| Kit recorrido con el caso Productor A y lista de mejoras | En revisión | T-007 |
| Prueba técnica en PC básica | En curso | T-008 |
| Piloto y KPIs | Pendiente | T-009 |
| Repositorio y CI | En curso: repositorio creado, falta CI | T-010, ADR-0020 |

#### Criterio de cierre

Las ADR de arquitectura en estado Aceptada, T-007 entregada, T-008 con medición en la PC mínima y P-02 y P-04 cerradas. El hosting no cuenta: se decide con el primer cliente (ADR-0019). Las P-xx de dominio pueden seguir abiertas si tienen responsable, porque se cierran con cada productor.

## Historial

Sin sprints cerrados.
