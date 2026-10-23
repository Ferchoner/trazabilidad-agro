# ARCHITECTURAL DECISION RECORDS

## Formato

Cada decisión importante debe registrar:

- ID
- Fecha
- Contexto
- Decisión
- Alternativas consideradas
- Consecuencias
- Estado

Estados posibles: Propuesta, Aceptada, Reemplazada, Rechazada.

Una decisión en estado Propuesta necesita aprobación humana antes de implementarse (`TEAM_GUIDE.md`). La decisión pendiente que la origina (P-xx) está en `PROGRESS.md`.

## Índice

| ID | Título | Estado |
|---|---|---|
| ADR-0001 | Estado inicial | Reemplazada parcialmente por ADR-0002 a ADR-0006 |
| ADR-0002 | Dos productos: kit del consultor y plataforma | Aceptada |
| ADR-0003 | Alcance operativo: solo invernadero y jerarquía de ubicación | Aceptada |
| ADR-0004 | El lote como unidad central de trazabilidad | Aceptada |
| ADR-0005 | Eventos inmutables como fuente de verdad | Aceptada |
| ADR-0006 | Operación sin conexión desde el diseño | Aceptada |
| ADR-0007 | Stack tecnológico: TypeScript, NestJS, PostgreSQL y SQLite | Aceptada |
| ADR-0008 | Servidor externo con una base por productor y nodo local opcional | Aceptada |
| ADR-0009 | Estado del lote en tres ejes | Propuesta |
| ADR-0010 | Identidad: UUID interno y folio corto con bloques por dispositivo | Aceptada |
| ADR-0011 | Correcciones por anulación, no por edición | Propuesta |
| ADR-0012 | Labores sobre una ubicación se ligan a los lotes presentes | Propuesta |
| ADR-0013 | Orden determinista de eventos y conflictos visibles | Propuesta |
| ADR-0014 | Identificación independiente de la tecnología | Aceptada |
| ADR-0015 | Configuración por productor separada del núcleo | Propuesta |
| ADR-0016 | Entregables para cliente en formato Office | Aceptada |
| ADR-0017 | Caso de prueba controlado "Productor A" | Aceptada |
| ADR-0018 | Esqueleto de gobierno tomado de base-shop | Aceptada |
| ADR-0019 | Hosting y servidor se deciden con el primer cliente | Aceptada |
| ADR-0020 | Un solo repositorio para la plataforma | Aceptada |
| ADR-0021 | Demo para futuros clientes, separado del producto | Aceptada |

---

## ADR-0001 — Estado inicial

### Contexto

El proyecto tiene documentación de referencia (`README.md` y `docs/01–13` de origen) y un kit de consultoría, pero ninguna decisión tecnológica.

### Decisión

No asumir stack, modelo de despliegue, autenticación, hardware ni infraestructura hasta que se aprueben.

### Estado

Reemplazada parcialmente por ADR-0002 a ADR-0006 (2026-10-18). Sigue vigente para todo lo que continúa como PENDIENTE DE DECISIÓN (ver `PROGRESS.md`).

---

## ADR-0002 — Dos productos: kit del consultor y plataforma

- **Fecha:** 2026-09-30
- **Contexto:** La documentación de origen describe a la vez una metodología de consultoría y una plataforma de software (análisis, sección 1 y hueco 1).
- **Decisión:** Son dos productos con su propia fuente de verdad. El kit del consultor (`kit_consultor/`) cubre la Fase 0 (diagnóstico) y se entrega en Office. La plataforma (`plataforma/`) cubre las Fases 1 a 6 y se gobierna con esta documentación. El diagnóstico alimenta la configuración de cada productor (ADR-0015).
- **Alternativas consideradas:** Un solo repositorio con metodología y código mezclados (propuesta del análisis, sección 4), descartada porque el kit lo usan consultores y ventas en Office, no en Git.
- **Consecuencias:** Los hallazgos del caso Productor A (ADR-0017) pueden cambiar ambos productos; cada cambio se registra en su lado.
- **Estado:** Aceptada.

---

## ADR-0003 — Alcance operativo: solo invernadero y jerarquía de ubicación

- **Fecha:** 2026-10-02
- **Contexto:** El modelo de ubicación debe reflejar cómo opera el productor.
- **Decisión:** La plántula se produce solo en invernadero. La jerarquía física es Centro de producción → Invernadero → Sector → Mesa → Charola. "Parcela" o "hectáreas" son medidas de tamaño, no un tipo de espacio. Los nombres de cada nivel pueden variar por productor (ADR-0015), pero el número y el orden de niveles es el del núcleo.
- **Alternativas consideradas:** Jerarquía libre de profundidad variable; campo abierto. Descartadas por el productor.
- **Consecuencias:** El tamaño de la operación (varias hectáreas) influye en cobertura de red, volumen de lecturas y número de dispositivos, no en el modelo.
- **Estado:** Aceptada.

---

## ADR-0004 — El lote como unidad central de trazabilidad

- **Fecha:** 2026-10-02
- **Contexto:** Doc 04 de origen; el término "lote" funciona con los clientes.
- **Decisión:** El lote es la unidad central. Conserva genealogía al dividirse (FR-2026-00017 → -A / -B). Charolas, ubicaciones, labores, inspecciones y entregas se relacionan con lotes.
- **Alternativas consideradas:** Trazabilidad solo por charola. Queda como posible nivel adicional según P-14.
- **Consecuencias:** La relación lote–charola, la fusión y la unidad de conteo siguen abiertas (P-13, P-15, P-16).
- **Estado:** Aceptada.

---

## ADR-0005 — Eventos inmutables como fuente de verdad

- **Fecha:** 2026-10-18
- **Contexto:** Doc 06 de origen define un evento por cambio y pide auditoría completa; el análisis (hueco 8) señala que eventos y tablas específicas no pueden ser dos fuentes de verdad.
- **Decisión:** El Core es basado en eventos. Cada cambio de negocio es un evento inmutable con UUID generado en el dispositivo que lo captura, tipo, entidad, hora del dispositivo, hora de registro, usuario, dispositivo, ubicación y contenido. El registro es idempotente: reenviar un evento no lo duplica, y el mismo UUID con otro contenido se rechaza. Las tablas de lotes, charolas, inventario y labores son proyecciones reconstruibles a partir de los eventos. El ciclo de vida del lote es una máquina de estados con transiciones explícitas (ADR-0009).
- **Alternativas consideradas:** Tablas como verdad con bitácora de auditoría aparte; descartada porque la sincronización sin conexión necesitaría resolver conflictos fila por fila (sobrescrituras ciegas, doc 09 de origen).
- **Consecuencias:** El significado de un tipo de evento no cambia una vez guardado; los cambios de contenido se versionan. Reconstruir las proyecciones debe ser un comando probado.
- **Estado:** Aceptada.

---

## ADR-0006 — Operación sin conexión desde el diseño

- **Fecha:** 2026-10-18
- **Contexto:** Doc 10 de origen pone offline en la Fase 5, pero la arquitectura A y la regla de diseño 8 lo necesitan antes (análisis, hueco 12). El cliente básico tiene Internet limitado y poca cobertura dentro de los invernaderos.
- **Decisión:** Identificadores, eventos, folios y reglas se diseñan desde la Fase 1 para captura sin conexión: base local → cola → sincronización, con idempotencia, reintentos, detección de conflictos y sin sobrescrituras. La sincronización completa entre nodos puede implementarse después, pero nada de la Fase 1 puede impedirla.
- **Alternativas consideradas:** Diseñar en línea y agregar offline en la Fase 5; descartada porque obliga a migrar identificadores y datos.
- **Consecuencias:** Folio legible por nodo (ADR-0010), orden determinista (ADR-0013) y sincronización por red local o por archivo.
- **Estado:** Aceptada.

---

## ADR-0007 — Stack tecnológico

- **Fecha:** 2026-10-18
- **Contexto:** El cliente básico (arquitectura A) tiene una PC antigua, Excel e Internet limitado. El equipo ya trabaja con TypeScript, NestJS y PostgreSQL en base-shop. Fernando prevé servidores externos para el rendimiento (ESTUDIO-01) y quiere que la plataforma acompañe el crecimiento de los productores sin rehacerse.
- **Decisión:** TypeScript sobre Node.js con **NestJS**, monolito modular con DDD pragmático como base-shop. Lo decidió Fernando el 2026-10-18: aunque el productor sea pequeño, se busca que sus equipos crezcan, y empezar con un framework que no escala obligaría a migrar después.
- **Motor de base de datos:** híbrido, decidido por Fernando el 2026-10-19 (ESTUDIO-01, opción C): PostgreSQL en el servidor externo y SQLite en el nodo local. El mismo código corre en ambos, con el motor detrás de los repositorios de Infrastructure.
- **Alternativas consideradas:** Node.js sin framework con SQLite (más ligero, pero sin la estructura ni la experiencia de base-shop); Python con SQLite (corre en Windows 7, pero el equipo no lo usa y no reutiliza nada del servidor).
- **Consecuencias:**
  - El nodo local necesita Windows 10 o superior por Node.js 24; una PC con Windows 7 u 8 no puede ser nodo local (P-04).
  - NestJS ocupa más memoria que un servidor mínimo; hay que medir arranque y consumo en la PC mínima (T-008).
  - Si el nodo local usa SQLite, hay que validar en T-008 que el ORM y el driver de SQLite se instalan en Windows sin compilar (Prisma con su adaptador de SQLite o una alternativa).
  - Se reutilizan de base-shop: estructura de módulos y capas, verificación de límites, Jest, oxlint, Prettier, Problem Details, idempotencia y CI.
- **Estado:** Aceptada (2026-10-19). El proveedor y el tamaño del servidor se deciden con el primer cliente (ADR-0019).

---

## ADR-0008 — Servidor externo con una base por productor y nodo local opcional

- **Fecha:** 2026-10-18 (revisada por ESTUDIO-01; aceptada el 2026-10-19)
- **Contexto:** Hueco 3 del análisis: multi-cliente (SaaS) o instalación por cliente. Fernando prevé servidores externos; el cliente básico opera sin Internet estable.
- **Decisión:** Un servidor externo con PostgreSQL y **una base de datos por productor** (aislamiento, respaldo y baja por cliente sin afectar a otros). El mismo núcleo para todos; la configuración de cada productor aparte (ADR-0015). Un **nodo local** con SQLite es opcional y solo para productores sin Internet confiable; sincroniza eventos con su base en el servidor.
- **Alternativas consideradas:** Instalación solo local por productor (propuesta original: sin acceso remoto ni respaldos profesionales); una sola base multi-tenant con columna de productor (más simple de operar, pero cada consulta debe filtrar por productor y un error expone datos de otro).
- **Consecuencias:** Los eventos llevan nodo de origen; el servidor es el registro completo de eventos del productor. Hace falta provisionar una base por productor nuevo y un procedimiento de actualización del núcleo para todas.
- **Estado:** Aceptada (2026-10-19, Fernando). Proveedor, región y costo del servidor se deciden con el primer cliente (ADR-0019); la conexión del nodo se diseña en P-08.

---

## ADR-0009 — Estado del lote en tres ejes

- **Fecha:** 2026-10-18
- **Contexto:** Doc 06 de origen lista 15 estados que mezclan etapa agrícola, retención y situación comercial (hueco 7). EN_CUARENTENA y PERDIDO ocurren en cualquier etapa; RESERVADO y PARCIALMENTE_VENDIDO dependen de cantidades.
- **Decisión propuesta:** (1) **Etapa agrícola**: PLANIFICADO → PREPARADO → SEMBRADO → GERMINACION → CRECIMIENTO → DESARROLLO → CONTROL_CALIDAD → LISTO_VENTA → CERRADO, más los terminales PERDIDO y CANCELADO; transiciones configurables por productor. (2) **Retención**: LIBRE o EN_CUARENTENA, independiente de la etapa. (3) **Situación comercial**: DISPONIBLE, RESERVADO, PARCIALMENTE_VENDIDO o VENDIDO, calculada a partir de cantidades, nunca asignada a mano. Códigos sin acento; etiquetas traducibles.
- **Alternativas consideradas:** Un solo estado con 15 valores; obliga a perder la etapa al entrar en cuarentena.
- **Consecuencias:** Los criterios de paso entre GERMINACION, CRECIMIENTO y DESARROLLO los define cada productor (P-17). Evidencia del caso Productor A (H-09): usa tres etapas con nombres propios y pasa a listo sin control de calidad formal, así que la configuración debe permitir menos etapas, nombres propios y la transición directa a LISTO_VENTA.
- **Estado:** Propuesta (P-10).

---

## ADR-0010 — Identidad: UUID interno y folio corto con bloques por dispositivo

- **Fecha:** 2026-10-18; revisada el 2026-10-19 con el caso Productor A.
- **Contexto:** El folio consecutivo FR-2026-00017 choca con la captura sin conexión: dos equipos pueden generar el mismo (hueco 10). En el caso Productor A el folio debe existir al sembrar, en un teléfono sin señal, y se escribe a mano en una estaca, por lo que debe ser corto (L-0812) (hallazgos H-03 y H-04 de T-007).
- **Decisión:** Cada entidad tiene un UUID interno. El folio legible es corto: prefijo del productor y consecutivo (p. ej. L-0812); el año es opcional por configuración (ADR-0015) y el nodo no se muestra. Los consecutivos se reparten en bloques: cada nodo recibe un rango y cada dispositivo recibe un bloque dentro del rango de su nodo antes de salir sin conexión, así el folio es definitivo desde la siembra. Los sublotes agregan sufijo (-A, -B). Al migrar desde Excel se conserva el folio del productor y los bloques nuevos empiezan después de su último consecutivo.
- **Alternativas consideradas:** Folio por nodo `PREFIJO-AÑO-NODO-CONSECUTIVO` (largo para escribir a mano y muestra el nodo); folio provisional que el nodo confirma al sincronizar (el provisional ya quedó escrito en la estaca y en papel); folio asignado al sincronizar (el lote no tiene folio mientras está sin conexión).
- **Consecuencias:** Hay que administrar bloques: tamaño del bloque y qué hace un dispositivo que agota el suyo sin conexión quedan en P-11. Los folios de un mismo día pueden no ser consecutivos entre dispositivos.
- **Estado:** Aceptada (2026-10-19, Fernando, con el caso Productor A; se confirma con el primer productor real).

---

## ADR-0011 — Correcciones por anulación, no por edición

- **Fecha:** 2026-10-18
- **Contexto:** Hueco 11: no se define cómo se corrige un evento erróneo.
- **Decisión propuesta:** Un evento equivocado se anula con un evento ANULACION que apunta a él, con motivo y usuario; después se captura el correcto. Anular reconstruye las proyecciones. No se anula una anulación.
- **Alternativas consideradas:** Edición con historial; rompe la inmutabilidad de ADR-0005.
- **Consecuencias:** Quién puede anular qué tipo de evento queda en la matriz de permisos (P-18).
- **Estado:** Propuesta.

---

## ADR-0012 — Labores sobre una ubicación se ligan a los lotes presentes

- **Fecha:** 2026-10-18
- **Contexto:** En invernadero el riego, la fertilización y muchas aplicaciones se hacen por sector o mesa, no por lote.
- **Decisión propuesta:** Riego, fertilización, aplicación e inspección pueden registrarse sobre un lote o sobre una ubicación. Sobre una ubicación, el evento queda ligado a todos los lotes activos de esa ubicación y sus niveles inferiores en ese momento, para la trazabilidad hacia atrás y para el intervalo de seguridad.
- **Alternativas consideradas:** Obligar a capturar la labor lote por lote; multiplica la captura y la hace menos confiable.
- **Consecuencias:** La ubicación de cada charola en el tiempo debe ser exacta (transferencias registradas, BR-LOT-11). Evidencia del caso Productor A (H-05): las aplicaciones se registran por sector, así que la labor se acepta en cualquier nivel de la jerarquía.
- **Estado:** Propuesta.

---

## ADR-0013 — Orden determinista de eventos y conflictos visibles

- **Fecha:** 2026-10-18
- **Contexto:** Eventos capturados sin conexión llegan tarde y en otro orden. La exploración técnica encontró que eventos con la misma hora se aplicaban antes que sus dependencias (un sector antes que su invernadero).
- **Decisión propuesta:** Las proyecciones se construyen en orden (hora del dispositivo, nodo de origen, secuencia del dispositivo). Cada dispositivo garantiza horas y secuencias crecientes. Un evento que llega después y ya no es válido (p. ej. pérdida mayor a lo que queda) se guarda en estado CONFLICTO, visible para revisión, sin aplicarse a medias ni perderse. Dos nodos con los mismos eventos llegan al mismo estado.
- **Alternativas consideradas:** Último en llegar gana; sobrescritura ciega prohibida por doc 09 de origen.
- **Consecuencias:** El reloj de los dispositivos importa; se registra hora del dispositivo y del servidor para detectar desfases. La resolución de un conflicto es una acción de usuario con permiso (P-12). En el caso Productor A capturar con días de atraso es la norma (H-02): la fecha de la operación se guarda aparte (BR-EVT-06) y T-008 mide la reconstrucción con una semana de atraso.
- **Estado:** Propuesta (P-12).

---

## ADR-0014 — Identificación independiente de la tecnología

- **Fecha:** 2026-10-18
- **Contexto:** Doc 06 de origen: el modelo debe abstraer QR, barcode, NFC y RFID. Regla de diseño 3: no imponer RFID/NFC sin justificarlo.
- **Decisión:** Un identificador es un código asociado a una entidad (lote, charola, ubicación) con su tecnología como atributo. Una entidad puede tener varios. Un escáner USB que funciona como teclado es el mínimo soportado.
- **Alternativas consideradas:** Usar el folio como único identificador físico.
- **Consecuencias:** Cambiar de etiqueta impresa a QR o RFID no cambia el modelo.
- **Estado:** Aceptada.

---

## ADR-0015 — Configuración por productor separada del núcleo

- **Fecha:** 2026-10-18
- **Contexto:** Doc 11 de origen: separar componentes reutilizables y específicos del cliente.
- **Decisión propuesta:** Lo propio de cada productor vive en configuración, no en código: nombres de niveles de ubicación, prefijo de folio, transiciones de etapa permitidas, tipos de labor y causas de pérdida, roles y permisos, columnas de su Excel. El núcleo no tiene ramas por cliente.
- **Alternativas consideradas:** Bifurcar el código por cliente.
- **Consecuencias:** El diagnóstico (kit) produce la configuración inicial del productor; falta definir ese entregable (T-007).
- **Estado:** Propuesta.

---

## ADR-0016 — Entregables para cliente en formato Office

- **Fecha:** 2026-10-02
- **Contexto:** Ventas y el personal del productor revisan en Office.
- **Decisión:** Todo documento para clientes, ventas o recopilación de información va en Word, Excel o PowerPoint. Esta carpeta, que es para el equipo de desarrollo, se mantiene en Markdown y Git.
- **Estado:** Aceptada.

---

## ADR-0017 — Caso de prueba controlado "Productor A"

- **Fecha:** 2026-10-18
- **Contexto:** Antes de usar el paquete con un cliente real hay que saber qué documentos, preguntas y prompts fallan.
- **Decisión:** Se define un productor ficticio: 2 invernaderos, una PC antigua, control en Excel, Internet limitado y ningún sistema de trazabilidad. Se recorre con él todo el kit del consultor (Fase 0) y se usa como escenario de aceptación del Sprint 0 y del piloto técnico. Sus datos son ficticios y se marcan así.
- **Consecuencias:** T-007 produce la lista de mejoras al kit y los casos de aceptación de la plataforma.
- **Estado:** Aceptada.

---

## ADR-0018 — Esqueleto de gobierno tomado de base-shop

- **Fecha:** 2026-10-18
- **Contexto:** Fernando pidió planificar antes de programar con el mismo esquema de reglas y fuentes de verdad de base-shop.
- **Decisión:** Se adoptan de base-shop: `CLAUDE.md` con fuente de verdad y reglas, el juego de documentos de `docs/`, ADR con estados, decisiones pendientes P-xx, tareas T-xxx con criterios de aceptación, sprints con review, Definition of Done, GitHub Flow y Conventional Commits. Se adapta: Sprint 0 incluye la validación con el caso Productor A. No se adoptan por ahora: stack NestJS/PostgreSQL/Docker (ADR-0007), OpenAPI generado, auditoría de seguridad formal y plantillas CSV de carga en inglés, que se revisan cuando haya código.
- **Consecuencias:** Si una pieza del esqueleto no sirve para este proyecto, se cambia con un ADR.
- **Estado:** Aceptada.

---

## ADR-0019 — Hosting y servidor se deciden con el primer cliente

- **Fecha:** 2026-10-19
- **Contexto:** ADR-0008 define un servidor externo con PostgreSQL, pero el proveedor, la región, el tamaño y el costo dependen de lo que decida y pague cada cliente. Base-shop hizo lo mismo: corre solo en el entorno local hasta que una entidad quiera usarlo.
- **Decisión:** No se elige proveedor, región, tamaño ni costo del servidor hasta tener un cliente que lo decida (P-07). Mientras tanto el desarrollo y las pruebas corren en el entorno local: PostgreSQL local para el papel de servidor y SQLite para el nodo local. El código no depende de un proveedor (sin servicios propietarios de una nube).
- **Alternativas consideradas:** Elegir un proveedor ahora para el piloto; descartada porque la decisión y el costo son del cliente.
- **Consecuencias:** P-07 y lo que depende del hosting (respaldo fuera del sitio, P-05; TLS y dominio del servidor, parte de P-08) salen del criterio de cierre del Sprint 0. El primer cliente con servidor abre una tarea de despliegue.
- **Estado:** Aceptada (Fernando).

---

## ADR-0020 — Un solo repositorio para la plataforma

- **Fecha:** 2026-10-19
- **Contexto:** P-02 pedía nombre, cuenta y forma del repositorio. El nodo local entrega juntas la API y la interfaz, y el contrato de eventos es el mismo en la cola sin conexión del navegador y en la API. El equipo es pequeño.
- **Decisión:** Un solo repositorio, `Ferchoner/trazabilidad-agro` en GitHub, creado por Fernando. La raíz contiene `CLAUDE.md`, `README.md` y `docs/` (lo que hoy es la carpeta `plataforma/`). El código llegará con T-100 en `apps/api` (NestJS), `apps/web` (interfaz) y `packages/contracts` (tipos de eventos compartidos). El kit del consultor, el análisis, la documentación de origen y la exploración técnica (`spikes/`) quedan fuera de Git, en la carpeta compartida del proyecto (ADR-0002, ADR-0016). A partir de que se integre el primer pull request, el repositorio es la fuente de verdad de esta documentación y la carpeta `plataforma/` compartida es una copia de lectura.
- **Alternativas consideradas:** Repositorios separados para API, interfaz y contratos; descartada porque obliga a versionar y publicar el contrato de eventos entre repositorios para un solo equipo. Un repositorio con el kit en Office; descartada por ADR-0002.
- **Consecuencias:** Un segundo repositorio solo se justifica para una aplicación nativa o un conector ERP grande (Fase 5). La CI mínima (T-010) se activa cuando T-100 cree el primer proyecto de Node; la protección de `main` se configura en GitHub.
- **Estado:** Aceptada (2026-10-19, Fernando).

---

## ADR-0021 — Demo para futuros clientes, separado del producto

- **Fecha:** 2026-10-19
- **Contexto:** Fernando pidió el 2026-10-19 un demo que los futuros clientes puedan probar: registrar lotes y ver sus estados y el inventario. Choca con dos reglas vigentes: no hay código de producto hasta cerrar el Sprint 0 (`PROGRESS.md`) y el hosting se decide con el primer cliente (ADR-0019).
- **Decisión:**
  1. El demo es material de ventas, no el producto ni la prueba técnica T-008. Su código no se copia al producto sin pasar por T-101.
  2. Usa el stack de ADR-0007: TypeScript, NestJS y SQLite en el entorno local, con la interfaz web servida por la misma aplicación (como el nodo local de `ARCHITECTURE.md`). Corre en la laptop del consultor y se abre en el navegador de la PC, teléfono o tablet de la misma red.
  3. No se publica en ningún hosting. Cuando el demo esté probado y listo para presentarse, Fernando lo presenta y entonces se decide si se lleva a un hosting para que los clientes lo prueben solos (ADR-0019).
  4. Aplica las reglas ya escritas: eventos inmutables con UUID e idempotencia y estado derivado (ADR-0005), orden determinista y CONFLICTO visible (ADR-0013), anulación en lugar de edición (ADR-0011), estado del lote en tres ejes (ADR-0009) con las etapas configuradas del Productor A (ADR-0015), jerarquía Centro → Invernadero → Sector → Mesa (ADR-0003), labores por ubicación ligadas a los lotes presentes (ADR-0012), folio corto (ADR-0010), fecha de la operación aparte de la de captura (BR-EVT-06) y las reglas BR-LOT, BR-LAB, BR-CAL y BR-ENT que toca. Lo que aún es Propuesta se muestra como propuesta.
  5. Usa los datos ficticios del caso Productor A, marcados como tales en pantalla (ADR-0017).
  6. El código vive en este repositorio en `demo/`, fuera de `apps/` y `packages/`, con sus propias pruebas, incluida la de reconstrucción. La guía del demo va en Word (ADR-0016), en la carpeta compartida.
- **Alternativas consideradas:** Página que corre entera en el navegador y se comparte por enlace (el cliente la prueba solo, pero no usa NestJS y adelanta la decisión de dónde publicarla); servidor público en la nube (obliga a elegir proveedor antes del primer cliente, ADR-0019); esperar al MVP (no hay nada que mostrar en ventas hasta entonces); dejar el demo fuera de Git como `spikes/` (ADR-0020), descartada porque el demo se mantiene y se prueba, no se desecha.
- **Consecuencias:** El cliente no lo prueba solo hasta decidir el hosting; mientras tanto lo presenta el consultor. El demo no demuestra servidor PostgreSQL, sincronización entre equipos, captura sin señal ni rendimiento en la PC mínima; eso sigue en T-008. Simplificaciones del demo, no del producto: un solo nodo y un solo bloque de folios (P-11), selección de usuario sin PIN (P-40), proyecciones en memoria reconstruidas al arrancar, sin charolas individuales (el Productor A traza por lote, P-14) y botón para regresar a los datos iniciales. Cada cambio de reglas del producto se lleva al demo a mano mientras sean código separado. Amplía ADR-0020 con la carpeta `demo/`.
- **Estado:** Aceptada (2026-10-19, Fernando: NestJS local, el hosting se decide después de presentarlo).

---

## ADR-0022 — El demo se ve como producto terminado

- **Fecha:** 2026-10-23
- **Contexto:** Al revisar el demo (T-012), Fernando pidió el 2026-10-23 que no se vean los avisos de que es un demo: busca que el cliente vea un producto terminado. ADR-0021 punto 5 pedía marcar en pantalla los datos ficticios.
- **Decisión:** Reemplaza ADR-0021 punto 5. La interfaz del demo no muestra avisos de "demo", "ficticio" ni "no es el producto". El nombre del productor sale de la configuración. La elección de usuario es una pantalla de inicio de sesión (sigue sin contraseña, P-40) y "Restablecer datos" pasa a una pantalla de Administración solo para el Administrador. Lo interno (README, `docs/`, código y la guía del consultor) sigue diciendo que es un demo con datos ficticios del caso Productor A (ADR-0017).
- **Alternativas consideradas:** Mantener la franja de aviso (lo que Fernando descartó); un modo "presentación" que la oculte (dos versiones que mantener).
- **Consecuencias:** El consultor aclara al presentar que los datos son de un caso ficticio; la guía en Word lo dice. Sin contraseña, el demo sigue solo en la laptop o en una red de confianza (SECURITY.md).
- **Estado:** Aceptada (2026-10-23, Fernando, plan T-013).

---

## ADR-0023 — Etiquetas impresas desde el navegador, con Code 128

- **Fecha:** 2026-10-23
- **Contexto:** Fernando pidió el 2026-10-23 que el demo muestre cómo se registra físicamente un lote: con pistola lectora de códigos de barras y con la impresión de su etiqueta. ADR-0014 ya fija como mínimo la etiqueta impresa y el escáner USB que funciona como teclado; falta decidir cómo se imprime (UC-IDE-03, T-131).
- **Decisión:** La etiqueta se genera en el navegador: código de barras Code 128 en SVG con un codificador propio, sin librerías externas ni Internet (CSP `script-src 'self'`). Se imprime con el diálogo de impresión del sistema a cualquier impresora instalada, en cuatro formatos: térmica de 100 × 50 mm, rollo térmico de 80 mm, rollo térmico de 58 mm y hoja carta con varias etiquetas. El código de un lote es su folio (`L-0822`) y el de una tabla, su ruta (`INV1-A-M1`). Cada impresión es un evento inmutable `LabelPrinted` que no cambia el estado del lote. La pistola se reconoce por su ritmo de teclas (muy seguidas y con Enter al final); la cámara se usa solo donde el navegador trae lector de códigos y el contexto es seguro (P-06).
- **Alternativas consideradas:** Impresión directa en lenguaje de impresora (ZPL, TSPL), que exige un servicio local por marca y queda para el MVP (T-131); QR, que obliga a una pistola 2D; una librería de códigos desde CDN, que rompe la operación sin Internet.
- **Consecuencias:** Funciona con cualquier impresora con controlador de Windows; los márgenes y la escala dependen del controlador, y la guía indica cómo ajustarlos. Aplica al demo; para el producto la retoma T-131.
- **Estado:** Aceptada para el demo (2026-10-23, Fernando, plan T-013).
