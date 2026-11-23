/**
 * The boot chain as the topic describes it, step by step, for Linux and Windows on UEFI firmware,
 * with three things that can go wrong on the way. Every sentence restates the topic text.
 */

export type System = 'linux' | 'windows';
export type Stage = 'firmware' | 'loader' | 'kernel' | 'first';

export interface Options {
  system: System;
  secureBoot: boolean;
  /** The firmware has no boot entry for the disk, for example after cloning to a new disk. */
  noBootEntry: boolean;
  /** The boot loader is not signed by a key the firmware trusts, for example one built by the user. */
  unsignedLoader: boolean;
  /** Linux only: the initramfs lacks the driver for the disk controller. */
  missingDriver: boolean;
}

export const DEFAULTS: Options = { system: 'linux', secureBoot: true, noBootEntry: false, unsignedLoader: false, missingDriver: false };

export interface Step {
  stage: Stage;
  /** The program that is running. */
  who: string;
  text: string;
  failed?: boolean;
}

export const STAGE_LABEL: Record<Stage, string> = { firmware: 'Firmware', loader: 'Boot loader', kernel: 'Kernel', first: 'First process' };

export function boot(o: Options): Step[] {
  const linux = o.system === 'linux';
  const loader = linux ? 'GRUB or systemd-boot' : 'Windows Boot Manager, then the Windows loader';
  const steps: Step[] = [
    { stage: 'firmware', who: 'UEFI firmware', text: 'Power on. The processor starts the firmware from the flash chip on the mainboard. It tests and initializes processor, memory and the devices needed to boot (POST).' },
  ];
  const stop = (s: Step) => [...steps, { ...s, failed: true }];

  if (o.noBootEntry)
    return stop({ stage: 'firmware', who: 'UEFI firmware', text: 'The firmware looks through its boot entries and finds none that names a file on this disk. It stops with a message like "no bootable device".' });
  steps.push({ stage: 'firmware', who: 'UEFI firmware', text: 'The firmware reads its list of boot entries. The first one names a file on the EFI System Partition, a small FAT partition, and the firmware loads that file into memory.' });

  if (o.secureBoot) {
    if (o.unsignedLoader)
      return stop({ stage: 'firmware', who: 'UEFI firmware', text: 'Secure Boot is on: the signature of the boot loader does not check against any key the firmware trusts, so the firmware refuses to start it.' });
    steps.push({ stage: 'firmware', who: 'UEFI firmware', text: 'Secure Boot is on: the boot loader\'s signature checks against a key the firmware trusts, so it may run.' });
  } else if (o.unsignedLoader) {
    steps.push({ stage: 'firmware', who: 'UEFI firmware', text: 'Secure Boot is off: the firmware starts the boot loader without checking who signed it, including one that was modified.' });
  }

  steps.push({
    stage: 'loader',
    who: loader,
    text: linux
      ? 'The boot loader shows a menu if there is a choice, loads the selected kernel and the initramfs into memory, and starts the kernel with its command line, for example which partition is the root file system.'
      : 'The Windows Boot Manager shows a menu if there is a choice and starts the Windows loader, which loads the Windows kernel into memory and starts it.',
  });
  if (o.secureBoot) steps.push({ stage: 'loader', who: loader, text: 'With Secure Boot, the boot loader checks the signature of the kernel before starting it: the chain of trust continues.' });

  const kernel = linux ? 'Linux kernel' : 'Windows kernel (ntoskrnl.exe)';
  steps.push({ stage: 'kernel', who: kernel, text: 'The kernel takes over: it sets up memory management and the devices.' });
  if (linux) {
    if (o.missingDriver)
      return stop({ stage: 'kernel', who: kernel, text: 'To mount the root file system the kernel needs the driver for the disk controller, but it is not in the initramfs. It cannot reach its root file system, and the start ends with an error instead of a login.' });
    steps.push({ stage: 'kernel', who: kernel, text: 'The drivers it needs for the disk come from the initramfs in memory. With them it mounts the real root file system.' });
  } else {
    steps.push({ stage: 'kernel', who: kernel, text: 'It mounts the root file system, where the rest of Windows lies.' });
  }

  steps.push(
    linux
      ? { stage: 'first', who: 'systemd (PID 1)', text: 'The kernel starts the first process, systemd, with PID 1. It starts the services described in its units, in parallel where their dependencies allow, mounts the remaining file systems, brings up the network and ends at the graphical login.' }
      : { stage: 'first', who: 'Session Manager', text: 'The kernel starts the Session Manager, which starts the services and finally the logon screen.' },
  );
  return steps;
}

/** Faults that make sense for the chosen system. */
export const faultsFor = (system: System): (keyof Options)[] => (system === 'linux' ? ['noBootEntry', 'unsignedLoader', 'missingDriver'] : ['noBootEntry', 'unsignedLoader']);
