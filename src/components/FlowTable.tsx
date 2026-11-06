import { useEffect, useRef } from 'react';
import type { Capture, Exchange, Step } from '../schema';
import { layerKind } from './PacketView';

interface Props {
  exchange: Exchange;
  index: number;
  onSelect: (index: number) => void;
}

/** Source and destination as a packet analyzer shows them: network layer addresses if present, else link layer. */
function endpoints(step: Step, exchange: Exchange): [string, string] {
  const layers = step.captures[0].layers;
  for (const kind of ['internet', 'link'] as const) {
    const l = [...layers].reverse().find((x) => x.def.tcpip === kind && x.values.src && x.values.dst);
    if (l) return [l.values.src.display, l.values.dst.display];
  }
  const name = (id: string) => exchange.participants.find((p) => p.id === id)?.label ?? id;
  return [name(step.from), name(step.to)];
}

/** Frame size from destination MAC to FCS: everything except layer 1 framing. */
function frameSize(c: Capture): number {
  return c.layers.filter((l) => layerKind(l) !== 'phy').reduce((n, l) => n + l.bytes.length + (l.trailerBytes?.length ?? 0), 0);
}

export function FlowTable({ exchange, index, onSelect }: Props) {
  const color = new Map(exchange.categories.map((c) => [c.id, c.color]));
  const body = useRef<HTMLTableSectionElement>(null);

  // Keep the current row visible when stepping through long exchanges.
  useEffect(() => {
    // Scroll only the table container, never the page.
    const row = body.current?.children[index] as HTMLElement | undefined;
    const box = body.current?.closest('.flow-scroll') as HTMLElement | null;
    if (!row || !box) return;
    const head = box.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const top = row.offsetTop - head;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }, [index]);

  return (
    <div className="flow">
      <ul className="flow-legend" aria-label="Legend">
        {exchange.categories.map((c) => (
          <li key={c.id}>
            <span className={`dot cat-${c.color}`} aria-hidden="true" /> {c.label}
          </li>
        ))}
      </ul>
      <div className="flow-scroll">
        <table className="flow-table">
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col">Time</th>
              <th scope="col">Source</th>
              <th scope="col">Destination</th>
              <th scope="col">Protocol</th>
              <th scope="col">Info</th>
              <th scope="col" className="num" title="Frame size from destination MAC address to FCS, without preamble. Packet analyzers usually show 4 octets less, because the network card strips the FCS.">
                Size
              </th>
            </tr>
          </thead>
          <tbody ref={body}>
            {exchange.steps.map((s, i) => {
              const [src, dst] = endpoints(s, exchange);
              return (
                <tr
                  key={s.id}
                  className={`${i === index ? 'current' : ''}${s.lost ? ' lost' : ''}`}
                  onClick={() => onSelect(i)}
                  aria-current={i === index ? 'step' : undefined}
                >
                  <td>
                    <button type="button" className={`step-dot cat-${color.get(s.category) ?? 'gray'}`} onClick={() => onSelect(i)} aria-label={`Go to step ${i + 1}`}>
                      {i + 1}
                    </button>
                  </td>
                  {/* Milliseconds in the table; steps less than 1 ms apart show the exact time on hover. */}
                  <td className="mono" title={Number.isInteger(s.time) ? undefined : `${s.time} ms`}>
                    {(s.time / 1000).toFixed(3)}s
                  </td>
                  <td className="mono">{src}</td>
                  <td className="mono">{dst}</td>
                  <td>{s.protocol}</td>
                  <td className="mono info-cell">
                    {s.info}
                    {s.lost && <span className="badge">LOST</span>}
                  </td>
                  <td className="mono num">{frameSize(s.captures[0])} B</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
