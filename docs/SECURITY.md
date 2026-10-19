# SECURITY

Estado: borrador del Sprint 0.

## Principios

Seguridad por diseño, mínimo privilegio, validación de toda entrada, errores sin detalles internos, logs sin datos sensibles. El escenario principal es una red local de un productor, no Internet: el riesgo es más de acceso indebido entre empleados, pérdida de datos y manipulación de registros que de ataques externos.

## Autenticación

Usuarios locales con PIN o contraseña guardados con hash lento con sal (PENDIENTE: algoritmo según stack; base-shop usa Argon2id). Sesión con token aleatorio y expiración. P-40 decide PIN o contraseña y su longitud mínima.

Teléfonos personales (caso Productor A, H-13): la captura se hace en teléfonos de los trabajadores. Cada persona inicia sesión con su usuario aunque el teléfono sea de otro; la sesión expira sola; el teléfono no guarda PIN ni contraseña; la cola de eventos se borra al sincronizarse; un administrador puede revocar un dispositivo. Qué datos quedan en el teléfono y por cuánto tiempo se cierra con P-40 y P-41.

## Autorización

Permisos por rol con la matriz de `REQUIREMENTS.md` §4, verificados en el servidor para cada evento. Un evento lleva siempre el usuario autenticado, no el que diga el cliente.

## Integridad de registros

- Eventos inmutables; anulación con motivo y usuario (ADR-0011).
- Huella de contenido por evento para detectar alteraciones en la sincronización.
- PENDIENTE: encadenar huellas para detectar alteraciones directas al archivo de base de datos, si alguna normativa lo exige (P-19).

## Red local

- La aplicación escucha en la red local para teléfonos y tablets. Por defecto HTTP; HTTPS local (P-06) habilita PWA y cámara.
- La sincronización entre nodos exige clave compartida; la clave no se versiona.
- Con servidor externo (ADR-0008; proveedor con el cliente, ADR-0019): TLS obligatorio, autenticación de cada nodo local y de cada usuario remoto (P-08); la base de cada productor aislada en su propia base de datos.

## Respaldos

Respaldo automático diario y manual; prueba de restauración como criterio de aceptación (P-05). Un respaldo contiene datos personales de clientes del productor y se trata igual que la base.

Cortes de luz (caso Productor A, H-12: sin no-break): la base local se configura para que un apagón no la corrompa ni pierda eventos confirmados, y T-106 lo prueba cortando el proceso durante una escritura.

## Datos personales

El MVP guarda nombres de usuarios del productor y nombre de sus clientes en las entregas. Aviso y conservación conforme a la ley mexicana de protección de datos: PENDIENTE (P-41).

## Gestión de secretos

Configuración sensible (clave de sincronización, PIN iniciales) fuera del repositorio, con un archivo de ejemplo sin valores reales, como `.env.example` en base-shop.

## Auditoría

El almacén de eventos es la auditoría de negocio. Además: inicios de sesión, fallos de autenticación, importaciones, sincronizaciones y respaldos se registran.
