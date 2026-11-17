import { useEffect, useRef, useState } from 'react';
import type { EntryRef } from '../refs';
import { describeQuiz, progress, progressKey, useProgress } from '../progress';

/** "Visited" on a card or in a list, when the reader has opened the page in this browser. */
export function VisitedTag({ entry }: { entry: EntryRef }) {
  const p = useProgress();
  return progressKey(entry) in p.visited ? <span className="tag visited">Visited</span> : null;
}

/** "3 of 7 visited" for a group of pages; nothing while none of them is visited. */
export function VisitedCount({ entries, className = 'muted progress-count' }: { entries: EntryRef[]; className?: string }) {
  const p = useProgress();
  const n = entries.filter((e) => progressKey(e) in p.visited).length;
  return n > 0 ? (
    <span className={className}>
      {n} of {entries.length} visited
    </span>
  ) : null;
}

/** The last and best result of a quiz in this browser, or nothing before the first finished attempt. */
export function QuizHistory({ entry, prefix = 'Your results in this browser:' }: { entry: EntryRef; prefix?: string }) {
  const p = useProgress();
  const result = p.quizzes[progressKey(entry)];
  return result ? (
    <span className="quiz-history">
      {prefix} {describeQuiz(result)}
    </span>
  ) : null;
}

/** Records an attempt once all questions are answered; after "Start over" the next full attempt counts again. */
export function useRecordQuiz(entry: EntryRef | undefined, answered: number, correct: number, total: number) {
  const recorded = useRef(false);
  const complete = entry !== undefined && total > 0 && answered === total;
  useEffect(() => {
    if (!complete) {
      recorded.current = false;
      return;
    }
    if (recorded.current) return;
    recorded.current = true;
    progress.quiz(entry, correct, total);
    // Only the change to complete matters; correct and total are final at that moment.
  }, [complete]);
}

/** Where progress is kept, and a reset that asks once more before it deletes. */
export function ProgressNote() {
  const p = useProgress();
  const [confirm, setConfirm] = useState(false);
  const empty = Object.keys(p.visited).length === 0 && Object.keys(p.quizzes).length === 0;
  if (!progress.persistent())
    return <p className="progress-note muted">This browser does not allow the site to store data, so visited pages and quiz results are kept only until the page is closed.</p>;
  return (
    <p className="progress-note muted">
      Visited pages and quiz results are stored only in this browser, on this device. Nothing is sent anywhere.{' '}
      {!empty &&
        (confirm ? (
          <>
            <button type="button" className="link-button" onClick={() => (progress.reset(), setConfirm(false))}>
              Delete my progress
            </button>{' '}
            <button type="button" className="link-button" onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="link-button" onClick={() => setConfirm(true)}>
            Reset progress
          </button>
        ))}
    </p>
  );
}
