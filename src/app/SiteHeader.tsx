import { href } from './router';
import { SECTIONS, type Section } from './sections';
import { SITE_NAME } from '../shared/hub';

export type { Section } from './sections';

/** Site name and section navigation. Exchange pages use their own compact bar instead. */
export function SiteHeader({ current }: { current?: Section }) {
  return (
    <header className="site-header">
      <a href={href.home} className="site-title">
        {SITE_NAME}
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
