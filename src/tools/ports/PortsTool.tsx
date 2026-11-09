import { useId, useState } from 'react';
import { SourceLink, SourceList } from '../../shared/components/SourceList';
import { href } from '../../app/router';
import { CATEGORIES, PORTS, RANGES, rangeOf, search, SOURCES, type Category, type Query } from './data';

const IANA_SEARCH = 'https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.xhtml';

function PortCard({ port, onShow }: { port: number; onShow: (text: string) => void }) {
  const range = RANGES[rangeOf(port)];
  const entry = PORTS.find((p) => p.port === port);
  return (
    <div className="port-card" aria-live="polite">
      <h2>
        Port {port} <span className="muted small">{range.name}</span>
      </h2>
      <p className="small">
        Range {range.span}. {range.about}
      </p>
      {entry ? (
        <p>
          <strong>{entry.title}</strong> ({entry.service}, {entry.transports.join(' and ')}): {entry.about}
          {entry.related && (
            <>
              {' '}
              <button type="button" className="link-button" onClick={() => onShow(String(entry.related))}>
                See port {entry.related}
              </button>
            </>
          )}
        </p>
      ) : (
        <p className="small">
          Not in this list of common ports. Look it up in the <a href={IANA_SEARCH}>IANA registry</a>; many ports are unassigned or used by applications without registration.
        </p>
      )}
    </div>
  );
}

/** Well-known ports: a searchable reference with the port ranges of RFC 6335. */
export default function PortsTool() {
  const [query, setQuery] = useState<Query>({ text: '', transport: 'all', category: 'all' });
  const searchId = useId();
  const categoryId = useId();
  const results = search(query);
  const number = /^\d{1,5}$/.test(query.text.trim()) ? Number(query.text.trim()) : undefined;
  const show = (text: string) => setQuery({ text, transport: 'all', category: 'all' });

  return (
    <div className="index tool ports-tool">
      <h1>Well-known ports</h1>
      <p className="lead">The ports you meet most often in networks, with their transport, purpose and the specification that assigns them. Type a number to see which range it belongs to.</p>

      <div className="tool-input ports-input">
        <div className="field wide">
          <label htmlFor={searchId}>Port or name</label>
          <input id={searchId} type="search" value={query.text} onChange={(e) => setQuery({ ...query, text: e.target.value })} placeholder="443, dns, mail ..." autoComplete="off" spellCheck={false} />
        </div>
        <fieldset className="field segmented">
          <legend>Transport</legend>
          {(['all', 'TCP', 'UDP'] as const).map((t) => (
            <label key={t}>
              <input type="radio" name="transport" checked={query.transport === t} onChange={() => setQuery({ ...query, transport: t })} />
              {t === 'all' ? 'All' : t}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor={categoryId}>Category</label>
          <select id={categoryId} value={query.category} onChange={(e) => setQuery({ ...query, category: e.target.value as 'all' | Category })}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {number !== undefined && number <= 65535 && <PortCard port={number} onShow={show} />}
      {number !== undefined && number > 65535 && (
        <p className="notice" role="alert">
          Ports are 16-bit numbers: the highest is 65535.
        </p>
      )}

      <section aria-labelledby="h-list">
        <h2 id="h-list">
          {results.length === PORTS.length ? `All ${PORTS.length} ports` : `${results.length} of ${PORTS.length} ports`}
        </h2>
        {results.length === 0 ? (
          <p className="muted">No port matches.</p>
        ) : (
          <table className="ports-table">
            <thead>
              <tr>
                <th scope="col">Port</th>
                <th scope="col">Service</th>
                <th scope="col">Transport</th>
                <th scope="col">What it is</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {results.map((p) => (
                <tr key={p.port}>
                  <td className="mono port">{p.port}</td>
                  <td>
                    <strong>{p.title}</strong>
                    <span className="mono small muted"> {p.service}</span>
                  </td>
                  <td className="mono small">{p.transports.join(', ')}</td>
                  <td className="small">
                    {p.about}
                    {p.related && (
                      <>
                        {' '}
                        <button type="button" className="link-button" onClick={() => show(String(p.related))}>
                          Port {p.related}
                        </button>
                      </>
                    )}
                    {p.exchange && (
                      <>
                        {' '}
                        <a href={href.exchange(p.exchange)}>See the exchange</a>
                      </>
                    )}
                  </td>
                  <td className="small">
                    <SourceLink source={p.source} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="h-how">
        <h2 id="h-how">How ports work</h2>
        <div className="prose">
          <p>
            An IP address identifies a host; a port identifies a process on it. Ports are 16-bit numbers in the TCP and UDP headers, so they range from 0 to 65535. A connection is identified by five values: protocol, source address, source port, destination address and destination port. That is why a server can talk to thousands of clients on the same port 443.
          </p>
          <p>
            TCP and UDP have separate port spaces: TCP port 53 and UDP port 53 are different endpoints. IANA usually registers a service for both, even if it only uses one. Some protocols have no port at all because they do not run on TCP or UDP: ICMP, OSPF (IP protocol 89) and ESP of IPsec (IP protocol 50).
          </p>
          <p>
            Servers listen on a fixed, known port so clients can find them. Clients use a temporary source port that the operating system picks from its dynamic range. On a host, <span className="mono">ss -tulpn</span> (Linux) or <span className="mono">netstat -ano</span> (Windows) lists the ports that are open and the processes behind them.
          </p>
          <p>A port number is a convention, not a guarantee: any service can listen on any port, and a firewall rule for "port 443" does not prove that the traffic is HTTPS.</p>
        </div>
      </section>

      <section aria-labelledby="h-sources">
        <h2 id="h-sources">Sources</h2>
        <SourceList sources={SOURCES} />
      </section>
    </div>
  );
}
