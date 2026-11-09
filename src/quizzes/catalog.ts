import type { Quiz } from './schema';

/** Quizzes by exchange id, loaded when opened. Every quiz must match an exchange in the protocol catalog. */
export const QUIZZES: Record<string, () => Promise<Quiz>> = {
  tcp: () => import('./tcp').then((m) => m.tcpQuiz),
};

export const hasQuiz = (id: string): boolean => id in QUIZZES;
