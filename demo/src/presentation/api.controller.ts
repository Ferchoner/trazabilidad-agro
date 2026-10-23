import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { checkExcelRows } from '../domain/excel-check';
import { LABEL_FORMATS } from '../domain/label-formats';
import { labelsData, resolveCode, SCAN_CODE_RE } from '../domain/labels';
import {
  dispatchesReport,
  eventView,
  inventoryByLocation,
  inventoryByVariety,
  listLots,
  locationPath,
  lossesReport,
  lotDetail,
  summary,
} from '../domain/queries';
import {
  CaptureInput,
  InputError,
  RegisterLotInput,
  TraceService,
} from '../application/trace.service';
import { EXCEL_2026_ROWS } from '../seed/excel-2026';

const USER_HEADER = 'x-demo-user';

@Controller('api')
export class ApiController {
  constructor(private readonly trace: TraceService) {}

  @Get('config')
  config() {
    const c = this.trace.config;
    return {
      producer: c.producer,
      levels: c.levels,
      stages: c.stages,
      roles: Object.fromEntries(Object.entries(c.roles).map(([k, v]) => [k, v.label])),
      users: c.users.map((u) => ({
        ...u,
        permissions: [...new Set(u.roles.flatMap((r) => c.roles[r]?.can ?? []))],
      })),
      lossCauses: c.lossCauses,
      inspectionResults: c.inspectionResults,
      labelFormats: LABEL_FORMATS,
      today: this.trace.today(),
    };
  }

  @Get('summary')
  summary() {
    return summary(this.trace.current, this.trace.config, this.trace.today());
  }

  @Get('catalog')
  catalog() {
    const s = this.trace.current;
    return {
      varieties: [...s.varieties.values()],
      materials: [...s.materials.values()].map((m) => ({
        ...m,
        variety: s.varieties.get(m.varietyId)?.name ?? '',
      })),
      products: [...s.products.values()],
      locations: [...s.locations.values()].map((l) => ({
        ...l,
        path: locationPath(s, l.id) || l.name,
        levelLabel: this.trace.config.levels[l.level],
      })),
    };
  }

  @Get('lots')
  lots() {
    return listLots(this.trace.current, this.trace.config, this.trace.today());
  }

  @Get('lots/:id')
  lot(@Param('id') id: string) {
    const s = this.trace.current;
    const lot = s.lots.get(id) ?? s.lots.get(s.folios.get(id.toUpperCase()) ?? '');
    if (!lot) throw new NotFoundException('El lote no existe.');
    return lotDetail(s, lot, this.trace.config, this.trace.today());
  }

  @Get('inventory')
  inventory() {
    const s = this.trace.current;
    return {
      byVariety: inventoryByVariety(s, this.trace.config, this.trace.today()),
      byLocation: inventoryByLocation(s, this.trace.config),
    };
  }

  @Get('losses')
  losses() {
    return lossesReport(this.trace.current);
  }

  @Get('dispatches')
  dispatches() {
    return dispatchesReport(this.trace.current);
  }

  @Get('events')
  events(@Query('limit') limit?: string, @Query('status') status?: string) {
    const s = this.trace.current;
    const max = Math.min(Math.max(Number(limit) || 200, 1), 2000);
    const all = [...s.order]
      .reverse()
      .map((id) => eventView(s, s.events.get(id)!, this.trace.config));
    const filtered = status ? all.filter((e) => e.status === status) : all;
    return { total: filtered.length, events: filtered.slice(0, max) };
  }

  @Get('labels')
  labels() {
    return labelsData(this.trace.current, this.trace.config);
  }

  /** Qué es un código leído con la pistola o la cámara (ADR-0014). No cambia nada. */
  @Get('scan/:code')
  scan(@Param('code') code: string) {
    if (!SCAN_CODE_RE.test(code)) throw new InputError('El código leído no es válido.');
    return resolveCode(this.trace.current, code);
  }

  @Get('import-check')
  importCheck() {
    const names = [...this.trace.current.varieties.values()].map((v) => v.name);
    const rows = checkExcelRows(EXCEL_2026_ROWS, names, this.trace.config);
    return {
      file: 'Control de siembra 2026, hoja Siembras 2026',
      rows,
      totals: {
        rows: rows.length,
        ok: rows.filter((r) => r.result === 'OK').length,
        warnings: rows.filter((r) => r.result === 'ADVERTENCIA').length,
        errors: rows.filter((r) => r.result === 'ERROR').length,
      },
      note: 'La hoja Pedidos no se importa: pedidos y reservas quedan fuera del MVP (BR-ENT-04, P-22).',
    };
  }

  @Post('lots')
  registerLot(@Headers(USER_HEADER) user: string, @Body() body: RegisterLotInput) {
    if (!body || typeof body !== 'object') throw new InputError('Faltan los datos del lote.');
    const result = this.trace.registerLot(user, body);
    return { ...result, lot: this.lot(result.lotId) };
  }

  @Post('events')
  submit(
    @Headers(USER_HEADER) user: string,
    @Body() body: { events?: CaptureInput[] } & Partial<CaptureInput>,
  ) {
    const inputs = Array.isArray(body?.events)
      ? body.events
      : body?.type
        ? [body as CaptureInput]
        : [];
    return this.trace.submit(user, inputs);
  }

  @Post('admin/reset')
  @HttpCode(200)
  reset(@Headers(USER_HEADER) user: string) {
    this.trace.reset(user);
    return { ok: true };
  }
}
