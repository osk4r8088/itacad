import { describe, expect, it } from 'vitest';
import { MAX_COMMITS, ancestors, branch, commit, example, initial, merge, mergeBase, switchTo, type Repo } from './commit-graph';

const apply = (r: Repo, ...fs: ((r: Repo) => { repo: Repo })[]) => fs.reduce((acc, f) => f(acc).repo, r);

describe('the commit graph', () => {
  it('starts with one commit on main', () => {
    const r = initial();
    expect(r.commits).toHaveLength(1);
    expect(r.branches).toEqual({ main: 0 });
    expect(r.current).toBe('main');
  });

  it('adds a commit whose parent is the old tip and moves only the current branch', () => {
    const r = apply(initial(), (x) => branch(x, 'feature'), commit);
    expect(r.commits[1].parents).toEqual([0]);
    expect(r.branches).toEqual({ main: 0, feature: 1 });
  });

  it('creates a branch as a pointer to the current commit, without a commit', () => {
    const r = apply(initial(), commit, (x) => branch(x, 'feature'));
    expect(r.commits).toHaveLength(2);
    expect(r.branches.feature).toBe(r.branches.main);
    expect(r.current).toBe('feature');
    expect(branch(r, 'feature').repo).toBe(r);
  });

  it('keeps every parent older than its child', () => {
    let r = initial();
    for (const s of example()) r = s.repo;
    r = merge(r, 'feature').repo;
    for (const c of r.commits) for (const p of c.parents) expect(p).toBeLessThan(c.n);
  });

  it('fast-forwards when the current branch has no commits of its own', () => {
    const r = apply(initial(), (x) => branch(x, 'feature'), commit, commit, (x) => switchTo(x, 'main'));
    const s = merge(r, 'feature');
    expect(s.outcome).toMatch(/^Fast-forward/);
    expect(s.repo.commits).toHaveLength(r.commits.length);
    expect(s.repo.branches.main).toBe(r.branches.feature);
  });

  it('creates a merge commit with two parents when both sides moved on', () => {
    let r = initial();
    for (const s of example()) r = s.repo;
    const before = { main: r.branches.main, feature: r.branches.feature };
    expect(mergeBase(r, before.main, before.feature)).toBe(1);
    const s = merge(r, 'feature');
    const m = s.repo.commits[s.repo.commits.length - 1];
    expect(m.parents).toEqual([before.main, before.feature]);
    expect(s.repo.branches.main).toBe(m.n);
    expect(s.repo.branches.feature).toBe(before.feature);
    const history = ancestors(s.repo, m.n);
    for (const c of r.commits) expect(history.has(c.n)).toBe(true);
  });

  it('reports already up to date after a merge, and refuses to merge a branch into itself', () => {
    let r = initial();
    for (const s of example()) r = s.repo;
    r = merge(r, 'feature').repo;
    const again = merge(r, 'feature');
    expect(again.repo).toBe(r);
    expect(again.outcome).toMatch(/^Already up to date/);
    expect(merge(r, 'main').outcome).toMatch(/itself/);
  });

  it('finds the newest common ancestor across earlier merges', () => {
    let r = initial();
    for (const s of example()) r = s.repo;
    r = merge(r, 'feature').repo; // main gets a merge commit
    r = apply(r, (x) => switchTo(x, 'feature'), commit);
    expect(mergeBase(r, r.branches.main, r.branches.feature)).toBe(3);
  });

  it('stops adding commits at the size of the picture', () => {
    let r = initial();
    for (let i = 0; i < MAX_COMMITS + 3; i++) r = commit(r).repo;
    expect(r.commits).toHaveLength(MAX_COMMITS);
  });

  it('starts the figure with a branch that has moved on next to main', () => {
    const steps = example();
    const r = steps[steps.length - 1].repo;
    expect(r.order).toEqual(['main', 'feature']);
    expect(r.current).toBe('main');
    expect(steps.map((s) => s.command)).toEqual(['git commit', 'git switch -c feature', 'git commit', 'git commit', 'git switch main', 'git commit']);
  });
});
