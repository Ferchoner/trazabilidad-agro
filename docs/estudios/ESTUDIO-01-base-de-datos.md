# ESTUDIO-01 — SQLite, PostgreSQL y servidores externos

- **Fecha:** 2026-10-18
- **Para:** P-01 (stack), P-03 (despliegue), ADR-0007, ADR-0008
- **Pregunta de Fernando:** comparar SQLite y PostgreSQL, considerando que lo más probable es usar servidores externos para mejorar el rendimiento.

## 1. Resumen

No hay que elegir uno: con el modelo de eventos (ADR-0005) los dos se complementan.

- **PostgreSQL en un servidor externo** como base central: concentra los eventos de todos los equipos del productor, sirve reportes, consultas de dirección e integraciones, y es donde mejora el rendimiento cuando crece el número de usuarios y productores.
- **SQLite en el equipo local** (PC de oficina o laptop del invernadero) solo donde haga falta operar sin Internet: guarda los eventos capturados y los envía al servidor cuando hay conexión.

Un productor con buen Internet usa solo el servidor. Uno como el Productor A (Internet limitado) tiene además un nodo local. El núcleo es el mismo; cambia la configuración.

## 2. Comparación

| Criterio | SQLite | PostgreSQL |
|---|---|---|
| Qué es | Biblioteca embebida; la base es un archivo | Servidor de base de datos cliente-servidor |
| Instalación | Ninguna; viene con el runtime | Servidor propio, Docker o servicio administrado |
| Administración | Casi nula; respaldar es copiar el archivo con su API de respaldo | Usuarios, actualizaciones, respaldos, monitoreo; un servicio administrado lo absorbe |
| Escrituras simultáneas | Un escritor a la vez (con WAL, lecturas en paralelo) | Muchos escritores en paralelo (MVCC, bloqueo por fila) |
| Acceso por red | No está pensado para que varios servidores lo compartan | Sí; varias instancias de la aplicación contra la misma base |
| Volumen de un productor | Sobrado: decenas de miles de eventos por temporada | Sobrado |
| Muchos productores en un servidor | No recomendable | Adecuado (una base o esquema por productor) |
| Sin Internet | Funciona igual | El equipo del invernadero no puede escribir si no llega al servidor |
| Respaldo y recuperación | Copia del archivo; sin recuperación a un punto en el tiempo | Respaldos continuos, réplicas y recuperación a un punto en el tiempo (en servicios administrados) |
| Tipos y consultas | Tipado flexible; JSON con funciones básicas | Tipos estrictos, JSONB indexable, consultas recursivas y particionado |
| Seguridad | La del sistema de archivos del equipo | Roles, permisos por tabla, TLS, auditoría |
| Costo | Cero | Servidor o servicio mensual (PENDIENTE cotizar, P-07) |
| Experiencia del equipo | Nueva | La de base-shop (PostgreSQL 18 con Prisma) |

## 3. Qué mejora realmente un servidor externo

- **Sí mejora:** reportes y consultas pesadas, usuarios simultáneos de varias sedes, respaldos profesionales, acceso desde fuera del rancho (dirección, clientes, auditores), integraciones con ERP, y operar varios productores desde un solo lugar.
- **No resuelve:** la captura dentro de un invernadero sin señal. Ahí el cuello de botella es la conexión, no la base de datos. Por eso el Productor A necesita un nodo local o la cola del teléfono (ADR-0006).

Con el volumen de un productor (cientos de lotes por temporada) ninguno de los dos motores es el límite de rendimiento; la diferencia está en concurrencia, operación y conectividad.

## 4. Arquitecturas posibles

| Opción | Cómo queda | A favor | En contra |
|---|---|---|---|
| A. Solo SQLite local | Todo en la PC del productor | Sin costo ni Internet | Sin acceso remoto; respaldo depende del productor; no escala a muchos productores |
| B. Solo PostgreSQL externo | Todo en el servidor; teléfonos y PC por Internet | Una sola base, operación centralizada | No funciona en invernaderos sin señal; contradice ADR-0006 para el cliente básico |
| **C. Híbrida (recomendada)** | PostgreSQL externo como base central; SQLite en un nodo local solo donde no hay Internet confiable | Funciona sin conexión y escala; mismo núcleo para todos | Hay que construir y probar la sincronización (ya prevista en T-105) |

## 5. Cómo funciona la opción C

```text
Teléfonos / tablets ──(red local)──► Nodo local (SQLite)  ──(cuando hay Internet)──►  Servidor externo (PostgreSQL)
                                     opera sin Internet                                 base central del productor
Dirección / ventas / ERP ──(Internet)──────────────────────────────────────────────►  reportes, API, integraciones
```

- Solo viajan eventos, con su UUID; el servidor los recibe de forma idempotente (ADR-0005).
- El servidor guarda el registro completo de eventos del productor; cada nodo reconstruye sus proyecciones con el mismo orden determinista (ADR-0013).
- Un evento que llega tarde y ya no es válido queda en CONFLICTO en el servidor y se ve en el nodo.
- Los folios se generan por nodo (ADR-0010), así que dos equipos sin conexión no chocan.

## 6. Impacto en las decisiones

- **ADR-0007 (stack):** el motor central pasa a PostgreSQL y SQLite queda como motor del nodo local. El lenguaje debe tener buen soporte para ambos: TypeScript/Node.js lo tiene (`pg` y `node:sqlite`), y Prisma admite los dos motores con un esquema por motor; se valida en T-008. Esto favorece TypeScript sobre Python, porque el servidor reutiliza lo de base-shop.
- **ADR-0008 (despliegue):** con servidor externo ya no es "una instalación por productor en su PC". Propuesta: un servidor compartido con **una base de datos por productor** (aislamiento, respaldo y baja por cliente sin tocar a otros), más un nodo local opcional por productor.
- **P-04 (PC mínima):** deja de ser crítica para clientes con buen Internet; sigue importando para el nodo local del cliente básico.
- **Nuevas decisiones:** P-07 proveedor del servidor y costo mensual; P-08 cómo se conecta un nodo local al servidor (autenticación del nodo, TLS).

## 7. Recomendación

Opción C con TypeScript: PostgreSQL en un servidor externo como base central y SQLite en un nodo local solo para productores sin Internet confiable. Para el piloto con un productor como el Productor A se puede empezar por el nodo local y conectar el servidor en cuanto esté contratado, sin cambiar el modelo.
