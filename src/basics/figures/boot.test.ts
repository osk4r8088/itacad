import { describe, expect, it } from 'vitest';
import { DEFAULTS, boot, faultsFor, type Options, type Stage } from './boot';

const ORDER: Stage[] = ['firmware', 'loader', 'kernel', 'first'];
const stages = (o: Options) => boot(o).map((s) => s.stage);

describe('the boot chain', () => {
  for (const system of ['linux', 'windows'] as const)
    for (const secureBoot of [true, false]) {
      it(`runs firmware, boot loader, kernel and first process in order (${system}, Secure Boot ${secureBoot ? 'on' : 'off'})`, () => {
        const s = stages({ ...DEFAULTS, system, secureBoot });
        expect([...new Set(s)]).toEqual(ORDER);
        for (let i = 1; i < s.length; i++) expect(ORDER.indexOf(s[i])).toBeGreaterThanOrEqual(ORDER.indexOf(s[i - 1]));
        expect(boot({ ...DEFAULTS, system, secureBoot }).some((x) => x.failed)).toBe(false);
      });
    }

  it('stops in the firmware without a boot entry', () => {
    const s = boot({ ...DEFAULTS, noBootEntry: true });
    expect(s.at(-1)).toMatchObject({ stage: 'firmware', failed: true });
    expect(s.at(-1)!.text).toMatch(/no bootable device/);
  });

  it('refuses an unsigned boot loader only when Secure Boot is on', () => {
    expect(boot({ ...DEFAULTS, unsignedLoader: true }).at(-1)).toMatchObject({ stage: 'firmware', failed: true });
    const off = boot({ ...DEFAULTS, secureBoot: false, unsignedLoader: true });
    expect(off.some((x) => x.failed)).toBe(false);
    expect(off.at(-1)!.stage).toBe('first');
  });

  it('stops in the kernel when the initramfs lacks the disk driver, on Linux', () => {
    expect(boot({ ...DEFAULTS, missingDriver: true }).at(-1)).toMatchObject({ stage: 'kernel', failed: true });
    expect(faultsFor('windows')).not.toContain('missingDriver');
  });

  it('names the programs of each system', () => {
    const linux = boot(DEFAULTS).map((s) => s.who).join(' ');
    const windows = boot({ ...DEFAULTS, system: 'windows' }).map((s) => s.who).join(' ');
    expect(linux).toMatch(/GRUB/);
    expect(linux).toMatch(/systemd \(PID 1\)/);
    expect(windows).toMatch(/Windows Boot Manager/);
    expect(windows).toMatch(/ntoskrnl\.exe/);
  });

  it('mentions the kernel signature check only with Secure Boot on', () => {
    expect(boot(DEFAULTS).some((s) => /signature of the kernel/.test(s.text))).toBe(true);
    expect(boot({ ...DEFAULTS, secureBoot: false }).some((s) => /signature of the kernel/.test(s.text))).toBe(false);
  });
});
