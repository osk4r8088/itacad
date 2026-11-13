import type { OsiLayer, Source } from '../shared/schema';

/** One multiple-choice question. It links to where the answer is shown: a step of an exchange, or a layer of the OSI overview. */
export interface QuizQuestion {
  id: string;
  prompt: string;
  /** Three or four answers, shown in this order. */
  options: string[];
  /** Index of the correct answer in options. */
  answer: number;
  /** Shown after answering: why the answer is right. */
  explanation: string;
  /** Id of the step in the exchange that shows it, linked after answering. */
  step?: string;
  /** For the quiz of the OSI and TCP/IP overview, which has no steps: the layer that shows it. */
  layer?: OsiLayer;
  source?: Source;
}

/** The quiz of one protocol or lesson. Its id is the id of the exchange or lesson it belongs to; the two never share an id. */
export interface Quiz {
  id: string;
  questions: QuizQuestion[];
}
