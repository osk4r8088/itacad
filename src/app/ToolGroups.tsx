import { HubCards } from './HubCards';
import { href } from './router';
import { TOOL_GROUPS, toolsFor } from '../tools/registry';

/** Tools split by purpose: everyday utilities, and models to understand something. */
export function ToolGroups({ headingLevel = 'h2' }: { headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel;
  return (
    <>
      {TOOL_GROUPS.map((g) => (
        <div key={g.purpose} className="tool-group">
          <H className="tool-group-title">{g.title}</H>
          <p className="small muted">{g.about}</p>
          <HubCards entries={toolsFor(g.purpose)} link={href.tool} />
        </div>
      ))}
    </>
  );
}
