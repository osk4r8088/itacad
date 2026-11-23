import { useState } from 'react';
import { BRANCH_NAMES, MAX_COMMITS, branch, commit, example, label, merge, switchTo, type Repo, type Step } from './commit-graph';

const DX = 46;
const LEFT = 76;
const R = 11;
/** Height of one branch tag; tags on the same commit stack upwards. */
const TAG = 17;

const start = () => {
  const steps = example();
  return { repo: steps[steps.length - 1].repo, log: steps };
};

/** A commit graph that grows with commit, branch, switch and merge. */
export default function CommitGraph() {
  const [{ repo, log }, setState] = useState(start);
  const run = (s: Step) => setState({ repo: s.repo, log: [...log, s] });
  const nextName = BRANCH_NAMES.find((n) => !(n in repo.branches));
  const full = repo.commits.length >= MAX_COMMITS;
  const last = log[log.length - 1];

  return (
    <div className="cg-figure">
      <div className="cg-controls">
        <button type="button" className="chip" onClick={() => run(commit(repo))} disabled={full}>
          Commit on {repo.current}
        </button>
        {nextName && (
          <button type="button" className="chip" onClick={() => run(branch(repo, nextName))}>
            New branch {nextName}
          </button>
        )}
        <button type="button" className="link-button" onClick={() => setState(start())}>
          Start over
        </button>
      </div>
      <div className="cg-controls" role="group" aria-label="Switch branch">
        <span>Switch to</span>
        {repo.order.map((b) => (
          <button key={b} type="button" className="chip" aria-pressed={b === repo.current} onClick={() => b !== repo.current && run(switchTo(repo, b))}>
            {b}
          </button>
        ))}
      </div>
      {repo.order.length > 1 && (
        <div className="cg-controls" role="group" aria-label={`Merge into ${repo.current}`}>
          <span>Merge into {repo.current}</span>
          {repo.order
            .filter((b) => b !== repo.current)
            .map((b) => (
              <button key={b} type="button" className="chip" onClick={() => run(merge(repo, b))}>
                {b}
              </button>
            ))}
        </div>
      )}

      <div className="cg-scroll">
        <Graph repo={repo} />
      </div>

      <p className="cg-result" aria-live="polite">
        <code>{last.command}</code>: {last.outcome}
      </p>
      <details className="cg-log">
        <summary>All commands so far ({log.length})</summary>
        <ol>
          {log.map((s, i) => (
            <li key={i}>
              <code>{s.command}</code>
            </li>
          ))}
        </ol>
      </details>
      <p className="vm-note">
        Commits are named c0, c1 and so on here; Git names them by their hash. The checked-out branch, which Git calls HEAD, is shown filled. Merges in this picture never conflict; in a real repository both sides may have changed the same lines.
      </p>
    </div>
  );
}

function Graph({ repo }: { repo: Repo }) {
  const pointing: Record<number, string[]> = {};
  for (const b of repo.order) (pointing[repo.branches[b]] ??= []).push(b);
  const stack = Math.max(...Object.values(pointing).map((names) => names.length));
  const TOP = R + 10 + stack * TAG;
  const DY = R * 2 + 12 + stack * TAG;
  const lane = (name: string) => repo.order.indexOf(name);
  const pos = (n: number) => ({ x: LEFT + n * DX, y: TOP + lane(repo.commits[n].lane) * DY });
  const width = LEFT + (repo.commits.length - 1) * DX + 70;
  const height = TOP + (repo.order.length - 1) * DY + R + 12;

  return (
    <svg className="cg-graph" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={describe(repo)}>
      {repo.order.map((b, i) => (
        <text key={b} x={4} y={TOP + i * DY + 4} className="cg-lane">
          {b}
        </text>
      ))}
      {repo.commits.flatMap((c) =>
        c.parents.map((p) => {
          const a = pos(p);
          const z = pos(c.n);
          const d = a.y === z.y ? `M${a.x},${a.y} L${z.x},${z.y}` : `M${a.x},${a.y} C${a.x + DX * 0.6},${a.y} ${z.x - DX * 0.6},${z.y} ${z.x},${z.y}`;
          return <path key={`${p}-${c.n}`} d={d} className="cg-edge" />;
        }),
      )}
      {repo.commits.map((c) => {
        const { x, y } = pos(c.n);
        return (
          <g key={c.n}>
            <circle cx={x} cy={y} r={R} className={`cg-commit${c.parents.length > 1 ? ' is-merge' : ''}`} />
            <text x={x} y={y + 4} className="cg-id">
              {label(c.n)}
            </text>
          </g>
        );
      })}
      {Object.entries(pointing).map(([n, names]) => {
        const { x, y } = pos(Number(n));
        return names.map((b, i) => (
          <g key={b} transform={`translate(${x}, ${y - R - 8 - i * TAG})`}>
            <rect x={-b.length * 3.6 - 6} y={-11} width={b.length * 7.2 + 12} height={15} rx={4} className={`cg-tag${b === repo.current ? ' is-current' : ''}`} />
            <text x={0} y={0} className={`cg-tag-text${b === repo.current ? ' is-current' : ''}`}>
              {b}
            </text>
          </g>
        ));
      })}
    </svg>
  );
}

/** The graph in words, for screen readers. */
function describe(repo: Repo): string {
  const commits = repo.commits.map((c) => `${label(c.n)}${c.parents.length ? ` after ${c.parents.map(label).join(' and ')}` : ''}`).join(', ');
  const branches = repo.order.map((b) => `${b} at ${label(repo.branches[b])}`).join(', ');
  return `Commits: ${commits}. Branches: ${branches}. Checked out: ${repo.current}.`;
}
