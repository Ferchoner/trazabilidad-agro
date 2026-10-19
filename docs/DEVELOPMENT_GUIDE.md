# DEVELOPMENT GUIDE

## Flujo

ANALIZAR → PLANIFICAR → IMPLEMENTAR → PROBAR → REVISAR → DOCUMENTAR → ACTUALIZAR ESTADO (`CLAUDE.md`).

GitHub Flow: una rama corta por tarea y pull request hacia `main` en `Ferchoner/trazabilidad-agro` (ADR-0020).

## Convenciones

- Ramas `tipo/T-xxx-descripcion`; commits con Conventional Commits; ramas, commits y pull requests en inglés.
- Documentación en español.
- Código e identificadores técnicos en inglés; interfaz en español; códigos de estado en mayúsculas sin acento (P-32, ADR-0009).
- Identificadores de trazabilidad: ADR-xxxx, P-xx, BR-xxx-nn, UC-xxx-nn, E-nn, T-xxx. Toda regla nueva cita su fuente.
- Un tipo de evento nuevo se documenta en `DOMAIN_MODEL.md` antes de implementarse; un cambio de contenido sube su `payloadVersion`.
- Datos de ejemplo siempre ficticios y marcados como tales (ADR-0017).

## Configuración local

PENDIENTE hasta ADR-0007. Requisito: arrancar con un solo comando y sin Internet.

## Pull Requests

Cada pull request: una tarea, descripción con qué cambia, cómo se probó y qué documentación se actualizó; CI en verde.

## Definition of Done

Una tarea está DONE cuando:

- código implementado;
- tests apropiados, incluida la prueba de reconstrucción si toca eventos o proyecciones;
- verificaciones ejecutadas;
- documentación actualizada;
- criterios de aceptación cumplidos;
- funciona sin conexión o documenta por qué no aplica (ADR-0006);
- toda configuración nueva agregada al archivo de ejemplo con descripción;
- sin problemas críticos conocidos.
