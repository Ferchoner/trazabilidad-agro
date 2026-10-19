# REQUIREMENTS — Especificación técnica

Estado: **borrador del Sprint 0** (T-002). Lo no definido se marca PENDIENTE DE DECISIÓN con su P-xx (`PROGRESS.md`). Las reglas están en `BUSINESS_RULES.md`.

## 1. Actores

| Actor | Descripción |
|---|---|
| Administrador | Usuarios, configuración, respaldos, sincronización, conflictos, anulaciones |
| Producción | Jefe de producción: catálogos, lotes, siembra, etapas, transferencias, divisiones, aplicaciones |
| Capturista | Personal de invernadero: riego, fertilización, pérdidas, transferencias |
| Calidad | Inspección, cuarentena, liberación, control de calidad |
| Ventas | Entregas y consulta de disponibilidad |
| Consulta | Dirección o auditor: solo lectura |
| Nodo par | Otra instalación del mismo productor que sincroniza eventos |
| Sistema externo | Excel o ERP del productor (importación/exportación) |

## 2. Módulos

| Módulo | Contexto (`DOMAIN_MODEL.md`) | Fase de origen |
|---|---|---|
| Ubicaciones | Locations | 1 |
| Catálogo agrícola | Agronomy Catalog | 1 |
| Lotes y charolas | Lots | 1 |
| Identificación | Identification | 1 |
| Labores | Crop Operations | 2 |
| Calidad | Quality | 2 |
| Entregas | Dispatch | 4 (parcial) |
| Trazabilidad y reportes | Traceability Queries | 1–2 |
| Integración Excel/CSV | Integration | 5 (parcial) |
| Sincronización | Sync | 5 (diseño en 1, ADR-0006) |
| Identidad y acceso | Identity & Access | 1 |
| Transversal | Eventos, auditoría, respaldos, configuración | 1 |

## 3. Entidades y estados

### 3.1 Lote (ADR-0009, propuesta)

**Etapa agrícola**

| Desde | Hacia | Cómo |
|---|---|---|
| — | PLANIFICADO | Crear lote |
| PLANIFICADO | PREPARADO, SEMBRADO, CANCELADO | Manual, siembra, cancelación |
| PREPARADO | SEMBRADO, CANCELADO | Siembra, cancelación |
| SEMBRADO | GERMINACION | Manual (criterio P-17) |
| GERMINACION | CRECIMIENTO | Manual (criterio P-17) |
| CRECIMIENTO | DESARROLLO | Manual (criterio P-17) |
| DESARROLLO | CONTROL_CALIDAD | Manual |
| CONTROL_CALIDAD | LISTO_VENTA / DESARROLLO | Control de calidad aprobado / rechazado |
| LISTO_VENTA | CERRADO | Entrega total o cierre |
| Cualquiera no terminal | PERDIDO | Pérdida que deja la cantidad en 0 sin entregas ni divisiones |
| Cualquiera no terminal | CERRADO | Cantidad en 0 por entregas o división |

Terminales: CERRADO, PERDIDO, CANCELADO. Las transiciones son configurables por productor (ADR-0015).

**Retención**: LIBRE ⇄ EN_CUARENTENA, en cualquier etapa no terminal.

**Situación comercial** (calculada): DISPONIBLE (LISTO_VENTA sin entregas), PARCIALMENTE_VENDIDO, VENDIDO. RESERVADO queda fuera del MVP.

### 3.2 Evento

Estados: APLICADO, CONFLICTO, ANULADO (ADR-0005, ADR-0011, ADR-0013).

### 3.3 Otras entidades

Ubicación, variedad, material vegetal, charola, identificador, usuario, nodo. Sin estados de ciclo de vida en el MVP; las charolas están libres u ocupadas por un lote.

## 4. Permisos

Propuesta inicial; la matriz final es por productor (P-18).

| Operación | Admin | Producción | Capturista | Calidad | Ventas | Consulta |
|---|---|---|---|---|---|---|
| Catálogos (incluye productos) y ubicaciones | ✓ | ✓ | | | | |
| Crear lote, siembra, etapa, división, cancelación | ✓ | ✓ | | | | |
| Riego, fertilización, pérdida, transferencia, resiembra | ✓ | ✓ | ✓ | | | |
| Aplicación fitosanitaria | ✓ | ✓ | | | | |
| Inspección | ✓ | ✓ | ✓ | ✓ | | |
| Cuarentena | ✓ | ✓ | | ✓ | | |
| Liberación y control de calidad | ✓ | | | ✓ | | |
| Entrega y cierre | ✓ | | | | ✓ | |
| Anulación | ✓ | propias | | propias | | |
| Consultas y reportes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Importar Excel, sincronizar, respaldos, conflictos | ✓ | | | | | |

## 5. Casos de uso

Cada caso de uso se completa con criterios de aceptación detallados en T-002. Los listados aquí son el mínimo del MVP.

### 5.1 Ubicaciones y catálogo

- **UC-UBI-01** Crear ubicación. Respeta la jerarquía (un sector cuelga de un invernadero); código único.
- **UC-CAT-01** Crear variedad. Nombre único sin distinguir mayúsculas.
- **UC-CAT-02** Registrar material vegetal: variedad, origen (planta madre, estolón, in vitro, proveedor), proveedor, documento fitosanitario, fecha de recepción. Lo que falte queda PENDIENTE.
- **UC-CAT-03** Registrar producto fitosanitario: nombre, ingrediente activo e intervalo de seguridad en días; el intervalo puede quedar PENDIENTE (BR-LAB-02).

### 5.2 Lotes

- **UC-LOT-01** Planificar lote: folio (ADR-0010), variedad, material, cantidad planeada, ubicación.
- **UC-LOT-02** Sembrar: cantidad, mesa, charolas con cavidades. La cantidad no supera las cavidades; una charola ocupada no se asigna.
- **UC-LOT-03** Cambiar etapa según transiciones permitidas.
- **UC-LOT-04** Transferir el lote o algunas charolas a otra ubicación, capturando lote y mesa destino (BR-LOT-11).
- **UC-LOT-05** Dividir en sublotes con cantidad y charolas; el padre conserva su historia y los hijos la heredan en la trazabilidad.
- **UC-LOT-06** Registrar pérdida con cantidad y causa; no supera lo que queda.
- **UC-LOT-07** Cancelar un lote no sembrado.
- **UC-LOT-08** Consultar lote: datos, charolas, genealogía, historial, aplicaciones y entregas.
- **UC-LOT-09** Registrar resiembra: lote que recibe, lote que aporta, charolas y cantidad (BR-CHA-04).

### 5.3 Labores y calidad

- **UC-LAB-01** Registrar riego o fertilización sobre lote o ubicación (ADR-0012).
- **UC-LAB-02** Registrar aplicación con producto del catálogo, dosis y motivo; si el producto no tiene intervalo, se advierte y se registra (BR-LAB-02).
- **UC-CAL-01** Registrar inspección con resultado (OK, observación, plaga, enfermedad) y nota.
- **UC-CAL-02** Poner en cuarentena con motivo; **UC-CAL-03** liberar.
- **UC-CAL-04** Control de calidad: aprobado pasa a LISTO_VENTA, rechazado regresa a DESARROLLO.

### 5.4 Entregas

- **UC-ENT-01** Registrar entrega de un pedido: cliente, pedido (texto), fecha y una línea por lote con su cantidad. Cada lote debe estar LISTO_VENTA, libre y fuera de intervalo de seguridad (BR-ENT-02).
- **UC-ENT-02** Cerrar lote; el sobrante cuenta como merma con causa.

### 5.5 Trazabilidad y reportes

- **UC-TRZ-01** Trazabilidad hacia atrás desde lote, charola o pedido.
- **UC-TRZ-02** Trazabilidad hacia adelante (recall) desde lote o material vegetal: sublotes, entregas, clientes y lo que sigue en invernadero.
- **UC-REP-01** Disponibilidad por variedad y etapa, separando cuarentena e intervalo de seguridad.
- **UC-REP-02** Mermas por lote y por causa.
- **UC-REP-03** Exportar lotes, disponibilidad, mermas y eventos a CSV para Excel.
- **UC-REP-04** Ficha de lote para el cliente del productor, imprimible: material vegetal y su origen, siembra y ubicaciones, labores (directas y por ubicación), inspecciones, cuarentenas y entregas. Decidido por Fernando el 2026-10-19 con el caso Productor A (hallazgo H-14, P-23).

### 5.6 Identificación

- **UC-IDE-01** Resolver un código escaneado o escrito a su lote, charola o ubicación.
- **UC-IDE-02** Asignar un identificador adicional (QR, barcode, NFC, RFID) a una entidad.
- **UC-IDE-03** Imprimir etiquetas de lote y charolas.

### 5.7 Integración

- **UC-INT-01** Importar el registro de lotes desde Excel: vista previa con errores y advertencias por fila; solo se importa al confirmar; las filas con error no se importan (P-30). Las mermas sin causa siguen BR-INT-05.

### 5.8 Sincronización y operación

- **UC-SYN-01** Capturar sin conexión en el teléfono y enviar la cola al recuperar red, sin duplicar.
- **UC-SYN-02** Sincronizar con otro nodo por red local.
- **UC-SYN-03** Exportar e importar un paquete de eventos por archivo (USB).
- **UC-SYN-04** Revisar eventos en CONFLICTO y resolverlos (anular o recapturar).
- **UC-OPS-01** Respaldo automático diario y manual; **UC-OPS-02** restaurar un respaldo (P-05).
- **UC-EVT-01** Anular un evento con motivo (ADR-0011).

### 5.9 Identidad y acceso

- **UC-IAM-01** Iniciar sesión con usuario y PIN o contraseña (P-40). **UC-IAM-02** Administrar usuarios y roles.

## 6. Flujos principales

### 6.1 Ciclo de un lote
Material vegetal → planificar → sembrar en charolas y mesa → labores e inspecciones → etapas → control de calidad → listo para venta → entregas → cierre.

### 6.2 Brote sanitario
Inspección con enfermedad → cuarentena → pérdida o división de charolas afectadas → aplicación → liberación o descarte.

### 6.3 Captura sin conexión
Teléfono sin señal → eventos en cola local → al recuperar red se envían → aplicados o en conflicto visible.

### 6.4 Migración desde Excel
Archivo del productor → vista previa → corrección en Excel o aceptación de advertencias → importación → lotes con su historia inicial.

### 6.5 Recall
Reclamo de un cliente → pedido → lote → material y labores (hacia atrás) → todos los lotes hermanos y clientes afectados (hacia adelante).

## 7. Catálogo de errores

| Código | Situación |
|---|---|
| E-01 | Transición de etapa no permitida |
| E-02 | Cantidad mayor a la existente (pérdida, división, entrega) |
| E-03 | Charola ocupada por otro lote |
| E-04 | Entrega bloqueada por cuarentena |
| E-05 | Entrega bloqueada por intervalo de seguridad |
| E-06 | Folio o código duplicado |
| E-07 | Mismo UUID con contenido distinto (idempotencia) |
| E-08 | Rol sin permiso para la operación |
| E-09 | Entidad inexistente |
| E-10 | Ubicación fuera de jerarquía |
| E-11 | Archivo de importación sin columnas obligatorias |
| E-12 | Resiembra que supera las cavidades vacías o la cantidad del lote que aporta |
| E-13 | Fecha de la operación futura o anterior a la siembra (BR-EVT-06) |

## 8. Dependencias externas

Ninguna en tiempo de ejecución: sin Internet, sin servicios en la nube. Navegador moderno en PC y teléfonos (versión mínima en P-04). Escáner USB opcional.

## 9. Requisitos no funcionales

### 9.1 Parámetros definidos

| Área | Requisito | Fuente |
|---|---|---|
| Inmutabilidad | Eventos sin edición ni borrado; correcciones por anulación | ADR-0005, ADR-0011 |
| Idempotencia | Reenviar un evento no lo duplica | ADR-0005 |
| Offline | Captura sin conexión y sincronización sin sobrescrituras | ADR-0006, ADR-0013 |
| Convergencia | Dos nodos con los mismos eventos tienen el mismo estado | ADR-0013 |
| Reconstrucción | Las proyecciones se reconstruyen desde los eventos con un comando | ADR-0005 |
| Instalación | Sin Docker ni servidor; una carpeta o instalador en la PC del productor | ADR-0007, ADR-0008 |
| Cortes de luz | Un apagón durante una escritura no corrompe la base local ni pierde eventos confirmados; respaldo diario automático | Caso Productor A, H-12; T-106 |
| Captura atrasada | Registrar una semana de eventos atrasados reconstruye proyecciones en un tiempo aceptable en la PC mínima (medir en T-008) | Caso Productor A, H-02; ADR-0013 |

### 9.2 Pendientes

- PC mínima de referencia para T-008: equipo de 2016 con Windows 10, 4 GB de RAM y disco mecánico, compartido con otro uso (caso Productor A, hallazgo H-11; ficticio, se confirma con el primer cliente). Navegadores mínimos: P-04.
- Volumen esperado: lotes por temporada, eventos por día, usuarios simultáneos (P-04).
- Tiempo de respuesta en la PC mínima (P-04).
- Respaldo fuera del sitio y su frecuencia (P-05).

## 10. Contradicciones y ambigüedades detectadas

Del análisis de la documentación de origen (`analisis/analisis_documentacion.md`, sección 3):

| # | Tema | Resolución |
|---|---|---|
| 1 | Alcance del proyecto base | ADR-0002 |
| 2 | Stack | P-01, ADR-0007 |
| 3 | Multi-cliente o instalación por cliente | P-03, ADR-0008 |
| 4 | Relación lote–charola | P-13 |
| 5 | Genealogía: fusión, trasplante, cambio de charola | P-15 |
| 6 | Unidad de conteo y pérdida parcial | P-16 |
| 7 | Estados mezclados | ADR-0009 |
| 8 | Eventos vs. tablas específicas | ADR-0005 |
| 9 | Origen del material vegetal | P-20 |
| 10 | Folio consecutivo sin conexión | ADR-0010 |
| 11 | Hora del dispositivo, versión y correcciones | ADR-0011, ADR-0013 |
| 12 | Offline en Fase 5 | ADR-0006 |
| 13 | Normativa | P-19 |
| 14 | Reportes clave | §5.5; P-23 |
| 15 | KPIs del piloto | P-24, T-009 |
| 16 | Inventario operativo vs. financiero | P-21 |
| 17 | Matriz de permisos | §4; P-18 |
| 18 | Convención de idioma | ADR-0009 (códigos sin acento); P-32 |
