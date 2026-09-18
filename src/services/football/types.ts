/** Forma común que consumen el router y los tests, sin importar el proveedor. */
export interface Match {
  /** Identificador del partido en el proveedor: sirve para pedirle después más datos. */
  id: string | null;
  home?: string;
  away?: string;
  league: string | null;
  round: string | null;
  venue: string | null;
  date: Date | null;
  finished: boolean;
  live: boolean;
  score: string | null;
}

export interface MakeMatchInput {
  id?: string | null;
  home?: string;
  away?: string;
  league?: string | null;
  round?: string | number | null;
  venue?: string | null;
  date: Date | null;
  status?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
}

export interface Team {
  id: string;
  name: string;
}

export interface PlayerLine {
  number: number | null;
  name: string;
  captain: boolean;
}

export interface LineupTeam {
  name: string | null;
  formation: string | null;
  coach: string | null;
  starting: PlayerLine[];
}

export interface Lineups {
  /** "Probable" o "Confirmado", tal cual lo publica Promiedos. */
  status: string | null;
  teams: LineupTeam[];
}

export interface MissingPlayer {
  name: string;
  reason: string | null;
}

export interface MissingTeam {
  name: string | null;
  players: MissingPlayer[];
}

export interface HeadToHeadGame {
  home?: string;
  away?: string;
  homeScore?: number;
  awayScore?: number;
  league: string | null;
  date: Date | null;
}

/** `homeWins`/`awayWins` están en relación a los equipos del partido consultado. */
export interface HeadToHead {
  homeWins: number;
  awayWins: number;
  draws: number;
  games: HeadToHeadGame[];
}

/** Ficha del partido: formaciones, bajas, árbitro y TV. Sólo la tiene Promiedos. */
export interface MatchDetails {
  league: string | null;
  venue: string | null;
  referee: string | null;
  tv: string | null;
  lineups: Lineups | null;
  missing: MissingTeam[];
  headToHead: HeadToHead | null;
}

export type TeamIdKey = 'promiedos' | 'apiFootball' | 'sportsDb';

export interface FootballProvider {
  name: string;
  teamIdKey: TeamIdKey;
  supportsFixtures: boolean;
  nextMatches(teamId: string): Promise<Match[]>;
  lastMatches(teamId: string): Promise<Match[]>;
  team(teamId: string): Promise<Team | null>;
  details?(matchId: string): Promise<MatchDetails>;
}
