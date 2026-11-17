import type { Exchange, StepDetails } from '../../shared/schema';
import { linkProse, type Matcher, type Segment } from './match';

/** The page id of an exchange for the term links: "protocols/<id>", or "learn/<id>" for a lesson. */
export const exchangePage = (exchange: Exchange, lesson: boolean) => `${lesson ? 'learn' : 'protocols'}/${exchange.id}`;

/** The texts of a step panel, each as paragraphs of segments. */
export interface LinkedStepDetails {
  what: Segment[][];
  why: Segment[][];
  typical?: Segment[][];
  wrong?: Segment[][];
  insight?: Segment[][];
}

/** Links the texts of one step. A step is one section: each term is linked once in it. */
export function linkStepDetails(d: StepDetails, matcher: Matcher, page: string): LinkedStepDetails {
  const linked = new Set<string>();
  const link = (text: string) => linkProse(text, matcher, page, linked);
  return {
    what: link(d.what),
    why: link(d.why),
    ...(d.typical ? { typical: link(d.typical) } : {}),
    ...(d.wrong ? { wrong: link(d.wrong) } : {}),
    ...(d.insight ? { insight: link(d.insight) } : {}),
  };
}

/** Links the scenario and the introduction of an exchange, shown together in its About panel. */
export function linkAbout(exchange: Exchange, matcher: Matcher, page: string): { scenario: Segment[]; intro: Segment[][] } {
  const linked = new Set<string>();
  return { scenario: linkProse(exchange.scenario, matcher, page, linked).flat(), intro: linkProse(exchange.intro, matcher, page, linked) };
}
