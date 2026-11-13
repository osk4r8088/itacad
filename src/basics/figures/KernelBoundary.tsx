import { useState } from 'react';

interface Part {
  id: string;
  label: string;
  about: string;
}

/** User space, the kernel and the hardware; selecting a part explains what it does. */
const USER: Part[] = [
  { id: 'apps', label: 'Applications', about: 'Browser, editor, shell: programs started by a user. They run unprivileged and reach everything outside their own memory through system calls.' },
  { id: 'services', label: 'System services', about: 'Long-running programs such as a web server, a name resolver or the init system. They run in user space too, some with more rights than others, but in the same unprivileged processor mode.' },
  { id: 'libc', label: 'Standard library', about: 'The library that wraps the system calls in ordinary functions such as open, read and write, so programs do not write the call instruction themselves.' },
];

const KERNEL: Part[] = [
  { id: 'syscall', label: 'System call interface', about: 'The entry point of the kernel. A program puts the number of the service and its arguments into registers and executes one special instruction; the processor switches to kernel mode and continues here. The kernel checks the arguments and the rights of the caller before it does anything.' },
  { id: 'sched', label: 'Scheduler', about: 'Decides which process or thread runs on which core and for how long. The timer interrupt gives it the processor back even from a program that never asks for anything.' },
  { id: 'mm', label: 'Memory management', about: 'Keeps the page tables of every process, hands out memory on demand through page faults, and frees pages when memory runs short.' },
  { id: 'fs', label: 'File systems', about: 'Turns reads and writes of files into reads and writes of blocks, and keeps the page cache of recently used file contents.' },
  { id: 'net', label: 'Network stack', about: 'Sockets, TCP and UDP, IP and routing, down to the frames a network driver sends.' },
  { id: 'drivers', label: 'Device drivers', about: 'Operate the hardware: registers, interrupts and direct memory access. They are the largest part of a kernel and the usual cause of crashes, because a fault here is a fault in kernel mode.' },
];

const HARDWARE: Part = { id: 'hw', label: 'Hardware: CPU, memory, disks, network cards', about: 'Only code in kernel mode may touch it. The processor itself enforces that: a privileged instruction in user mode is stopped and handed to the kernel.' };

const ALL = [...USER, ...KERNEL, HARDWARE];

/** The boundary between user space and the kernel, as a diagram with one explanation per part. */
export default function KernelBoundary() {
  const [selected, setSelected] = useState('syscall');
  const part = ALL.find((p) => p.id === selected)!;

  const Box = ({ p, className }: { p: Part; className: string }) => (
    <button type="button" className={`${className}${selected === p.id ? ' is-selected' : ''}`} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}>
      {p.label}
    </button>
  );

  return (
    <div className="kernel-figure">
      <div className="kernel-stack">
        <div className="kernel-band kind-user">
          <span className="kernel-band-name">User space, unprivileged</span>
          <div className="kernel-row">
            {USER.map((p) => (
              <Box key={p.id} p={p} className="kernel-box" />
            ))}
          </div>
        </div>
        <div className="kernel-band kind-kernel">
          <span className="kernel-band-name">Kernel, privileged</span>
          <div className="kernel-row">
            <Box p={KERNEL[0]} className="kernel-box is-wide" />
          </div>
          <div className="kernel-row">
            {KERNEL.slice(1).map((p) => (
              <Box key={p.id} p={p} className="kernel-box" />
            ))}
          </div>
        </div>
        <div className="kernel-band kind-hw">
          <div className="kernel-row">
            <Box p={HARDWARE} className="kernel-box is-wide" />
          </div>
        </div>
      </div>
      <p className="kernel-about" aria-live="polite">
        <strong>{part.label}:</strong> {part.about}
      </p>
    </div>
  );
}
