# PLAN T-013 — Demo con aspecto de producto, escáner de código de barras e impresión de etiquetas

Estado: **propuesta, pendiente de aprobación de Fernando** (`AI_WORKFLOW.md`). No se escribe código hasta aprobarlo.
Origen: mensaje de Fernando del 2026-10-23. Parte de T-012 (en REVIEW) y de ADR-0021 y ADR-0014.

## 1. Objetivo

1. Que el demo se vea como un producto terminado: sin avisos de "demo", "ficticio" ni "no es el producto" en pantalla.
2. Que el cliente vea cómo se identifica físicamente un lote: se imprime su etiqueta con código de barras, se pega en la tabla o charola y se escanea con una pistola lectora (o con la cámara) para abrir su ficha, moverlo o entregarlo.

## 2. Arquitectura: qué ya está decidido y qué se agrega

| Tema | Decisión | Estado |
|---|---|---|
| Identificación | ADR-0014 (aceptada): etiqueta impresa con código de barras y escáner USB que funciona como teclado es el mínimo. ARCHITECTURE.md ya lo dice. No hace falta otra decisión para el modelo. | Ya decidido |
| Cámara como lector | ARCHITECTURE.md: requiere HTTPS en la red local (P-06). En la laptop (`127.0.0.1`) funciona sin HTTPS; en el teléfono por Wi-Fi no, mientras P-06 siga abierta. | Ya decidido; P-06 sigue abierta |
| Aspecto de producto | Cambia ADR-0021 y el criterio de T-012 "ficticio, marcado en pantalla". Se registra como **ADR-0022** (propuesta) y se ajusta el criterio de T-012. | Nuevo, requiere tu aprobación |
| Impresión | **ADR-0023** (propuesta): la etiqueta se genera en el navegador (código de barras en SVG, sin librerías externas ni Internet) y se imprime con el diálogo de impresión del sistema, a cualquier impresora instalada en Windows (térmica de etiquetas u hoja carta). La impresión directa en lenguaje de impresora (ZPL de Zebra, TSPL) queda para el MVP (T-131), porque exige un servicio local por marca. | Nuevo, requiere tu aprobación |

Nada de esto impone tecnología al productor (regla 17): el AS-IS dice que el folio se asigna días después y se repite, y que la remisión no lleva lote. La etiqueta y el escáner son el mínimo de ADR-0014; RFID, NFC y QR quedan fuera.

## 3. Alcance

### 3.1 Aspecto de producto (ADR-0022)

| # | Cambio |
|---|---|
| 1 | Quitar la franja "Demo con datos ficticios… No es el producto" |
| 2 | Título de la pestaña y encabezado: "Trazabilidad de plántula" y el nombre del productor, sin "Demo" ni "(ficticio)" |
| 3 | Nombre del productor y de los productos sin "(ficticio)"; el nombre se toma de la configuración, así se puede presentar con otro nombre sin tocar código |
| 4 | El selector de usuario de la barra superior se convierte en una pantalla de **inicio de sesión** (elegir usuario y entrar) y un menú "Cerrar sesión". Sigue sin contraseña (P-40): solo se usa en la laptop o en una red de confianza, como hoy |
| 5 | "Regresar a los datos iniciales" sale del pie de página y pasa a una pantalla **Administración** que solo ve el Administrador, con el texto "Restablecer datos" |
| 6 | Mensajes de error y avisos sin la palabra "demo" (por ejemplo "No se pudo abrir la aplicación") |
| 7 | Lo interno sigue diciendo que es un demo con datos ficticios: README, `docs/`, comentarios del código y la guía en Word para el consultor |

### 3.2 Etiquetas e impresión (ADR-0023, UC-IDE-03)

| # | Función |
|---|---|
| 8 | **Etiqueta de lote**: folio grande, código de barras Code 128 del folio, variedad, fecha de siembra, tabla y cantidad sembrada |
| 9 | **Etiqueta de ubicación** para cada tabla (por ejemplo `INV1-A-M1`), para escanear el destino de un movimiento |
| 10 | Imprimir desde la ficha del lote, al terminar de registrar un lote ("Imprimir etiqueta") y desde una pantalla **Etiquetas** (varios lotes o todas las tablas de un invernadero) |
| 11 | Dos formatos: etiqueta térmica de 100 × 50 mm (una por hoja) y hoja carta con varias etiquetas. Se elige al imprimir |
| 12 | Cada impresión queda como evento inmutable `LabelPrinted` (lote o ubicación, formato, usuario, fecha): la ficha muestra cuándo se imprimió y las reimpresiones |

Code 128 porque lo lee cualquier pistola 1D, que es la más barata; las de 2D también lo leen.

### 3.3 Escaneo

| # | Función |
|---|---|
| 13 | **Pistola lectora USB o Bluetooth** en modo teclado: la aplicación reconoce una lectura (caracteres muy seguidos que terminan en Enter) en cualquier pantalla. Sin controladores ni configuración |
| 14 | Escanear un lote en cualquier pantalla abre su ficha |
| 15 | En **Mover lote**: escanear el lote y luego la etiqueta de la tabla destino llena el movimiento |
| 16 | En **Entregas**: cada lote escaneado agrega una línea al pedido |
| 17 | En **Registrar lote**: escanear la etiqueta de la tabla llena la ubicación |
| 18 | Código desconocido: aviso "Código no reconocido" sin cambiar nada |
| 19 | **Cámara** (botón "Escanear con cámara") en los navegadores que traen lector de códigos (Chrome y Edge en Android y macOS); donde no lo traen, el botón no aparece. En el teléfono por Wi-Fi depende de P-06 |
| 20 | Sin pistola, se presenta igual: un campo "Escanear o escribir código" acepta el código tecleado y Enter, que es exactamente lo que envía la pistola |

### Lo que no entra

Impresión directa ZPL/TSPL, etiquetas de charola individual (P-14), QR, RFID y NFC, HTTPS en la red local (P-06), contraseña o PIN (P-40).

## 4. Diseño técnico

- `public/codigo128.js`: codificador Code 128 (juego B, dígito verificador módulo 103) que devuelve SVG. Sin dependencias, compatible con la CSP actual (`script-src 'self'`).
- `public/escaner.js`: escucha del teclado que distingue una pistola (intervalo entre teclas menor a ~35 ms, al menos 4 caracteres, termina en Enter) de una persona escribiendo; no interfiere cuando el foco está en un campo de texto normal salvo el de escaneo.
- Hoja de estilos de impresión con `@page` para 100 × 50 mm y carta; la vista previa es la del navegador.
- `src/domain`: nuevo evento `LabelPrinted` con validación (el lote o la ubicación existe, el formato es válido); no cambia el estado del lote ni el inventario, solo la historia. Permiso en la configuración del productor por rol (ADMIN, OFICINA, PRODUCCION). Eventos ya guardados no cambian (regla 12).
- API: `GET /api/labels/lot/:folio`, `GET /api/labels/location/:code` (datos de la etiqueta) y `GET /api/scan/:code` (qué es el código: lote, ubicación o desconocido); la impresión se registra con `POST /api/events` como hoy.
- Inicio de sesión: el usuario elegido se guarda en el navegador y viaja en el encabezado `x-demo-user` como hoy; el servidor no cambia en este punto.

## 5. Pasos

1. Rama nueva desde `main` (la rama anterior ya se integró). ADR-0022 y ADR-0023 en Propuesta, T-013 en TASKS con criterios, ajuste del criterio de T-012.
2. Aspecto de producto (3.1).
3. Codificador Code 128 con pruebas contra códigos de referencia.
4. Evento `LabelPrinted`, endpoints de etiqueta y escaneo, con pruebas.
5. Pantalla Etiquetas e impresión desde ficha y registro.
6. Escucha de pistola y flujos de escaneo (ficha, mover, entregar, registrar).
7. Cámara donde el navegador lo permita.
8. Prueba en navegador con Playwright: escritura simulada de pistola (teclas rápidas + Enter), vista de impresión en PDF de ambos formatos, verificar que el código impreso se decodifica de vuelta al folio, pantallas en 1280 y 390 px, sin errores de consola ni CSP.
9. Documentación (SECURITY, README del demo, CHANGELOG, PROGRESS) y actualizar la guía en Word con un paso "Etiqueta y escaneo" y la lista de equipo opcional.
10. PR con el reporte obligatorio.

## 6. Decisiones por defecto (cámbialas si no te sirven)

1. Etiqueta térmica de 100 × 50 mm y hoja carta. Si ya tienes impresora, dime el tamaño de su etiqueta.
2. Code 128 con el folio (`L-0822`) y las tablas con su código (`INV1-A-M1`).
3. El nombre en pantalla sigue siendo "Productor A", configurable.
4. Inicio de sesión sin contraseña, como hoy.
5. La cámara en el teléfono por Wi-Fi queda para cuando se resuelva P-06.

## 7. Equipo para presentarlo (opcional)

El demo se puede presentar sin equipo: el código se teclea y se imprime a PDF. Para mostrarlo físicamente basta una pistola lectora USB 1D o 2D en modo teclado (la mayoría viene así de fábrica) y cualquier impresora; una térmica de etiquetas de 4 pulgadas con controlador para Windows da el resultado más parecido al real. No se fija marca ni modelo.

## 8. Riesgos

- Sin el aviso en pantalla, un cliente podría tomar los datos del caso como reales: lo aclara el consultor al presentar (la guía lo dice).
- Los márgenes de impresión varían por controlador: la guía indica "márgenes: ninguno" y "escala 100 %".
- Algunas pistolas vienen configuradas con otra distribución de teclado; se documenta cómo probarlo en el bloc de notas.
