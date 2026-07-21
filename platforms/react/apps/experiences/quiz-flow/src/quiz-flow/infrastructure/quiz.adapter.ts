import type { QuizConfig } from './quiz.config';
import type { QuizQuestion } from '../domain/quiz.domain';

export interface QuizInstance {
  readonly title: string;
  readonly subtitle: string;
  readonly questions: QuizQuestion[];
  readonly theme: string;
}

export function adaptQuizConfig(raw: Partial<QuizConfig> | undefined): QuizInstance {
  return {
    title: raw?.title ?? '',
    subtitle: raw?.subtitle ?? '',
    questions: (raw?.questions ?? []).map((q) => ({
      text: q.text ?? '',
      options: q.options ?? [],
      correct: q.correct ?? 0,
    })),
    theme: raw?.theme ?? 'light',
  };
}
