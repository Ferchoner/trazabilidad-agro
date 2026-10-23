# Demo para futuros clientes (T-012, T-013, ADR-0021, ADR-0022, ADR-0023)

Demo de lotes, estados e inventario con los **datos ficticios del caso Productor A** (ADR-0017). Es material de ventas, **no es código de producto**: su código no se copia a `apps/` ni a `packages/` sin pasar por T-101. Corre en el entorno local; el hosting se decide después de presentarlo (ADR-0019, ADR-0021).

Planes aprobados: `docs/planes/PLAN-T-012-demo.md` y `docs/planes/PLAN-T-013-demo-producto-etiquetas.md`.

En pantalla no se ve ningún aviso de demo ni de datos ficticios (ADR-0022): quien lo presenta aclara que los datos son del caso ficticio Productor A. Guía para presentarlo (Word): carpeta compartida del proyecto, `demo/Guía del demo - Productor A.docx`.

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
- Al abrir se elige el usuario (inicio de sesión sin contraseña, P-40).
- "Restablecer datos" (pantalla Administración, solo Administrador) recarga el caso Productor A. Una base creada con una versión anterior conserva sus datos hasta restablecerla.

## Etiquetas y lector de códigos (ADR-0014, ADR-0023)

- Etiquetas de lote (código = folio) y de tabla (código = `INV1-A-M1`) con Code 128, generadas en el navegador sin Internet.
- Formatos: térmica 100 × 50 mm, rollo térmico de 80 mm (80 × 50), rollo térmico de 58 mm (58 × 40) y hoja carta con 10 etiquetas de 4 × 2 pulgadas. Se imprime con el diálogo del sistema: elegir la impresora, márgenes "Ninguno" y escala 100 %. En una térmica, el tamaño de papel del controlador debe coincidir con el formato.
- Cada impresión queda como evento `LabelPrinted` en la historia del lote.
- Pistola USB o Bluetooth en modo teclado (con Enter al final): funciona en cualquier pantalla sin instalar nada. Lote → abre su ficha; en la ficha, tabla → destino del movimiento; en Registrar lote, tabla → ubicación; en Entregas, lote → nueva línea; en Etiquetas, lo agrega a la impresión. Sin pistola, el código se escribe en "Escanear o escribir código" y Enter.
- Cámara: solo en navegadores con lector de códigos (Chrome o Edge en Android y macOS) y en contexto seguro (`127.0.0.1` o HTTPS, P-06).

## Qué muestra

| Pantalla       | Qué enseña                                                                                               | Reglas                              |
| -------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Resumen        | Indicadores y lotes que piden atención hoy                                                               | —                                   |
| Lotes          | Estado en tres ejes: etapa, retención y situación comercial calculada                                    | ADR-0009                            |
| Ficha del lote | Origen, ubicaciones en el tiempo, aplicaciones, entregas, historia de eventos y operaciones según el rol | UC-LOT-08, UC-REP-04, ADR-0012      |
| Registrar lote | Folio corto, cavidades, fecha de la operación                                                            | ADR-0010, BR-LOT-03, BR-EVT-06      |
| Inventario     | Por variedad y etapa, separando cuarentena e intervalo; por invernadero, sector y tabla                  | UC-REP-01, BR-LOT-11                |
| Entregas       | Varios lotes por pedido; se rechaza todo si una línea no cumple                                          | BR-ENT-01, 02, BR-CAL-01, BR-LAB-03 |
| Mermas         | Por causa y por lote                                                                                     | UC-REP-02                           |
| Eventos        | Bitácora inmutable con anulaciones y conflictos                                                          | ADR-0005, ADR-0011, ADR-0013        |
| Etiquetas      | Etiquetas de lote y tabla en cuatro formatos, con su historial de impresión                              | ADR-0023, UC-IDE-03                 |
| Administración | Usuarios, prueba del lector y restablecer datos                                                          | ADR-0022                            |
| Excel 2026     | Vista previa de las 11 filas del Excel del productor: 7 entran (4 con aviso) y 4 no                      | BR-INT-01 a 05                      |

## Simplificaciones del demo (no del producto)

Un solo nodo y un solo bloque de folios (P-11); inicio de sesión sin PIN (P-40); proyecciones en memoria reconstruidas desde los eventos al arrancar; sin charolas individuales ni etiquetas de charola (el Productor A traza por lote, P-14); impresión por el diálogo del sistema, sin lenguaje de impresora (T-131); sin división, resiembra, sincronización, captura sin señal ni respaldos. Lo que no demuestra sigue en T-008.

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
