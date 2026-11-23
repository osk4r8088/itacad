/**
 * A tiny model of Git history for the figure on version control: commits that point to their
 * parents, branches that are movable pointers to commits, and merges that either move a pointer
 * forward (fast-forward) or create a commit with two parents.
 *
 * Commits are numbered in the order they are made, which is also a valid order of the history:
 * every parent has a smaller number than its child.
 */

export interface Commit {
  /** Position in creation order, shown as c0, c1, ... */
  n: number;
  parents: number[];
  /** The branch that was checked out when the commit was made; it decides the row in the picture. */
  lane: string;
}

export interface Repo {
  commits: Commit[];
  /** Branch name to the commit it points to. */
  branches: Record<string, number>;
  /** Branch names in the order they were created. */
  order: string[];
  /** The checked-out branch (what Git calls HEAD). */
  current: string;
}

export interface Step {
  repo: Repo;
  /** The Git command this step stands for. */
  command: string;
  /** What happened, in one sentence. */
  outcome: string;
}

export const MAX_COMMITS = 14;
export const BRANCH_NAMES = ['feature', 'fix', 'docs'];

export const label = (n: number) => `c${n}`;

export function initial(): Repo {
  return { commits: [{ n: 0, parents: [], lane: 'main' }], branches: { main: 0 }, order: ['main'], current: 'main' };
}

/** All commits reachable from `n` by following parents, including `n` itself. */
export function ancestors(repo: Repo, n: number): Set<number> {
  const seen = new Set<number>();
  const stack = [n];
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c)) continue;
    seen.add(c);
    stack.push(...repo.commits[c].parents);
  }
  return seen;
}

/** The newest commit both sides share: what Git compares both sides against when merging. */
export function mergeBase(repo: Repo, a: number, b: number): number {
  const left = ancestors(repo, a);
  let best = -1;
  for (const c of ancestors(repo, b)) if (left.has(c) && c > best) best = c;
  return best;
}

export function commit(repo: Repo): Step {
  if (repo.commits.length >= MAX_COMMITS) return { repo, command: 'git commit', outcome: `The picture is full at ${MAX_COMMITS} commits; start over to continue.` };
  const n = repo.commits.length;
  const parent = repo.branches[repo.current];
  return {
    repo: { ...repo, commits: [...repo.commits, { n, parents: [parent], lane: repo.current }], branches: { ...repo.branches, [repo.current]: n } },
    command: 'git commit',
    outcome: `New commit ${label(n)} with parent ${label(parent)}; ${repo.current} now points to ${label(n)}.`,
  };
}

/** Creates a branch at the current commit and switches to it. */
export function branch(repo: Repo, name: string): Step {
  const command = `git switch -c ${name}`;
  if (name in repo.branches) return { repo, command, outcome: `A branch called ${name} already exists.` };
  const at = repo.branches[repo.current];
  return {
    repo: { ...repo, branches: { ...repo.branches, [name]: at }, order: [...repo.order, name], current: name },
    command,
    outcome: `New branch ${name} points to ${label(at)}, the same commit as ${repo.current}. No files were copied; only a pointer was added.`,
  };
}

export function switchTo(repo: Repo, name: string): Step {
  const command = `git switch ${name}`;
  if (!(name in repo.branches)) return { repo, command, outcome: `There is no branch called ${name}.` };
  return { repo: { ...repo, current: name }, command, outcome: `Now on ${name}, at ${label(repo.branches[name])}. New commits will go there.` };
}

/** Merges branch `other` into the current branch. */
export function merge(repo: Repo, other: string): Step {
  const command = `git merge ${other}`;
  if (!(other in repo.branches)) return { repo, command, outcome: `There is no branch called ${other}.` };
  if (other === repo.current) return { repo, command, outcome: 'A branch cannot be merged into itself.' };
  const ours = repo.branches[repo.current];
  const theirs = repo.branches[other];
  const base = mergeBase(repo, ours, theirs);
  if (base === theirs) return { repo, command, outcome: `Already up to date: ${label(theirs)} is already part of ${repo.current}.` };
  if (base === ours) {
    return {
      repo: { ...repo, branches: { ...repo.branches, [repo.current]: theirs } },
      command,
      outcome: `Fast-forward: ${repo.current} had no commits of its own since ${label(base)}, so its pointer simply moves to ${label(theirs)}. No new commit.`,
    };
  }
  if (repo.commits.length >= MAX_COMMITS) return { repo, command, outcome: `The picture is full at ${MAX_COMMITS} commits; start over to continue.` };
  const n = repo.commits.length;
  return {
    repo: {
      ...repo,
      commits: [...repo.commits, { n, parents: [ours, theirs], lane: repo.current }],
      branches: { ...repo.branches, [repo.current]: n },
    },
    command,
    outcome: `Both sides have new commits since their common ancestor ${label(base)}. Git combines the changes of both into the merge commit ${label(n)}, which has two parents, ${label(ours)} and ${label(theirs)}.`,
  };
}

/** A short scripted history to start from, so the first look already shows a branch. */
export function example(): Step[] {
  const steps: Step[] = [];
  let r = initial();
  const run = (s: Step) => {
    steps.push(s);
    r = s.repo;
  };
  run(commit(r));
  run(branch(r, 'feature'));
  run(commit(r));
  run(commit(r));
  run(switchTo(r, 'main'));
  run(commit(r));
  return steps;
}
