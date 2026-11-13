import { useEffect, useState } from 'react';
import type { Exchange } from '../shared/schema';
import type { Quiz, QuizQuestion } from './schema';
import { QUIZZES } from './catalog';
import { findEntry } from '../protocols/catalog';
import { LESSONS } from '../learn/registry';
import { OSI_LAYERS } from '../shared/layers';
import { href } from '../app/router';
import { SourceList } from '../shared/components/SourceList';
import { pageTitle } from '../shared/hub';

/** What a quiz is about: a protocol exchange, a lesson that is an exchange, or a lesson page without steps. */
interface Subject {
  title: string;
  href: string;
  kind: 'protocol' | 'lesson';
  exchange?: Exchange;
  stepHref: (step: number) => string;
}

async function loadSubject(id: string): Promise<Subject | undefined> {
  const entry = findEntry(id);
  if (entry) return { title: entry.title, href: href.exchange(id), kind: 'protocol', exchange: await entry.load(), stepHref: (n) => href.exchange(id, n) };
  const lesson = LESSONS.find((l) => l.id === id && l.status === 'ready');
  if (!lesson) return undefined;
  const exchange = lesson.exchange ? await lesson.exchange() : undefined;
  return { title: lesson.title, href: exchange ? href.lesson(id, 1) : href.lesson(id), kind: 'lesson', exchange, stepHref: (n) => href.lesson(id, n) };
}

type State = { status: 'loading' } | { status: 'ready'; quiz: Quiz; subject: Subject } | { status: 'missing' } | { status: 'failed' };

/** The quiz of one protocol or lesson: one question after the other, each answer explained and linked to where it is shown. */
export default function QuizPage({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [answers, setAnswers] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadQuiz = QUIZZES[id];
    if (!loadQuiz) return setState({ status: 'missing' });
    let active = true;
    setState({ status: 'loading' });
    setAnswers({});
    Promise.all([loadQuiz(), loadSubject(id)])
      .then(([quiz, subject]) => active && setState(subject ? { status: 'ready', quiz, subject } : { status: 'missing' }))
      .catch(() => active && setState({ status: 'failed' }));
    return () => {
      active = false;
    };
  }, [id]);

  const title = state.status === 'ready' ? `${state.subject.title} quiz` : 'Quiz';
  useEffect(() => {
    document.title = pageTitle(title);
  }, [title]);

  if (state.status === 'loading') return <p className="notice muted">Loading quiz...</p>;
  if (state.status !== 'ready')
    return (
      <p className="notice">
        {state.status === 'missing' ? `There is no quiz for "${id}" yet.` : 'Could not load this quiz. Reload the page to try again.'} <a href={href.quizzes}>All quizzes</a>.
      </p>
    );

  const { quiz, subject } = state;
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
        {total} questions about {subject.kind === 'protocol' ? 'the ' : 'the lesson '}
        <a href={subject.href}>{subject.kind === 'protocol' ? `${subject.title} exchange` : subject.title}</a>. Each answer is explained, with a link to {subject.exchange ? 'the step' : 'the layer'} that shows it.
      </p>
      <ol className="quiz-list">
        {quiz.questions.map((q, i) => (
          <Question
            key={q.id}
            number={i + 1}
            question={q}
            subject={subject}
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

function Question({ number, question: q, subject, chosen, onChoose }: { number: number; question: QuizQuestion; subject: Subject; chosen: number | undefined; onChoose: (option: number) => void }) {
  const done = chosen !== undefined;
  const right = chosen === q.answer;
  const stepIndex = subject.exchange && q.step ? subject.exchange.steps.findIndex((s) => s.id === q.step) : -1;
  const step = stepIndex >= 0 ? subject.exchange!.steps[stepIndex] : undefined;

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
          {step && (
            <p className="quiz-more">
              <a href={subject.stepHref(stepIndex + 1)}>
                See step {stepIndex + 1}: {step.label}
              </a>
            </p>
          )}
          {q.layer && (
            <p className="quiz-more">
              <a href={href.lesson('layers', q.layer)}>
                See layer {q.layer}: {OSI_LAYERS[q.layer].name}
              </a>
            </p>
          )}
          {q.source && <SourceList sources={[q.source]} />}
        </div>
      )}
    </li>
  );
}
