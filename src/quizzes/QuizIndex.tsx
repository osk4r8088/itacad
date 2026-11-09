import { CATALOG, GROUPS } from '../protocols/catalog';
import { href } from '../app/router';
import { ISSUES_URL } from '../shared/hub';
import { hasQuiz } from './catalog';

/** The "Quizzes" lesson: every protocol that has a quiz, in the groups of the protocol overview. */
export default function QuizIndex() {
  const ready = CATALOG.filter((e) => hasQuiz(e.id));
  return (
    <div className="index">
      <h1>Quizzes</h1>
      <p className="lead">Check what you took from a protocol page. Each answer is explained and links to the step of the exchange that shows it. Nothing is saved.</p>
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
      <p className="muted">
        More protocols follow, see <a href={`${ISSUES_URL}/7`}>issue #7</a>.
      </p>
    </div>
  );
}
