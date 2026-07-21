export type QuizPhase = 'intro' | 'quiz' | 'results';

export interface QuizQuestion {
  readonly text: string;
  readonly options: readonly string[];
  readonly correct: number;
}

export function evaluateAnswers(questions: QuizQuestion[], answers: number[]): number {
  return answers.filter((answer, i) => answer === questions[i]?.correct).length;
}
