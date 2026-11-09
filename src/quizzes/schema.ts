import type { Source } from '../shared/schema';

/** One multiple-choice question about an exchange. */
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
  step: string;
  source?: Source;
}

/** The quiz of one protocol. Its id is the id of the exchange it belongs to. */
export interface Quiz {
  id: string;
  questions: QuizQuestion[];
}
