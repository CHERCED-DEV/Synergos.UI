import type { QuizFlowInputs } from '../models/quiz-flow-inputs.model';

export function mapQuizFlowData(data: Record<string, unknown>): QuizFlowInputs {
  return { config: JSON.stringify(data) };
}
