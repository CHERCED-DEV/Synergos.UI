import { useReducer, useCallback } from 'react';
import type { QuizPhase, QuizQuestion } from '../domain/quiz.domain';
import { evaluateAnswers } from '../domain/quiz.domain';

interface QuizStateInternal {
  phase: QuizPhase;
  currentIndex: number;
  answers: number[];
}

type QuizAction =
  | { type: 'START' }
  | { type: 'ANSWER'; payload: { answer: number; total: number } }
  | { type: 'RESTART' };

function quizReducer(state: QuizStateInternal, action: QuizAction): QuizStateInternal {
  switch (action.type) {
    case 'START':
      return { phase: 'quiz', currentIndex: 0, answers: [] };
    case 'ANSWER': {
      const answers = [...state.answers, action.payload.answer];
      const nextIndex = state.currentIndex + 1;
      return {
        answers,
        currentIndex: nextIndex,
        phase: nextIndex >= action.payload.total ? 'results' : 'quiz',
      };
    }
    case 'RESTART':
      return { phase: 'intro', currentIndex: 0, answers: [] };
  }
}

export interface QuizState {
  phase: QuizPhase;
  currentIndex: number;
  answers: number[];
  score: number;
  start: () => void;
  answer: (index: number) => void;
  restart: () => void;
}

export function useQuizState(questions: QuizQuestion[]): QuizState {
  const total = questions.length;
  const [state, dispatch] = useReducer(quizReducer, {
    phase: 'intro',
    currentIndex: 0,
    answers: [],
  });

  const score = evaluateAnswers(questions, state.answers);

  const start = useCallback(() => dispatch({ type: 'START' }), []);
  const answer = useCallback(
    (index: number) => dispatch({ type: 'ANSWER', payload: { answer: index, total } }),
    [total],
  );
  const restart = useCallback(() => dispatch({ type: 'RESTART' }), []);

  return { ...state, score, start, answer, restart };
}
