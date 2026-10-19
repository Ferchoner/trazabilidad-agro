# BUSINESS RULES

Cada regla indica su fuente. Lo no definido se marca como PENDIENTE DE DEFINICIÓN con su decisión pendiente (P-xx, ver `PROGRESS.md`). Los casos de uso que aplican cada regla están en `REQUIREMENTS.md`. "Origen" se refiere a `README.md` y `docs/01–13` de la carpeta raíz.

## Eventos e historia

- BR-EVT-01. Todo cambio de negocio es un evento inmutable con UUID; ningún registro se edita ni se borra (ADR-0005; doc 06 de origen).
- BR-EVT-02. Reenviar un evento ya registrado no tiene efecto; el mismo UUID con otro contenido se rechaza (ADR-0005; doc 09 de origen).
- BR-EVT-03. Un evento equivocado se corrige con una anulación con motivo; no se anula una anulación (ADR-0011).
- BR-EVT-04. Cada evento guarda la hora en que ocurrió (dispositivo) y la hora en que se registró (servidor) (ADR-0013; análisis, hueco 11).
- BR-EVT-05. Un evento que llega por sincronización y ya no es válido queda en CONFLICTO, visible y sin aplicar; no se descarta (ADR-0013).
- BR-EVT-06. Capturar días después de la operación es normal. La captura pide la fecha de la operación cuando no es la del momento y la guarda aparte de la hora del dispositivo y la de registro. Reportes, trazabilidad e intervalo de seguridad usan la fecha de la operación; el orden de aplicación sigue ADR-0013. La fecha de la operación no puede ser futura ni anterior a la siembra del lote. Decidido por Fernando el 2026-10-19 con el caso Productor A (hallazgo H-02 de T-007, datos ficticios, ADR-0017); se confirma con el primer productor real.

## Ubicaciones

- BR-UBI-01. La jerarquía es Centro de producción → Invernadero → Sector → Mesa; cada ubicación cuelga del nivel inmediato superior (ADR-0003).
- BR-UBI-02. El código de una ubicación es único dentro de la instalación.
- BR-UBI-03. Los nombres visibles de los niveles los configura cada productor (ADR-0015).

## Material vegetal y variedades

- BR-MAT-01. Todo lote debería tener material vegetal con origen; si no se conoce, el origen queda PENDIENTE y aparece en reportes de calidad de datos (doc 02 del kit; P-20).
- BR-MAT-02. El documento fitosanitario del material es obligatorio o no según la normativa del productor: PENDIENTE DE DEFINICIÓN (P-19).

## Lotes

- BR-LOT-01. El folio legible es único; el identificador interno es un UUID (ADR-0010). El folio es corto (prefijo y consecutivo, como L-0812), existe desde la siembra aunque no haya conexión y no muestra el nodo.
- BR-LOT-02. Al migrar desde Excel se conserva el folio del productor (ADR-0010; regla de diseño 1 de origen, no imponer).
- BR-LOT-03. Solo se siembra un lote PLANIFICADO o PREPARADO; la cantidad sembrada no supera las cavidades de sus charolas.
- BR-LOT-04. Las etapas avanzan solo por transiciones permitidas (ADR-0009). Los criterios de paso son del productor: PENDIENTE DE DEFINICIÓN (P-17).
- BR-LOT-05. Una pérdida no supera las plántulas que quedan y siempre tiene causa.
- BR-LOT-06. Un lote cuya cantidad llega a 0 pasa a CERRADO si tuvo entregas o divisiones, o a PERDIDO si no.
- BR-LOT-07. Una división reparte plántulas y charolas del padre entre sublotes; la suma no supera lo que queda; los sublotes heredan variedad, material, etapa, retención, fecha de siembra e intervalo de seguridad (doc 04 de origen).
- BR-LOT-08. La fusión de lotes, el trasplante y el cambio de charola: PENDIENTE DE DEFINICIÓN (P-15).
- BR-LOT-09. Solo se cancela un lote antes de sembrarlo.
- BR-LOT-10. La cantidad del lote se lleva en plántulas; la forma de conteo (cavidad, charola, conteo, peso) es PENDIENTE DE DEFINICIÓN (P-16).
- BR-LOT-11. Si el lote se identifica con una etiqueta en la mesa y no en la charola, toda transferencia se captura con el lote y la mesa destino. La ubicación del lote sale de sus transferencias, no de la etiqueta que quedó en la mesa de origen. Decidido por Fernando el 2026-10-19 con el caso Productor A (hallazgo H-10 de T-007, datos ficticios, ADR-0017); se confirma con el primer productor real.

## Charolas

- BR-CHA-01. Una charola se asigna a un lote al sembrar y un lote puede ocupar varias charolas. La resiembra puede agregar a sus cavidades vacías plántula de otro lote (BR-CHA-04). Decidido por Fernando el 2026-10-19 con el caso Productor A (hallazgo H-01 de T-007, datos ficticios, ADR-0017); se confirma con el primer productor real.
- BR-CHA-04. La resiembra es un evento del lote que recibe, con el lote que aporta y la cantidad. La cantidad baja en el lote que aporta y sube en el que recibe, sin superar las cavidades de sus charolas. La trazabilidad hacia atrás del lote que recibe incluye al que aporta, y la trazabilidad hacia adelante del que aporta incluye al que recibe. Resembrar con plántula de otra variedad: PENDIENTE DE DEFINICIÓN (P-13).
- BR-CHA-02. Una charola se libera cuando su lote termina (CERRADO, PERDIDO o CANCELADO) y puede reutilizarse con su mismo código.
- BR-CHA-03. Si el productor no etiqueta charolas, se generan códigos a partir del folio (`FOLIO-C01`) y se marca en la configuración (P-14).

## Labores

- BR-LAB-01. Riego, fertilización, aplicación e inspección pueden registrarse sobre un lote o una ubicación; sobre una ubicación se ligan a todos los lotes activos presentes (ADR-0012).
- BR-LAB-02. Toda aplicación fitosanitaria registra producto, dosis y motivo; el ingrediente activo y el intervalo de seguridad en días salen del catálogo de productos (análisis, hueco 13). Si el producto no tiene intervalo en el catálogo, la aplicación se registra con una advertencia y el intervalo del lote queda desconocido; la captura no se bloquea. Decidido por Fernando el 2026-10-19 con el caso Productor A (hallazgo H-06 de T-007, datos ficticios, ADR-0017); se confirma con el primer productor real.
- BR-LAB-03. Un lote no se entrega antes de cumplir el intervalo de seguridad de su aplicación más reciente; los sublotes heredan ese bloqueo. Entregar un lote con intervalo desconocido: PENDIENTE DE DEFINICIÓN (P-19); propuesta: advertencia que confirma un rol con permiso.

## Calidad y retención

- BR-CAL-01. Un lote en cuarentena no se entrega ni pasa control de calidad; sí puede dividirse, perder plántulas y recibir labores.
- BR-CAL-02. La cuarentena requiere motivo. Quién libera: PENDIENTE DE DEFINICIÓN (P-18); propuesta: rol Calidad.
- BR-CAL-03. Control de calidad aprobado lleva a LISTO_VENTA; rechazado regresa a DESARROLLO.

## Entregas

- BR-ENT-01. Solo se entrega un lote LISTO_VENTA, LIBRE, fuera de intervalo de seguridad y por una cantidad no mayor a la existente.
- BR-ENT-02. Una entrega registra cliente, pedido (texto libre), fecha y una o más líneas, cada una con su lote y cantidad. Cada línea cumple BR-ENT-01; si una no lo cumple, la entrega completa se rechaza o queda en CONFLICTO. El cliente y el pedido no son maestros en la plataforma en el MVP (matriz de sistema maestro del kit, doc 07). Decidido por Fernando el 2026-10-19 con el caso Productor A (hallazgo H-07 de T-007, datos ficticios, ADR-0017); se confirma con el primer productor real.
- BR-ENT-04. Las reservas de plántula para un cliente quedan fuera del MVP (Fase 4). Decidido por Fernando el 2026-10-19 con el caso Productor A (hallazgo H-08 de T-007, datos ficticios, ADR-0017); se confirma con el primer productor real.
- BR-ENT-03. El inventario financiero no es de la plataforma; la reconciliación con el operativo es PENDIENTE DE DEFINICIÓN (P-21).

## Integración

- BR-INT-01. La importación muestra vista previa por fila con errores y advertencias; nada se guarda sin confirmar.
- BR-INT-02. Una fila con error (sin folio, folio repetido, sin variedad, sin cantidad, cantidad mayor a cavidades) no se importa.
- BR-INT-03. Lo que falta en una fila no se inventa: sin fecha de siembra el lote queda PLANIFICADO; sin origen del material queda PENDIENTE (regla de diseño 14 de origen).
- BR-INT-04. No se duplica un dato sin definir sistema maestro, sincronización y resolución de conflictos (doc 07 de origen).
- BR-INT-05. Una merma del archivo sin causa se importa con la causa "No registrada (importación)" y sin fecha de operación; nunca con la fecha del día en que se importa. Decidido por Fernando el 2026-10-19 con el caso Productor A (hallazgo H-15 de T-007, datos ficticios, ADR-0017); se confirma con el primer productor real.

## Usuarios y acceso

- BR-USR-01. Cada evento lleva el usuario autenticado que lo capturó; un evento recibido por sincronización conserva su usuario de origen.
- BR-USR-02. Las operaciones permitidas por rol siguen la matriz de `REQUIREMENTS.md` §4, configurable por productor (ADR-0015).
- BR-USR-03. Un usuario se desactiva, nunca se borra, porque firma eventos.
