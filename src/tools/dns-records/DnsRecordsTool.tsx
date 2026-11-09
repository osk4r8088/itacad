import { useMemo, useState, type ReactNode } from 'react';
import { HeaderDiagram } from '../../shared/components/HeaderDiagram';
import { FieldInfo, LayerInfo } from '../../shared/components/FieldInfo';
import { SourceLink, SourceList } from '../../shared/components/SourceList';
import type { Source } from '../../shared/schema';
import { GROUPS, TYPES, typeInfo } from './types';
import { ORIGIN, OTHER, ZONE, illustrative, present, relative } from './zone';
import { recordInstance } from './record';
import type { Record, RrType } from './wire';

interface Entry {
  rec: Record;
  zone: string;
  about?: string;
}

const ENTRIES: Entry[] = [...ZONE.map((rec) => ({ rec, zone: ORIGIN })), ...OTHER.map((o) => ({ rec: o.record, zone: o.zone, about: o.about }))];
const indexOf = (owner: string, type: RrType) => ENTRIES.findIndex((e) => e.rec.owner === owner && e.rec.rdata.type === type);

/** The first RDATA field, selected when the RDATA part of a record line is clicked. */
const firstRdataField = (t: RrType) => typeInfo(t).fields[0].id;

function RecordLine({ entry, selected, field, onPick }: { entry: Entry; selected: boolean; field?: string; onPick: (field?: string) => void }) {
  const p = present(entry.rec);
  const parts: [string, string, string][] = [
    ['owner', p.owner, 'name'],
    ['ttl', p.ttl, 'ttl'],
    ['cls', p.cls, 'class'],
    ['type', p.type, 'type'],
    ['rdata', p.rdata, firstRdataField(entry.rec.rdata.type)],
  ];
  return (
    <div className={`rr-line${selected ? ' selected' : ''}`}>
      {parts.map(([cls, text, fieldId]) => (
        <button key={cls} type="button" className={`rr-part rr-${cls}${selected && field === fieldId ? ' on' : ''}`} onClick={() => onPick(fieldId)} title={`Select the ${fieldId === 'name' ? 'owner name' : fieldId} field`}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Ref({ owner, type, onShow, children }: { owner: string; type: RrType; onShow: (i: number) => void; children: ReactNode }) {
  return (
    <button type="button" className="link-button mono" onClick={() => onShow(indexOf(owner, type))}>
      {children}
    </button>
  );
}

const MISTAKES: { title: string; text: string; source: Source }[] = [
  { title: 'CNAME at the apex or next to other records', text: 'A name with a CNAME may hold nothing else, and the apex always holds SOA and NS. Use A and AAAA records, an HTTPS record in AliasMode, or the "ALIAS" feature of the DNS provider.', source: { rfc: 2181, section: '10.1' } },
  { title: 'MX or NS pointing to a CNAME', text: 'Mail servers and name servers must be named by their canonical name. Many senders tolerate it, some do not.', source: { rfc: 2181, section: '10.3' } },
  { title: 'Missing glue', text: 'When ns1.example.com serves example.com, the parent zone needs its address too. Without glue the delegation points at a name that can only be resolved through itself.', source: { rfc: 9499, section: '7' } },
  { title: 'Forgotten trailing dot', text: 'In a zone file, names without a final dot are relative to the origin: "mail.example.com" becomes mail.example.com.example.com.', source: { rfc: 1035, section: '5.1' } },
  { title: 'Serial not increased', text: 'Secondary name servers only transfer the zone when the SOA serial grows, so they keep serving the old records.', source: { rfc: 1035, section: '3.3.13' } },
  { title: 'Two SPF records, or too many lookups', text: 'More than one v=spf1 record on a name is a permanent error, and evaluating a record may need at most 10 DNS lookups.', source: { rfc: 7208, section: '4.5' } },
  { title: 'High TTL during a migration', text: 'Resolvers keep old answers for up to the TTL. Lower it a full old TTL before the change, switch, then raise it again.', source: { rfc: 1035, section: '3.2.1' } },
  { title: 'Stale DS at the registrar', text: 'If the DS in the parent no longer matches the keys of the zone, for example after moving to a provider without DNSSEC, validating resolvers return SERVFAIL for the whole domain.', source: { rfc: 4035, section: '5' } },
];

/** DNS record explorer: record types, their wire format, and an example zone where they work together. */
export default function DnsRecordsTool() {
  const [selected, setSelected] = useState(indexOf('example.com.', 'MX'));
  const [field, setField] = useState<string | undefined>(undefined);
  const entry = ENTRIES[selected];
  const type = entry.rec.rdata.type;
  const info = typeInfo(type);
  const inst = useMemo(() => recordInstance(entry.rec), [entry]);
  const examples = ENTRIES.map((e, i) => [e, i] as const).filter(([e]) => e.rec.rdata.type === type);
  const note = illustrative(entry.rec);

  const show = (i: number, f?: string) => {
    setSelected(i);
    setField(f);
  };
  const showAndScroll = (i: number) => {
    show(i);
    document.getElementById('h-type')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="index tool dns-records-tool">
      <h1>DNS records</h1>
      <p className="lead">Which record types exist, what each one is for, and how they look in a zone file and on the wire. All examples come from one zone, example.com, so you can see how the records work together.</p>

      <nav className="rr-types" aria-label="Record types">
        {GROUPS.map((g) => (
          <div key={g} className="rr-group">
            <span className="muted small">{g}</span>
            <div>
              {TYPES.filter((t) => t.group === g).map((t) => (
                <button key={t.type} type="button" className={`chip${t.type === type ? ' active' : ''}`} aria-pressed={t.type === type} onClick={() => show(ENTRIES.findIndex((e) => e.rec.rdata.type === t.type))}>
                  {t.type}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <section className="rr-layout" aria-labelledby="h-type">
        <div className="rr-about">
          <h2 id="h-type">
            {type} <span className="muted">{info.title}</span>
          </h2>
          <p className="small muted">
            Type {info.code}, defined in <SourceLink source={info.source} />
          </p>
          <p>{info.purpose}</p>
          <ul className="small">
            {info.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <h3>{examples.length > 1 ? 'Records of this type in the example' : 'In the example'}</h3>
          <div className="rr-list">
            {examples.map(([e, i]) => (
              <div key={i}>
                <RecordLine entry={e} selected={i === selected} field={field} onPick={(f) => show(i, f)} />
                {e.about && <p className="small muted rr-zone-note">Zone {e.zone}: {e.about}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="rr-wire">
          <h3>On the wire</h3>
          <p className="small muted">
            Click a part of the record line or a field. {inst.bytes.length} octets, owner name written without compression.
          </p>
          {note && <p className="notice small">{note}</p>}
          <HeaderDiagram inst={inst} payloadOctets={0} selected={field} onSelect={setField} />
          {field ? <FieldInfo inst={inst} fieldId={field} onClose={() => setField(undefined)} /> : <LayerInfo layer={inst} />}
        </div>
      </section>

      <section aria-labelledby="h-zone">
        <h2 id="h-zone">The example zone</h2>
        <p className="small muted">As it would appear in a zone file. Names without a final dot are relative to $ORIGIN, "@" is the origin itself. Click a line to look at the record.</p>
        <div className="zone-file mono">
          <div className="zone-directive">$ORIGIN {ORIGIN}</div>
          <div className="zone-directive">$TTL 3600</div>
          {ENTRIES.map((e, i) =>
            e.zone !== ORIGIN ? null : (
              <button key={i} type="button" className={`zone-line${i === selected ? ' selected' : ''}`} onClick={() => showAndScroll(i)}>
                <span>{relative(e.rec.owner)}</span>
                <span>{e.rec.ttl}</span>
                <span>IN</span>
                <span>{e.rec.rdata.type}</span>
                <span>{present(e.rec).rdata}</span>
              </button>
            ),
          )}
        </div>
        <h3>In other zones</h3>
        <div className="zone-file mono">
          {ENTRIES.map((e, i) =>
            e.zone === ORIGIN ? null : (
              <button key={i} type="button" className={`zone-line${i === selected ? ' selected' : ''}`} onClick={() => showAndScroll(i)}>
                <span>{e.rec.owner}</span>
                <span>{e.rec.ttl}</span>
                <span>IN</span>
                <span>{e.rec.rdata.type}</span>
                <span>{present(e.rec).rdata}</span>
              </button>
            ),
          )}
        </div>
      </section>

      <section aria-labelledby="h-together">
        <h2 id="h-together">How the records work together</h2>
        <div className="prose rr-stories">
          <h3>Finding the website</h3>
          <p>
            A browser asks for <Ref owner="www.example.com." type="A" onShow={showAndScroll}>www A</Ref> and <Ref owner="www.example.com." type="AAAA" onShow={showAndScroll}>www AAAA</Ref>, and also for{' '}
            <Ref owner="www.example.com." type="HTTPS" onShow={showAndScroll}>www HTTPS</Ref>, which tells it before connecting that the server speaks HTTP/2 and HTTP/3. A visitor of blog.example.com first gets the <Ref owner="blog.example.com." type="CNAME" onShow={showAndScroll}>blog CNAME</Ref> and the resolver follows it to www. The "From URL to page" lesson shows the A lookup on the wire.
          </p>
          <h3>Delivering mail</h3>
          <p>
            A server sending mail to someone@example.com looks up the <Ref owner="example.com." type="MX" onShow={showAndScroll}>MX records</Ref>, tries mail.example.com first (preference 10) and needs its <Ref owner="mail.example.com." type="A" onShow={showAndScroll}>A record</Ref>. The receiving side checks
            mail claiming to be from example.com: <Ref owner="example.com." type="TXT" onShow={showAndScroll}>SPF</Ref> says only the MX hosts may send it, the <Ref owner="2026a._domainkey.example.com." type="TXT" onShow={showAndScroll}>DKIM key</Ref> verifies the signature in the mail header, and{' '}
            <Ref owner="_dmarc.example.com." type="TXT" onShow={showAndScroll}>DMARC</Ref> says to reject mail that fails. Mail programs find the IMAP server through <Ref owner="_imaps._tcp.example.com." type="SRV" onShow={showAndScroll}>SRV</Ref>.
          </p>
          <h3>Delegation and the chain of trust</h3>
          <p>
            The com servers do not know www.example.com; they answer with the <Ref owner="example.com." type="NS" onShow={showAndScroll}>delegation</Ref> to ns1.example.com, including its address as glue. With DNSSEC, the com zone also publishes the <Ref owner="example.com." type="DS" onShow={showAndScroll}>DS</Ref>, a hash of the example.com{' '}
            <Ref owner="example.com." type="DNSKEY" onShow={showAndScroll}>DNSKEY</Ref>. That key verifies the <Ref owner="www.example.com." type="RRSIG" onShow={showAndScroll}>RRSIG</Ref> over www A, and <Ref owner="example.com." type="NSEC" onShow={showAndScroll}>NSEC</Ref> records prove which names and types do not exist. Each zone vouches for the next one down, from the root key every validating resolver knows.
          </p>
          <h3>Back from address to name</h3>
          <p>
            Logs and mail servers turn 203.0.113.80 back into a name with the <Ref owner="80.113.0.203.in-addr.arpa." type="PTR" onShow={showAndScroll}>PTR</Ref> record in the reverse zone. It is managed by the holder of the address block, so it can disagree with the forward zone.
          </p>
        </div>
      </section>

      <section aria-labelledby="h-mistakes">
        <h2 id="h-mistakes">Common mistakes</h2>
        <ul className="rr-mistakes">
          {MISTAKES.map((m) => (
            <li key={m.title}>
              <strong>{m.title}.</strong> {m.text} <span className="small"><SourceLink source={m.source} /></span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="h-sources">
        <h2 id="h-sources">Sources</h2>
        <SourceList
          sources={[
            { rfc: 1034, note: 'concepts' },
            { rfc: 1035, note: 'record format and zone files' },
            { rfc: 2181, note: 'clarifications: CNAME and other rules' },
            { rfc: 9499, note: 'DNS terminology' },
            ...TYPES.filter((t) => !('rfc' in t.source && t.source.rfc === 1035)).map((t) => ({ ...t.source, note: t.type })),
            { rfc: 7208, note: 'SPF' },
            { rfc: 6376, note: 'DKIM' },
            { rfc: 9989, note: 'DMARC' },
          ]}
        />
      </section>
    </div>
  );
}
