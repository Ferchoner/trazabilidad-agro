# AI WORKFLOW

## Regla

La IA trabaja por tareas acotadas (T-xxx), no por instrucciones ambiguas de "construir todo".

## Ciclo

ANALIZAR
→ PLANIFICAR
→ IMPLEMENTAR
→ PROBAR
→ REVISAR
→ DOCUMENTAR
→ CHECKPOINT GIT

## Sesiones

Cada nueva sesión debe comenzar leyendo `CLAUDE.md` y el estado relevante del proyecto (`PROGRESS.md`, `SPRINT.md`, la tarea).

## Cambios

Si una tarea revela una nueva decisión importante:

1. detener la implementación relacionada si es necesario;
2. explicar la decisión;
3. registrar ADR en estado Propuesta;
4. obtener aprobación humana;
5. continuar.

## Prompts del proyecto

Los prompts que usa el equipo con la IA viven aquí, versionados, para que no dependan de una conversación. Se revisan con el caso Productor A (T-007).

| Prompt | Uso | Estado |
|---|---|---|
| Inicio de tarea | "Lee `CLAUDE.md`, `PROGRESS.md` y la tarea T-xxx. Explica el plan y el impacto antes de cambiar nada." | Propuesto |
| Ficha AS-IS desde notas | Convertir notas de campo en una ficha del doc 06 del kit, marcando PENDIENTE lo que no está en las notas | PENDIENTE (T-007) |
| Informe de diagnóstico | Redactar el doc 09 del kit a partir de cuestionarios, fichas y matrices, sin inventar datos | PENDIENTE (T-007) |
| Configuración del productor | Derivar la configuración (ADR-0015) del diagnóstico | PENDIENTE (T-301) |

## Contexto

No sobrecargar una sesión con documentación irrelevante. Leer primero los archivos directamente relacionados con la tarea.
