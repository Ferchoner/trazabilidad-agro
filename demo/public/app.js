// Interfaz del demo (ADR-0021, ADR-0022). JavaScript sin framework; todo texto dinámico se escapa.
// Sin avisos de demo en pantalla: lo interno lo dicen README y docs/.
'use strict';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const $print = document.getElementById('print-area');

const store = {
  get(key, fallback) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* sin almacenamiento del navegador: no pasa nada */
    }
  },
};

let config = null;
let catalog = null;
/** Usuario con sesión iniciada (sin contraseña, P-40). */
let sessionUser = null;
/** Qué hace la pantalla actual con un código leído; si devuelve false, se abre lo leído. */
let scanHandler = null;
/** Navegación vigente: una consulta de una pantalla anterior no pinta sobre la actual. */
let routeSeq = 0;
/** Charolas marcadas en la ficha del lote, para mover o imprimir. */
let traySelection = new Set();

class StaleView extends Error {}

// ---------- utilidades ----------

function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function uuid() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  // La red local sin HTTPS no expone randomUUID (P-06).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function deviceId() {
  let id = store.get('dispositivo', null);
  if (!id) {
    id = `navegador-${uuid().slice(0, 6)}`;
    store.set('dispositivo', id);
  }
  return id;
}

const nf = new Intl.NumberFormat('es-MX');
const fmtN = (n) => nf.format(n ?? 0);

function fmtDate(d) {
  if (!d) return '—';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtInstant(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: config?.producer.timeZone ?? 'America/Mexico_City',
  });
}

function currentUser() {
  return config.users.find((u) => u.id === sessionUser) ?? config.users[0];
}

function can(type) {
  const p = currentUser().permissions;
  return p.includes('*') || p.includes(type);
}

function canSetStage(code) {
  const u = currentUser();
  if (u.permissions.includes('*')) return true;
  const stage = config.stages.find((s) => s.code === code);
  return can('LotStageChanged') && stage && stage.setBy.some((r) => u.roles.includes(r));
}

function toast(message, isError = false) {
  $toast.textContent = message;
  $toast.className = `toast${isError ? ' error' : ''}`;
  $toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($toast.hidden = true), isError ? 7000 : 3500);
}

async function api(path, options = {}) {
  const seq = routeSeq;
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-demo-user': sessionUser ?? '',
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.detail ?? 'No se pudo completar la operación.');
    err.code = body.code;
    throw err;
  }
  if (!options.method && !options.global && seq !== routeSeq) throw new StaleView();
  return body;
}

function errorText(err) {
  return err.message;
}

/** Envía un evento capturado con su UUID, hora del dispositivo y fecha de operación. */
async function capture(type, entityType, entityId, payload, operatedAt) {
  return api('/events', {
    method: 'POST',
    body: JSON.stringify({
      id: uuid(),
      type,
      entityType,
      entityId,
      occurredAt: new Date().toISOString(),
      operatedAt: operatedAt || null,
      deviceId: deviceId(),
      payload,
    }),
  });
}

function stageBadge(lot) {
  const cls = {
    PLANIFICADO: '',
    SEMBRADO: 'blue',
    LISTO_VENTA: 'green',
    CERRADO: '',
    PERDIDO: 'red',
    CANCELADO: '',
  }[lot.stage];
  return `<span class="badge ${cls ?? 'blue'}">${esc(lot.stageLabel)}</span>`;
}

function holdBadge(lot) {
  return lot.hold === 'EN_CUARENTENA'
    ? '<span class="badge red">En cuarentena</span>'
    : '<span class="badge">Libre</span>';
}

const COMMERCIAL = {
  DISPONIBLE: ['Disponible', 'green'],
  PARCIALMENTE_VENDIDO: ['Parcialmente vendido', 'amber'],
  VENDIDO: ['Vendido', ''],
};
function commercialBadge(lot) {
  if (!lot.commercial) return '<span class="muted">—</span>';
  const [label, cls] = COMMERCIAL[lot.commercial];
  return `<span class="badge ${cls}">${label}</span>`;
}

const STATUS = {
  APPLIED: ['Aplicado', 'green'],
  CONFLICT: ['Conflicto', 'red'],
  VOIDED: ['Anulado', ''],
};
function statusBadge(status) {
  const [label, cls] = STATUS[status] ?? [status, ''];
  return `<span class="badge ${cls}">${label}</span>`;
}

function today() {
  return config.today;
}

function dateField(name = 'operatedAt', label = 'Fecha de la operación') {
  return `<label class="field">${esc(label)}
    <input type="date" name="${name}" value="${today()}" max="${today()}" required></label>`;
}

function locationOptions(levels, selected) {
  return catalog.locations
    .filter((l) => levels.includes(l.level))
    .sort((a, b) =>
      a.level === b.level ? a.code.localeCompare(b.code) : a.level === 'TABLE' ? -1 : 1,
    )
    .map(
      (l) =>
        `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${esc(l.path)}${l.level === 'SECTOR' ? ' (sin tabla)' : ''}</option>`,
    )
    .join('');
}

function setBars(root = $app) {
  root.querySelectorAll('[data-pct]').forEach((el) => {
    el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.pct)))}%`;
  });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function onSubmit(form, handler) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      await handler(formData(form), form);
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function isAdmin() {
  return currentUser().permissions.includes('*');
}

// ---------- charolas (ADR-0024) ----------

/** Cavidades por charola que usa cada variedad en el caso; se pueden cambiar al capturar. */
const DEFAULT_CAVITIES = { Festival: 72, 'Camino Real': 72, 'San Andreas': 128 };

/** "L-0818-C05" → "C05". */
const shortTray = (code) => String(code).replace(/^.*-(C\d+)$/, '$1');

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** Columnas del mapa: 72 cavidades en 6 × 12 y 128 en 8 × 16. */
function gridCols(n) {
  if (n === 72) return 12;
  if (n === 128) return 16;
  for (const c of [12, 10, 16, 8, 14, 9, 6, 20]) if (n % c === 0 && n / c <= c) return c;
  return Math.min(16, Math.ceil(Math.sqrt(n * 2)));
}

const CELL_LABEL = {
  SANA: 'Con plántula',
  VACIA: 'Vacía',
  PERDIDA: 'Perdida',
  OBSERVADA: 'Observada',
  RESEMBRADA: 'Resembrada',
};

/**
 * Cantidad prellenada con el máximo (charolas × cavidades), que queda marcado junto al campo;
 * casi siempre se usan todas las cavidades (Fernando, 2026-11-04). Se puede bajar, no pasar.
 */
function bindMaxQuantity(form, hint) {
  const update = (reset) => {
    const cap = Number(form.trays.value) * Number(form.cavities.value);
    if (!(cap > 0)) {
      hint.textContent = '';
      form.quantity.removeAttribute('max');
      return;
    }
    form.quantity.max = String(cap);
    if (reset) form.quantity.value = String(cap);
    const over = Number(form.quantity.value) > cap;
    hint.innerHTML = `Máximo: <strong>${fmtN(cap)}</strong> plántulas (${fmtN(Number(form.trays.value))} charolas × ${fmtN(Number(form.cavities.value))} cavidades)${over ? '. <strong class="text-red">No puede pasar el máximo.</strong>' : ''}`;
  };
  form.trays.addEventListener('input', () => update(true));
  form.cavities.addEventListener('input', () => update(true));
  form.quantity.addEventListener('input', () => update(false));
  update(true);
  return update;
}

// ---------- etiquetas (ADR-0023) ----------

/** Espacio para el código de barras y su alto, en mm, por formato. */
const BARCODE_BOX = {
  T100X50: [88, 13],
  R80: [70, 12],
  R58: [50, 10],
  CARTA: [90, 13],
};

function labelFormat(code) {
  return config.labelFormats.find((f) => f.code === code) ?? config.labelFormats[0];
}

function formatOptions(selected = store.get('formato-etiqueta', 'T100X50')) {
  return config.labelFormats
    .map(
      (f) =>
        `<option value="${esc(f.code)}" ${f.code === selected ? 'selected' : ''}>${esc(f.label)}</option>`,
    )
    .join('');
}

/** Módulo en múltiplos de 0.125 mm (un punto a 203 ppp), entre 0.25 y 0.5 mm. */
function barcodeSvg(code, fmt) {
  const [avail, height] = BARCODE_BOX[fmt.code] ?? [80, 12];
  const raw = avail / Code128.width(code);
  const moduleMm = Math.max(0.25, Math.min(0.5, Math.floor(raw / 0.125) * 0.125));
  return Code128.svg(code, { moduleMm, heightMm: height });
}

function lotLabelItem(lot) {
  return {
    kind: 'lot',
    id: lot.id,
    code: lot.folio,
    variety: lot.variety,
    sowingDate: lot.sowingDate,
    quantity: lot.initialQty || lot.plannedQty,
    trays: lot.trays,
    location: lot.location?.path ?? '',
  };
}

function labelHtml(item, fmt) {
  const compact = fmt.code === 'R58';
  const kindLabel =
    item.kind === 'lot' ? 'Lote' : item.kind === 'tray' ? 'Charola' : item.levelLabel;
  const top = `<div class="lbl-top"><span>${esc(config.producer.name)}</span><span>${esc(kindLabel)}</span></div>`;
  const bars = `<div class="lbl-bars">${barcodeSvg(item.code, fmt)}</div>`;
  if (item.kind === 'lot') {
    return `<div class="label lbl-${esc(fmt.code)}">${top}
      <div class="lbl-code">${esc(item.code)}</div>
      <div class="lbl-line"><strong>${esc(item.variety)}</strong> · ${item.sowingDate ? `Siembra ${esc(fmtDate(item.sowingDate))}` : 'Planificado'}</div>
      <div class="lbl-line">${esc(item.location || '—')}</div>
      ${compact ? '' : `<div class="lbl-line">${fmtN(item.quantity)} plántulas${item.trays ? ` · ${item.trays} charolas` : ''}</div>`}
      ${bars}</div>`;
  }
  if (item.kind === 'tray') {
    return `<div class="label lbl-${esc(fmt.code)}">${top}
      <div class="lbl-code">${esc(item.code)}</div>
      <div class="lbl-line">Lote <strong>${esc(item.folio)}</strong> · ${esc(item.variety)}</div>
      ${compact ? '' : `<div class="lbl-line">Charola ${item.index} de ${item.total} · ${item.cavities} cavidades</div>`}
      ${bars}</div>`;
  }
  return `<div class="label lbl-${esc(fmt.code)}">${top}
    <div class="lbl-code">${esc(item.code)}</div>
    <div class="lbl-line">${esc(item.path)}</div>
    ${bars}</div>`;
}

/** Registra la impresión (un evento por etiqueta) y abre el diálogo de impresión del sistema. */
async function printLabels(items, formatCode, copies) {
  const fmt = labelFormat(formatCode);
  const n = Math.max(1, Math.min(50, Number(copies) || 1));
  if (!items.length) throw new Error('Elige al menos una etiqueta.');
  // Un evento por lote o ubicación; las charolas de un lote van juntas en un solo evento.
  const trayGroups = new Map();
  for (const it of items.filter((x) => x.kind === 'tray')) {
    trayGroups.set(it.lotId, [...(trayGroups.get(it.lotId) ?? []), it.code]);
  }
  const event = (entityType, entityId, payload) => ({
    id: uuid(),
    type: 'LabelPrinted',
    entityType,
    entityId,
    occurredAt: new Date().toISOString(),
    deviceId: deviceId(),
    payload,
  });
  await api('/events', {
    method: 'POST',
    body: JSON.stringify({
      events: [
        ...items
          .filter((it) => it.kind !== 'tray')
          .map((it) => event(it.kind, it.id, { format: fmt.code, copies: n })),
        ...[...trayGroups].map(([lotId, trays]) =>
          event('lot', lotId, { format: fmt.code, copies: n, trays }),
        ),
      ],
    }),
  });
  store.set('formato-etiqueta', fmt.code);
  const all = items.flatMap((it) => Array.from({ length: n }, () => it));
  let html = '';
  if (fmt.perSheet > 1) {
    for (let i = 0; i < all.length; i += fmt.perSheet) {
      html += `<div class="sheet sheet-${esc(fmt.code)}">${all
        .slice(i, i + fmt.perSheet)
        .map((it) => labelHtml(it, fmt))
        .join('')}</div>`;
    }
  } else {
    html = all
      .map((it) => `<div class="page page-${esc(fmt.code)}">${labelHtml(it, fmt)}</div>`)
      .join('');
  }
  $print.innerHTML = html;
  window.print();
}

// ---------- lectura de códigos (ADR-0014) ----------

async function onScan(raw) {
  const code = String(raw ?? '').trim();
  if (!code) return;
  let result;
  try {
    result = await api(`/scan/${encodeURIComponent(code)}`, { global: true });
  } catch (err) {
    if (!(err instanceof StaleView)) toast(errorText(err), true);
    return;
  }
  if (scanHandler && (await scanHandler(result))) return;
  if (result.kind === 'unknown') {
    toast(`Código no reconocido: ${result.code}`, true);
  } else if (result.kind === 'lot') {
    location.hash = `#/lote/${result.folio}`;
  } else if (result.kind === 'tray') {
    location.hash = `#/lote/${result.folio}?charola=${encodeURIComponent(result.code)}`;
  } else {
    const lots = await api('/lots', { global: true });
    const here = lots.filter(
      (l) =>
        (l.locations.length
          ? l.locations.some((x) => x.id === result.id)
          : l.location?.id === result.id) && !['CERRADO', 'PERDIDO', 'CANCELADO'].includes(l.stage),
    );
    toast(`${result.path}: ${here.length ? here.map((l) => l.folio).join(', ') : 'sin lotes'}`);
  }
}

async function setupCamera() {
  const btn = document.getElementById('camera-open');
  if (!('BarcodeDetector' in window) || !window.isSecureContext) return;
  if (!navigator.mediaDevices?.getUserMedia) return;
  let formats = [];
  try {
    formats = await window.BarcodeDetector.getSupportedFormats();
  } catch {
    return;
  }
  if (!formats.includes('code_128')) return;
  btn.hidden = false;
  btn.addEventListener('click', openCamera);
}

async function openCamera() {
  const dialog = document.getElementById('camera');
  const video = document.getElementById('camera-video');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    toast('No se pudo abrir la cámara.', true);
    return;
  }
  video.srcObject = stream;
  dialog.hidden = false;
  await video.play().catch(() => {});
  const detector = new window.BarcodeDetector({ formats: ['code_128'] });
  let done = false;
  const stop = () => {
    done = true;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    dialog.hidden = true;
  };
  document.getElementById('camera-close').onclick = stop;
  dialog.onkeydown = (e) => e.key === 'Escape' && stop();
  const tick = async () => {
    if (done) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        stop();
        onScan(codes[0].rawValue);
        return;
      }
    } catch {
      /* cuadro sin imagen todavía */
    }
    setTimeout(tick, 250);
  };
  tick();
}

// ---------- vistas ----------

const views = {
  async resumen() {
    const s = await api('/summary');
    const pct = s.sown ? Math.round((s.lost / s.sown) * 1000) / 10 : 0;
    $app.innerHTML = `
      <h1>Resumen al ${esc(fmtDate(s.today))}</h1>
      <p class="muted">${esc(s.producer)} · temporada 2026</p>
      <div class="cards">
        <a class="card" href="#/lotes"><div class="label">Lotes activos</div><div class="value">${fmtN(s.activeLots)}</div><div class="hint">en invernadero o planificados</div></a>
        <a class="card" href="#/inventario"><div class="label">Plántulas en invernadero</div><div class="value">${fmtN(s.plantsInGreenhouse)}</div><div class="hint">de ${fmtN(s.sown)} sembradas</div></a>
        <a class="card" href="#/inventario"><div class="label">Listas para entregar hoy</div><div class="value">${fmtN(s.readyDeliverable)}</div><div class="hint">libres y fuera de intervalo</div></a>
        <a class="card" href="#/lotes?hold=EN_CUARENTENA"><div class="label">Lotes en cuarentena</div><div class="value">${fmtN(s.inQuarantine)}</div><div class="hint">no se entregan</div></a>
        <a class="card" href="#/lotes"><div class="label">En intervalo de seguridad</div><div class="value">${fmtN(s.inSafetyInterval)}</div><div class="hint">lotes con aplicación reciente</div></a>
        <a class="card" href="#/mermas"><div class="label">Mermas</div><div class="value">${fmtN(s.lost)}</div><div class="hint">${pct}% de lo sembrado, todas con causa</div></a>
        <a class="card" href="#/entregas"><div class="label">Entregadas</div><div class="value">${fmtN(s.dispatched)}</div><div class="hint">a clientes del productor</div></a>
        <a class="card" href="#/eventos?status=CONFLICT"><div class="label">Eventos en conflicto</div><div class="value">${fmtN(s.conflicts)}</div><div class="hint">de ${fmtN(s.events)} eventos</div></a>
      </div>
      <div class="panel">
        <h2>Atención hoy</h2>
        <div id="attention" class="stack"><p class="muted small">Cargando…</p></div>
      </div>`;
    const lots = await api('/lots');
    const active = lots.filter((l) => !['CERRADO', 'PERDIDO', 'CANCELADO'].includes(l.stage));
    const groups = [
      ['Se pueden entregar hoy', 'green', active.filter((l) => l.deliverable)],
      ['En cuarentena', 'red', active.filter((l) => l.hold === 'EN_CUARENTENA')],
      ['En intervalo de seguridad', 'amber', active.filter((l) => l.safety)],
      ['Sin origen del material', 'amber', active.filter((l) => !l.material && l.sowingDate)],
      ['Planificados por sembrar', '', active.filter((l) => l.stage === 'PLANIFICADO')],
    ].filter(([, , list]) => list.length);
    document.getElementById('attention').innerHTML =
      groups
        .map(
          ([title, cls, list]) =>
            `<div class="attention-row"><span class="badge ${cls}">${esc(title)}</span><span>${list.map((l) => `<a class="chip" href="#/lote/${esc(l.folio)}" title="${esc(l.safety?.message ?? l.holdReason ?? l.variety)}">${esc(l.folio)}</a>`).join('')}</span></div>`,
        )
        .join('') || '<p class="muted small">Nada pendiente.</p>';
  },

  async lotes(params) {
    const lots = await api('/lots');
    const f = {
      q: params.get('q') ?? '',
      variety: params.get('variety') ?? '',
      stage: params.get('stage') ?? 'ACTIVOS',
      hold: params.get('hold') ?? '',
    };
    const terminal = ['CERRADO', 'PERDIDO', 'CANCELADO'];
    const rows = lots.filter(
      (l) =>
        (!f.q || l.folio.includes(f.q.toUpperCase())) &&
        (!f.variety || l.varietyId === f.variety) &&
        (f.stage === '' ||
          (f.stage === 'ACTIVOS' ? !terminal.includes(l.stage) : l.stage === f.stage)) &&
        (!f.hold || l.hold === f.hold),
    );
    $app.innerHTML = `
      <div class="row-head"><h1>Lotes</h1>${can('LotPlanned') ? '<a href="#/nuevo"><button class="primary" type="button">Registrar lote</button></a>' : ''}</div>
      <p class="muted">Cada lote muestra su etapa, si está retenido y su situación comercial.</p>
      <form class="toolbar" id="filters">
        <input name="q" placeholder="Buscar folio" value="${esc(f.q)}" aria-label="Buscar folio">
        <select name="variety" aria-label="Variedad"><option value="">Todas las variedades</option>
          ${catalog.varieties.map((v) => `<option value="${v.id}" ${v.id === f.variety ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
        <select name="stage" aria-label="Etapa">
          <option value="ACTIVOS" ${f.stage === 'ACTIVOS' ? 'selected' : ''}>Activos</option>
          <option value="" ${f.stage === '' ? 'selected' : ''}>Todos</option>
          ${config.stages.map((s) => `<option value="${s.code}" ${s.code === f.stage ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
        <select name="hold" aria-label="Retención">
          <option value="">Libre o en cuarentena</option>
          <option value="LIBRE" ${f.hold === 'LIBRE' ? 'selected' : ''}>Libre</option>
          <option value="EN_CUARENTENA" ${f.hold === 'EN_CUARENTENA' ? 'selected' : ''}>En cuarentena</option></select>
      </form>
      <div class="table-wrap"><table>
        <thead><tr><th>Folio</th><th>Variedad</th><th class="hide-sm">Ubicación</th><th>Etapa</th><th>Retención</th><th>Comercial</th><th class="num">Plántulas</th><th class="hide-sm">Alertas</th></tr></thead>
        <tbody>${
          rows
            .map(
              (l) => `<tr class="clickable" data-href="#/lote/${esc(l.folio)}">
              <td class="nowrap"><a href="#/lote/${esc(l.folio)}"><strong>${esc(l.folio)}</strong></a></td>
              <td>${esc(l.variety)}</td>
              <td class="hide-sm">${l.locations.length > 1 ? esc(l.locations.map((x) => x.code).join(', ')) : esc(l.location?.path ?? '—')}</td>
              <td>${stageBadge(l)}</td><td>${holdBadge(l)}</td><td>${commercialBadge(l)}</td>
              <td class="num">${l.stage === 'PLANIFICADO' ? `<span class="muted">${fmtN(l.plannedQty)} plan.</span>` : fmtN(l.currentQty)}</td>
              <td class="hide-sm">${l.safety ? `<span class="badge amber" title="${esc(l.safety.message)}">Intervalo</span>` : ''}${l.material ? '' : ' <span class="badge amber">Origen PENDIENTE</span>'}</td>
            </tr>`,
            )
            .join('') ||
          '<tr><td colspan="8" class="muted">No hay lotes con esos filtros.</td></tr>'
        }</tbody></table></div>`;
    const form = document.getElementById('filters');
    form.addEventListener('change', () => {
      const q = new URLSearchParams(formData(form));
      location.hash = `#/lotes?${q}`;
    });
    form.addEventListener('submit', (e) => e.preventDefault());
    form.q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') form.dispatchEvent(new Event('change'));
    });
    $app.querySelectorAll('tr[data-href]').forEach((tr) =>
      tr.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        location.hash = tr.dataset.href;
      }),
    );
  },

  async lote(params, folio) {
    const lot = await api(`/lots/${encodeURIComponent(folio)}`);
    const m = lot.material;
    const terminal = ['CERRADO', 'PERDIDO', 'CANCELADO'].includes(lot.stage);
    $app.innerHTML = `
      <p><a href="#/lotes">← Lotes</a></p>
      <div class="row-head"><h1>Lote ${esc(lot.folio)} · ${esc(lot.variety)}</h1></div>
      <div class="axes">
        <div class="axis"><div class="label">Etapa agrícola</div>${stageBadge(lot)}</div>
        <div class="axis"><div class="label">Retención</div>${holdBadge(lot)}${lot.holdReason ? `<div class="small muted">${esc(lot.holdReason)}</div>` : ''}</div>
        <div class="axis"><div class="label">Situación comercial (calculada)</div>${commercialBadge(lot)}</div>
        <div class="axis"><div class="label">Plántulas actuales</div><strong>${fmtN(lot.currentQty)}</strong> <span class="muted small">de ${fmtN(lot.initialQty || lot.plannedQty)}</span></div>
      </div>
      ${lot.safety ? `<div class="alert amber">${esc(lot.safety.message)}</div>` : ''}
      ${lot.deliverable ? '<div class="alert green">Se puede entregar hoy: listo, libre y fuera de intervalo de seguridad.</div>' : ''}
      ${params.get('nuevo') ? '<div class="alert green">Lote registrado. Imprime su etiqueta y pégala en la tabla; las de sus charolas se imprimen abajo, en Charolas.</div>' : ''}
      <div class="panel">
        <div class="row-head"><h2>Etiqueta</h2><span class="small muted" id="label-prints"></span></div>
        <div class="label-panel">
          <div class="label-preview" id="lot-label"></div>
          <form class="stack" id="lot-print">
            <label class="field">Formato<select name="format">${formatOptions()}</select></label>
            <label class="field">Copias<input type="number" name="copies" min="1" max="50" value="1" required></label>
            <div class="actions"><button class="primary" type="submit" ${can('LabelPrinted') ? '' : 'disabled'}>Imprimir etiqueta</button></div>
            ${can('LabelPrinted') ? '' : '<p class="small muted">Tu usuario no imprime etiquetas.</p>'}
          </form>
        </div>
      </div>
      <div class="grid-2">
        <div class="panel">
          <h2>Datos y origen</h2>
          <dl class="facts">
            <dt>Variedad</dt><dd>${esc(lot.variety)}</dd>
            <dt>Material vegetal</dt><dd>${m ? `${esc(m.origin)}, ${esc(m.supplier ?? 'proveedor PENDIENTE')}` : '<span class="badge amber">PENDIENTE</span> <span class="small muted">Falta el proveedor del material</span>'}</dd>
            ${m ? `<dt>Documento</dt><dd>${esc(m.document ?? 'PENDIENTE')}</dd>` : ''}
            <dt>Siembra</dt><dd>${esc(fmtDate(lot.sowingDate))}</dd>
            <dt>Charolas</dt><dd>${lot.trays ? `${lot.trays} × ${lot.cavities} cavidades = ${fmtN(lot.trays * lot.cavities)}` : '—'}</dd>
            <dt>Sembradas</dt><dd>${fmtN(lot.initialQty)}</dd>
            <dt>Perdidas</dt><dd>${fmtN(lot.lostQty)}</dd>
            <dt>Entregadas</dt><dd>${fmtN(lot.dispatchedQty)}</dd>
            <dt>Ubicación</dt><dd>${
              lot.locations.length > 1
                ? `Repartido en ${lot.locations.length} ${esc(config.levels.TABLE.toLowerCase())}s:<ul class="small plain">${lot.locations.map((x) => `<li>${esc(x.path)}: ${x.trays} charolas, ${fmtN(x.quantity)} plántulas</li>`).join('')}</ul>`
                : esc(lot.location?.path ?? '—')
            }</dd>
          </dl>
          ${lot.locationHistory.length > 1 ? `<h3 class="small muted">Ubicaciones en el tiempo</h3><ul class="small">${lot.locationHistory.map((h) => `<li>Desde ${esc(fmtDate(h.from))}: ${esc(h.path)}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="panel">
          <h2>Aplicaciones y entregas</h2>
          ${lot.applications.length ? `<ul class="small">${lot.applications.map((a) => `<li>${esc(fmtDate(a.date))}: ${esc(a.product)} (${esc(a.activeIngredient)}). ${a.until ? `Sin entregar hasta el ${esc(fmtDate(a.until))}.` : '<strong>Intervalo de seguridad PENDIENTE.</strong>'}</li>`).join('')}</ul>` : '<p class="muted small">Sin aplicaciones.</p>'}
          ${lot.dispatches.length ? `<ul class="small">${lot.dispatches.map((d) => `<li>${esc(fmtDate(d.date))}: ${fmtN(d.quantity)} a ${esc(d.customer)}, pedido ${esc(d.order)}</li>`).join('')}</ul>` : '<p class="muted small">Sin entregas.</p>'}
          ${lot.losses.length ? `<h3 class="small muted">Pérdidas</h3><ul class="small">${lot.losses.map((l) => `<li>${esc(fmtDate(l.date))}: ${fmtN(l.quantity)}, ${esc(l.cause)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>
      ${lot.trayList.length ? '<div class="panel" id="trays-panel"></div>' : ''}
      ${terminal ? '' : `<div class="panel"><h2>Registrar</h2><p class="muted small">Aparecen las operaciones que permite tu usuario. Para mover el lote, escanea la etiqueta de la ${esc(config.levels.TABLE.toLowerCase())} destino; para mover solo algunas charolas, márcalas o escanéalas antes.</p><div class="action-list" id="actions"></div></div>`}
      <div class="panel">
        <h2>Historia del lote</h2>
        <p class="muted small">Eventos del lote y de su ubicación (en azul), en el orden en que se aplican. La fecha de la operación puede ser anterior a la de captura.</p>
        <ol class="timeline">${lot.history
          .map(
            (
              h,
            ) => `<li class="${h.status === 'VOIDED' ? 'voided' : h.status === 'CONFLICT' ? 'conflict' : h.direct ? '' : 'linked'}">
            <div class="desc">${esc(h.description)} ${h.status !== 'APPLIED' ? statusBadge(h.status) : ''}${h.direct ? '' : ' <span class="badge blue">por ubicación</span>'}</div>
            <div class="meta">Operación ${esc(fmtDate(h.operationDate))} · capturado ${esc(fmtInstant(h.occurredAt))} por ${esc(h.user)} (${esc(h.deviceId)})${h.reason ? ` · ${esc(h.code)}: ${esc(h.reason)}` : ''}</div>
            ${can('EventVoided') && h.status === 'APPLIED' && h.type !== 'EventVoided' ? `<button type="button" class="link-button" data-void="${h.id}">Anular</button>` : ''}
          </li>`,
          )
          .join('')}</ol>
      </div>`;
    traySelection = new Set();
    if (!terminal) renderLotActions(lot);
    if (lot.trayList.length) setupTrays(lot, params);
    const printed = lot.history.filter((h) => h.type === 'LabelPrinted' && h.status === 'APPLIED');
    document.getElementById('label-prints').textContent = printed.length
      ? `Impresa ${printed.length === 1 ? 'una vez' : `${printed.length} veces`}; última ${fmtInstant(printed[printed.length - 1].occurredAt)}`
      : 'Sin imprimir';
    const printForm = document.getElementById('lot-print');
    const item = lotLabelItem(lot);
    const preview = () => {
      document.getElementById('lot-label').innerHTML = labelHtml(
        item,
        labelFormat(printForm.format.value),
      );
    };
    printForm.format.addEventListener('change', preview);
    preview();
    onSubmit(printForm, async (d) => {
      await printLabels([item], d.format, d.copies);
      route();
    });
    scanHandler = (r) => {
      if (r.kind === 'tray' && r.lotId === lot.id) {
        const box = $app.querySelector(`input[data-tray="${CSS.escape(r.code)}"]`);
        if (!box || box.disabled) {
          toast(`La charola ${r.code} ya no tiene plántulas.`, true);
          return true;
        }
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        toast(
          `${shortTray(r.code)} marcada (${traySelection.size === 1 ? '1 charola' : `${traySelection.size} charolas`} para mover o imprimir).`,
        );
        return true;
      }
      if (r.kind !== 'location') return false;
      const move = $app.querySelector('details[data-action="move"]');
      if (!move) return false;
      if (r.level !== 'TABLE') {
        toast(`Escanea la etiqueta de una ${config.levels.TABLE.toLowerCase()}.`, true);
        return true;
      }
      if (!traySelection.size && lot.locations.length <= 1 && r.id === lot.location?.id) {
        toast(`El lote ya está en ${r.path}.`, true);
        return true;
      }
      move.open = true;
      const form = move.querySelector('form');
      form.toLocationId.value = r.id;
      form.querySelector('button[type="submit"]').focus();
      toast(`Destino: ${r.path}. Revisa la fecha y guarda.`);
      return true;
    };
    $app.querySelectorAll('[data-void]').forEach((b) =>
      b.addEventListener('click', async () => {
        const reason = prompt('Motivo de la anulación (queda en la historia):');
        if (!reason) return;
        try {
          await capture(
            'EventVoided',
            'event',
            b.dataset.void,
            { eventId: b.dataset.void, reason },
            null,
          );
          toast('Evento anulado. El estado se reconstruyó.');
          route();
        } catch (err) {
          toast(errorText(err), true);
        }
      }),
    );
  },

  async nuevo() {
    if (!can('LotPlanned')) {
      $app.innerHTML = `<h1>Registrar lote</h1><div class="alert amber">Tu usuario no tiene permiso para registrar lotes.</div>`;
      return;
    }
    const [s, lots] = await Promise.all([api('/summary'), api('/lots')]);
    const busy = new Set(
      lots
        .filter((l) => !['CERRADO', 'PERDIDO', 'CANCELADO'].includes(l.stage))
        .flatMap((l) => [l.location?.id, ...l.locations.map((x) => x.id)]),
    );
    const freeTable = catalog.locations
      .filter((l) => l.level === 'TABLE' && !busy.has(l.id))
      .sort((a, b) => a.code.localeCompare(b.code))[0];
    $app.innerHTML = `
      <h1>Registrar lote</h1>
      <p class="muted">El folio se asigna al registrar y continúa la numeración de su control actual. Escanea la etiqueta de la tabla para ubicarlo; al guardar, imprime la etiqueta del lote y las de sus charolas. La cantidad viene con el máximo de charolas por cavidades; bájala si quedaron cavidades sin sembrar.</p>
      <form class="panel stack" id="new-lot">
        <div class="form-grid">
          <label class="field">Folio<input name="folio" value="${esc(s.nextFolio)}" required pattern="[A-Za-z]{1,4}-[0-9]{3,6}(-[A-Za-z])?"></label>
          <label class="field">Variedad<select name="varietyId" required>${catalog.varieties.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select></label>
          <label class="field">Material vegetal<select name="plantMaterialId"></select></label>
          <label class="field">Ubicación<select name="locationId" required>${locationOptions(['TABLE', 'SECTOR'], freeTable?.id)}</select></label>
        </div>
        <fieldset class="form-grid">
          <legend class="small muted">¿En qué estado se registra?</legend>
          <label><input type="radio" name="mode" value="sow" checked> Ya se sembró</label>
          <label><input type="radio" name="mode" value="plan"> Solo planificado</label>
        </fieldset>
        <div class="form-grid" id="sow-fields">
          <label class="field">Charolas<input type="number" name="trays" min="1" value="12" required></label>
          <label class="field">Cavidades por charola<input type="number" name="cavities" min="1" value="72" required></label>
          <label class="field">Plántulas sembradas<input type="number" name="quantity" min="1" required></label>
          ${dateField('operatedAt', 'Fecha de siembra')}
          <p class="small field-hint" id="capacity"></p>
        </div>
        <div class="form-grid" id="plan-fields" hidden>
          <label class="field">Plántulas planeadas<input type="number" name="plannedQty" min="1" value="1000"></label>
        </div>
        <div class="actions"><button class="primary" type="submit">Registrar lote</button></div>
      </form>`;
    const form = document.getElementById('new-lot');
    const updateCapacity = bindMaxQuantity(form, document.getElementById('capacity'));
    const fillMaterials = () => {
      const opts = catalog.materials.filter((m) => m.varietyId === form.varietyId.value);
      form.plantMaterialId.innerHTML =
        opts
          .map(
            (m) =>
              `<option value="${m.id}">${esc(m.origin)}, ${esc(m.supplier ?? 'sin proveedor')}</option>`,
          )
          .join('') + '<option value="">Sin dato (queda PENDIENTE)</option>';
      const v = catalog.varieties.find((x) => x.id === form.varietyId.value);
      form.cavities.value = DEFAULT_CAVITIES[v?.name] ?? 72;
      updateCapacity(true);
    };
    form.varietyId.addEventListener('change', fillMaterials);
    form.querySelectorAll('input[name="mode"]').forEach((r) =>
      r.addEventListener('change', () => {
        const sow = form.mode.value === 'sow';
        document.getElementById('sow-fields').hidden = !sow;
        document.getElementById('plan-fields').hidden = sow;
        form.querySelectorAll('#sow-fields input').forEach((i) => (i.required = sow));
      }),
    );
    fillMaterials();
    scanHandler = (r) => {
      if (r.kind !== 'location') return false;
      if (!['TABLE', 'SECTOR'].includes(r.level)) {
        toast(`Escanea la etiqueta de una ${config.levels.TABLE.toLowerCase()}.`, true);
        return true;
      }
      form.locationId.value = r.id;
      toast(`Ubicación: ${r.path}.`);
      return true;
    };
    onSubmit(form, async (d) => {
      const sow = d.mode === 'sow';
      const res = await api('/lots', {
        method: 'POST',
        body: JSON.stringify({
          id: uuid(),
          folio: d.folio,
          varietyId: d.varietyId,
          plantMaterialId: d.plantMaterialId || null,
          locationId: d.locationId,
          plannedQty: sow ? undefined : Number(d.plannedQty),
          operatedAt: sow ? d.operatedAt : today(),
          deviceId: deviceId(),
          sow: sow
            ? { trays: Number(d.trays), cavities: Number(d.cavities), quantity: Number(d.quantity) }
            : null,
        }),
      });
      toast(`Lote ${res.folio} registrado.`);
      location.hash = `#/lote/${res.folio}?nuevo=1`;
    });
  },

  async inventario() {
    const inv = await api('/inventory');
    const { stages, rows } = inv.byVariety;
    const sum = (key, stage) => rows.reduce((a, r) => a + (stage ? r.byStage[stage] : r[key]), 0);
    const center = inv.byLocation[0];
    $app.innerHTML = `
      <h1>Inventario de plántula</h1>
      <p class="muted">Plántulas vivas por variedad y etapa. "Para entregar hoy" separa lo que está listo, libre y fuera de intervalo de seguridad.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Variedad</th>${stages.map((s) => `<th class="num">${esc(s.label)}</th>`).join('')}<th class="num">Total</th><th class="num">Charolas</th><th class="num">Para entregar hoy</th><th class="num">En cuarentena</th><th class="num">Bloqueado por intervalo</th><th class="num">Planificado</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td><strong>${esc(r.variety)}</strong></td>${stages.map((s) => `<td class="num">${fmtN(r.byStage[s.code])}</td>`).join('')}<td class="num"><strong>${fmtN(r.total)}</strong></td><td class="num">${fmtN(r.trays)}</td><td class="num">${fmtN(r.deliverable)}</td><td class="num">${fmtN(r.quarantine)}</td><td class="num">${fmtN(r.safetyBlocked)}</td><td class="num muted">${fmtN(r.planned)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td>${stages.map((s) => `<td class="num">${fmtN(sum(null, s.code))}</td>`).join('')}<td class="num">${fmtN(sum('total'))}</td><td class="num">${fmtN(sum('trays'))}</td><td class="num">${fmtN(sum('deliverable'))}</td><td class="num">${fmtN(sum('quarantine'))}</td><td class="num">${fmtN(sum('safetyBlocked'))}</td><td class="num">${fmtN(sum('planned'))}</td></tr></tfoot>
      </table></div>
      <h2>Por ubicación</h2>
      <p class="muted small">${esc(center.name)} → ${esc(config.levels.GREENHOUSE)} → ${esc(config.levels.SECTOR)} → ${esc(config.levels.TABLE)} → lote → charolas. La ubicación sale de los movimientos de cada charola: un lote repartido aparece en cada ${esc(config.levels.TABLE.toLowerCase())} con las suyas. Toca un lote para ver sus charolas ahí.</p>
      <div class="tree">${center.children
        .map(
          (gh) => `<section class="greenhouse">
          <div class="row-head"><h3>${esc(gh.name)}</h3><strong>${fmtN(gh.quantity)}</strong></div>
          <div class="sectors">${gh.children
            .map(
              (sec) => `<div class="sector">
              <div class="row-head"><strong>${esc(sec.name)}</strong><span>${fmtN(sec.quantity)}</span></div>
              ${sec.lots.length ? `<div class="small">Sin ${esc(config.levels.TABLE.toLowerCase())}: ${sec.lots.map((l) => chip(l, sec)).join('')}</div>` : ''}
              <div class="tables">${sec.children
                .map(
                  (t) =>
                    `<div class="table-row"><span>${esc(t.name)}</span><span>${t.lots.length ? t.lots.map((l) => chip(l, t)).join('') : '<span class="muted small">libre</span>'}</span><span class="num">${t.quantity ? fmtN(t.quantity) : ''}</span></div>`,
                )
                .join('')}</div>
            </div>`,
            )
            .join('')}</div>
        </section>`,
        )
        .join('')}</div>`;
    function chip(l, where) {
      const trays = l.trayItems.map((t) => `${shortTray(t.code)} ${fmtN(t.quantity)}`).join(', ');
      const title = `${l.stage}${trays ? `. Charolas: ${trays}` : ''}`;
      return `<a class="chip ${l.hold === 'EN_CUARENTENA' ? 'red' : ''}" href="#/lote/${esc(l.folio)}${l.trays ? `?mesa=${encodeURIComponent(where.code)}` : ''}" title="${esc(title)}">${esc(l.folio)}${l.trays ? ` <span class="chip-sub">${l.trays} ch.</span>` : ''}</a>`;
    }
  },

  async entregas() {
    const [dispatches, lots] = await Promise.all([api('/dispatches'), api('/lots')]);
    const ready = lots.filter((l) => l.stage === 'LISTO_VENTA');
    const allowed = can('DispatchRecorded');
    $app.innerHTML = `
      <h1>Entregas</h1>
      <p class="muted">Una entrega registra cliente, pedido y una línea por lote. Escanea la etiqueta de cada charola que sale: se suma a la línea de su lote con sus plántulas. También se puede escanear el lote y capturar la cantidad. Si una línea no cumple, no se guarda nada.</p>
      ${
        allowed
          ? `<form class="panel stack" id="dispatch">
        <h2>Nueva entrega</h2>
        <div class="form-grid">
          <label class="field">Cliente<input name="customer" required placeholder="Agrícola Los Pinos"></label>
          <label class="field">Pedido<input name="order" required placeholder="P-103"></label>
          ${dateField('operatedAt', 'Fecha de entrega')}
        </div>
        <div id="lines" class="stack"></div>
        <div class="actions"><button type="button" class="secondary" id="add-line">Agregar lote</button><button class="primary" type="submit">Registrar entrega</button></div>
        <p class="small muted">Un lote en cuarentena o en intervalo de seguridad no se puede entregar.</p>
      </form>`
          : `<div class="alert amber">Tu usuario no tiene permiso para registrar entregas.</div>`
      }
      <h2>Entregas registradas</h2>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Pedido</th><th>Lotes</th><th class="num">Plántulas</th></tr></thead>
      <tbody>${dispatches.map((d) => `<tr><td>${esc(fmtDate(d.date))}</td><td>${esc(d.customer)}</td><td>${esc(d.order)}</td><td>${d.lines.map((l) => `<a class="chip" href="#/lote/${esc(l.folio)}">${esc(l.folio)}</a> ${fmtN(l.quantity)}${l.trays?.length ? ` <span class="small muted">(${l.trays.length} charolas)</span>` : ''}`).join(' ')}</td><td class="num">${fmtN(d.total)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin entregas.</td></tr>'}</tbody></table></div>`;
    if (!allowed) return;
    const lines = document.getElementById('lines');
    const addLine = () => {
      const div = document.createElement('div');
      div.className = 'form-grid';
      div.innerHTML = `<label class="field">Lote<select name="lot" required>${ready.map((l) => `<option value="${l.id}">${esc(l.folio)} · ${esc(l.variety)} · quedan ${fmtN(l.currentQty)}${l.hold === 'EN_CUARENTENA' ? ' · en cuarentena' : ''}${l.safety ? ' · en intervalo' : ''}</option>`).join('')}</select></label>
        <label class="field">Plántulas<input type="number" name="qty" min="1" required></label>
        <div class="line-trays small" hidden></div>`;
      div.trays = [];
      lines.appendChild(div);
    };
    const renderTrays = (line) => {
      const box = line.querySelector('.line-trays');
      const qty = line.querySelector('input[name="qty"]');
      box.hidden = !line.trays.length;
      qty.readOnly = line.trays.length > 0;
      if (!line.trays.length) return;
      qty.value = String(line.trays.reduce((a, t) => a + t.quantity, 0));
      box.innerHTML = `${line.trays.length === 1 ? '1 charola' : `${line.trays.length} charolas`}: ${line.trays.map((t) => `<span class="chip">${esc(shortTray(t.code))} ${fmtN(t.quantity)}</span>`).join('')} <button type="button" class="link-button" data-clear-trays>Quitar charolas</button>`;
    };
    lines.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-clear-trays]');
      if (!btn) return;
      const line = btn.closest('.form-grid');
      line.trays = [];
      line.querySelector('input[name="qty"]').value = '';
      renderTrays(line);
    });
    /** Línea del lote ya escaneada o elegida, o una vacía (o nueva) para él. */
    const lineFor = (lotId) => {
      const all = [...lines.querySelectorAll('select[name="lot"]')];
      const existing = all.find(
        (sel) => sel.value === lotId && (sel.dataset.scanned || sel.dataset.touched),
      );
      if (existing) return { sel: existing, isNew: false };
      let target = all.find((sel) => !sel.dataset.touched && !sel.dataset.scanned);
      if (!target) {
        addLine();
        target = [...lines.querySelectorAll('select[name="lot"]')].pop();
      }
      target.value = lotId;
      target.dataset.scanned = '1';
      return { sel: target, isNew: true };
    };
    addLine();
    document.getElementById('add-line').addEventListener('click', addLine);
    lines.addEventListener('change', (e) => {
      if (e.target.name !== 'lot') return;
      e.target.dataset.touched = '1';
      const line = e.target.closest('.form-grid');
      if (line.trays.length) {
        line.trays = [];
        line.querySelector('input[name="qty"]').value = '';
        renderTrays(line);
      }
    });
    scanHandler = (r) => {
      if (r.kind === 'tray') {
        const lot = ready.find((l) => l.id === r.lotId);
        if (!lot) {
          toast(`${r.folio} no está listo para entregar.`, true);
          return true;
        }
        if (r.currentQty === 0) {
          toast(`La charola ${r.code} ya no tiene plántulas.`, true);
          return true;
        }
        const { sel } = lineFor(r.lotId);
        const line = sel.closest('.form-grid');
        if (line.trays.some((t) => t.code === r.code)) {
          toast(`${r.code} ya está en la entrega.`);
          return true;
        }
        line.trays.push({ code: r.code, quantity: r.currentQty });
        renderTrays(line);
        const total = line.trays.reduce((a, t) => a + t.quantity, 0);
        toast(
          `${r.code}: ${fmtN(r.currentQty)} plántulas. ${r.folio} lleva ${fmtN(total)} en ${line.trays.length === 1 ? '1 charola' : `${line.trays.length} charolas`}.`,
        );
        return true;
      }
      if (r.kind !== 'lot') return false;
      const lot = ready.find((l) => l.id === r.id);
      if (!lot) {
        toast(`${r.folio} no está listo para entregar.`, true);
        return true;
      }
      const selects = [...lines.querySelectorAll('select[name="lot"]')];
      if (
        selects.some((sel) => sel.value === r.id && (sel.dataset.scanned || sel.dataset.touched))
      ) {
        toast(`${r.folio} ya está en la entrega.`);
        return true;
      }
      let target = selects.find((sel) => !sel.dataset.touched && !sel.dataset.scanned);
      if (!target) {
        addLine();
        target = [...lines.querySelectorAll('select[name="lot"]')].pop();
      }
      target.value = r.id;
      target.dataset.scanned = '1';
      const qty = target.closest('.form-grid').querySelector('input[name="qty"]');
      qty.max = String(lot.currentQty);
      qty.focus();
      toast(`${r.folio} agregado: quedan ${fmtN(lot.currentQty)} plántulas. Captura la cantidad.`);
      return true;
    };
    onSubmit(document.getElementById('dispatch'), async (d, form) => {
      const rows = [...form.querySelectorAll('#lines > .form-grid')].map((line) => ({
        lotId: line.querySelector('select[name="lot"]').value,
        quantity: Number(line.querySelector('input[name="qty"]').value),
        ...(line.trays.length
          ? { trays: line.trays.map((t) => ({ code: t.code, quantity: t.quantity })) }
          : {}),
      }));
      await capture(
        'DispatchRecorded',
        'dispatch',
        uuid(),
        { customer: d.customer, order: d.order, lines: rows },
        d.operatedAt,
      );
      toast('Entrega registrada.');
      route();
    });
  },

  async mermas() {
    const r = await api('/losses');
    const max = Math.max(...r.byCause.map((c) => c.quantity), 1);
    $app.innerHTML = `
      <h1>Mermas</h1>
      <p class="muted">Cada pérdida lleva causa. El balance de la temporada cuadra plántula por plántula.</p>
      <div class="cards">
        <div class="card"><div class="label">Sembradas</div><div class="value">${fmtN(r.totals.sown)}</div></div>
        <div class="card"><div class="label">Perdidas</div><div class="value">${fmtN(r.totals.lost)}</div></div>
        <div class="card"><div class="label">Entregadas</div><div class="value">${fmtN(r.totals.dispatched)}</div></div>
        <div class="card"><div class="label">En invernadero</div><div class="value">${fmtN(r.totals.inGreenhouse)}</div></div>
      </div>
      <div class="grid-2">
        <div class="panel"><h2>Por causa</h2><div class="stack">${r.byCause.map((c) => `<div><div class="row-head"><span>${esc(c.cause)}</span><strong>${fmtN(c.quantity)}</strong></div><div class="bar red"><span data-pct="${(c.quantity / max) * 100}"></span></div><div class="small muted">${c.lots.map(esc).join(', ')}</div></div>`).join('')}</div></div>
        <div class="panel"><h2>Por lote</h2><div class="table-wrap"><table><thead><tr><th>Lote</th><th class="num">Sembradas</th><th class="num">Perdidas</th><th class="num">%</th></tr></thead><tbody>${r.byLot.map((l) => `<tr><td><a href="#/lote/${esc(l.folio)}">${esc(l.folio)}</a></td><td class="num">${fmtN(l.initialQty)}</td><td class="num">${fmtN(l.lostQty)}</td><td class="num">${l.percent}%</td></tr>`).join('')}</tbody></table></div></div>
      </div>`;
    setBars();
  },

  async eventos(params) {
    const status = params.get('status') ?? '';
    const r = await api(`/events?limit=300${status ? `&status=${status}` : ''}`);
    $app.innerHTML = `
      <h1>Eventos</h1>
      <p class="muted">Todo cambio queda registrado como evento y nunca se modifica. El estado de los lotes se calcula a partir de ellos.</p>
      <div class="toolbar"><select id="status" aria-label="Estado del evento">
        <option value="">Todos (${status ? '' : fmtN(r.total)})</option>
        <option value="APPLIED" ${status === 'APPLIED' ? 'selected' : ''}>Aplicados</option>
        <option value="VOIDED" ${status === 'VOIDED' ? 'selected' : ''}>Anulados</option>
        <option value="CONFLICT" ${status === 'CONFLICT' ? 'selected' : ''}>En conflicto</option>
      </select></div>
      <div class="table-wrap"><table><thead><tr><th>Evento</th><th>Operación</th><th class="hide-sm">Capturado</th><th class="hide-sm">Quién</th><th>Estado</th></tr></thead>
      <tbody>${r.events.map((e) => `<tr><td>${esc(e.description)}${e.reason ? `<div class="small muted">${esc(e.code)}: ${esc(e.reason)}</div>` : ''}</td><td>${esc(fmtDate(e.operationDate))}</td><td class="hide-sm">${esc(fmtInstant(e.occurredAt))}</td><td class="hide-sm">${esc(e.user)}<div class="small muted">${esc(e.deviceId)}</div></td><td>${statusBadge(e.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin eventos.</td></tr>'}</tbody></table></div>
      ${r.total > r.events.length ? `<p class="small muted">Se muestran los ${r.events.length} más recientes de ${fmtN(r.total)}.</p>` : ''}`;
    document.getElementById('status').addEventListener('change', (e) => {
      location.hash = `#/eventos${e.target.value ? `?status=${e.target.value}` : ''}`;
    });
  },

  async etiquetas() {
    const data = await api('/labels');
    const allowed = can('LabelPrinted');
    const lots = data.lots.filter((l) => l.active);
    const printed = (p) =>
      p.length ? `impresa ${p.length === 1 ? '1 vez' : `${p.length} veces`}` : 'sin imprimir';
    const tables = data.locations.filter((l) => l.level === 'TABLE');
    $app.innerHTML = `
      <h1>Etiquetas</h1>
      <p class="muted">Etiquetas de lote, de charola y de ${esc(config.levels.TABLE.toLowerCase())} con código de barras. Marca las que necesitas o escanéalas para agregarlas. La etiqueta de charola se pega una vez y la charola la conserva.</p>
      ${allowed ? '' : '<div class="alert amber">Tu usuario no imprime etiquetas.</div>'}
      <form class="panel stack" id="labels-form">
        <div class="form-grid">
          <label class="field">Formato<select name="format">${formatOptions()}</select></label>
          <label class="field">Copias de cada una<input type="number" name="copies" min="1" max="50" value="1" required></label>
        </div>
        <div class="actions"><button class="primary" type="submit" ${allowed ? '' : 'disabled'}>Imprimir <span id="sel-count">0</span> etiquetas</button></div>
      </form>
      <div class="grid-2">
        <div class="panel">
          <div class="row-head"><h2>Lotes activos</h2><label class="small"><input type="checkbox" data-all="lot"> Todos</label></div>
          <div class="check-list">${lots
            .map(
              (l) =>
                `<label class="check-row"><input type="checkbox" data-kind="lot" value="${esc(l.id)}"><strong>${esc(l.folio)}</strong><span>${esc(l.variety)} · ${esc(l.location || 'sin ubicación')}</span><span class="small muted">${printed(l.prints)}</span></label>`,
            )
            .join('')}</div>
        </div>
        <div class="panel">
          <div class="row-head"><h2>${esc(config.levels.TABLE)}s</h2><label class="small"><input type="checkbox" data-all="location"> Todas</label></div>
          <div class="check-list">${tables
            .map(
              (t) =>
                `<label class="check-row"><input type="checkbox" data-kind="location" value="${esc(t.id)}"><strong>${esc(t.code)}</strong><span>${esc(t.path)}</span><span class="small muted">${printed(t.prints)}</span></label>`,
            )
            .join('')}</div>
        </div>
      </div>
      <div class="panel">
        <div class="row-head"><h2>Charolas</h2><label class="small"><input type="checkbox" id="trays-all"> Todas las del lote</label></div>
        <div class="toolbar"><select id="tray-lot" aria-label="Lote de las charolas">${[...new Set(data.trays.map((t) => t.folio))].map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select><span class="small muted" id="trays-sel"></span></div>
        <div class="check-list tray-checks" id="tray-list"></div>
      </div>
      <h2>Vista previa</h2>
      <div class="label-preview" id="preview"><p class="muted small">Marca una etiqueta para verla.</p></div>`;
    const form = document.getElementById('labels-form');
    const trayChecked = new Set();
    const trayLot = document.getElementById('tray-lot');
    const renderTrayList = () => {
      const list = data.trays.filter((t) => t.folio === trayLot.value);
      document.getElementById('tray-list').innerHTML = list
        .map(
          (t) =>
            `<label class="check-row"><input type="checkbox" data-tray-code="${esc(t.code)}" ${trayChecked.has(t.code) ? 'checked' : ''}><strong>${esc(t.code)}</strong><span>${fmtN(t.currentQty)} plántulas · ${esc(t.location)}</span><span class="small muted">${printed(t.prints)}</span></label>`,
        )
        .join('');
      document.getElementById('trays-all').checked =
        list.length > 0 && list.every((t) => trayChecked.has(t.code));
      document.getElementById('trays-sel').textContent = trayChecked.size
        ? `${trayChecked.size} charolas marcadas`
        : '';
    };
    trayLot.addEventListener('change', renderTrayList);
    renderTrayList();
    document.getElementById('trays-all').addEventListener('change', (e) => {
      for (const t of data.trays.filter((x) => x.folio === trayLot.value)) {
        if (e.target.checked) trayChecked.add(t.code);
        else trayChecked.delete(t.code);
      }
      renderTrayList();
      refresh();
    });
    document.getElementById('tray-list').addEventListener('change', (e) => {
      const box = e.target.closest('input[data-tray-code]');
      if (!box) return;
      if (box.checked) trayChecked.add(box.dataset.trayCode);
      else trayChecked.delete(box.dataset.trayCode);
      renderTrayList();
      refresh();
    });
    const trayItems = () =>
      data.trays
        .filter((t) => trayChecked.has(t.code))
        .map((t) => ({
          kind: 'tray',
          lotId: t.lotId,
          code: t.code,
          folio: t.folio,
          index: t.index,
          total: t.total,
          variety: t.variety,
          cavities: t.cavities,
        }));
    const items = () => [
      ...[...$app.querySelectorAll('input[data-kind]:checked')].map((box) => {
        if (box.dataset.kind === 'lot') {
          const l = data.lots.find((x) => x.id === box.value);
          return {
            kind: 'lot',
            id: l.id,
            code: l.code,
            variety: l.variety,
            sowingDate: l.sowingDate,
            quantity: l.quantity,
            trays: l.trays,
            location: l.location,
          };
        }
        const t = data.locations.find((x) => x.id === box.value);
        return { kind: 'location', id: t.id, code: t.code, path: t.path, levelLabel: t.levelLabel };
      }),
      ...trayItems(),
    ];
    const refresh = () => {
      const list = items();
      document.getElementById('sel-count').textContent = String(list.length);
      const fmt = labelFormat(form.format.value);
      document.getElementById('preview').innerHTML = list.length
        ? list
            .slice(0, 6)
            .map((it) => labelHtml(it, fmt))
            .join('') +
          (list.length > 6 ? `<p class="small muted">y ${list.length - 6} más</p>` : '')
        : '<p class="muted small">Marca una etiqueta para verla.</p>';
    };
    $app.querySelectorAll('input[data-all]').forEach((all) =>
      all.addEventListener('change', () => {
        $app
          .querySelectorAll(`input[data-kind="${all.dataset.all}"]`)
          .forEach((box) => (box.checked = all.checked));
        refresh();
      }),
    );
    $app.addEventListener('change', (e) => {
      if (e.target.matches('input[data-kind], select[name="format"]')) refresh();
    });
    scanHandler = (r) => {
      if (r.kind === 'unknown') return false;
      if (r.kind === 'tray') {
        if (!data.trays.some((t) => t.code === r.code)) {
          toast(`${r.code} es de un lote terminado.`, true);
          return true;
        }
        trayChecked.add(r.code);
        trayLot.value = r.folio;
        renderTrayList();
        refresh();
        toast(`${r.code} agregada a la impresión.`);
        return true;
      }
      const box = $app.querySelector(`input[data-kind="${r.kind}"][value="${r.id}"]`);
      if (!box) {
        toast(`${r.code} no tiene etiqueta en esta lista.`, true);
        return true;
      }
      box.checked = true;
      refresh();
      toast(`${r.code} agregado a la impresión.`);
      return true;
    };
    onSubmit(form, async (d) => {
      await printLabels(items(), d.format, d.copies);
      route();
    });
  },

  async admin() {
    if (!isAdmin()) {
      $app.innerHTML =
        '<h1>Administración</h1><div class="alert amber">Solo el Administrador entra a esta sección.</div>';
      return;
    }
    $app.innerHTML = `
      <h1>Administración</h1>
      <div class="grid-2">
        <div class="panel">
          <h2>Usuarios</h2>
          <div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th></tr></thead>
          <tbody>${config.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${u.roles.map((r) => esc(config.roles[r])).join(', ')}</td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="panel">
          <h2>Lector de códigos</h2>
          <p class="small">Las pistolas USB o Bluetooth en modo teclado funcionan sin instalar nada. Para probarla, escanea cualquier etiqueta con esta pantalla abierta.</p>
          <div class="scan-test" id="scan-test"><span class="muted">Esperando lectura…</span></div>
        </div>
      </div>
      <div class="panel">
        <h2>Restablecer datos</h2>
        <p class="small">Regresa la información a la carga inicial. Se pierde lo capturado después.</p>
        <div class="actions"><button type="button" class="danger" id="reset">Restablecer datos</button></div>
      </div>`;
    scanHandler = (r) => {
      const what =
        r.kind === 'lot'
          ? `lote ${r.folio}`
          : r.kind === 'tray'
            ? `charola ${r.index} del lote ${r.folio}`
            : r.kind === 'location'
              ? r.path
              : 'código no reconocido';
      document.getElementById('scan-test').innerHTML =
        `<strong>${esc(r.code)}</strong> <span class="badge ${r.kind === 'unknown' ? 'red' : 'green'}">${esc(what)}</span>`;
      return true;
    };
    document.getElementById('reset').addEventListener('click', async () => {
      if (!confirm('¿Restablecer los datos? Se pierde lo capturado después de la carga inicial.'))
        return;
      try {
        await api('/admin/reset', { method: 'POST' });
        catalog = await api('/catalog');
        toast('Datos restablecidos.');
        location.hash = '#/resumen';
      } catch (err) {
        toast(errorText(err), true);
      }
    });
  },

  async importacion() {
    const r = await api('/import-check');
    const cls = { OK: 'green', ADVERTENCIA: 'amber', ERROR: 'red' };
    const label = { OK: 'Entra', ADVERTENCIA: 'Entra con aviso', ERROR: 'No entra' };
    $app.innerHTML = `
      <h1>Excel "Control de siembra 2026"</h1>
      <p class="muted">Revisión del Excel actual antes de importarlo: vista previa por fila, nada se guarda sin confirmar y lo que falta no se inventa.</p>
      <div class="cards">
        <div class="card"><div class="label">Filas</div><div class="value">${r.totals.rows}</div></div>
        <div class="card"><div class="label">Entran</div><div class="value">${r.totals.ok}</div></div>
        <div class="card"><div class="label">Entran con aviso</div><div class="value">${r.totals.warnings}</div></div>
        <div class="card"><div class="label">No entran</div><div class="value">${r.totals.errors}</div></div>
      </div>
      <div class="table-wrap panel"><table><thead><tr><th class="num">Fila</th><th>Folio</th><th>Variedad</th><th>Resultado</th><th>Detalle</th></tr></thead>
      <tbody>${r.rows.map((row) => `<tr><td class="num">${row.row}</td><td>${row.folio ? esc(row.folio) : '<span class="muted">(vacío)</span>'}</td><td>${esc(row.variety)}</td><td><span class="badge ${cls[row.result]}">${label[row.result]}</span></td><td class="small">${row.messages.map((m) => `${esc(m.text)} <span class="muted">${esc(m.rule)}</span>`).join('<br>') || '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">${esc(r.note)} Las filas que no entran se corrigen con el productor y se capturan como lotes nuevos.</p>`;
  },
};

/** Formularios de acción del lote, según su estado y el rol de quien captura. */
function renderLotActions(lot) {
  const box = document.getElementById('actions');
  const items = [];
  const sown = lot.sowingDate !== null;

  const stages = lot.nextStages.filter(canSetStage);
  if (sown && stages.length) {
    items.push([
      'Cambiar etapa',
      `<label class="field">Pasa a<select name="toStage">${stages.map((s) => `<option value="${s}">${esc(config.stages.find((x) => x.code === s).label)}</option>`).join('')}</select></label>
       <label class="field">Criterio<input name="criterion" placeholder="Raíz formada"></label>${dateField()}`,
      (d) =>
        capture(
          'LotStageChanged',
          'lot',
          lot.id,
          { toStage: d.toStage, criterion: d.criterion },
          d.operatedAt,
        ),
    ]);
  }
  if (!sown && can('LotSown')) {
    const cavities = DEFAULT_CAVITIES[lot.variety] ?? 72;
    items.push([
      'Sembrar',
      `<label class="field">Charolas<input type="number" name="trays" min="1" value="${Math.ceil(lot.plannedQty / cavities)}" required></label>
       <label class="field">Cavidades por charola<input type="number" name="cavities" min="1" value="${cavities}" required></label>
       <label class="field">Plántulas sembradas<input type="number" name="quantity" min="1" required></label>
       <p class="small field-hint" data-max-hint></p>
       <label class="field">${esc(config.levels.TABLE)}<select name="locationId">${locationOptions(['TABLE', 'SECTOR'], lot.location?.id)}</select></label>${dateField('operatedAt', 'Fecha de siembra')}`,
      (d) =>
        capture(
          'LotSown',
          'lot',
          lot.id,
          {
            trays: Number(d.trays),
            cavities: Number(d.cavities),
            quantity: Number(d.quantity),
            locationId: d.locationId,
          },
          d.operatedAt,
        ),
      'sow',
      (form) => bindMaxQuantity(form, form.querySelector('[data-max-hint]')),
    ]);
  }
  if (sown && can('LossRecorded')) {
    const withPlants = lot.trayList.filter((t) => t.currentQty > 0);
    items.push([
      'Registrar pérdida',
      `${withPlants.length ? `<label class="field">Charola<select name="tray"><option value="">Sin indicar charola</option>${withPlants.map((t) => `<option value="${esc(t.code)}">${esc(shortTray(t.code))} · ${fmtN(t.currentQty)} plántulas · ${esc(t.location.code)}</option>`).join('')}</select></label>` : ''}
       <label class="field">Plántulas<input type="number" name="quantity" min="1" max="${lot.currentQty}" required></label>
       <label class="field">Causa<select name="cause">${config.lossCauses.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>${dateField()}
       ${withPlants.length ? '<p class="small muted field-hint">Para marcar las cavidades, abre la charola en Charolas.</p>' : ''}`,
      (d) =>
        capture(
          'LossRecorded',
          'lot',
          lot.id,
          {
            quantity: Number(d.quantity),
            cause: d.cause,
            ...(d.tray ? { trays: [{ code: d.tray, quantity: Number(d.quantity) }] } : {}),
          },
          d.operatedAt,
        ),
      'loss',
      (form) => {
        if (!form.tray) return;
        const sync = () => {
          const t = lot.trayList.find((x) => x.code === form.tray.value);
          form.quantity.max = String(t ? t.currentQty : lot.currentQty);
        };
        form.tray.addEventListener('change', sync);
        if (traySelection.size === 1) form.tray.value = [...traySelection][0];
        sync();
      },
    ]);
  }
  if (sown && can('LotTransferred')) {
    items.push([
      `Mover a otra ${config.levels.TABLE.toLowerCase()}`,
      `<p class="small field-hint" data-move-what></p>
       <label class="field">Destino<select name="toLocationId">${locationOptions(['TABLE'])}</select></label>${dateField()}`,
      (d) =>
        capture(
          'LotTransferred',
          'lot',
          lot.id,
          {
            toLocationId: d.toLocationId,
            ...(traySelection.size ? { trays: [...traySelection] } : {}),
          },
          d.operatedAt,
        ),
      'move',
      () => updateMoveWhat(lot),
    ]);
  }
  if (sown && can('ApplicationRecorded')) {
    items.push([
      'Registrar aplicación',
      `<label class="field">Producto<select name="productId">${catalog.products.map((p) => `<option value="${p.id}">${esc(p.name)} · ${p.safetyIntervalDays === null ? 'intervalo PENDIENTE' : `${p.safetyIntervalDays} días`}</option>`).join('')}</select></label>
       <label class="field">Dosis<input name="dose" required placeholder="2 g/L"></label>
       <label class="field">Motivo<input name="reason" required placeholder="Preventivo"></label>
       <label class="field">Sobre<select name="target"><option value="lot">Este lote</option>${lot.location ? `<option value="sector">Todo su sector (se liga a los lotes presentes)</option>` : ''}</select></label>${dateField()}`,
      (d) => {
        const sectorId = sectorOf(lot.location?.id);
        const onSector = d.target === 'sector' && sectorId;
        const product = catalog.products.find((p) => p.id === d.productId);
        if (product?.safetyIntervalDays === null)
          toast('El producto no tiene intervalo de seguridad: se registra con advertencia.');
        return capture(
          'ApplicationRecorded',
          onSector ? 'location' : 'lot',
          onSector ? sectorId : lot.id,
          { productId: d.productId, dose: d.dose, reason: d.reason },
          d.operatedAt,
        );
      },
    ]);
  }
  if (sown && can('InspectionRecorded')) {
    items.push([
      'Registrar inspección',
      `<label class="field">Resultado<select name="result">${Object.entries(
        config.inspectionResults,
      )
        .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`)
        .join('')}</select></label>
       <label class="field">Nota<input name="note"></label>${dateField()}`,
      (d) =>
        capture(
          'InspectionRecorded',
          'lot',
          lot.id,
          { result: d.result, note: d.note },
          d.operatedAt,
        ),
    ]);
  }
  if (sown && lot.hold === 'LIBRE' && can('QuarantineStarted')) {
    items.push([
      'Poner en cuarentena',
      `<label class="field">Motivo<input name="reason" required placeholder="Sospecha de enfermedad"></label>${dateField()}`,
      (d) => capture('QuarantineStarted', 'lot', lot.id, { reason: d.reason }, d.operatedAt),
    ]);
  }
  if (lot.hold === 'EN_CUARENTENA' && can('QuarantineReleased')) {
    items.push([
      'Liberar de cuarentena',
      `<label class="field">Nota<input name="note" placeholder="Sin síntomas en dos inspecciones"></label>${dateField()}`,
      (d) => capture('QuarantineReleased', 'lot', lot.id, { note: d.note }, d.operatedAt),
    ]);
  }
  if (lot.stage === 'LISTO_VENTA' && can('LotClosed')) {
    items.push([
      'Cerrar lote',
      `<p class="small muted">El sobrante (${fmtN(lot.currentQty)}) cuenta como merma con causa.</p>
       <label class="field">Causa del sobrante<select name="cause">${config.lossCauses.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>${dateField()}`,
      (d) => capture('LotClosed', 'lot', lot.id, { cause: d.cause }, d.operatedAt),
    ]);
  }
  if (!sown && can('LotCancelled')) {
    items.push([
      'Cancelar lote',
      `<label class="field">Motivo<input name="reason" required></label>${dateField()}`,
      (d) => capture('LotCancelled', 'lot', lot.id, { reason: d.reason }, d.operatedAt),
    ]);
  }

  if (!items.length) {
    box.innerHTML = '<p class="muted small">Tu usuario no tiene operaciones para este lote.</p>';
    return;
  }
  items.forEach(([title, fields, handler, key, setup]) => {
    const details = document.createElement('details');
    details.className = 'action';
    if (key) details.dataset.action = key;
    details.innerHTML = `<summary>${esc(title)}</summary><form class="stack"><div class="form-grid">${fields}</div><div class="actions"><button class="primary" type="submit">Guardar</button></div></form>`;
    box.appendChild(details);
    if (setup) setup(details.querySelector('form'));
    onSubmit(details.querySelector('form'), async (d) => {
      await handler(d);
      toast(`${title}: registrado.`);
      route();
    });
  });
}

/** Lo que se mueve: el lote completo o las charolas marcadas. */
function updateMoveWhat(lot) {
  const el = $app.querySelector('[data-move-what]');
  if (!el) return;
  const active = lot.trayList.filter((t) => t.currentQty > 0).length;
  el.innerHTML = traySelection.size
    ? `Se ${traySelection.size === 1 ? 'mueve 1 charola' : `mueven ${traySelection.size} charolas`}: <strong>${esc(joinList([...traySelection].sort().map(shortTray)))}</strong>.`
    : `Se mueve el lote completo${active ? ` (${active} charolas)` : ''}. Para mover solo algunas, márcalas en Charolas o escanea sus etiquetas.`;
}

/** Pestaña Charolas de la ficha: lista por tabla, selección y mapa de cavidades (ADR-0024). */
function setupTrays(lot, params) {
  const panel = document.getElementById('trays-panel');
  const filterCode = params.get('mesa') ?? '';
  const tables = [...new Map(lot.trayList.map((t) => [t.location.id, t.location])).values()].sort(
    (a, b) => a.code.localeCompare(b.code),
  );
  const active = lot.trayList.filter((t) => t.currentQty > 0);
  const unassigned = [
    lot.unassignedLostQty ? `${fmtN(lot.unassignedLostQty)} perdidas` : '',
    lot.unassignedDispatchedQty ? `${fmtN(lot.unassignedDispatchedQty)} entregadas` : '',
  ].filter(Boolean);
  const marks = (t) => {
    const count = (st) => t.cells.filter((c) => c.state === st).length;
    const out = [];
    if (t.currentQty === 0 && t.dispatchedQty > 0)
      out.push('<span class="badge green">Entregada</span>');
    else if (t.currentQty === 0) out.push('<span class="badge">Vacía</span>');
    if (t.lostQty) out.push(`<span class="badge red" title="Perdidas">−${fmtN(t.lostQty)}</span>`);
    if (count('OBSERVADA'))
      out.push(
        `<span class="badge amber" title="Cavidades observadas">${count('OBSERVADA')} obs.</span>`,
      );
    if (count('RESEMBRADA'))
      out.push(
        `<span class="badge blue" title="Cavidades resembradas">${count('RESEMBRADA')} res.</span>`,
      );
    return out.join('');
  };
  panel.innerHTML = `
    <div class="row-head"><h2>Charolas</h2><span class="small muted">${lot.trayList.length} charolas de ${lot.cavities} cavidades · ${active.length} con plántula${tables.length > 1 ? ` · en ${tables.length} ${esc(config.levels.TABLE.toLowerCase())}s` : ''}</span></div>
    ${unassigned.length ? `<p class="small muted">${esc(joinList(unassigned))} sin charola asignada (se capturaron solo por lote).</p>` : ''}
    <div class="toolbar tray-toolbar">
      ${tables.length > 1 ? `<select id="tray-filter" aria-label="${esc(config.levels.TABLE)}"><option value="">Todas las ${esc(config.levels.TABLE.toLowerCase())}s</option>${tables.map((t) => `<option value="${esc(t.code)}" ${t.code === filterCode ? 'selected' : ''}>${esc(t.code)}</option>`).join('')}</select>` : ''}
      <label class="small"><input type="checkbox" id="tray-all"> Marcar las visibles</label>
      <span class="small" id="tray-count">Ninguna marcada</span>
      <button type="button" class="secondary" id="tray-print" disabled ${can('LabelPrinted') ? '' : 'hidden'}>Imprimir etiquetas</button>
    </div>
    <div class="tray-grid">${lot.trayList
      .map(
        (
          t,
        ) => `<div class="tray-tile${t.currentQty === 0 ? ' empty' : ''}" data-loc="${esc(t.location.code)}">
          <label class="tray-check"><input type="checkbox" data-tray="${esc(t.code)}" ${t.currentQty === 0 ? 'disabled' : ''} aria-label="Marcar ${esc(t.code)}"><strong>${esc(shortTray(t.code))}</strong></label>
          <button type="button" class="tray-open" data-open="${esc(t.code)}" title="Ver el mapa de ${esc(t.code)}">
            <span class="tray-qty">${fmtN(t.currentQty)}<span class="muted">/${t.cavities}</span></span>
            <span class="small muted">${esc(t.location.code)}</span>
            <span class="tray-marks">${marks(t)}</span>
          </button>
        </div>`,
      )
      .join('')}</div>
    <div id="tray-map"></div>`;
  const filter = document.getElementById('tray-filter');
  const tiles = [...panel.querySelectorAll('.tray-tile')];
  const applyFilter = () => {
    const code = filter?.value ?? '';
    tiles.forEach((tile) => (tile.hidden = Boolean(code) && tile.dataset.loc !== code));
  };
  const refresh = () => {
    const n = traySelection.size;
    document.getElementById('tray-count').textContent = n
      ? `${n === 1 ? '1 marcada' : `${n} marcadas`}: ${joinList([...traySelection].sort().map(shortTray))}`
      : 'Ninguna marcada';
    const print = document.getElementById('tray-print');
    print.disabled = n === 0;
    print.textContent = n
      ? `Imprimir ${n === 1 ? '1 etiqueta' : `${n} etiquetas`}`
      : 'Imprimir etiquetas';
    updateMoveWhat(lot);
  };
  filter?.addEventListener('change', applyFilter);
  applyFilter();
  panel.addEventListener('change', (e) => {
    const box = e.target.closest('input[data-tray]');
    if (!box) return;
    if (box.checked) traySelection.add(box.dataset.tray);
    else traySelection.delete(box.dataset.tray);
    if (box.checked && box.closest('.tray-tile').hidden && filter) {
      filter.value = '';
      applyFilter();
    }
    refresh();
  });
  document.getElementById('tray-all').addEventListener('change', (e) => {
    tiles
      .filter((tile) => !tile.hidden)
      .forEach((tile) => {
        const box = tile.querySelector('input[data-tray]');
        if (box.disabled) return;
        box.checked = e.target.checked;
        if (box.checked) traySelection.add(box.dataset.tray);
        else traySelection.delete(box.dataset.tray);
      });
    refresh();
  });
  document.getElementById('tray-print').addEventListener('click', async () => {
    const form = document.getElementById('lot-print');
    const items = lot.trayList
      .filter((t) => traySelection.has(t.code))
      .map((t) => ({
        kind: 'tray',
        lotId: lot.id,
        code: t.code,
        folio: lot.folio,
        index: t.index,
        total: lot.trayList.length,
        variety: lot.variety,
        cavities: t.cavities,
      }));
    try {
      await printLabels(items, form.format.value, form.copies.value);
      toast(
        `${items.length === 1 ? 'Etiqueta de charola enviada' : `${items.length} etiquetas de charola enviadas`} a imprimir.`,
      );
    } catch (err) {
      toast(errorText(err), true);
    }
  });
  panel.querySelectorAll('[data-open]').forEach((b) =>
    b.addEventListener('click', () => {
      renderTrayMap(lot, b.dataset.open);
      document.getElementById('tray-map').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }),
  );
  refresh();
  const open = params.get('charola');
  if (open && lot.trayList.some((t) => t.code === open)) {
    renderTrayMap(lot, open);
    document.getElementById('tray-map').scrollIntoView({ block: 'start' });
  }
}

/** Mapa de cavidades de una charola: solo se marcan las excepciones. */
function renderTrayMap(lot, code) {
  const box = document.getElementById('tray-map');
  const t = lot.trayList.find((x) => x.code === code);
  const terminal = ['CERRADO', 'PERDIDO', 'CANCELADO'].includes(lot.stage);
  const canLoss = !terminal && can('LossRecorded');
  const canMark = !terminal && can('CavitiesMarked');
  const sources = lot.trayList.filter((x) => x.code !== code && x.currentQty > 0);
  const actions = [
    canLoss && ['loss', 'Pérdida'],
    canMark && ['observe', 'Observación'],
    canMark && ['clear', 'Quitar observación'],
    canMark && sources.length && ['reseed', 'Resiembra'],
  ].filter(Boolean);
  const cellTitle = (c) =>
    `Cavidad ${c.pos}: ${CELL_LABEL[c.state]}${c.note ? `, ${c.note}` : ''}${c.date ? ` (${fmtDate(c.date)})` : ''}`;
  box.innerHTML = `
    <div class="tray-map">
      <div class="row-head"><h3>Charola ${esc(t.code)}</h3><button type="button" class="link-button" id="map-close">Cerrar</button></div>
      <p class="small muted">${esc(t.location.path)} · ${fmtN(t.currentQty)} plántulas en ${t.cavities} cavidades · sembradas ${fmtN(t.sownQty)}${t.lostQty ? ` · perdidas ${fmtN(t.lostQty)}` : ''}${t.dispatchedQty ? ` · entregadas ${fmtN(t.dispatchedQty)}` : ''}${t.reseedInQty ? ` · resembradas ${fmtN(t.reseedInQty)}` : ''}${t.reseedOutQty ? ` · dio ${fmtN(t.reseedOutQty)} para resembrar` : ''}${t.moves ? ` · ${t.moves === 1 ? '1 movimiento' : `${t.moves} movimientos`}` : ''}</p>
      <div class="cav-grid" id="cav-grid">${t.cells
        .map(
          (c) =>
            `<button type="button" class="cav s-${c.state.toLowerCase()}" data-pos="${c.pos}" title="${esc(cellTitle(c))}" aria-label="${esc(cellTitle(c))}" aria-pressed="false"><span>${c.pos}</span></button>`,
        )
        .join('')}</div>
      <div class="cav-legend small">${['SANA', 'OBSERVADA', 'RESEMBRADA', 'PERDIDA', 'VACIA']
        .map((st) => `<span><i class="cav s-${st.toLowerCase()}"></i>${CELL_LABEL[st]}</span>`)
        .join('')}</div>
      ${t.unplacedQty ? `<p class="small muted">${fmtN(t.unplacedQty)} ${t.unplacedQty === 1 ? 'plántula salió' : 'plántulas salieron'} de esta charola sin marcar cavidad (pérdida o entrega capturada por cantidad); el mapa no las ubica.</p>` : ''}
      ${
        actions.length
          ? `<form class="stack" id="cav-form">
        <p class="small" id="cav-sel">Toca las cavidades para marcarlas.</p>
        <div class="form-grid">
          <label class="field">Qué registras<select name="kind">${actions.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
          <label class="field" data-for="loss">Causa<select name="cause">${config.lossCauses.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
          <label class="field" data-for="observe">Nota<input name="note" placeholder="Hoja manchada"></label>
          <label class="field" data-for="reseed">Plántula de la charola<select name="fromTray">${sources.map((x) => `<option value="${esc(x.code)}">${esc(shortTray(x.code))} · ${fmtN(x.currentQty)} plántulas</option>`).join('')}</select></label>
          ${dateField()}
        </div>
        <div class="actions"><button class="primary" type="submit" disabled>Guardar</button></div>
      </form>`
          : ''
      }
    </div>`;
  const grid = document.getElementById('cav-grid');
  grid.style.gridTemplateColumns = `repeat(${gridCols(t.cavities)}, minmax(0, 1fr))`;
  document.getElementById('map-close').addEventListener('click', () => (box.innerHTML = ''));
  const form = document.getElementById('cav-form');
  if (!form) return;
  const selected = new Set();
  const stateOf = (pos) => t.cells[pos - 1].state;
  const ALLOWED = {
    loss: ['SANA', 'OBSERVADA', 'RESEMBRADA'],
    observe: ['SANA', 'RESEMBRADA'],
    clear: ['OBSERVADA'],
    reseed: ['VACIA', 'PERDIDA'],
  };
  const sync = () => {
    const action = form.kind.value;
    form.querySelectorAll('[data-for]').forEach((el) => (el.hidden = el.dataset.for !== action));
    const list = [...selected].sort((a, b) => a - b);
    const bad = list.filter((pos) => !ALLOWED[action].includes(stateOf(pos)));
    const from = sources.find((x) => x.code === form.fromTray?.value);
    let msg = list.length
      ? `${list.length === 1 ? '1 cavidad marcada' : `${list.length} cavidades marcadas`}: ${list.join(', ')}.`
      : 'Toca las cavidades para marcarlas.';
    if (bad.length)
      msg += ` <strong class="text-red">${action === 'reseed' ? 'Solo se resiembra una cavidad vacía o perdida' : action === 'clear' ? 'Solo se quita la observación a una cavidad observada' : 'Esa cavidad no tiene plántula'} (${bad.join(', ')}).</strong>`;
    else if (action === 'reseed' && from && from.currentQty < list.length)
      msg += ` <strong class="text-red">${shortTray(from.code)} solo tiene ${from.currentQty} plántulas.</strong>`;
    document.getElementById('cav-sel').innerHTML = msg;
    form.querySelector('button[type="submit"]').disabled =
      !list.length ||
      bad.length > 0 ||
      (action === 'reseed' && from && from.currentQty < list.length);
  };
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('.cav');
    if (!cell) return;
    const pos = Number(cell.dataset.pos);
    if (selected.has(pos)) selected.delete(pos);
    else selected.add(pos);
    cell.classList.toggle('sel', selected.has(pos));
    cell.setAttribute('aria-pressed', String(selected.has(pos)));
    sync();
  });
  form.addEventListener('change', sync);
  sync();
  onSubmit(form, async (d) => {
    const cavities = [...selected].sort((a, b) => a - b);
    if (d.kind === 'loss') {
      await capture(
        'LossRecorded',
        'lot',
        lot.id,
        {
          quantity: cavities.length,
          cause: d.cause,
          trays: [{ code: t.code, quantity: cavities.length, cavities }],
        },
        d.operatedAt,
      );
    } else {
      const mark = { observe: 'OBSERVADA', clear: 'SANA', reseed: 'RESEMBRADA' }[d.kind];
      await capture(
        'CavitiesMarked',
        'lot',
        lot.id,
        {
          tray: t.code,
          cavities,
          mark,
          ...(d.kind === 'observe' && d.note ? { note: d.note } : {}),
          ...(d.kind === 'reseed' ? { fromTray: d.fromTray } : {}),
        },
        d.operatedAt,
      );
    }
    toast(`${t.code}: registrado.`);
    const target = `#/lote/${lot.folio}?charola=${encodeURIComponent(t.code)}`;
    if (location.hash === target) route();
    else location.hash = target;
  });
}

function sectorOf(locationId) {
  const loc = catalog.locations.find((l) => l.id === locationId);
  if (!loc) return null;
  return loc.level === 'SECTOR' ? loc.id : loc.parentId;
}

// ---------- navegación ----------

async function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'resumen';
  const [path, query] = hash.split('?');
  const [view, arg] = path.split('/');
  const params = new URLSearchParams(query ?? '');
  const name = views[view] ? view : 'resumen';
  scanHandler = null;
  routeSeq++;
  document
    .querySelectorAll('#tabs a')
    .forEach((a) =>
      a.classList.toggle('active', a.dataset.view === (name === 'lote' ? 'lotes' : name)),
    );
  try {
    await views[name](params, arg ? decodeURIComponent(arg) : undefined);
  } catch (err) {
    if (err instanceof StaleView) return;
    $app.innerHTML = `<div class="alert red">${esc(errorText(err))}</div>`;
  }
}

function showLogin() {
  document.getElementById('shell').hidden = true;
  document.getElementById('login').hidden = false;
  const box = document.getElementById('login-users');
  box.innerHTML = config.users
    .map(
      (u) =>
        `<button type="button" class="login-user" data-user="${esc(u.id)}"><strong>${esc(u.name)}</strong><span class="small muted">${u.roles.map((r) => esc(config.roles[r])).join(', ')}</span></button>`,
    )
    .join('');
  box.querySelectorAll('[data-user]').forEach((b) =>
    b.addEventListener('click', () => {
      sessionUser = b.dataset.user;
      store.set('sesion', sessionUser);
      enterApp();
    }),
  );
  box.querySelector('button')?.focus();
}

function enterApp() {
  const u = currentUser();
  document.getElementById('login').hidden = true;
  document.getElementById('shell').hidden = false;
  document.getElementById('session-name').textContent = u.name;
  document.getElementById('session-role').textContent = u.roles
    .map((r) => config.roles[r])
    .join(', ');
  document.getElementById('tab-admin').hidden = !isAdmin();
  route();
}

async function init() {
  config = await api('/config');
  catalog = await api('/catalog');
  document
    .querySelectorAll('[data-producer]')
    .forEach((el) => (el.textContent = config.producer.name));
  document.title = `Trazabilidad de plántula · ${config.producer.name}`;
  document.getElementById('today').textContent = `Hoy: ${fmtDate(config.today)}`;
  window.addEventListener('hashchange', () => sessionUser && route());
  window.addEventListener('afterprint', () => ($print.innerHTML = ''));
  Escaner.attach((code) => sessionUser && onScan(code));
  const scanForm = document.getElementById('scan-form');
  scanForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('scan-input');
    const code = input.value;
    input.value = '';
    onScan(code);
  });
  document.getElementById('logout').addEventListener('click', () => {
    sessionUser = null;
    store.set('sesion', '');
    location.hash = '#/resumen';
    showLogin();
  });
  setupCamera();
  const saved = store.get('sesion', '');
  if (saved && config.users.some((u) => u.id === saved)) {
    sessionUser = saved;
    enterApp();
  } else showLogin();
}

init().catch((err) => {
  $app.innerHTML = `<div class="alert red">No se pudo abrir la aplicación: ${esc(err.message)}</div>`;
  document.getElementById('shell').hidden = false;
});
