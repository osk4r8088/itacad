import { useId, useMemo, useState } from 'react';
import { SourceLink, SourceList } from '../../shared/components/SourceList';
import { href } from '../../app/router';
import {
  MAX_PREFIX,
  OUTSIDE_ALLOCATED,
  SOURCES,
  blocksOf,
  compress,
  countText,
  expand,
  fromMac,
  interfaceId,
  multicastInfo,
  parseInput,
  prefixOf,
  reverseName,
  solicitedNodeOf,
  textNotes,
  toBits,
  type Ipv6,
} from './logic';

const EXAMPLES = ['2001:0DB8:0000:0000:0200:5EFF:FE00:530A/64', 'fe80::1%eth0', 'fd12:3456:789a:1::25/64', 'ff02::1:ff00:530a', '::ffff:192.0.2.33', '2001:db8::/32'];
const DEFAULT = EXAMPLES[0];

/** 128 bits in eight 16-bit groups, prefix bits marked. */
function Bits({ value, prefix }: { value: Ipv6; prefix: number }) {
  const bits = toBits(value);
  const groups = expand(value).split(':');
  return (
    <div className="v6-bits" aria-label={`${prefix} prefix bits, ${MAX_PREFIX - prefix} interface bits`}>
      {groups.map((g, gi) => (
        <div key={gi} className="v6-group">
          <span className="mono small">{g}</span>
          <span className="octet" aria-hidden="true">
            {bits
              .slice(gi * 16, gi * 16 + 16)
              .split('')
              .map((b, i) => {
                const pos = gi * 16 + i;
                return (
                  <span key={pos} className={`bit ${pos < prefix ? 'net' : 'host'}${pos === prefix && prefix > 0 ? ' edge' : ''}`}>
                    {b}
                  </span>
                );
              })}
          </span>
        </div>
      ))}
    </div>
  );
}

function Results({ address, prefix, typed }: { address: Ipv6; prefix: number; typed: string }) {
  const p = prefixOf(address, prefix);
  const notes = textNotes(typed, address);
  const blocks = blocksOf(address);
  const mc = multicastInfo(address);
  const iid = interfaceId(address);
  const unicast = !mc && address !== 0n;
  const sn = unicast ? solicitedNodeOf(address) : undefined;
  return (
    <table className="kv">
      <tbody>
        <tr>
          <th scope="row">Recommended form</th>
          <td>
            <span className="mono">{compress(address)}</span>
            {notes.length > 0 && <div className="muted small">Changed from your input: {notes.join('; ')}.</div>}
          </td>
        </tr>
        <tr>
          <th scope="row">Expanded</th>
          <td className="mono">{expand(address)}</td>
        </tr>
        <tr>
          <th scope="row">Prefix</th>
          <td className="mono">
            {compress(p.network)}/{prefix}
          </td>
        </tr>
        <tr>
          <th scope="row">Range</th>
          <td className="mono">{prefix === MAX_PREFIX ? compress(p.network) : `${compress(p.network)} to ${compress(p.last)}`}</td>
        </tr>
        <tr>
          <th scope="row">Addresses in prefix</th>
          <td>
            {countText(p.hostBits)} {p.hostBits > 32 && <span className="muted">({p.hostBits} bits)</span>}
          </td>
        </tr>
        <tr>
          <th scope="row">Address type</th>
          <td>
            {blocks.length === 0 ? (
              <span>{OUTSIDE_ALLOCATED}</span>
            ) : (
              <>
                <strong>{blocks[0].name}</strong>{' '}
                <span className="muted">
                  ({blocks[0].prefix}/{blocks[0].length}, <SourceLink source={blocks[0].source} />)
                </span>
                <div>{blocks[0].about}</div>
                {blocks[0].globallyReachable !== undefined && <div className="muted small">Globally reachable: {blocks[0].globallyReachable ? 'yes' : 'no'}.</div>}
                {blocks.length > 1 && (
                  <div className="muted small">
                    Inside: {blocks.slice(1).map((b) => `${b.name} (${b.prefix}/${b.length})`).join(', ')}.
                  </div>
                )}
              </>
            )}
          </td>
        </tr>
        {mc && (
          <tr>
            <th scope="row">Multicast</th>
            <td>
              Scope {mc.scope}; {mc.transient ? 'transient (T flag set: not permanently assigned)' : 'permanently assigned (well-known)'}
              {mc.prefixBased ? ', derived from a unicast prefix (P flag)' : ''}.
              {mc.wellKnown && <div>Group: {mc.wellKnown}.</div>}
              {mc.solicitedFor && <div>Solicited-node group: Neighbor Discovery asks here for any address whose last 24 bits are 0x{mc.solicitedFor}.</div>}
            </td>
          </tr>
        )}
        {unicast && (
          <tr>
            <th scope="row">Interface ID</th>
            <td>
              <span className="mono">{iid.iid}</span> <span className="muted">(the last 64 bits)</span>
              {iid.fromMac && (
                <div className="small">
                  Contains ff:fe in the middle: probably modified EUI-64, built from MAC address <span className="mono">{iid.fromMac}</span>. Such addresses reveal the device; most systems now use random or stable private identifiers instead.
                </div>
              )}
            </td>
          </tr>
        )}
        {sn && (
          <tr>
            <th scope="row">Solicited-node group</th>
            <td>
              <span className="mono">{sn.group}</span> <span className="muted">on Ethernet</span> <span className="mono">{sn.mac}</span>
              <div className="muted small">Where Neighbor Discovery sends the question "who has this address?".</div>
            </td>
          </tr>
        )}
        <tr>
          <th scope="row">Reverse DNS name</th>
          <td className="mono v6-wrap">{reverseName(address)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function MacBuilder({ address }: { address: Ipv6 }) {
  const [mac, setMac] = useState('00:00:5e:00:53:0a');
  const id = useId();
  const result = fromMac(address, mac);
  const prefix = prefixOf(address, 64).network;
  return (
    <section aria-labelledby="h-eui">
      <h2 id="h-eui">Address from a MAC address (modified EUI-64)</h2>
      <div className="tool-input">
        <div className="field">
          <label htmlFor={id}>MAC address</label>
          <input id={id} className="mono" value={mac} onChange={(e) => setMac(e.target.value)} spellCheck={false} autoComplete="off" aria-invalid={!result} />
        </div>
      </div>
      {result === undefined ? (
        <p className="notice">Enter a MAC address as six pairs of hex digits, for example 00:00:5e:00:53:0a.</p>
      ) : (
        <p>
          In the prefix <span className="mono">{compress(prefix)}/64</span>: <strong className="mono">{compress(result)}</strong>.{' '}
          <span className="muted">
            Interface ID <span className="mono">{interfaceId(result).iid}</span>: ff:fe inserted in the middle, and the universal/local bit (0x02 of the first octet) inverted.
          </span>
        </p>
      )}
    </section>
  );
}

function Explanation() {
  return (
    <div className="prose">
      <h2>How it works</h2>
      <p>
        An IPv6 address has 128 bits, written as eight groups of four hex digits. <strong>RFC 5952</strong> fixes one recommended form so that the same address always looks the same: lowercase, no leading zeros in a group, the longest run of two or more zero groups replaced by <span className="mono">::</span> (the first one if two runs are equally long), and never <span className="mono">::</span> for a single zero group.
      </p>
      <p>
        The <strong>prefix length</strong> works as in IPv4: the first bits name the network, the rest the interface. Almost every LAN uses a /64, so that hosts can form their own interface identifiers with SLAAC. Sites usually get a /48 or /56 and cut it into /64s. There is no broadcast address and no "first and last address are unusable" rule, so every address of a prefix can be assigned.
      </p>
      <p>
        The <strong>address type</strong> follows from the first bits: link-local fe80::/10, unique local fc00::/7 (in practice fd00::/8), multicast ff00::/8, global unicast 2000::/3, plus the special-purpose blocks registered with IANA. Multicast addresses carry flags and a scope in their second octet: ff02:: is link-local scope, ff05:: site, ff0e:: global.
      </p>
      <p>
        The <strong>solicited-node group</strong> is ff02::1:ff00:0/104 plus the last 24 bits of a unicast address. Neighbor Discovery sends address resolution and duplicate checks there instead of broadcasting, so only hosts with a matching address end look at the packet. See it at work in the <a href={href.exchange('ipv6')}>IPv6, NDP and SLAAC</a> exchange.
      </p>
    </div>
  );
}

/** IPv6 address tool: canonical text form, prefix, type, derived addresses. */
export default function Ipv6Tool() {
  const [text, setText] = useState(DEFAULT);
  const [prefix, setPrefix] = useState(64);
  const inputId = useId();
  const sliderId = useId();
  const errorId = useId();

  const parsed = useMemo(() => parseInput(text), [text]);
  const address = parsed.ok ? parsed.address : undefined;

  const onText = (value: string) => {
    setText(value);
    const r = parseInput(value);
    if (r.ok) setPrefix(r.prefix ?? 128);
  };
  const onPrefix = (value: number) => {
    setPrefix(value);
    if (address !== undefined) setText(`${compress(address)}/${value}`);
  };

  return (
    <div className="index tool ipv6-tool">
      <h1>IPv6 address tool</h1>
      <p className="lead">Enter an IPv6 address, with or without a prefix length. See its recommended form, its prefix and range, what kind of address it is, and the addresses derived from it.</p>

      <div className="tool-input">
        <div className="field">
          <label htmlFor={inputId}>Address</label>
          <input
            id={inputId}
            className="mono"
            value={text}
            onChange={(e) => onText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!parsed.ok}
            aria-describedby={parsed.ok ? undefined : errorId}
          />
        </div>
        <div className="field">
          <label htmlFor={sliderId}>Prefix length /{prefix}</label>
          <input id={sliderId} type="range" min={0} max={MAX_PREFIX} value={prefix} onChange={(e) => onPrefix(Number(e.target.value))} />
        </div>
        <p className="examples small">
          Examples:{' '}
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="link-button mono" onClick={() => onText(ex)}>
              {ex}
            </button>
          ))}
        </p>
      </div>

      {!parsed.ok && (
        <p id={errorId} className="notice" role="alert">
          {parsed.error}
        </p>
      )}

      {address !== undefined && (
        <>
          <section aria-labelledby="h-bits">
            <h2 id="h-bits">Bits</h2>
            <Bits value={address} prefix={prefix} />
            <p className="legend small">
              <span className="bit net">1</span> prefix bits (first {prefix}) <span className="bit host">0</span> interface bits (last {MAX_PREFIX - prefix})
            </p>
          </section>

          <section aria-labelledby="h-result">
            <h2 id="h-result">Result</h2>
            <Results address={address} prefix={prefix} typed={text} />
          </section>

          <MacBuilder address={address} />
          <Explanation />
        </>
      )}

      <section aria-labelledby="h-sources">
        <h2 id="h-sources">Sources</h2>
        <SourceList sources={SOURCES} />
      </section>
    </div>
  );
}
