import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_STAGES, LEVEL_ORDER, ProducerConfig } from '../domain/types';

export const DEFAULT_CONFIG_PATH = join(__dirname, '..', '..', 'config', 'productor-a.json');

/** Lee y valida la configuración del productor al arrancar (T-100, ADR-0015). */
export function loadConfig(path = process.env.DEMO_CONFIG ?? DEFAULT_CONFIG_PATH): ProducerConfig {
  const config = JSON.parse(readFileSync(path, 'utf8')) as ProducerConfig;
  validateConfig(config);
  return config;
}

export function validateConfig(config: ProducerConfig): void {
  const problems: string[] = [];
  const p = config.producer;
  if (!p?.name || !p.nodeCode || !p.folioPrefix || !p.timeZone)
    problems.push('producer incompleto');
  for (const level of LEVEL_ORDER)
    if (!config.levels?.[level]) problems.push(`falta el nombre del nivel ${level}`);
  const codes = new Set((config.stages ?? []).map((s) => s.code));
  for (const core of Object.values(CORE_STAGES))
    if (!codes.has(core)) problems.push(`falta la etapa ${core}`);
  for (const s of config.stages ?? []) {
    for (const n of s.next)
      if (!codes.has(n)) problems.push(`la etapa ${s.code} apunta a ${n}, que no existe`);
    for (const r of s.setBy)
      if (!config.roles?.[r]) problems.push(`la etapa ${s.code} usa el rol ${r}, que no existe`);
  }
  for (const u of config.users ?? []) {
    for (const r of u.roles)
      if (!config.roles?.[r]) problems.push(`el usuario ${u.id} usa el rol ${r}, que no existe`);
  }
  if (!config.users?.length) problems.push('no hay usuarios');
  if (!config.lossCauses?.length) problems.push('no hay causas de pérdida');
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: p?.timeZone });
  } catch {
    problems.push(`zona horaria no válida: ${p?.timeZone}`);
  }
  if (problems.length)
    throw new Error(`Configuración del productor no válida: ${problems.join('; ')}.`);
}
