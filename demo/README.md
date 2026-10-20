# Demo para futuros clientes (T-012, ADR-0021)

Demo de lotes, estados e inventario con los **datos ficticios del caso Productor A** (ADR-0017). Es material de ventas, **no es código de producto**: su código no se copia a `apps/` ni a `packages/` sin pasar por T-101. Corre en el entorno local; el hosting se decide después de presentarlo (ADR-0019, ADR-0021).

Plan aprobado: `docs/planes/PLAN-T-012-demo.md`. Guía para presentarlo (Word): carpeta compartida del proyecto, `demo/Guía del demo - Productor A.docx`.

## Arrancar

Requisito: Node.js 24 (ADR-0007). No se compila nada: SQLite viene con Node.js (`node:sqlite`).

```bash
cd demo
npm install          # solo la primera vez, con Internet
npm start            # compila y abre http://127.0.0.1:3000
```

En Windows: doble clic en `INICIAR_DEMO.bat`.

- Sin Internet una vez instalado.
- Para abrirlo desde un teléfono o tablet de la misma red: `HOST=0.0.0.0 npm start` y abrir `http://<IP de la laptop>:3000`. No hay PIN (P-40): solo en una red de confianza.
- La base queda en `demo/data/demo.sqlite` (fuera de Git). Otra ruta: `DEMO_DB=...`. Otro puerto: `PORT=...`.
- "Regresar a los datos iniciales" (pie de página, solo Administrador) recarga el caso Productor A.

## Qué muestra

| Pantalla       | Qué enseña                                                                                               | Reglas                              |
| -------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Resumen        | Indicadores y un recorrido sugerido para la presentación                                                 | —                                   |
| Lotes          | Estado en tres ejes: etapa, retención y situación comercial calculada                                    | ADR-0009                            |
| Ficha del lote | Origen, ubicaciones en el tiempo, aplicaciones, entregas, historia de eventos y operaciones según el rol | UC-LOT-08, UC-REP-04, ADR-0012      |
| Registrar lote | Folio corto, cavidades, fecha de la operación                                                            | ADR-0010, BR-LOT-03, BR-EVT-06      |
| Inventario     | Por variedad y etapa, separando cuarentena e intervalo; por invernadero, sector y tabla                  | UC-REP-01, BR-LOT-11                |
| Entregas       | Varios lotes por pedido; se rechaza todo si una línea no cumple                                          | BR-ENT-01, 02, BR-CAL-01, BR-LAB-03 |
| Mermas         | Por causa y por lote                                                                                     | UC-REP-02                           |
| Eventos        | Bitácora inmutable con anulaciones y conflictos                                                          | ADR-0005, ADR-0011, ADR-0013        |
| Excel 2026     | Vista previa de las 11 filas del Excel del productor: 7 entran (4 con aviso) y 4 no                      | BR-INT-01 a 05                      |

## Simplificaciones del demo (no del producto)

Un solo nodo y un solo bloque de folios (P-11); usuario elegido en pantalla, sin PIN (P-40); proyecciones en memoria reconstruidas desde los eventos al arrancar; sin charolas individuales ni etiquetas (el Productor A traza por lote, P-14); sin división, resiembra, sincronización, captura sin señal ni respaldos. Lo que no demuestra sigue en T-008.

## Estructura

```text
config/productor-a.json   configuración del productor (ADR-0015)
src/domain/               reglas, máquina de estados y consultas, sin NestJS
src/platform/             almacén de eventos SQLite, reloj, configuración, huellas
src/application/          casos de uso: permisos, idempotencia, reconstrucción
src/presentation/         API JSON de NestJS y errores como Problem Details
src/seed/                 caso Productor A como eventos y Excel 2026 transcrito
public/                   interfaz web (HTML, CSS y JavaScript sin framework)
test/                     reglas, reconstrucción, almacén y API
```

## Verificar

```bash
npm run check   # typecheck + oxlint + prettier + jest
```
