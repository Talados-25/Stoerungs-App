export type Level = 'ok' | 'minor' | 'major' | 'maintenance' | 'unknown';
export interface Service {
  id: string;
  name: string;
  kind: 'statuspage' | 'http' | 'google' | 'slack' | 'rss' | 'm365graph' | 'datev' | 'docuware';
  url?: string;
  product?: string;
  /** DocuWare: Region (emea, us, …) */
  region?: string;
  /** DATEV: nur Meldungen zu Diensten, deren Name einen dieser Begriffe enthält */
  filter?: string[];
  workerOnly?: boolean;
  custom?: boolean;
}
export interface CheckResult {
  id: string;
  name: string;
  checkedAt: string;
  level: Level;
  message: string;
  incidents: string[];
}
export type ServiceState = Record<string, { level: Level; pending?: Level; streak?: number; seen?: string[] }>;
export interface Change { result: CheckResult; from: Level; to: Level; fresh?: string[] }
export const CATALOG: Service[];
export const LEVEL_LABEL: Record<Level, string>;
export function confirmRuns(svc: Service): number;
export function resolveServices(entries: (string | Service)[]): Service[];
export function checkService(svc: Service, opts?: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> }): Promise<CheckResult>;
export function diffResults(services: Service[], results: CheckResult[], prevState?: ServiceState): { state: ServiceState; changes: Change[] };
export function formatChange(c: Change): { title: string; body: string; recovered: boolean; from: Level; to: Level };

export interface HistoryEntry { title: string; start: string; end: string | null; level: Level }
export function statusPageUrl(svc: Service): string | null;
export function fetchHistory(svc: Service, opts?: { fetchImpl?: typeof fetch }): Promise<{ entries: HistoryEntry[]; coversDays: number | null } | null>;
export function dailyBars(history: HistoryEntry[], opts?: { days?: number; now?: number; since?: string | null }): (Level | null)[];
export function daysWithoutIncident(history: HistoryEntry[], now?: number): number | null;
