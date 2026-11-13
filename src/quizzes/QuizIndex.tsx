import { CATALOG, GROUPS } from '../protocols/catalog';
import { href } from '../app/router';
import { hasQuiz } from './catalog';
import { LESSONS } from '../learn/registry';

/** The "Quizzes" lesson: every protocol that has a quiz, in the groups of the protocol overview, then the lessons. */
export default function QuizIndex() {
  const ready = CATALOG.filter((e) => hasQuiz(e.id));
  const lessons = LESSONS.filter((l) => l.status === 'ready' && hasQuiz(l.id));
  return (
    <div className="index">
      <h1>Quizzes</h1>
      <p className="lead">Check what you took from a protocol page or a lesson. Each answer is explained and links to the step that shows it. Nothing is saved.</p>
      {GROUPS.map((group) => {
        const entries = ready.filter((e) => e.group === group);
        if (entries.length === 0) return null;
        return (
          <section key={group}>
            <h2>{group}</h2>
            <ul className="cards">
              {entries.map((e) => (
                <li key={e.id}>
                  <a className="card" href={href.quiz(e.id)}>
                    <strong>{e.title}</strong>
                    <span>{e.summary}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {lessons.length > 0 && (
        <section>
          <h2>Lessons</h2>
          <ul className="cards">
            {lessons.map((l) => (
              <li key={l.id}>
                <a className="card" href={href.quiz(l.id)}>
                  <strong>{l.title}</strong>
                  <span>{l.summary}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
