# PROJECT — Plataforma de trazabilidad de plántula de fresa

## 1. Visión

Que cualquier productor de plántula de fresa, sin importar su nivel de digitalización, pueda responder en minutos de dónde viene una plántula, qué recibió, quién la inspeccionó y a quién se entregó.

## 2. Objetivo

Proporcionar un Traceability Core basado en eventos, auditable y operable sin conexión, que se integre, complemente o sustituya progresivamente lo que el productor ya usa (Excel, sistema propio, ERP), según su infraestructura, presupuesto y madurez (principio rector de `README.md` de origen).

La plataforma no asume que el productor quiera reemplazar su ERP, usar PWA o etiquetas RFID (reglas de diseño 1 a 3 del doc 13 de origen).

## 3. Alcance inicial (MVP)

Propuesta pendiente de aprobación (T-002). Corresponde a la Fase 1 y a la parte de la Fase 2 que hace falta para la trazabilidad (doc 10 de origen), sobre la arquitectura de referencia A (cliente básico).

Incluido:

- Ubicaciones: Centro de producción → Invernadero → Sector → Mesa (ADR-0003)
- Variedades y material vegetal con su origen
- Lotes: planificación, siembra, avance de etapas, división con genealogía, cierre (ADR-0004, ADR-0009)
- Charolas asignadas a lotes y su ubicación
- Identificadores independientes de la tecnología, con etiqueta impresa y escáner USB como mínimo (ADR-0014)
- Labores: riego, fertilización, aplicación con intervalo de seguridad, inspección (ADR-0012)
- Pérdidas con causa, transferencias, cuarentena y liberación, control de calidad
- Entregas a clientes del productor (sin pedidos ni precios)
- Trazabilidad hacia atrás y hacia adelante (recall)
- Reportes: disponibilidad por variedad y etapa, mermas y causas
- Importación del registro de lotes desde Excel y exportación a CSV
- Usuarios locales con roles
- Eventos con UUID, idempotencia, anulación y reconstrucción (ADR-0005, ADR-0011)
- Captura sin conexión desde teléfono o tablet y sincronización entre equipos por red local o por archivo (ADR-0006)
- Respaldos locales automáticos

Fuera del MVP:

- Pedidos, reservas, clientes y precios como módulo comercial (Fase 4); la entrega registra solo cliente, pedido y cantidad.
- Inventario y consumo de insumos (Fase 3).
- Conectores ERP/SAP, webhooks y SFTP (Fase 5). El MVP intercambia con Excel/CSV.
- RFID, NFC, sensores e IoT (Fase 6).
- Analítica avanzada y tableros.

El alcance funcional detallado se mantiene en `REQUIREMENTS.md`.

## 4. Stack tecnológico

| Área | Estado | Decisión | Referencia |
|---|---|---|---|
| Lenguaje y runtime | Definido | TypeScript sobre Node.js 24 | ADR-0007 |
| Framework | Definido | NestJS, monolito modular como base-shop | ADR-0007 |
| Base de datos | Definido | PostgreSQL en servidor externo, una base por productor; SQLite en el nodo local sin Internet | ADR-0007, ADR-0008, ESTUDIO-01 |
| Interfaz | Propuesto | Web servida por la aplicación (servidor o nodo local), usable en PC, teléfono y tablet | ADR-0007 |
| Modelo de datos | Definido | Eventos inmutables como verdad; proyecciones reconstruibles | ADR-0005 |
| Offline | Definido | Desde el diseño | ADR-0006 |
| Despliegue | Definido | Servidor externo con nodo local opcional; proveedor con el primer cliente, solo entorno local mientras tanto | ADR-0008, ADR-0019 |
| Autenticación | PENDIENTE DE DECISIÓN | Usuarios locales con PIN o contraseña | P-40 |
| Integración | Propuesto | Importación de Excel (.xlsx) y CSV; exportación CSV | P-30 |
| Repositorio y CI | Definido | Un solo repositorio en GitHub (`Ferchoner/trazabilidad-agro`) con GitHub Flow; CI con T-010 | ADR-0020 |
| Empaquetado | PENDIENTE | Instalador o carpeta portable para Windows | T-108 |

## 5. Usuarios del sistema

| Usuario | Uso principal |
|---|---|
| Dirección del productor | Consulta trazabilidad, disponibilidad y mermas |
| Jefe de producción | Lotes, siembra, etapas, divisiones, transferencias, aplicaciones |
| Capturista de invernadero | Riego, fertilización, pérdidas, transferencias desde el teléfono |
| Responsable de calidad | Inspecciones, cuarentena, liberación, control de calidad |
| Ventas / embarques | Entregas y consulta de disponibilidad |
| Administrador | Usuarios, configuración, respaldos, sincronización, conflictos |
| Consultor (nuestro) | Configura al productor a partir del diagnóstico; importa su Excel |

## 6. Contexto operativo

- Producción solo en invernadero (ADR-0003). La mayoría opera varias hectáreas.
- Cliente básico de referencia: una PC antigua en oficina, Excel, Internet limitado y poca o ninguna señal dentro de los invernaderos.
- Idioma de la interfaz: español. Fechas en hora de México en pantalla; UTC en los eventos.
- Normativa (SENASICA, GlobalG.A.P., exportación): PENDIENTE DE DECISIÓN por productor (P-19).

## 7. Caso de prueba controlado

"Productor A" (ADR-0017): 2 invernaderos, una PC antigua, Excel, Internet limitado y ningún sistema de trazabilidad. Datos ficticios. Se usa para recorrer el kit del consultor (T-007) y como escenario de aceptación de la plataforma.

## 8. Estado

Sprint 0 — Discovery and Architecture en curso (`SPRINT.md`). Sin código de producto.

## 9. Antes de operar con un productor real

- Stack probado en la PC mínima del nodo local (P-04, T-008).
- Hosting decidido con el cliente: proveedor, región, costo y respaldo fuera del sitio (ADR-0019, P-05, P-07).
- Definiciones de trazabilidad cerradas con ese productor (doc 02 del kit, P-13 a P-20).
- Piloto acotado con KPIs y línea base (T-009).
