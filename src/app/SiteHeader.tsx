import { href } from './router';

export type Section = 'protocols' | 'tools' | 'learn';

const SECTIONS: { id: Section; label: string; href: string }[] = [
  { id: 'protocols', label: 'Protocols', href: href.protocols },
  { id: 'tools', label: 'Tools', href: href.tools },
  { id: 'learn', label: 'Learn', href: href.learn },
];

/** Site name and section navigation. Exchange pages use their own compact bar instead. */
export function SiteHeader({ current }: { current?: Section }) {
  return (
    <header className="site-header">
      <a href={href.home} className="site-title">
        Netkit
      </a>
      <nav className="site-nav" aria-label="Sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={s.href} aria-current={s.id === current ? 'page' : undefined}>
            {s.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
