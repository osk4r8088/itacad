import type { Capture, Learned, Source, Step, StepDetails } from '../shared/schema';

/** A lesson step in one flat object; buildStep turns it into a Step. Every lesson step belongs to a phase. */
export interface Spec {
  id: string;
  phase: string;
  from: string;
  to: string;
  path: string[];
  extraPaths?: string[][];
  label: string;
  time: number;
  category: string;
  captures: Capture[];
  protocol: string;
  info: string;
  details: StepDetails;
  sources: Source[];
  states?: Record<string, string>;
  learned?: Learned[];
  lost?: boolean;
}

export const buildStep = (s: Spec): Step => ({
  id: s.id,
  phase: s.phase,
  from: s.from,
  to: s.to,
  path: s.path,
  ...(s.extraPaths ? { extraPaths: s.extraPaths } : {}),
  label: s.label,
  details: s.details,
  captures: s.captures,
  sources: s.sources,
  time: s.time,
  category: s.category,
  protocol: s.protocol,
  info: s.info,
  ...(s.states ? { states: s.states } : {}),
  ...(s.learned ? { learned: s.learned } : {}),
  ...(s.lost ? { lost: true } : {}),
});
