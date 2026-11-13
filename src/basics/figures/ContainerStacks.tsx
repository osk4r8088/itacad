interface Stack {
  title: string;
  about: string;
  /** From the hardware upwards; the last entries are drawn side by side as the isolated units. */
  base: string[];
  units: { label: string; lines: string[] }[];
  unitName: string;
}

const VM: Stack = {
  title: 'Virtual machines',
  about: 'Each guest boots a kernel of its own, so each can be a different operating system. The isolation is enforced by the hypervisor with hardware support.',
  base: ['Hardware', 'Host system with hypervisor'],
  unitName: 'Virtual machine',
  units: [
    { label: 'VM 1', lines: ['Guest kernel', 'Libraries', 'Application'] },
    { label: 'VM 2', lines: ['Guest kernel', 'Libraries', 'Application'] },
  ],
};

const CONTAINERS: Stack = {
  title: 'Containers',
  about: 'One kernel serves every container. An image holds libraries and the application, never a kernel, so a container starts in milliseconds and is megabytes in size.',
  base: ['Hardware', 'Host system: one shared kernel', 'Container runtime'],
  unitName: 'Container',
  units: [
    { label: 'Container 1', lines: ['Libraries', 'Application'] },
    { label: 'Container 2', lines: ['Libraries', 'Application'] },
    { label: 'Container 3', lines: ['Libraries', 'Application'] },
  ],
};

function StackView({ stack }: { stack: Stack }) {
  return (
    <section className="stack" aria-label={stack.title}>
      <h3>{stack.title}</h3>
      <div className="stack-units">
        {stack.units.map((u) => (
          <div key={u.label} className="stack-unit">
            <span className="stack-unit-name">{u.label}</span>
            {u.lines.map((l) => (
              <span key={l} className={`stack-layer${l.includes('kernel') ? ' is-kernel' : ''}`}>
                {l}
              </span>
            ))}
          </div>
        ))}
      </div>
      {[...stack.base].reverse().map((b) => (
        <div key={b} className={`stack-layer is-base${b.includes('kernel') ? ' is-kernel' : ''}`}>
          {b}
        </div>
      ))}
      <p className="muted small">{stack.about}</p>
    </section>
  );
}

/** Virtual machines and containers as two stacks side by side: one kernel per guest, or one shared kernel. */
export default function ContainerStacks() {
  return (
    <div className="stacks">
      <StackView stack={VM} />
      <StackView stack={CONTAINERS} />
    </div>
  );
}
