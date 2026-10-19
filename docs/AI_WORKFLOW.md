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
| Ficha AS-IS desde notas | Ver texto abajo | Probado (v2) en el caso Productor A |
| Informe de diagnóstico | Ver texto abajo | Propuesto; sin prueba aislada |
| Configuración del productor | Derivar la configuración (ADR-0015) del diagnóstico | PENDIENTE (T-301) |

### Ficha AS-IS desde notas (v2)

Probado con dos notas de campo ficticias del Productor A (T-007): no inventó datos ni propuso tecnología. La v1 dejaba 47 PENDIENTE explicados celda por celda; la v2 deja 24, agrupados por rol. Las salidas están en `kit_consultor/caso_productor_A/interno/prueba_prompts/` de la carpeta compartida.

```text
Eres consultor de procesos del servicio de diagnóstico de trazabilidad de plántula de fresa. Convierte las notas de campo en una ficha AS-IS con la estructura del doc 06 del kit: Datos de la ficha, Descripción (los 12 campos), Problemas y oportunidades, Preguntas clave de trazabilidad (las 10) y Pendientes de esta ficha.

Datos de la ficha (no los busques en las notas): cliente {cliente}, proceso {proceso}, consultor {consultor}, fecha {fecha}. Entrevistados: los que digan las notas, por puesto.

Reglas:
1. Usa solo lo que dicen las notas. Si un campo no tiene información escribe solo "PENDIENTE" en la celda, sin explicar; la explicación va una sola vez en "Pendientes de esta ficha", agrupada por persona que puede responder (rol). Nunca completes con lo que "suele pasar" en un invernadero.
2. Describe cómo se opera hoy. No propongas tecnología ni soluciones. Lo que el cliente pida o proponga va textual en una fila "Comentario del cliente" de Problemas y oportunidades.
3. Conserva las palabras del cliente y pon entre paréntesis el término del glosario del kit (doc 02) cuando sea distinto, por ejemplo "tabla (mesa)".
4. Cada problema, retrabajo, riesgo o pérdida de información lleva su evidencia: la foto o la frase de las notas. Si las notas no muestran un tipo, omite esa fila.
5. Separa hechos de valoraciones. Un hecho que deduces sin que las notas lo digan es SUPUESTO y va a la lista final. El impacto (Alto, Medio, Bajo) es valoración del consultor: escríbela sin marcarla como supuesto.
6. Responde una pregunta clave solo si las notas la contestan; si no, PENDIENTE.
7. No agregues nombres de personas.

Salida: los encabezados y tablas del doc 06 en Markdown, en su orden, y al final la lista "Supuestos para el registro (doc 10)". Nada más.
```

Ajuste pendiente (v3): decir qué va en Frecuencia e Impacto de la fila "Comentario del cliente" y en la fecha objetivo de los pendientes.

### Informe de diagnóstico (propuesto)

```text
Redacta el informe de diagnóstico con las secciones del doc 09 del kit usando solo los documentos adjuntos: cuestionario 05, resumen de madurez, fichas AS-IS 06, matrices 07 y 08, registro 10 y el resultado de la prueba de trazabilidad.

Reglas:
1. Cada hallazgo cita su fuente (ficha, pregunta o registro). Sin fuente, no va.
2. El nivel de madurez de cada área sale del resumen 05; no lo recalcules.
3. La arquitectura TO-BE se justifica con problemas del AS-IS y respeta las reglas de diseño: no proponer ERP, PWA, RFID/NFC ni IoT sin un problema que lo pida.
4. Lo que falta es PENDIENTE con responsable, tomado del registro 10.
5. Los KPIs del piloto usan la línea base de la prueba de trazabilidad; las metas se marcan como propuesta hasta que el cliente las acepte.
6. Usa los prefijos del registro: RQ requerimiento, R riesgo, S supuesto, PD pendiente, D decisión.
```

## Contexto

No sobrecargar una sesión con documentación irrelevante. Leer primero los archivos directamente relacionados con la tarea.
