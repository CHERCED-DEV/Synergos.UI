import { classNames } from '@synergos/shared';
import { useLogger } from '@synergos/core';
import { useQuizState } from '../application/quiz.state';
import { adaptQuizConfig } from '../infrastructure/quiz.adapter';
import type { QuizConfig } from '../infrastructure/quiz.config';

const styles = `
  :host { display: block; }

  .sg-quiz-flow {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    background: #ffffff;
    color: #0f172a;
    border-radius: 0.75rem;
    border: 1px solid #e2e8f0;
    padding: 2rem;
  }

  .sg-quiz-flow--dark {
    background: #1e293b;
    color: #f8fafc;
    border-color: #334155;
  }

  .sg-quiz-flow__title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
    letter-spacing: -0.025em;
  }

  .sg-quiz-flow__subtitle {
    font-size: 0.875rem;
    color: #64748b;
    margin: 0 0 1.5rem;
    line-height: 1.5;
  }

  .sg-quiz-flow--dark .sg-quiz-flow__subtitle {
    color: #94a3b8;
  }

  .sg-quiz-flow__progress {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #0ea5e9;
    margin: 0 0 1rem;
  }

  .sg-quiz-flow__text {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 1.25rem;
    line-height: 1.5;
  }

  .sg-quiz-flow__options {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sg-quiz-flow__option {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font-size: 0.875rem;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .sg-quiz-flow__option:hover {
    background: #f1f5f9;
    border-color: #0ea5e9;
  }

  .sg-quiz-flow--dark .sg-quiz-flow__option {
    border-color: #334155;
  }

  .sg-quiz-flow--dark .sg-quiz-flow__option:hover {
    background: #334155;
  }

  .sg-quiz-flow__score {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0 0 1.5rem;
  }

  .sg-quiz-flow__btn {
    display: inline-flex;
    align-items: center;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    font-family: inherit;
    cursor: pointer;
    border: none;
    transition: background 0.15s ease;
  }

  .sg-quiz-flow__btn--primary {
    background: #0ea5e9;
    color: #ffffff;
  }

  .sg-quiz-flow__btn--primary:hover {
    background: #0284c7;
  }

  .sg-quiz-flow__btn--secondary {
    background: transparent;
    color: #0ea5e9;
    border: 1px solid #0ea5e9;
  }

  .sg-quiz-flow__btn--secondary:hover {
    background: #e0f2fe;
  }
`;

interface QuizFlowProps {
  config?: string;
}

export function QuizFlow({ config = '' }: Readonly<QuizFlowProps>) {
  const logger = useLogger('quiz-flow');
  let parsed: Partial<QuizConfig> = {};
  try {
    parsed = config ? JSON.parse(config) : {};
  } catch {
    logger.warn('Invalid config JSON');
  }

  const { title, subtitle, questions, theme } = adaptQuizConfig(parsed);
  const { phase, currentIndex, score, start, answer, restart } = useQuizState(questions);

  const current = questions[currentIndex];
  const rootClass = classNames('sg-quiz-flow', theme === 'dark' && 'sg-quiz-flow--dark');

  return (
    <>
      <style>{styles}</style>
      <div className={rootClass}>
        {phase === 'intro' && (
          <div className="sg-quiz-flow__intro">
            {title && <h2 className="sg-quiz-flow__title">{title}</h2>}
            {subtitle && <p className="sg-quiz-flow__subtitle">{subtitle}</p>}
            <button
              className="sg-quiz-flow__btn sg-quiz-flow__btn--primary"
              onClick={start}
              type="button"
            >
              Iniciar quiz
            </button>
          </div>
        )}

        {phase === 'quiz' && current && (
          <div className="sg-quiz-flow__question">
            <p className="sg-quiz-flow__progress">
              {currentIndex + 1} / {questions.length}
            </p>
            <p className="sg-quiz-flow__text">{current.text}</p>
            <ul className="sg-quiz-flow__options">
              {current.options.map((opt, i) => (
                <li key={opt}>
                  <button
                    className="sg-quiz-flow__option"
                    onClick={() => answer(i)}
                    type="button"
                  >
                    {opt}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {phase === 'results' && (
          <div className="sg-quiz-flow__results">
            <h3 className="sg-quiz-flow__score">
              Resultado: {score} / {questions.length}
            </h3>
            <button
              className="sg-quiz-flow__btn sg-quiz-flow__btn--secondary"
              onClick={restart}
              type="button"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </>
  );
}
