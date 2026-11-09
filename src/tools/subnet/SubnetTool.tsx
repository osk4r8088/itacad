import { useId, useMemo, useState } from 'react';
import { SourceLink, SourceList } from '../../shared/components/SourceList';
import { classify, formatIpv4, historicalClass, MAX_PREFIX, parseInput, roleOf, SOURCES, subnet, toBits, type Ipv4, type Subnet } from './logic';

const EXAMPLES = ['192.0.2.77/26', '172.16.35.123/20', '10.1.2.3/8', '198.51.100.7/31'];
const DEFAULT = EXAMPLES[0];

const n = (value: number) => value.toLocaleString('en-US');

/** One row of the bit view: 32 bits in four octets, network bits marked. */
function BitRow({ label, value, prefix }: { label: string; value: Ipv4; prefix: number }) {
  const bits = toBits(value);
  const dotted = [0, 8, 16, 24].map((i) => bits.slice(i, i + 8)).join('.');
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="bits" aria-label={dotted}>
        {[0, 1, 2, 3].map((octet) => (
          <span key={octet} className="octet" aria-hidden="true">
            {bits
              .slice(octet * 8, octet * 8 + 8)
              .split('')
              .map((b, i) => {
                const pos = octet * 8 + i;
                return (
                  <span key={pos} className={`bit ${pos < prefix ? 'net' : 'host'}${pos === prefix && prefix > 0 ? ' edge' : ''}`}>
                    {b}
                  </span>
                );
              })}
          </span>
        ))}
      </td>
      <td className="mono">{formatIpv4(value)}</td>
    </tr>
  );
}

function Results({ s }: { s: Subnet }) {
  const special = classify(s.address);
  const role = roleOf(s);
  const hostBits = MAX_PREFIX - s.prefix;
  return (
    <table className="kv">
      <tbody>
        <tr>
          <th scope="row">Network address</th>
          <td className="mono">
            {formatIpv4(s.network)}/{s.prefix}
          </td>
        </tr>
        <tr>
          <th scope="row">Broadcast address</th>
          <td className="mono">{s.rule === 'normal' ? formatIpv4(s.broadcast) : <span className="muted">none ({s.rule === 'single-host' ? 'single host' : 'point-to-point link'})</span>}</td>
        </tr>
        <tr>
          <th scope="row">Host range</th>
          <td className="mono">{s.hosts === 1 ? formatIpv4(s.firstHost) : `${formatIpv4(s.firstHost)} to ${formatIpv4(s.lastHost)}`}</td>
        </tr>
        <tr>
          <th scope="row">Usable hosts</th>
          <td>
            {n(s.hosts)}
            {s.rule === 'normal' && (
              <span className="muted">
                {' '}
                = 2<sup>{hostBits}</sup> - 2
              </span>
            )}
          </td>
        </tr>
        <tr>
          <th scope="row">Addresses in block</th>
          <td>
            {n(s.total)}{' '}
            <span className="muted">
              = 2<sup>{hostBits}</sup>
            </span>
          </td>
        </tr>
        <tr>
          <th scope="row">Subnet mask</th>
          <td className="mono">{formatIpv4(s.mask)}</td>
        </tr>
        <tr>
          <th scope="row">Wildcard mask</th>
          <td className="mono">{formatIpv4(s.wildcard)}</td>
        </tr>
        <tr>
          <th scope="row">This address is</th>
          <td>
            {role === 'host' ? 'a host address' : role === 'network' ? 'the network address, not usable for a host' : 'the broadcast address, not usable for a host'}
          </td>
        </tr>
        <tr>
          <th scope="row">Address type</th>
          <td>
            {special ? (
              <>
                {special.name} <span className="muted">({formatIpv4(special.network)}/{special.prefix}, <SourceLink source={special.source} />)</span>
              </>
            ) : (
              'Public unicast'
            )}
          </td>
        </tr>
        <tr>
          <th scope="row">Historical class</th>
          <td>
            {historicalClass(s.address)} <span className="muted">(before CIDR, see below)</span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Explanation({ s }: { s: Subnet }) {
  const hostBits = MAX_PREFIX - s.prefix;
  return (
    <div className="prose">
      <h2>How it works</h2>
      <p>
        The prefix length /{s.prefix} says that the first {s.prefix} bits of the address identify the network and the remaining {hostBits} bits identify a host in it. The subnet mask is the same information written as an address: {s.prefix} one bits followed by {hostBits} zero bits, here {formatIpv4(s.mask)}.
      </p>
      <p>
        The <strong>network address</strong> is the address with all host bits set to 0, computed as address AND mask. The <strong>broadcast address</strong> has all host bits set to 1. Neither may be assigned to a host (RFC 1122, section 3.2.1.3), so a subnet with h host bits has 2<sup>h</sup> - 2 usable addresses.
      </p>
      <p>
        Two prefix lengths are special. In a /31 there is no room for network and broadcast addresses, and RFC 3021 allows both addresses as hosts on a point-to-point link, where a broadcast is not needed. A /32 is a single address, used for loopback interfaces and host routes.
      </p>
      <p>
        The <strong>wildcard mask</strong> is the inverted subnet mask. It is not defined by the IP standards; Cisco IOS uses it in access lists and OSPF network statements, where a 0 bit means "must match".
      </p>
      <p>
        <strong>Address classes</strong> are the original scheme: the first bits of an address fixed the network size (class A /8 starts with 0, B /16 with 10, C /24 with 110, D with 1110 is multicast, E with 1111 is reserved). CIDR replaced classes in 1993 (RFC 1519, today RFC 4632), so the prefix length, not the class, decides the size of a network.
      </p>
    </div>
  );
}

/** Subnet calculator: one IPv4 address and prefix, shown as bits, values and explanation. */
export default function SubnetTool() {
  const [text, setText] = useState(DEFAULT);
  const [prefix, setPrefix] = useState(26);
  const inputId = useId();
  const sliderId = useId();
  const errorId = useId();

  const parsed = useMemo(() => parseInput(text), [text]);
  const address = parsed.ok ? parsed.address : undefined;
  const s = address === undefined ? undefined : subnet(address, prefix);

  const onText = (value: string) => {
    setText(value);
    const r = parseInput(value);
    if (r.ok && r.prefix !== undefined) setPrefix(r.prefix);
  };

  const onPrefix = (value: number) => {
    setPrefix(value);
    if (address !== undefined) setText(`${formatIpv4(address)}/${value}`);
  };

  return (
    <div className="index tool subnet-tool">
      <h1>Subnet calculator</h1>
      <p className="lead">Enter an IPv4 address with a prefix length or subnet mask. Move the slider to see how the boundary between network and host bits changes the subnet.</p>

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

      {s && (
        <>
          <section aria-labelledby="h-bits">
            <h2 id="h-bits">Bits</h2>
            <div className="table-scroll">
              <table className="bit-table">
                <tbody>
                  <BitRow label="Address" value={s.address} prefix={s.prefix} />
                  <BitRow label="Mask" value={s.mask} prefix={s.prefix} />
                  <BitRow label="Network" value={s.network} prefix={s.prefix} />
                  <BitRow label="Broadcast" value={s.broadcast} prefix={s.prefix} />
                </tbody>
              </table>
            </div>
            <p className="legend small">
              <span className="bit net">1</span> network bits (first {s.prefix}) <span className="bit host">0</span> host bits (last {MAX_PREFIX - s.prefix})
            </p>
          </section>

          <section aria-labelledby="h-result">
            <h2 id="h-result">Result</h2>
            <Results s={s} />
          </section>

          <Explanation s={s} />
        </>
      )}

      <section aria-labelledby="h-sources">
        <h2 id="h-sources">Sources</h2>
        <SourceList sources={SOURCES} />
      </section>
    </div>
  );
}
