import { describe, expect, it } from 'vitest';
import styles from './styles.css?raw';

// A merge that drops a closing brace makes browsers read every later rule as nested in the one before,
// and the build still passes. This catches it.
describe('styles.css', () => {
  it('closes every rule, and nests rules only inside @-rules such as @media', () => {
    const css = styles.replace(/\/\*[\s\S]*?\*\//g, '');
    const open: string[] = [];
    let selector = '';
    for (const ch of css) {
      if (ch === '{') {
        const s = selector.trim();
        if (open.length && !open[open.length - 1].startsWith('@')) throw new Error(`"${s}" is nested inside "${open[open.length - 1]}"`);
        open.push(s);
        selector = '';
      } else if (ch === '}') {
        expect(open.pop(), 'a } without a matching {').toBeDefined();
        selector = '';
      } else if (ch === ';') selector = '';
      else selector += ch;
    }
    expect(open, 'rules left open at the end of the file').toEqual([]);
  });
});
