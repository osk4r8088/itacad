import { useEffect, useState } from 'react';
import type { Exchange } from '../shared/schema';
import type { Quiz, QuizQuestion } from './schema';
import { QUIZZES } from './catalog';
import { findEntry } from '../protocols/catalog';
import { href } from '../app/router';
import { SourceList } from '../shared/components/SourceList';

type State = { status: 'loading' } | { status: 'ready'; quiz: Quiz; exchange: Exchange } | { status: 'missing' } | { status: 'failed' };

/** The quiz of one protocol: one question after the other, each answer explained and linked to its step. */
export default function QuizPage({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [answers, setAnswers] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadQuiz = QUIZZES[id];
    const entry = findEntry(id);
    if (!loadQuiz || !entry) return setState({ status: 'missing' });
    let active = true;
    setState({ status: 'loading' });
    setAnswers({});
    Promise.all([loadQuiz(), entry.load()])
      .then(([quiz, exchange]) => active && setState({ status: 'ready', quiz, exchange }))
      .catch(() => active && setState({ status: 'failed' }));
    return () => {
      active = false;
    };
  }, [id]);

  const title = state.status === 'ready' ? `${state.exchange.title} quiz` : 'Quiz';
  useEffect(() => {
    document.title = `${title} | Netkit`;
  }, [title]);

  if (state.status === 'loading') return <p className="notice muted">Loading quiz...</p>;
  if (state.status !== 'ready')
    return (
      <p className="notice">
        {state.status === 'missing' ? `There is no quiz for "${id}" yet.` : 'Could not load this quiz. Reload the page to try again.'} <a href={href.quizzes}>All quizzes</a>.
      </p>
    );

  const { quiz, exchange } = state;
  const total = quiz.questions.length;
  const answered = quiz.questions.filter((q) => q.id in answers).length;
  const correct = quiz.questions.filter((q) => answers[q.id] === q.answer).length;

  return (
    <div className="index quiz">
      <p className="back">
        <a href={href.quizzes}>All quizzes</a>
      </p>
      <h1>{title}</h1>
      <p className="lead">
        {total} questions about the <a href={href.exchange(exchange.id)}>{exchange.title} exchange</a>. Each answer is explained, with a link to the step that shows it.
      </p>
      <ol className="quiz-list">
        {quiz.questions.map((q, i) => (
          <Question
            key={q.id}
            number={i + 1}
            question={q}
            exchange={exchange}
            chosen={answers[q.id]}
            onChoose={(option) => setAnswers((a) => (q.id in a ? a : { ...a, [q.id]: option }))}
          />
        ))}
      </ol>
      <div className="quiz-score" aria-live="polite">
        <p>
          <strong>
            {correct} of {total}
          </strong>{' '}
          correct{answered < total ? `, ${total - answered} still open` : '.'}
        </p>
        {answered > 0 && (
          <button type="button" onClick={() => setAnswers({})}>
            Start over
          </button>
        )}
      </div>
    </div>
  );
}

function Question({ number, question: q, exchange, chosen, onChoose }: { number: number; question: QuizQuestion; exchange: Exchange; chosen: number | undefined; onChoose: (option: number) => void }) {
  const done = chosen !== undefined;
  const right = chosen === q.answer;
  const stepIndex = exchange.steps.findIndex((s) => s.id === q.step);
  const step = exchange.steps[stepIndex];

  return (
    <li className="quiz-q">
      <fieldset>
        <legend>
          <span className="quiz-n">{number}.</span> {q.prompt}
        </legend>
        {q.options.map((text, i) => {
          const state = !done ? '' : i === q.answer ? ' is-right' : i === chosen ? ' is-wrong' : '';
          return (
            <label key={i} className={`quiz-option${state}`}>
              <input type="radio" name={q.id} checked={chosen === i} disabled={done && chosen !== i} onChange={() => onChoose(i)} />
              <span>{text}</span>
              {done && i === q.answer && <span className="quiz-mark">correct answer</span>}
              {done && i === chosen && !right && <span className="quiz-mark">your answer</span>}
            </label>
          );
        })}
      </fieldset>
      {done && (
        <div className={`quiz-feedback${right ? ' is-right' : ' is-wrong'}`} role="status">
          <p>
            <strong>{right ? 'Right.' : 'Not quite.'}</strong> {q.explanation}
          </p>
          <p className="quiz-more">
            <a href={href.exchange(exchange.id, stepIndex + 1)}>
              See step {stepIndex + 1}: {step.label}
            </a>
          </p>
          {q.source && <SourceList sources={[q.source]} />}
        </div>
      )}
    </li>
  );
}
