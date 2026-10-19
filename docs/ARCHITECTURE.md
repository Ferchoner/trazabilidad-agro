# ARCHITECTURE

Estado: borrador del Sprint 0 (T-003). Lo que depende del stack se completa al aprobar ADR-0007.

## Principios

Del doc 05 de origen: modular, integrable, independiente de fabricante, offline cuando sea necesario, auditable, trazable, configurable y reutilizable. Además:

- Los eventos son la verdad; el estado se deriva (ADR-0005).
- Nada de la Fase 1 impide operar sin conexión (ADR-0006).
- La base central vive en un servidor externo con PostgreSQL; donde no hay Internet confiable, un nodo local con SQLite opera solo y sincroniza eventos (ADR-0007, ADR-0008, `estudios/ESTUDIO-01-base-de-datos.md`). Hasta tener cliente, todo corre en el entorno local (ADR-0019).
- El núcleo no conoce al productor; el productor vive en configuración (ADR-0015).

## Despliegue propuesto (ESTUDIO-01)

Servidor externo con PostgreSQL, una base por productor, para reportes, acceso remoto e integraciones. Nodo local opcional con SQLite y la misma aplicación para captura sin Internet; solo intercambia eventos con el servidor. El diagrama de abajo describe el nodo local; el servidor usa la misma estructura con PostgreSQL.

## Estilo arquitectónico

Monolito modular con DDD pragmático, igual que base-shop, sobre un almacén de eventos propio:

```text
Navegador (PC, teléfono, tablet en la red local)
   │  cola local de eventos si no hay conexión
   ▼
Aplicación local (un proceso)
   ├─ Presentación: API JSON + interfaz web
   ├─ Aplicación: casos de uso por contexto, permisos
   ├─ Dominio: reglas y máquina de estados (sin framework)
   ├─ Plataforma: almacén de eventos, proyecciones, reloj, configuración, respaldos
   └─ Integración: Excel/CSV, sincronización con nodos
   ▼
SQLite (un archivo): eventos + proyecciones
```

Arquitecturas de referencia del doc 05 de origen: el MVP cubre la A (cliente básico). B y C agregan la capa de integración y conectores sin cambiar el núcleo.

## Estructura

Repositorio único (ADR-0020): `apps/api` (NestJS), `apps/web` (interfaz) y `packages/contracts` (tipos de eventos compartidos por la API y la cola sin conexión del navegador). Se crean con T-100.

Dentro de cada aplicación: PENDIENTE DE DECISIÓN (T-101). Propuesta, tomada de base-shop: un módulo por contexto con carpetas `domain`, `application`, `infrastructure`, `presentation`, más `platform` y `shared-kernel`, y una regla automática de límites entre módulos y capas.

## Módulos (bounded contexts)

Ver `DOMAIN_MODEL.md`, mapa de contextos.

## Reglas de integración entre módulos

- Un módulo no lee tablas de otro; usa su fachada o las proyecciones de consulta.
- Integration y Sync solo producen o transportan eventos; nunca escriben proyecciones.
- Traceability Queries es de solo lectura.

## Eventos y proyecciones

1. Un caso de uso valida contra la proyección actual y produce un evento.
2. El evento se guarda y se aplica a las proyecciones en la misma transacción.
3. Si el evento es anterior al último aplicado (captura sin conexión) o es una anulación, las proyecciones se reconstruyen en orden determinista (ADR-0013).
4. Un evento recibido por sincronización que ya no es válido se guarda en CONFLICTO.
5. Reconstruir desde cero debe producir exactamente el mismo estado (prueba obligatoria).

Riesgo conocido: la reconstrucción completa en cada evento atrasado es suficiente para el volumen de un productor (cientos de lotes por temporada), pero hay que medirla en la PC mínima (T-008) y, si hace falta, reconstruir solo desde el punto afectado. En el caso Productor A capturar con días de atraso es la norma (H-02), así que T-008 mide una semana de eventos atrasados.

## Transacciones y concurrencia

Un solo escritor a la vez en el proceso local. Los teléfonos no escriben en la base; envían eventos al proceso.

## Sincronización sin conexión (ADR-0006, ADR-0013)

- **Teléfono o tablet → PC:** la interfaz guarda los eventos en el navegador si no hay red y los reenvía; la idempotencia evita duplicados.
- **Nodo ↔ nodo** (p. ej. laptop de invernadero y PC de oficina): intercambio de eventos por red local con clave compartida.
- **Por archivo:** paquete de eventos exportado e importado con USB cuando no hay red entre equipos.
- Solo se intercambian eventos; nunca tablas.

Pendiente: la interfaz web solo puede guardar en el navegador mientras la página siga abierta; una PWA instalable necesita HTTPS en la red local (P-06).

## Identificación y dispositivos

Identificadores abstractos (ADR-0014). Mínimo soportado: etiqueta impresa con código de barras y escáner USB (funciona como teclado). La cámara del teléfono como lector requiere HTTPS (P-06).

## Configuración

Archivo de configuración por productor: nombre, código de nodo, prefijo de folio y si lleva año, rango de folios del nodo (ADR-0010), nombres de niveles, transiciones de etapa, permisos, usuarios iniciales, clave de sincronización (ADR-0015). Los secretos no se versionan.

## Respaldos

Respaldo automático diario del archivo de base de datos con la API de respaldo del motor, y respaldo manual desde la interfaz. La base local se configura para sobrevivir cortes de luz sin no-break (H-12). Restaurar y respaldar fuera del sitio: P-05.

## Observabilidad

Logs en consola y archivo local, sin PIN ni contraseñas. Bitácora de sincronizaciones con recibidos, nuevos, duplicados y rechazados.

## Reloj

Las horas de los eventos se guardan en UTC; la interfaz muestra hora de México. El reloj es inyectable en el dominio para pruebas.
