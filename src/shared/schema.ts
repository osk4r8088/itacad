// Data model for protocol exchanges.
//
// Header *definitions* (field names, sizes, meaning, sources) live in src/headers
// and are shared by all exchanges. Exchange files in src/exchanges only supply
// participants, steps, texts and field values. The components render this data
// and contain no protocol-specific code.

export type OsiLayer = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Layers of the Internet model as named in RFC 1122, section 1.1.3. */
export type TcpIpLayer = 'link' | 'internet' | 'transport' | 'application';

export type Source =
  | { rfc: number; section?: string; note?: string }
  | { spec: string; section?: string; url?: string; note?: string };

export interface FieldDef {
  id: string;
  /** Name as used in the defining specification. */
  name: string;
  /** Abbreviation for narrow cells in the header diagram (for example flag bits). */
  short?: string;
  /** Size in bits, or 'variable' when the instance decides the size. */
  bits: number | 'variable';
  about: string;
  source?: Source;
  /** Draw as one row in the header diagram, not to scale (long opaque data). */
  compact?: boolean;
}

/** A structure made of fields: a protocol header or a sub-structure such as a TCP option. */
export interface StructDef {
  id: string;
  name: string;
  about: string;
  fields: FieldDef[];
  /** Fields that follow the payload (for example the Ethernet FCS). */
  trailer?: FieldDef[];
  sources: Source[];
}

/** A protocol layer that appears in the encapsulation of a packet. */
export interface LayerDef extends StructDef {
  /** Short name for compact labels, for example 'TCP'. */
  short: string;
  osi: OsiLayer[];
  tcpip: TcpIpLayer;
  /** Explanation when the OSI mapping is approximate or debated. */
  osiNote?: string;
}

export interface FieldValue {
  /** Human readable value, for example "0x0800 (IPv4)". */
  display: string;
  /** Actual size of this field in this instance, in bits. */
  bits: number;
  note?: string;
  /** Set when a value or statement is not verified against a source. Rendered visibly. */
  unverified?: string;
  /** Sub-structures inside a variable field, for example the list of TCP options. */
  items?: StructInstance[];
}

export interface StructInstance<D extends StructDef = StructDef> {
  def: D;
  values: Record<string, FieldValue>;
  /** Encoded bytes of the header fields (without payload and trailer). */
  bytes: Uint8Array;
  /** Encoded bytes of the trailer fields, if the definition has a trailer. */
  trailerBytes?: Uint8Array;
  /** One-line summary shown in the layer stack. */
  summary?: string;
}

export type LayerInstance = StructInstance<LayerDef>;

/** One frame as it is seen on one link. Layers are ordered outermost first. */
export interface Capture {
  link: string;
  note?: string;
  layers: LayerInstance[];
}

export type ParticipantKind = 'host' | 'server' | 'router' | 'switch' | 'resolver' | 'internet' | 'attacker';

export interface Participant {
  id: string;
  label: string;
  kind: ParticipantKind;
  addr?: { mac?: string; ipv4?: string; ipv6?: string };
  /** Position in the network view, in grid units. */
  pos: { x: number; y: number };
  /** Whether the participant has a lifeline in the sequence view. */
  lifeline: boolean;
  note?: string;
}

export interface Link {
  id: string;
  a: string;
  b: string;
  label: string;
}

export interface FieldRef {
  /** LayerDef id, for example 'tcp'. */
  layer: string;
  /** FieldDef id, for example 'seq'. */
  field: string;
}

export interface StepDetails {
  what: string;
  why: string;
  keyFields: FieldRef[];
  typical?: string;
  wrong?: string;
  insight?: string;
}

export interface Step {
  id: string;
  from: string;
  to: string;
  /** Participants the message passes, from sender to receiver. */
  path: string[];
  /** Further paths taken by copies of the same message, for broadcast or flooding. */
  extraPaths?: string[][];
  /** Short arrow label for the sequence view. */
  label: string;
  /** Protocol state of participants after this step, only where it changes. */
  states?: Record<string, string>;
  details: StepDetails;
  /** Frames on the links of interest. The first one is shown by default. */
  captures: Capture[];
  sources: Source[];

  // ---- packet flow table
  /** When the sender transmits the message, in milliseconds since the first step. */
  time: number;
  /** Id of a category from Exchange.categories, used for the color in the flow table. */
  category: string;
  /** Protocol column in the flow table, for example 'TCP'. */
  protocol: string;
  /** Info column in the flow table, in the style of a packet analyzer. */
  info: string;
  /** The message is lost on the way and never reaches the receiver. */
  lost?: boolean;

  // ---- exchanges that chain several protocols
  /** Id of a phase from Exchange.phases. */
  phase?: string;
  /** What the sender or receiver knows after this step, shown in a "known so far" panel. */
  learned?: Learned[];
}

export interface Learned {
  /** Stable name across the exchange, for example "Server IP". */
  label: string;
  value: string;
}

/** A section of a long exchange, for example "DNS" in "From URL to page". */
export interface Phase {
  id: string;
  label: string;
  about: string;
  /** Id of the exchange that shows this protocol in detail. */
  deepDive?: string;
}

export type CategoryColor = 'green' | 'yellow' | 'purple' | 'gray' | 'blue' | 'red';

export interface Category {
  id: string;
  label: string;
  color: CategoryColor;
}

export interface Exchange {
  id: string;
  title: string;
  /** Short line for the index page. */
  summary: string;
  /** Group on the index page, for example 'Transport'. */
  group: string;
  scenario: string;
  intro: string;
  sources: Source[];
  participants: Participant[];
  links: Link[];
  /** Protocol state of participants before the first step. */
  initialStates?: Record<string, string>;
  /** Legend of the packet flow table. */
  categories: Category[];
  steps: Step[];
  /** Sections of an exchange that chains protocols. Every step then names its phase. */
  phases?: Phase[];
}
