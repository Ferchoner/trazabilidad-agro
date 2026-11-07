# PLAN T-014: Inventario y acciones por lote, charola y plántula (análisis y plan)

Estado: **aprobado por Fernando el 2026-11-04** con dos cambios: se descarta el bloque (se pasa de lote a charola) y, donde se registran plántulas por lote, la cantidad viene prellenada con el máximo (charolas × cavidades), porque casi siempre se usan todas las cavidades, y el máximo queda marcado en cuanto se capturan charolas y cavidades (§4, función 10). El resto, con las recomendaciones de este análisis.
Origen: mensaje de Fernando del 2026-11-04: ver el inventario y las acciones por lote, dentro del lote por bloques o charolas y, si es posible, por plántula dentro de la charola, con análisis de costo y viabilidad.
Decisiones relacionadas: ADR-0004 (el lote es la unidad central; charola como posible nivel adicional), ADR-0014 (identificación), ADR-0023 (etiquetas), P-14 (lote, charola o ambos), P-16 (unidad de conteo), BR-CHA-01 a 04, UC-LOT-04, UC-IDE-03.

## 1. Resumen

| Nivel | ¿Viable? | Costo principal | Recomendación |
|---|---|---|---|
| Lote | Ya está | — | Se queda como unidad central (ADR-0004) |
| Bloque (grupo de charolas) | Sí | Casi nulo: no pide etiquetas nuevas | **Descartado por Fernando (2026-11-04)**: se pasa de lote a charola |
| Charola | Sí | Una etiqueta resistente por charola, que se reutiliza; un escaneo por charola en cada operación | **Implementarlo en el demo** y dejarlo configurable por productor (P-14) |
| Plántula con identificador propio | No | Una etiqueta o chip por plántula y un escaneo por plántula; la trazabilidad se corta al entregar | **No implementarlo** |
| Plántula por posición en la charola (cavidad) | Sí, para excepciones | Marcar en un mapa de la charola solo las cavidades con algo que contar | **Implementarlo en el demo** como mapa de cavidades |

## 2. Lo que dice el caso Productor A (AS-IS, datos ficticios)

- Charolas de 72 y 128 cavidades, sin número ni etiqueta. El folio va en una estaca por mesa, escrito con plumón (guion del caso).
- Ambiente: humedad alta, riego por aspersión que moja charolas y estacas, sol directo.
- Las charolas se mueven de mesa seguido, sobre todo en Inv 2, y no se registra.
- Resiembra en cerca de 1 de cada 20 charolas; a veces con plántula de otro lote (H-01, BR-CHA-04).
- Al entregar se cuentan charolas llenas, no plántulas.
- El dueño pidió por charola "no por ahora" y mencionó "chips como los del ganado".
- Temporada 2026 del demo: 121 charolas, 10,270 plántulas sembradas, 312 perdidas, 1,900 entregadas en 2 pedidos.

Con esto, la charola sí resuelve problemas del AS-IS:
- los movimientos parciales no registrados;
- la pérdida sin causa;
- la resiembra que mezcla lotes;
- la entrega por charolas.

La plántula individual no resuelve ninguno que la charola no resuelva ya (regla 17 de `CLAUDE.md`).

## 3. Costo por nivel

Los tiempos son estimaciones, no medidas: un escaneo de pistola toma unos 2 a 3 segundos con la charola a la mano. Los precios de etiquetas, pistolas y chips no se inventan: quedan **PENDIENTE de cotizar** con proveedores. Aquí se dan las cantidades a cotizar.

### 3.1 Bloque (rango de charolas)

- Equipo: ninguno nuevo. Si las charolas tienen número, el bloque es "C01 a C10"; si no, basta la estaca de la mesa.
- Captura: igual que hoy, más elegir el rango.
- Software: bajo. Es una forma de elegir charolas, no una entidad nueva.

### 3.2 Charola

| Concepto | Cantidad en Productor A | Nota |
|---|---|---|
| Etiquetas | Unas 120 a 200 charolas en uso, **una vez** | Una charola conserva su código al reutilizarse (BR-CHA-02). Material sintético por la humedad y el sol (`08_matriz_hardware.md`) |
| Pistola | 1 o 2 | La de ADR-0014. En el invernadero conviene inalámbrica |
| Escaneos al entregar 900 plántulas (P-101) | 13 charolas: unos 30 a 40 segundos | Hoy se cuentan charolas igual |
| Escaneos al mover una mesa | Una lectura por charola movida, más la de la mesa destino | Hoy no se registra |
| Datos | Unas 200 filas de charola y sus eventos por temporada | Insignificante para SQLite en la PC mínima |
| Software | Medio | `Tray` ya está en `DOMAIN_MODEL.md` y `DATABASE.md`. El cambio es que la ubicación y la cantidad se lleven por charola y el lote las sume |

Sin etiqueta física también funciona, con un costo de capturar a mano: el código se genera del folio (`L-0812-C01`, BR-CHA-03) y se imprime en la hoja o en una estaca por grupo.

### 3.3 Plántula con identificador propio

| Concepto | Cantidad en Productor A | Nota |
|---|---|---|
| Identificadores | 10,270 por temporada; no se reutilizan porque la plántula se va con el cliente | Una etiqueta no cabe en una cavidad de 128 sin estorbar la planta |
| Escaneos al entregar 900 plántulas | 900: unos 30 a 45 minutos, contra menos de 1 minuto por charola | |
| Escaneos al sembrar | 10,270 | Hoy se anotan 3 datos por lote |
| Chip RFID ("como el ganado") | Uno por plántula | La Fase 6 lo deja fuera; en una plántula de pocas semanas no tiene dónde ir |
| Trazabilidad útil | Se corta en la entrega: el cliente trasplanta y no lee el código | La pregunta "de dónde vino esta planta" ya la contesta el lote |

Conclusión: el costo crece con cada plántula y no compra trazabilidad que el lote o la charola no den.

### 3.4 Plántula por posición (mapa de cavidades)

Lo que sí da detalle dentro de la charola, sin identificadores:
- Se muestra la charola como una cuadrícula: 6 × 12 para 72 cavidades y 8 × 16 para 128.
- Se marcan solo las cavidades con algo que contar: vacía o no pegó, pérdida con causa, resembrada con plántula de otro lote, o observada en una inspección.
- Las cavidades sin marca se cuentan como sanas.

| Concepto | Cantidad en Productor A | Nota |
|---|---|---|
| Marcas por temporada | Hasta unas 312 pérdidas y la resiembra de 1 de cada 20 charolas | Solo excepciones |
| Equipo | El teléfono o la tablet con la que ya se captura | |
| Captura | Tocar las cavidades en pantalla | Opcional: se puede seguir registrando solo la cantidad |
| Software | Bajo a medio | Eventos con la lista de posiciones; la cantidad sigue siendo la del lote y la charola |

## 4. Lo que se propone construir en el demo

| # | Función | Reglas |
|---|---|---|
| 1 | Al sembrar, el lote crea sus charolas `FOLIO-C01…Cnn` con sus cavidades y plántulas; la última puede ir incompleta | BR-CHA-01, BR-CHA-03, BR-LOT-03 |
| 2 | Ficha del lote con pestaña **Charolas**: cada charola con mesa, plántulas, pérdidas y estado; filtros por mesa | UC-LOT-08 |
| 3 | **Inventario** con un nivel más: invernadero → sector → mesa → lote → charolas | UC-REP-01 |
| 4 | **Mover charolas**: todas o las elegidas (marcadas o escaneadas) a otra mesa, escaneando la mesa destino. Un lote puede quedar repartido en varias mesas | UC-LOT-04, BR-LOT-11 |
| 5 | **Pérdida por charola**, con causa, y opcionalmente las cavidades en el mapa | BR-LOT-05 |
| 6 | **Mapa de cavidades** en la charola: vacía, perdida, resembrada, observada | BR-CHA-04 (resiembra, solo dentro del mismo lote en el demo) |
| 7 | **Entrega por charolas**: escanear las charolas del pedido suma sus plántulas a la línea del lote | BR-ENT-01, 02 |
| 8 | **Etiqueta de charola** en los cuatro formatos de ADR-0023, con código Code 128 `L-0812-C01`; la pistola la reconoce en cualquier pantalla | ADR-0014, ADR-0023, UC-IDE-03 |
| 9 | Los datos del caso Productor A se cargan con sus 121 charolas, y pérdidas, movimientos y entregas repartidos por charola | ADR-0017 |
| 10 | Al registrar plántulas por lote (Registrar lote y Sembrar), la cantidad viene **prellenada con el máximo** (charolas × cavidades), que se recalcula al cambiar charolas o cavidades y queda marcado junto a la cantidad; se puede bajar, pero no pasarlo | BR-LOT-03 |

Fuera del alcance:
- resiembra entre lotes (P-13);
- división en sublotes (UC-LOT-05);
- cuarentena de solo algunas charolas;
- identificador por plántula;
- RFID.

## 5. Decisiones por defecto (cámbialas si no te sirven)

1. ~~Bloque = rango de charolas~~: descartado; de lote se pasa a charola.
2. **Cuarentena y aplicaciones siguen por lote** (BR-CAL-01, ADR-0012). Una aplicación en una mesa bloquea la entrega de todo lote que tenga alguna charola ahí; es la opción conservadora. Bloquear solo las charolas tratadas queda como **PENDIENTE DE DECISIÓN (P-42)** para el producto.
3. **El lote sigue mandando en las cantidades.** Una pérdida o entrega capturada sin charola, incluidos los eventos ya guardados (regla 12), queda en "sin charola asignada" y no se reparte inventando datos.
4. **En el demo, por charola siempre activo.** En el producto, cada productor elige lote, charola o ambos (P-14, ADR-0015); Productor A dijo "no por ahora".
5. **Mapa de cavidades opcional**: registrar solo la cantidad sigue siendo válido.
6. **Código de charola `FOLIO-Cnn`**, generado del folio (BR-CHA-03). Un código físico reutilizable de charola (BR-CHA-02) queda para el producto (T-123).

## 6. Pasos (después de aprobar)

1. Rama nueva desde `main`.
2. T-014 en TASKS con criterios.
3. ADR-0024 (aceptada para el demo): "El demo traza por charola y por posición de cavidad, sin identificador por plántula".
4. Agregar P-42 en PROGRESS.
5. Dominio:
   - charolas en la proyección;
   - eventos `TraysTransferred` y `CavitiesMarked` (en la implementación, el movimiento por charola quedó como `LotTransferred` con detalle de charolas; ver ADR-0024);
   - `LossRecorded` y `DispatchRecorded` con detalle opcional por charola;
   - ubicación del lote como conjunto de mesas.
   - Pruebas, incluida la reconstrucción desde cero.
6. Datos del caso con charolas, cuadrando los totales actuales (10,270 / 312 / 1,900 / 8,058).
7. API e interfaz:
   - pestaña Charolas;
   - mapa de cavidades;
   - mover por rango;
   - entrega por charola;
   - inventario con un nivel más;
   - etiqueta y lectura de charola.
8. Prueba en navegador en PC y teléfono, con la pistola simulada. Los PDF de las etiquetas de charola se leen de vuelta con un decodificador independiente.
9. Documentación, guía en Word y PR con el reporte.

## 7. Riesgos

- Que un lote esté en varias mesas cambia el cálculo de "qué lotes estaban en la mesa tratada" (ADR-0012). Se cubre con pruebas y con la regla conservadora del §5.2.
- Más detalle en pantalla puede abrumar en el teléfono: la pestaña Charolas se abre solo a pedido y el mapa, solo al tocar una charola.
- Lo que el demo muestre por charola debe presentarse como opción, no como requisito: Productor A no lo pidió todavía (P-14).
