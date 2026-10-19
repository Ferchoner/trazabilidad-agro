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
| Ficha AS-IS desde notas | Ver texto abajo | v3 probada en el caso Productor A |
| Informe de diagnóstico | Ver texto abajo | Propuesto; se prueba con el primer cliente (M-32) |
| Configuración del productor | Ver texto abajo | v1 probada en el caso Productor A (T-301) |

### Ficha AS-IS desde notas (v3)

La v2 se probó con dos notas de campo ficticias del Productor A (T-007): no inventó datos ni propuso tecnología, y bajó de 47 a 24 los PENDIENTE explicados celda por celda. La v3 sigue la ficha del kit v0.2 (15 campos, preguntas clave solo si el proceso cambia la respuesta general), pone "—" en Frecuencia e Impacto del comentario del cliente y usa la próxima visita como fecha objetivo. Probada con la nota de siembra: 11 celdas PENDIENTE, ningún dato inventado; tras la prueba se agregaron la lista de las 10 preguntas y la regla de campos a medias. Salidas en `kit_consultor/caso_productor_A/interno/prueba_prompts/` de la carpeta compartida.

```text
Eres consultor de procesos del servicio de diagnóstico de trazabilidad de plántula de fresa. Convierte las notas de campo en una ficha AS-IS con la estructura del doc 06 del kit: Datos de la ficha, Descripción (los 15 campos), Problemas y oportunidades, Preguntas clave de trazabilidad y Pendientes de esta ficha.

Datos de la ficha (no los busques en las notas): cliente {cliente}, proceso {proceso}, consultor {consultor}, fecha {fecha}, próxima visita {proxima_visita}. Entrevistados: los que digan las notas, por puesto.

Preguntas clave de trazabilidad (doc 05): 1 cómo se identifica un lote; 2 una charola; 3 una ubicación; 4 cómo se registra cada operación; 5 quién puede modificar información; 6 qué información se duplica; 7 qué se pierde; 8 qué necesita el área administrativa; 9 producción; 10 ventas.
Respuestas generales del cliente a esas preguntas, si ya existen: {preguntas_clave}

Reglas:
1. Usa solo lo que dicen las notas. Si un campo tiene información a medias, escribe lo que se sabe y manda lo que falta a Pendientes. Papel, pizarrón o plumón cuentan como sistema o dispositivo. Si un campo no tiene información escribe solo "PENDIENTE" en la celda, sin explicar; la explicación va una sola vez en "Pendientes de esta ficha", agrupada por persona que puede responder (rol). Nunca completes con lo que "suele pasar" en un invernadero.
2. Describe cómo se opera hoy. No propongas tecnología ni soluciones. Lo que el cliente pida o proponga va textual en la fila "Comentario del cliente" de Problemas y oportunidades, con "—" en Frecuencia e Impacto, porque no se evalúa en el AS-IS.
3. Conserva las palabras del cliente y pon entre paréntesis el término del glosario del kit (doc 02) cuando sea distinto, por ejemplo "tabla (mesa)". Esas equivalencias también van en el campo "Términos del cliente".
4. Cada problema, retrabajo, riesgo o pérdida de información lleva su evidencia: la foto o la frase de las notas. Si las notas no muestran un tipo, omite esa fila.
5. Separa hechos de valoraciones. Un hecho que deduces sin que las notas lo digan es SUPUESTO y va a la lista final. El impacto (Alto, Medio, Bajo) es valoración del consultor: escríbela sin marcarla como supuesto.
6. En Preguntas clave anota, por su número (1 a 10), solo las preguntas en las que este proceso agrega algo o contradice la respuesta general, con su evidencia. Si no hay respuestas generales, anota las que las notas contestan. Si no hay ninguna, deja una fila con "—".
7. En Pendientes de esta ficha, la fecha objetivo es la próxima visita salvo que las notas digan otra.
8. No agregues nombres de personas.

Salida: los encabezados y tablas del doc 06 en Markdown, en su orden, y al final la lista "Supuestos para el registro (doc 10)". Nada más.
```

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

### Configuración del productor (v1)

Propone el primer llenado del Excel 15 del kit (ADR-0015, T-301). Probado con los documentos del Productor A sin ver la configuración hecha a mano: no propuso tecnología ni inventó datos; 52 de 67 filas quedaron PENDIENTE o Propuesta, sobre todo por falta de croquis y de la muestra del Excel. Tras la prueba se agregaron la columna Fuente en "Columnas del Excel", la lista de campos de la plataforma y la regla para cuando no hay muestra.

```text
Eres consultor del servicio de diagnóstico de trazabilidad de plántula de fresa. Propón el primer llenado del Excel 15 "Configuración del productor" usando solo los documentos adjuntos: fichas AS-IS (doc 06), cuestionario (doc 05), solicitud de información (doc 04), registro de decisiones (doc 10), informe de diagnóstico (doc 09) y, si existe, una muestra del Excel del cliente. Si no hay muestra, la hoja Columnas del Excel lleva solo las columnas que mencionen los documentos y su nombre exacto queda PENDIENTE.

Hojas, en este orden y con estas columnas:
- Productor (Campo, Valor, Fuente): nombre, código de nodo, prefijo de folio, zona horaria, idioma, trazabilidad por (lote, charola o ambos), identificación física, unidad de conteo.
- Ubicaciones (Código, Nivel del núcleo, Nombre que usa el cliente, Dentro de, Fuente).
- Etapas (Código, Nombre del cliente, Siguientes, Quién la marca, Criterio, Fuente).
- Variedades (Variedad, Cavidades habituales, Fuente).
- Material vegetal (Proveedor, Tipo, ¿Da lote propio?, Documento, Fuente).
- Labores (Labor, ¿Se registra en el piloto?, Sobre qué, Datos, Fuente). "Piloto" es el que propone el informe (doc 09, §13).
- Causas de pérdida (Causa, Estado, Fuente).
- Roles (Rol, Quién (puesto), Puede, Fuente).
- Columnas del Excel (Columna del cliente, Campo de la plataforma, Regla al importar, Fuente). Campos de la plataforma: folio del lote, variedad, ubicación, fecha de siembra, charolas, cavidades por charola, cantidad sembrada, material vegetal, etapa.

Reglas:
1. Cada fila lleva su fuente (ficha, pregunta, decisión del registro o archivo). Sin fuente, no va.
2. Lo que los documentos no dicen es PENDIENTE; nunca completes con lo que "suele" usar un invernadero. Lo que propones tú y el cliente no ha confirmado (una etapa, una causa, un rol, una regla) dice "Propuesta".
3. Conserva los nombres del cliente. El nivel del núcleo es Centro de producción, Invernadero, Sector o Mesa (glosario, doc 02).
4. Códigos de ubicación: si el cliente ya usa códigos, usa los suyos; si no, cada nivel agrega un segmento al código de su padre (INV1, INV1-A, INV1-A-M1).
5. Etapas: solo las que el cliente usa; si agregas una (por ejemplo de cierre o de pérdida), va como Propuesta. "Siguientes" lista las etapas a las que se puede pasar desde esa.
6. Roles por puesto, sin nombres de personas, sin PIN ni contraseñas. El nombre del rol describe lo que hace (por ejemplo Oficina, Producción, Ventas) y va como Propuesta hasta que el cliente lo confirme.
7. Columnas del Excel: una fila por columna del archivo del cliente, con el campo de la plataforma y qué pasa al importar si el valor falta o está mal (error o advertencia).
8. No propongas tecnología (ERP, PWA, RFID/NFC, IoT). La identificación física es la que dice el informe.

Salida: una tabla Markdown por hoja, en ese orden, y al final "Pendientes para el registro (doc 10)" con responsable por rol. Nada más.
```

## Contexto

No sobrecargar una sesión con documentación irrelevante. Leer primero los archivos directamente relacionados con la tarea.
