# PLAN T-012 — Demo de lotes, estados e inventario para futuros clientes

Estado: **para aprobación de Fernando**. No se escribe código hasta aprobarlo (`AI_WORKFLOW.md`).
Decisión de base: ADR-0021 (NestJS local, sin hosting hasta presentarlo). Datos ficticios del caso Productor A (ADR-0017).

## 1. Objetivo

Que el consultor muestre a un futuro cliente, en su laptop y en el navegador de la PC, teléfono o tablet de la misma red, cómo se registra un lote, cómo cambia de estado y cómo se ve el inventario, con las reglas que ya están escritas en `docs/`.

## 2. Alcance

### Lo que el demo hace

| # | Función | Reglas que aplica |
|---|---|---|
| 1 | Cargar el caso Productor A: 1 centro, 2 invernaderos, 4 sectores, 12 tablas, 3 variedades, 2 proveedores, los lotes del Excel 2026 y su temporada simulada hasta hoy | ADR-0017, BR-INT-01 a 05 |
| 2 | Registrar un lote planificado o sembrado: folio corto (sigue después de L-0820), variedad, material vegetal, tabla, charolas, cavidades, cantidad y fecha de la operación | ADR-0010, BR-LOT-01, 03, BR-EVT-06, BR-MAT-01 |
| 3 | Cambiar etapa solo por las transiciones del Productor A: Planificado → Sembrado → Enraizado → Listo → Cerrado | ADR-0009, ADR-0015, BR-LOT-04 |
| 4 | Registrar pérdida con causa del catálogo del productor | BR-LOT-05, 06 |
| 5 | Transferir el lote a otra tabla | BR-LOT-11 |
| 6 | Poner en cuarentena con motivo y liberar | BR-CAL-01, 02 |
| 7 | Registrar aplicación sobre un lote o un sector, con intervalo de seguridad del catálogo; sin intervalo se registra con advertencia | ADR-0012, BR-LAB-01 a 03 |
| 8 | Registrar entrega de un pedido con una o varias líneas de lote; se rechaza si un lote no está Listo, está en cuarentena o en intervalo de seguridad | BR-ENT-01, 02 |
| 9 | Anular un evento equivocado con motivo; el estado se reconstruye y un evento que deja de ser válido queda en CONFLICTO visible | ADR-0011, ADR-0013, BR-EVT-03, 05 |
| 10 | Ver el estado de cada lote en sus tres ejes: etapa, retención (Libre o En cuarentena) y situación comercial calculada (Disponible, Parcialmente vendido, Vendido) | ADR-0009 |
| 11 | Ver el inventario: plántulas por variedad y etapa, separando lo entregable de lo bloqueado por cuarentena o intervalo; y por ubicación (invernadero, sector, tabla) | UC-REP-01 |
| 12 | Ver mermas por causa y por lote (responde "sembramos 14 mil y entregamos menos") | UC-REP-02 |
| 13 | Ficha del lote: datos, origen del material, ubicaciones, labores directas y por sector, inspecciones, cuarentenas, entregas e historia completa de eventos | UC-LOT-08, UC-REP-04 |
| 14 | Calidad de datos de la importación: las 4 filas del Excel que no entran y por qué | BR-INT-02 |
| 15 | Elegir con qué rol se captura (Administrador, Oficina, Producción, Capturista, Ventas); cada rol solo puede lo que dice la configuración | BR-USR-01, 02, REQUIREMENTS §4 |
| 16 | Regresar a los datos iniciales del caso con un botón (solo Administrador) | ADR-0021 |

### Lo que el demo no hace (sigue en T-008 o en el MVP)

Servidor PostgreSQL, sincronización entre equipos o por archivo, captura sin señal desde el teléfono, importación de un Excel nuevo, división de lotes, resiembra, charolas individuales y etiquetas, PIN o contraseña, respaldos, rendimiento en la PC mínima.

## 3. Diseño

### Stack (ADR-0007)

- TypeScript, NestJS 11 y Node.js 24.
- SQLite con el módulo `node:sqlite` que trae Node.js: no se instala ni se compila nada en Windows, que es justo el riesgo que ADR-0007 pide revisar en T-008.
- Interfaz web en español, HTML, CSS y JavaScript sin framework, servida por la misma aplicación. Funciona en PC, teléfono y tablet.
- Jest para pruebas, oxlint y Prettier como en base-shop.

### Estructura en `demo/` (ADR-0020 ampliada por ADR-0021)

```text
demo/
  config/productor-a.json   configuración del productor (ADR-0015): niveles, etapas, roles, causas, catálogo
  src/
    domain/                 reglas y máquina de estados del lote, sin NestJS
    platform/               almacén de eventos en SQLite, reloj, configuración, reconstrucción
    application/            casos de uso: validan contra el estado actual y producen el evento
    presentation/           API JSON de NestJS
    seed/                   caso Productor A como eventos
  public/                   interfaz web
  test/                     pruebas unitarias, de reconstrucción y de la API
```

### Eventos

- Forma del evento de `DOMAIN_MODEL.md`: UUID, tipo, entidad, hora del dispositivo, fecha de la operación, hora de registro, usuario, dispositivo, nodo, secuencia, contenido, versión y huella.
- Tipos ya documentados: `LocationCreated`, `VarietyCreated`, `PlantMaterialRegistered`, `ProductRegistered`, `LotPlanned`, `LotSown`, `LotStageChanged`, `LotTransferred`, `LossRecorded`, `LotCancelled`, `LotClosed`, `ApplicationRecorded`, `FertilizationRecorded`, `InspectionRecorded`, `QuarantineStarted`, `QuarantineReleased`, `DispatchRecorded`, `EventVoided`. No se inventan tipos nuevos.
- Reenviar el mismo evento no tiene efecto; el mismo UUID con otro contenido se rechaza.
- El estado se calcula aplicando los eventos en el orden de ADR-0013 y se reconstruye completo al arrancar y al anular.

### Datos del caso Productor A (ficticios)

- Ubicaciones, variedades, proveedores, etapas, roles y causas de `Configuración inicial - Productor A.xlsx`.
- Lotes de `Productor_A_control_siembra_2026.xlsx` con las reglas de importación: entran L-0812 a L-0818; no entran la fila sin folio, L-0819 (fecha ilegible), el segundo L-0816 (folio repetido) y L-0820 (más plantas que cavidades). Las mermas del Excel entran con la causa "No registrada (importación)" y sin fecha.
- Temporada simulada hasta el 19 de octubre con lo que dice el guion del caso: fertirriego semanal por sector, aplicaciones del 10 y 28 de septiembre en Inv 1 sector A, avance a Enraizado (unas 3 semanas) y a Listo (8 a 10 semanas), movimientos en Inv 2, una cuarentena en Inv 2, entregas a Rancho El Sauz (P-101, 900 de L-0812) y Agrícola Los Pinos (P-102, 1000 Festival desde L-0812 y L-0813).

## 4. Pasos

| Paso | Entregable | Cómo se verifica |
|---|---|---|
| 1 | Proyecto NestJS en `demo/` que arranca con `npm start`, configuración validada al arrancar | Arranca sin Internet con Node.js 24 |
| 2 | Almacén de eventos en SQLite con idempotencia y huella | Pruebas: duplicado sin efecto, mismo UUID con otro contenido rechazado |
| 3 | Dominio del lote: tres ejes, transiciones, cantidades, intervalo de seguridad, cuarentena, entregas | Una prueba por regla de la tabla del §2 |
| 4 | Reconstrucción, anulación y CONFLICTO | Prueba: reconstruir desde cero da el mismo estado; una anulación deja en CONFLICTO lo que ya no es válido |
| 5 | API JSON con permisos por rol | Pruebas de la API con los casos del §2 |
| 6 | Carga del caso Productor A | Prueba: totales de lotes, plántulas, mermas y entregas cuadran con el guion |
| 7 | Interfaz web: resumen, lotes, registrar lote, ficha del lote con acciones, inventario, mermas, entregas, eventos, importación | Recorrido completo en navegador de PC y de teléfono, con capturas |
| 8 | Guía del demo en Word para presentarlo (ADR-0016), en la carpeta compartida | Revisión de Fernando |
| 9 | Documentación: `TASKS.md`, `PROGRESS.md`, `CHANGELOG.md` y `demo/README.md` | PR listo para revisión con el reporte de `CLAUDE.md` |

Todo va en el mismo PR (#5), un commit por paso.

## 5. Decisiones que tomo por defecto (dime si alguna no va)

1. **NestJS 11 y no 12.** La 12 salió hace días; la 11 es la estable conocida. Cambiar después es una actualización de versión.
2. **`node:sqlite` en lugar de Prisma.** No necesita compilar nada en Windows. El producto decide su ORM en T-008.
3. **Fila con más plantas que cavidades = error.** `BUSINESS_RULES.md` (BR-INT-02) dice error; la configuración del Productor A dice advertencia. Sigo la regla y lo anoto como contradicción.
4. **Entregar un lote con intervalo de seguridad desconocido se bloquea** con un mensaje que cita P-19, porque esa regla sigue pendiente.
5. **El nivel Mesa se muestra como "Tabla"**, el nombre que usa el Productor A, para enseñar que cada productor configura sus nombres.
6. **Rama:** la que asignó esta sesión (`claude/project-thread-bjejn1`), no `feat/T-012-...`; las sesiones de Claude solo pueden subir a esa rama.

## 6. Riesgos

- El demo puede tomarse por el producto: la pantalla y la guía dicen que es un demo con datos ficticios.
- Las reglas en Propuesta (ADR-0009, 0011, 0012, 0013, 0015) pueden cambiar; el demo se ajusta a mano.
- `node:sqlite` todavía marca advertencia de función experimental en Node.js 24; no afecta el demo y se evalúa en T-008.
