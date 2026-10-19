# CHANGELOG

Formato por versión, como en base-shop. No hay versiones publicadas.

## Sin publicar

- Esqueleto de gobierno del proyecto: `CLAUDE.md`, documentación en `docs/`, 18 ADR, decisiones pendientes y plan del Sprint 0 (ADR-0018).
- Stack decidido: TypeScript con NestJS; PostgreSQL en servidor externo con una base por productor y SQLite en el nodo local (ADR-0007, ADR-0008, ESTUDIO-01).
- El hosting y el servidor se deciden con el primer cliente; mientras tanto, solo entorno local (ADR-0019).
- Repositorio único `Ferchoner/trazabilidad-agro` con esta documentación (ADR-0020).
- Recorrido del kit con el caso Productor A (T-007): prompt de ficha AS-IS probado (v2) y prompt de informe propuesto en `AI_WORKFLOW.md`.
- Kit del consultor v0.2 con las 33 mejoras aprobadas (T-300) y plantilla de configuración del productor (T-301); prompts de ficha AS-IS v3 y de configuración v1 en `AI_WORKFLOW.md`.
- Hallazgos del caso Productor A llevados a la plataforma (T-011): resiembra entre lotes, folio corto con bloques por dispositivo (ADR-0010 aceptada), entregas con varios lotes, ficha de lote imprimible, catálogo de productos con intervalo de seguridad, fecha de la operación aparte de la de captura y PC mínima de referencia.
- Propuesta de demo para futuros clientes en el navegador, separado del producto (ADR-0021, T-012).
