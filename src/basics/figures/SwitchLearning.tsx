import { useState } from 'react';
import { HOSTS, age, hostById, send, type Delivery, type Table } from './switching';

/** A frame crossing a switch while the MAC address table fills. */
export default function SwitchLearning() {
  const [table, setTable] = useState<Table>({});
  const [from, setFrom] = useState('A');
  const [to, setTo] = useState('C');
  const [last, setLast] = useState<{ d: Delivery; from: string; to: string } | undefined>(undefined);
  const [count, setCount] = useState(0);

  const go = () => {
    if (from === to) return;
    const d = send(table, from, to);
    setTable(d.table);
    setLast({ d, from, to });
    setCount(count + 1);
  };

  const portState = (port: number) => {
    if (!last) return '';
    if (port === last.d.inPort) return 'is-in';
    if (last.d.outPorts.includes(port)) return last.d.flooded ? 'is-flood' : 'is-out';
    return '';
  };

  return (
    <div className="sw-figure">
      <div className="sw-controls">
        <div className="vm-choice" role="group" aria-label="Sender">
          <span>From</span>
          {HOSTS.map((h) => (
            <button key={h.id} type="button" className="chip" aria-pressed={from === h.id} onClick={() => setFrom(h.id)}>
              {h.id}
            </button>
          ))}
        </div>
        <div className="vm-choice" role="group" aria-label="Destination">
          <span>To</span>
          {[...HOSTS.map((h) => h.id), 'broadcast'].map((id) => (
            <button key={id} type="button" className="chip" aria-pressed={to === id} disabled={id === from} onClick={() => setTo(id)}>
              {id === 'broadcast' ? 'Broadcast' : id}
            </button>
          ))}
        </div>
        <button type="button" className="chip sw-send" onClick={go} disabled={from === to}>
          Send frame
        </button>
      </div>

      <div className="sw-diagram" aria-hidden="true">
        <div className="sw-box">Switch</div>
        <div className="sw-ports">
          {HOSTS.map((h) => {
            const s = portState(h.port);
            const took = last?.d.accepted.includes(h.id);
            return (
              <div key={h.id} className={`sw-port ${s}`}>
                <span className="sw-port-no">Port {h.port}</span>
                <span className="sw-link" />
                <span className={`sw-host${took ? ' is-took' : s === 'is-flood' ? ' is-dropped' : ''}`}>
                  <strong>{h.id}</strong>
                  <span className="mono">{h.mac.slice(-5)}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="sw-result" aria-live="polite">
        {last ? <Outcome {...last} /> : 'The table is empty: the switch has not seen any frame yet. Send one.'}
      </p>

      <table className="vm-table is-active sw-table">
        <caption>MAC address table</caption>
        <thead>
          <tr>
            <th scope="col">MAC address</th>
            <th scope="col">Port</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(table).length === 0 ? (
            <tr>
              <td colSpan={2}>empty</td>
            </tr>
          ) : (
            Object.entries(table)
              .sort((a, b) => a[1] - b[1])
              .map(([mac, port]) => (
                <tr key={mac} className={last?.d.learned.mac === mac && last.d.learned.isNew ? 'is-hit' : undefined}>
                  <td className="mono">{mac}</td>
                  <td className="mono">{port}</td>
                </tr>
              ))
          )}
        </tbody>
      </table>
      <div className="sw-controls">
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setTable(age());
            setLast(undefined);
          }}
        >
          Let a few quiet minutes pass (entries age out)
        </button>
        <span className="sw-count">{count} {count === 1 ? 'frame' : 'frames'} sent</span>
      </div>
      <p className="vm-note">One switch, one VLAN and one host per port. The addresses are invented, from the range for locally administered addresses.</p>
    </div>
  );
}

function Outcome({ d, from, to }: { d: Delivery; from: string; to: string }) {
  const src = hostById(from);
  const learned = d.learned.isNew ? <>The switch learns that {src.mac} is on port {src.port}. </> : <>It already knew {src.mac} on port {src.port} and refreshes the entry. </>;
  if (to === 'broadcast')
    return (
      <>
        {learned}A broadcast always goes out of all other ports: {d.outPorts.join(', ')}. Every other host takes it in.
      </>
    );
  const dst = hostById(to);
  if (d.flooded)
    return (
      <>
        {learned}
        {dst.mac} is not in the table yet, so the switch floods the frame out of ports {d.outPorts.join(', ')}. Only {to} takes it in; the others see a destination that is not theirs and drop it.
      </>
    );
  return (
    <>
      {learned}
      {dst.mac} is in the table on port {dst.port}, so the frame goes out of that one port only. The other hosts never see it.
    </>
  );
}
