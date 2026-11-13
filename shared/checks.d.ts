export type Level = 'ok' | 'minor' | 'major' | 'maintenance' | 'unknown';
export interface Service {
  id: string;
  name: string;
  kind: 'statuspage' | 'http' | 'google' | 'slack' | 'rss' | 'm365graph';
  url?: string;
  product?: string;
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
export type ServiceState = Record<string, { level: Level; pending?: Level; streak?: number }>;
export interface Change { result: CheckResult; from: Level; to: Level }
export const CATALOG: Service[];
export const LEVEL_LABEL: Record<Level, string>;
export function confirmRuns(svc: Service): number;
export function resolveServices(entries: (string | Service)[]): Service[];
export function checkService(svc: Service, opts?: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> }): Promise<CheckResult>;
export function diffResults(services: Service[], results: CheckResult[], prevState?: ServiceState): { state: ServiceState; changes: Change[] };
export function formatChange(c: Change): { title: string; body: string; recovered: boolean; from: Level; to: Level };
