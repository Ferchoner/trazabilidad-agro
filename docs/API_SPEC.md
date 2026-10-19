# API SPECIFICATION

Estado: borrador del Sprint 0 (T-005). Solo principios y lista de operaciones; el detalle por endpoint (request, response, errores, permisos) se completa al aprobar el stack, siguiendo el formato de base-shop.

## 1. Principios

- La interfaz web y cualquier cliente futuro (app, ERP) usan la misma API.
- La escritura es por eventos: un cliente envía eventos con UUID propio; la API los valida, los registra y responde su estado.
- Toda escritura es idempotente por el UUID del evento (ADR-0005).
- Sin dependencia de Internet ni de servicios externos.

## 2. Convenciones generales

- JSON en UTF-8; fechas ISO 8601 en UTC.
- Prefijo `/api/v1` (P-31).
- Errores con código estable del catálogo E-xx (`REQUIREMENTS.md` §7) y mensaje en español para el usuario. Formato: PENDIENTE (propuesta: RFC 9457 como en base-shop).
- Un evento rechazado en captura en vivo no se guarda; uno recibido en lote (cola sin conexión o sincronización) se guarda en CONFLICTO si no es válido.

## 3. Autenticación y autorización

Sesión local con usuario y PIN o contraseña (P-40); permisos por rol (`REQUIREMENTS.md` §4). La sincronización entre nodos usa una clave compartida por instalación (P-40).

## 4. Operaciones previstas

| Grupo | Operación |
|---|---|
| Sesión | Iniciar sesión, cerrar sesión, configuración pública |
| Eventos | Registrar un evento; registrar un lote de eventos (cola sin conexión); anular |
| Lotes | Listar con filtros; detalle por id o folio; nuevo folio |
| Catálogos | Ubicaciones, variedades, materiales |
| Identificación | Resolver código |
| Trazabilidad | Hacia atrás; hacia adelante |
| Reportes | Disponibilidad; mermas y causas; exportación CSV |
| Integración | Analizar archivo Excel/CSV (vista previa); confirmar importación |
| Sincronización | Enviar eventos; recibir eventos desde una secuencia; exportar e importar paquete |
| Operación | Respaldo; listar respaldos; conflictos; reconstruir proyecciones |
