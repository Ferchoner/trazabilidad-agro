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
  const top = `<div class="lbl-top"><span>${esc(config.producer.name)}</span><span>${esc(item.kind === 'lot' ? 'Lote' : item.levelLabel)}</span></div>`;
  const bars = `<div class="lbl-bars">${barcodeSvg(item.code, fmt)}</div>`;
  if (item.kind === 'lot') {
    return `<div class="label lbl-${esc(fmt.code)}">${top}
      <div class="lbl-code">${esc(item.code)}</div>
      <div class="lbl-line"><strong>${esc(item.variety)}</strong> · ${item.sowingDate ? `Siembra ${esc(fmtDate(item.sowingDate))}` : 'Planificado'}</div>
      <div class="lbl-line">${esc(item.location || '—')}</div>
      ${compact ? '' : `<div class="lbl-line">${fmtN(item.quantity)} plántulas${item.trays ? ` · ${item.trays} charolas` : ''}</div>`}
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
  await api('/events', {
    method: 'POST',
    body: JSON.stringify({
      events: items.map((it) => ({
        id: uuid(),
        type: 'LabelPrinted',
        entityType: it.kind,
        entityId: it.id,
        occurredAt: new Date().toISOString(),
        deviceId: deviceId(),
        payload: { format: fmt.code, copies: n },
      })),
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
  } else {
    const lots = await api('/lots', { global: true });
    const here = lots.filter(
      (l) => l.location?.id === result.id && !['CERRADO', 'PERDIDO', 'CANCELADO'].includes(l.stage),
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
              <td class="hide-sm">${esc(l.location?.path ?? '—')}</td>
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
      ${params.get('nuevo') ? '<div class="alert green">Lote registrado. Imprime su etiqueta y pégala en la tabla.</div>' : ''}
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
            <dt>Ubicación</dt><dd>${esc(lot.location?.path ?? '—')}</dd>
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
      ${terminal ? '' : `<div class="panel"><h2>Registrar</h2><p class="muted small">Aparecen las operaciones que permite tu usuario. Para mover el lote, escanea la etiqueta de la tabla destino.</p><div class="action-list" id="actions"></div></div>`}
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
    if (!terminal) renderLotActions(lot);
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
      if (r.kind !== 'location') return false;
      const move = $app.querySelector('details[data-action="move"]');
      if (!move) return false;
      if (r.level !== 'TABLE') {
        toast(`Escanea la etiqueta de una ${config.levels.TABLE.toLowerCase()}.`, true);
        return true;
      }
      if (r.id === lot.location?.id) {
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
        .map((l) => l.location?.id),
    );
    const freeTable = catalog.locations
      .filter((l) => l.level === 'TABLE' && !busy.has(l.id))
      .sort((a, b) => a.code.localeCompare(b.code))[0];
    const cav = { Festival: 72, 'Camino Real': 72, 'San Andreas': 128 };
    $app.innerHTML = `
      <h1>Registrar lote</h1>
      <p class="muted">El folio se asigna al registrar y continúa la numeración de su control actual. Escanea la etiqueta de la tabla para ubicarlo; al guardar, imprime la etiqueta del lote.</p>
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
          <label class="field">Plántulas sembradas<input type="number" name="quantity" min="1" value="864" required></label>
          ${dateField('operatedAt', 'Fecha de siembra')}
        </div>
        <div class="form-grid" id="plan-fields" hidden>
          <label class="field">Plántulas planeadas<input type="number" name="plannedQty" min="1" value="1000"></label>
        </div>
        <div class="small muted" id="capacity"></div>
        <div class="actions"><button class="primary" type="submit">Registrar lote</button></div>
      </form>`;
    const form = document.getElementById('new-lot');
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
      form.cavities.value = cav[v?.name] ?? 72;
      updateCapacity(true);
    };
    const updateCapacity = (resetQty = false) => {
      const cap = Number(form.trays.value) * Number(form.cavities.value);
      if (resetQty) form.quantity.value = cap;
      const over = Number(form.quantity.value) > cap;
      document.getElementById('capacity').innerHTML =
        form.mode.value === 'sow'
          ? `${fmtN(cap)} cavidades en total.${over ? ' <strong>Hay más plántulas que cavidades: no se podrá registrar.</strong>' : ''}`
          : '';
    };
    form.varietyId.addEventListener('change', fillMaterials);
    form.trays.addEventListener('input', () => updateCapacity(true));
    form.cavities.addEventListener('input', () => updateCapacity(true));
    form.quantity.addEventListener('input', () => updateCapacity(false));
    form.querySelectorAll('input[name="mode"]').forEach((r) =>
      r.addEventListener('change', () => {
        const sow = form.mode.value === 'sow';
        document.getElementById('sow-fields').hidden = !sow;
        document.getElementById('plan-fields').hidden = sow;
        form.querySelectorAll('#sow-fields input').forEach((i) => (i.required = sow));
        updateCapacity();
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
        <thead><tr><th>Variedad</th>${stages.map((s) => `<th class="num">${esc(s.label)}</th>`).join('')}<th class="num">Total</th><th class="num">Para entregar hoy</th><th class="num">En cuarentena</th><th class="num">Bloqueado por intervalo</th><th class="num">Planificado</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td><strong>${esc(r.variety)}</strong></td>${stages.map((s) => `<td class="num">${fmtN(r.byStage[s.code])}</td>`).join('')}<td class="num"><strong>${fmtN(r.total)}</strong></td><td class="num">${fmtN(r.deliverable)}</td><td class="num">${fmtN(r.quarantine)}</td><td class="num">${fmtN(r.safetyBlocked)}</td><td class="num muted">${fmtN(r.planned)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td>${stages.map((s) => `<td class="num">${fmtN(sum(null, s.code))}</td>`).join('')}<td class="num">${fmtN(sum('total'))}</td><td class="num">${fmtN(sum('deliverable'))}</td><td class="num">${fmtN(sum('quarantine'))}</td><td class="num">${fmtN(sum('safetyBlocked'))}</td><td class="num">${fmtN(sum('planned'))}</td></tr></tfoot>
      </table></div>
      <h2>Por ubicación</h2>
      <p class="muted small">${esc(center.name)} → ${esc(config.levels.GREENHOUSE)} → ${esc(config.levels.SECTOR)} → ${esc(config.levels.TABLE)}. La ubicación de cada lote sale de sus movimientos.</p>
      <div class="tree">${center.children
        .map(
          (gh) => `<section class="greenhouse">
          <div class="row-head"><h3>${esc(gh.name)}</h3><strong>${fmtN(gh.quantity)}</strong></div>
          <div class="sectors">${gh.children
            .map(
              (sec) => `<div class="sector">
              <div class="row-head"><strong>${esc(sec.name)}</strong><span>${fmtN(sec.quantity)}</span></div>
              ${sec.lots.length ? `<div class="small">Sin tabla: ${sec.lots.map(chip).join('')}</div>` : ''}
              <div class="tables">${sec.children
                .map(
                  (t) =>
                    `<div class="table-row"><span>${esc(t.name)}</span><span>${t.lots.length ? t.lots.map(chip).join('') : '<span class="muted small">libre</span>'}</span><span class="num">${t.quantity ? fmtN(t.quantity) : ''}</span></div>`,
                )
                .join('')}</div>
            </div>`,
            )
            .join('')}</div>
        </section>`,
        )
        .join('')}</div>`;
    function chip(l) {
      return `<a class="chip ${l.hold === 'EN_CUARENTENA' ? 'red' : ''}" href="#/lote/${esc(l.folio)}" title="${esc(l.stage)}">${esc(l.folio)}</a>`;
    }
  },

  async entregas() {
    const [dispatches, lots] = await Promise.all([api('/dispatches'), api('/lots')]);
    const ready = lots.filter((l) => l.stage === 'LISTO_VENTA');
    const allowed = can('DispatchRecorded');
    $app.innerHTML = `
      <h1>Entregas</h1>
      <p class="muted">Una entrega registra cliente, pedido y una línea por lote. Escanea la etiqueta de cada lote para agregarlo. Si una línea no cumple, no se guarda nada.</p>
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
      <tbody>${dispatches.map((d) => `<tr><td>${esc(fmtDate(d.date))}</td><td>${esc(d.customer)}</td><td>${esc(d.order)}</td><td>${d.lines.map((l) => `<a class="chip" href="#/lote/${esc(l.folio)}">${esc(l.folio)}</a> ${fmtN(l.quantity)}`).join(' ')}</td><td class="num">${fmtN(d.total)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin entregas.</td></tr>'}</tbody></table></div>`;
    if (!allowed) return;
    const lines = document.getElementById('lines');
    const addLine = () => {
      const div = document.createElement('div');
      div.className = 'form-grid';
      div.innerHTML = `<label class="field">Lote<select name="lot" required>${ready.map((l) => `<option value="${l.id}">${esc(l.folio)} · ${esc(l.variety)} · quedan ${fmtN(l.currentQty)}${l.hold === 'EN_CUARENTENA' ? ' · en cuarentena' : ''}${l.safety ? ' · en intervalo' : ''}</option>`).join('')}</select></label>
        <label class="field">Plántulas<input type="number" name="qty" min="1" required></label>`;
      lines.appendChild(div);
    };
    addLine();
    document.getElementById('add-line').addEventListener('click', addLine);
    lines.addEventListener('change', (e) => {
      if (e.target.name === 'lot') e.target.dataset.touched = '1';
    });
    scanHandler = (r) => {
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
      const lots = [...form.querySelectorAll('select[name="lot"]')].map((s) => s.value);
      const qtys = [...form.querySelectorAll('input[name="qty"]')].map((i) => Number(i.value));
      await capture(
        'DispatchRecorded',
        'dispatch',
        uuid(),
        {
          customer: d.customer,
          order: d.order,
          lines: lots.map((lotId, i) => ({ lotId, quantity: qtys[i] })),
        },
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
      <p class="muted">Etiquetas de lote y de ${esc(config.levels.TABLE.toLowerCase())} con código de barras. Marca las que necesitas o escanéalas para agregarlas.</p>
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
      <h2>Vista previa</h2>
      <div class="label-preview" id="preview"><p class="muted small">Marca una etiqueta para verla.</p></div>`;
    const form = document.getElementById('labels-form');
    const items = () =>
      [...$app.querySelectorAll('input[data-kind]:checked')].map((box) => {
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
      });
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
    items.push([
      'Sembrar',
      `<label class="field">Charolas<input type="number" name="trays" min="1" required></label>
       <label class="field">Cavidades por charola<input type="number" name="cavities" min="1" value="72" required></label>
       <label class="field">Plántulas sembradas<input type="number" name="quantity" min="1" value="${lot.plannedQty}" required></label>
       <label class="field">Tabla<select name="locationId">${locationOptions(['TABLE', 'SECTOR'], lot.location?.id)}</select></label>${dateField('operatedAt', 'Fecha de siembra')}`,
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
    ]);
  }
  if (sown && can('LossRecorded')) {
    items.push([
      'Registrar pérdida',
      `<label class="field">Plántulas<input type="number" name="quantity" min="1" max="${lot.currentQty}" required></label>
       <label class="field">Causa<select name="cause">${config.lossCauses.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>${dateField()}`,
      (d) =>
        capture(
          'LossRecorded',
          'lot',
          lot.id,
          { quantity: Number(d.quantity), cause: d.cause },
          d.operatedAt,
        ),
    ]);
  }
  if (sown && can('LotTransferred')) {
    items.push([
      `Mover a otra ${config.levels.TABLE.toLowerCase()}`,
      `<label class="field">Destino<select name="toLocationId">${locationOptions(['TABLE']).replace(`value="${lot.location?.id}"`, `value="${lot.location?.id}" disabled`)}</select></label>${dateField()}`,
      (d) =>
        capture('LotTransferred', 'lot', lot.id, { toLocationId: d.toLocationId }, d.operatedAt),
      'move',
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
  items.forEach(([title, fields, handler, key]) => {
    const details = document.createElement('details');
    details.className = 'action';
    if (key) details.dataset.action = key;
    details.innerHTML = `<summary>${esc(title)}</summary><form class="stack"><div class="form-grid">${fields}</div><div class="actions"><button class="primary" type="submit">Guardar</button></div></form>`;
    box.appendChild(details);
    onSubmit(details.querySelector('form'), async (d) => {
      await handler(d);
      toast(`${title}: registrado.`);
      route();
    });
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
