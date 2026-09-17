import { config } from '../../config.js';
import { createApiFootball } from './apifootball.js';
import { createPromiedos } from './promiedos.js';
import { createTheSportsDb } from './thesportsdb.js';

/**
 * Elige el proveedor: api-football si hay key, si no Promiedos (scraping, pero
 * gratis y con fixtures). Se puede forzar con FOOTBALL_PROVIDER.
 */
function pickProvider() {
  const forced = config.football.provider;
  const hasApiFootball = Boolean(config.football.apiFootballKey);

  if (forced === 'api-football' || (forced === 'auto' && hasApiFootball)) {
    return createApiFootball({ key: config.football.apiFootballKey });
  }
  if (forced === 'thesportsdb') {
    return createTheSportsDb({ key: config.football.sportsDbKey });
  }
  return createPromiedos();
}

export const provider = pickProvider();

const cache = new Map(); // clave -> { at, value }

async function cached(key, fn, ttl = config.football.cacheTtlMs) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;

  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const teamId = () => config.football.teamId[provider.teamIdKey];

/** Próximo partido que todavía no terminó (la API a veces deja el recién jugado en la lista). */
export async function getNextMatch() {
  const matches = await cached('next', () => provider.nextMatches(teamId()));
  return (
    matches
      .filter((m) => !m.finished)
      .sort((a, b) => a.date - b.date)[0] ?? null
  );
}

export async function getLastMatch() {
  const matches = await cached('last', () => provider.lastMatches(teamId()));
  return matches.sort((a, b) => b.date - a.date)[0] ?? null;
}

export async function getTeam() {
  return cached('team', () => provider.team(teamId()));
}

// Las formaciones se publican poco antes del partido y cambian: caché corto.
const DETAILS_TTL_MS = 2 * 60 * 1000;

/**
 * Ficha del partido (formaciones, bajas, árbitro, TV). Sólo la tiene Promiedos;
 * con otro proveedor devuelve null.
 */
export async function getMatchDetails(match) {
  if (!provider.details || !match?.id) return null;
  return cached(`details:${match.id}`, () => provider.details(match.id), DETAILS_TTL_MS);
}
