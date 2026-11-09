import type { Source } from '../../shared/schema';

// TCP connection states and transitions from RFC 9293, section 3.3.2 (Figure 5),
// plus the transitions the figure leaves out (notes below the figure, and RST handling in section 3.10.7).

export const STATES = [
  'CLOSED',
  'LISTEN',
  'SYN-SENT',
  'SYN-RECEIVED',
  'ESTABLISHED',
  'FIN-WAIT-1',
  'FIN-WAIT-2',
  'CLOSE-WAIT',
  'CLOSING',
  'LAST-ACK',
  'TIME-WAIT',
] as const;
export type State = (typeof STATES)[number];

const S332: Source = { rfc: 9293, section: '3.3.2' };

export const STATE_INFO: Record<State, { about: string; phase: 'closed' | 'open' | 'data' | 'close' }> = {
  CLOSED: { phase: 'closed', about: 'No connection exists. A conceptual state: there is no TCB (Transmission Control Block) for it.' },
  LISTEN: { phase: 'open', about: 'Waiting for a connection request from any remote TCP and port. A server socket after listen() is here.' },
  'SYN-SENT': { phase: 'open', about: 'A SYN was sent; waiting for a matching SYN from the peer.' },
  'SYN-RECEIVED': { phase: 'open', about: 'A SYN was received and answered with SYN,ACK; waiting for the ACK of our SYN.' },
  ESTABLISHED: { phase: 'data', about: 'The connection is open. Data received can be delivered to the application. The normal state for data transfer.' },
  'FIN-WAIT-1': { phase: 'close', about: 'Our FIN was sent. Waiting for its ACK, or for a FIN from the peer.' },
  'FIN-WAIT-2': { phase: 'close', about: 'Our FIN was acknowledged. Waiting for the FIN of the peer. Data from the peer can still arrive (half-close).' },
  'CLOSE-WAIT': { phase: 'close', about: 'The peer sent FIN. Waiting for the local application to close. We can still send data.' },
  CLOSING: { phase: 'close', about: 'Both sides sent FIN at about the same time. Waiting for the ACK of our FIN.' },
  'LAST-ACK': { phase: 'close', about: 'We sent our FIN after receiving the FIN of the peer. Waiting for the ACK of our FIN.' },
  'TIME-WAIT': {
    phase: 'close',
    about:
      'Waiting 2 MSL (maximum segment lifetime) so the peer surely received our last ACK, and so delayed segments of this connection cannot be mistaken for a new connection with the same ports. Only the side that closed first goes through TIME-WAIT.',
  },
};

export type EventKind = 'user' | 'segment' | 'timer';

export interface Transition {
  id: string;
  from: State;
  to: State;
  kind: EventKind;
  /** Event label as in RFC 9293 Figure 5. */
  event: string;
  /** Action label as in RFC 9293 Figure 5, if any. */
  action?: string;
  about: string;
  /** Drawn in RFC 9293 Figure 5. Others come from the notes and section 3.10.7. */
  inFigure: boolean;
  /** Only allowed for a connection that came from LISTEN (passive open). */
  passiveOnly?: boolean;
  activeOnly?: boolean;
  /** Where the transition happens in the TCP exchange of this site. */
  exchange?: { step: string; participant: 'client' | 'server' };
  source: Source;
}

const rst = (from: State, about: string): Transition => ({
  id: `${from.toLowerCase()}-rst`,
  from,
  to: 'CLOSED',
  kind: 'segment',
  event: 'rcv RST',
  about,
  inFigure: false,
  source: { rfc: 9293, section: '3.10.7.4' },
});

export const TRANSITIONS: Transition[] = [
  // ---- opening
  { id: 'passive-open', from: 'CLOSED', to: 'LISTEN', kind: 'user', event: 'passive OPEN', action: 'create TCB', about: 'The application opens a socket for incoming connections (listen()). Nothing is sent.', inFigure: true, source: S332 },
  { id: 'active-open', from: 'CLOSED', to: 'SYN-SENT', kind: 'user', event: 'active OPEN', action: 'create TCB, snd SYN', about: 'The application connects (connect()). TCP picks an initial sequence number and sends a SYN.', inFigure: true, exchange: { step: 'syn', participant: 'client' }, source: S332 },
  { id: 'listen-syn', from: 'LISTEN', to: 'SYN-RECEIVED', kind: 'segment', event: 'rcv SYN', action: 'snd SYN,ACK', about: 'A SYN arrives. The server answers with its own SYN and acknowledges the SYN of the client.', inFigure: true, exchange: { step: 'synack', participant: 'server' }, source: S332 },
  { id: 'listen-send', from: 'LISTEN', to: 'SYN-SENT', kind: 'user', event: 'SEND', action: 'snd SYN', about: 'The application sends data on a listening socket, which turns it into an active open. Allowed by the specification, but socket APIs do not offer it.', inFigure: true, source: S332 },
  { id: 'listen-close', from: 'LISTEN', to: 'CLOSED', kind: 'user', event: 'CLOSE', action: 'delete TCB', about: 'The application stops listening. Nothing is sent.', inFigure: true, source: S332 },
  { id: 'synsent-syn', from: 'SYN-SENT', to: 'SYN-RECEIVED', kind: 'segment', event: 'rcv SYN', action: 'snd SYN,ACK', about: 'Simultaneous open: both sides sent a SYN at the same time, so a SYN without ACK arrives. Each side answers with SYN,ACK. Rare in practice.', inFigure: true, source: S332 },
  { id: 'synsent-synack', from: 'SYN-SENT', to: 'ESTABLISHED', kind: 'segment', event: 'rcv SYN,ACK', action: 'snd ACK', about: 'The SYN,ACK of the server arrives. The client acknowledges it, and the connection is open for the client.', inFigure: true, exchange: { step: 'synack', participant: 'client' }, source: S332 },
  { id: 'synsent-close', from: 'SYN-SENT', to: 'CLOSED', kind: 'user', event: 'CLOSE', action: 'delete TCB', about: 'The application gives up before an answer arrived.', inFigure: true, source: S332 },
  { id: 'synrcvd-ack', from: 'SYN-RECEIVED', to: 'ESTABLISHED', kind: 'segment', event: 'rcv ACK of SYN', about: 'The ACK of our SYN arrives. The handshake is complete; the server hands the connection to accept().', inFigure: true, exchange: { step: 'ack', participant: 'server' }, source: S332 },
  { id: 'synrcvd-close', from: 'SYN-RECEIVED', to: 'FIN-WAIT-1', kind: 'user', event: 'CLOSE', action: 'snd FIN', about: 'The application closes before the handshake completed. TCP sends a FIN once the ACK is there.', inFigure: true, source: S332 },
  {
    id: 'synrcvd-rst-passive',
    from: 'SYN-RECEIVED',
    to: 'LISTEN',
    kind: 'segment',
    event: 'rcv RST',
    about: 'The client resets the half-open connection. Because it came from LISTEN, the server simply goes back to listening (note 1 of Figure 5).',
    inFigure: true,
    passiveOnly: true,
    source: S332,
  },
  // ---- closing
  { id: 'estab-close', from: 'ESTABLISHED', to: 'FIN-WAIT-1', kind: 'user', event: 'CLOSE', action: 'snd FIN', about: 'Active close: the application has no more data to send and closes. TCP sends FIN.', inFigure: true, exchange: { step: 'fin-client', participant: 'client' }, source: S332 },
  { id: 'estab-fin', from: 'ESTABLISHED', to: 'CLOSE-WAIT', kind: 'segment', event: 'rcv FIN', action: 'snd ACK', about: 'Passive close: the peer is done sending. TCP acknowledges the FIN and tells the application (read() returns 0).', inFigure: true, exchange: { step: 'fin-client', participant: 'server' }, source: S332 },
  { id: 'fw1-ack', from: 'FIN-WAIT-1', to: 'FIN-WAIT-2', kind: 'segment', event: 'rcv ACK of FIN', about: 'Our FIN is acknowledged. The peer may still send data until it closes too.', inFigure: true, exchange: { step: 'ack-fin-client', participant: 'client' }, source: S332 },
  { id: 'fw1-fin', from: 'FIN-WAIT-1', to: 'CLOSING', kind: 'segment', event: 'rcv FIN', action: 'snd ACK', about: 'Simultaneous close: the FIN of the peer arrives before the ACK of our FIN.', inFigure: true, source: S332 },
  {
    id: 'fw1-finack',
    from: 'FIN-WAIT-1',
    to: 'TIME-WAIT',
    kind: 'segment',
    event: 'rcv FIN, ACK of FIN',
    action: 'snd ACK',
    about: 'The peer acknowledges our FIN and sends its own FIN in the same segment. Left out of the figure for simplicity (note 2).',
    inFigure: false,
    source: S332,
  },
  { id: 'fw2-fin', from: 'FIN-WAIT-2', to: 'TIME-WAIT', kind: 'segment', event: 'rcv FIN', action: 'snd ACK', about: 'The FIN of the peer arrives. We send the last ACK and wait in TIME-WAIT in case it gets lost.', inFigure: true, exchange: { step: 'fin-server', participant: 'client' }, source: S332 },
  { id: 'closewait-close', from: 'CLOSE-WAIT', to: 'LAST-ACK', kind: 'user', event: 'CLOSE', action: 'snd FIN', about: 'The application closes its side too. TCP sends FIN.', inFigure: true, exchange: { step: 'fin-server', participant: 'server' }, source: S332 },
  { id: 'closing-ack', from: 'CLOSING', to: 'TIME-WAIT', kind: 'segment', event: 'rcv ACK of FIN', about: 'The ACK of our FIN arrives after a simultaneous close. Both sides go through TIME-WAIT.', inFigure: true, source: S332 },
  { id: 'lastack-ack', from: 'LAST-ACK', to: 'CLOSED', kind: 'segment', event: 'rcv ACK of FIN', about: 'The last ACK arrives. The passive closer deletes the connection right away; it does not wait.', inFigure: true, exchange: { step: 'ack-fin-server', participant: 'server' }, source: S332 },
  {
    id: 'timewait-timeout',
    from: 'TIME-WAIT',
    to: 'CLOSED',
    kind: 'timer',
    event: 'Timeout=2MSL',
    action: 'delete TCB',
    about: 'After twice the maximum segment lifetime the connection is deleted. RFC 9293 sets MSL to 2 minutes; Linux keeps TIME-WAIT for 60 seconds.',
    inFigure: true,
    source: S332,
  },
  // ---- resets (RFC 9293 section 3.10.7.3 and 3.10.7.4); not drawn in the figure (note 3)
  { ...rst('SYN-SENT', 'The other host refuses the connection, for example because nothing listens on the port. RFC 9293 signals "connection reset" to the application; socket APIs report it as "connection refused" (ECONNREFUSED).'), source: { rfc: 9293, section: '3.10.7.3' } },
  { ...rst('SYN-RECEIVED', 'The connection came from an active open (simultaneous open). A reset means the connection was refused.'), activeOnly: true },
  rst('ESTABLISHED', 'The peer aborts the connection. Pending reads and writes fail with "connection reset".'),
  rst('FIN-WAIT-1', 'The peer aborts the connection during the close.'),
  rst('FIN-WAIT-2', 'The peer aborts the connection during the close.'),
  rst('CLOSE-WAIT', 'The peer aborts the connection while we still had data to send.'),
  rst('CLOSING', 'The connection is aborted during a simultaneous close.'),
  rst('LAST-ACK', 'The connection is aborted while waiting for the last ACK.'),
  rst('TIME-WAIT', 'A reset ends TIME-WAIT early ("TIME-WAIT assassination"). RFC 1337 recommends ignoring RST in TIME-WAIT, and many stacks do.'),
];

export interface Context {
  /** The connection reached SYN-RECEIVED from LISTEN. */
  passive: boolean;
}

export function available(state: State, ctx: Context): Transition[] {
  return TRANSITIONS.filter((t) => t.from === state && !(t.passiveOnly && !ctx.passive) && !(t.activeOnly && ctx.passive));
}

/** Follows a list of transitions from CLOSED, returning the visited states. Throws on an impossible path. */
export function run(ids: string[], start: State = 'CLOSED'): { states: State[]; ctx: Context } {
  let state = start;
  let ctx: Context = { passive: false };
  const states: State[] = [state];
  for (const id of ids) {
    const t = available(state, ctx).find((x) => x.id === id);
    if (!t) throw new Error(`transition ${id} is not possible in ${state}`);
    ctx = next(ctx, t);
    state = t.to;
    states.push(state);
  }
  return { states, ctx };
}

export function next(ctx: Context, t: Transition): Context {
  if (t.to === 'SYN-RECEIVED') return { passive: t.from === 'LISTEN' };
  if (t.to === 'CLOSED' || t.to === 'LISTEN') return { passive: false };
  return ctx;
}

export interface Scenario {
  id: string;
  title: string;
  about: string;
  /** One side of the connection; the other side's path is a separate scenario. */
  path: string[];
}

export const SCENARIOS: Scenario[] = [
  { id: 'client', title: 'Client: open and close first', about: 'A browser connects, exchanges data and closes first (active close), as in the TCP exchange.', path: ['active-open', 'synsent-synack', 'estab-close', 'fw1-ack', 'fw2-fin', 'timewait-timeout'] },
  { id: 'server', title: 'Server: accept and close second', about: 'A web server accepts the connection and closes after the client (passive close).', path: ['passive-open', 'listen-syn', 'synrcvd-ack', 'estab-fin', 'closewait-close', 'lastack-ack'] },
  { id: 'simultaneous-close', title: 'Simultaneous close', about: 'Both sides send FIN at the same time. Both end in TIME-WAIT.', path: ['active-open', 'synsent-synack', 'estab-close', 'fw1-fin', 'closing-ack', 'timewait-timeout'] },
  { id: 'simultaneous-open', title: 'Simultaneous open', about: 'Both sides send SYN at the same time, so neither is client nor server.', path: ['active-open', 'synsent-syn', 'synrcvd-ack'] },
  { id: 'refused', title: 'Connection refused', about: 'Nothing listens on the port; the server host answers the SYN with RST.', path: ['active-open', 'syn-sent-rst'] },
  { id: 'syn-reset', title: 'Half-open reset', about: 'A client resets after its SYN was answered; the server goes back to LISTEN.', path: ['passive-open', 'listen-syn', 'synrcvd-rst-passive'] },
];

export const SOURCES: Source[] = [
  { rfc: 9293, section: '3.3.2', note: 'states and Figure 5, the state diagram' },
  { rfc: 9293, section: '3.10.7', note: 'segment arrival, including RST handling' },
  { rfc: 1337, note: 'TIME-WAIT assassination hazards' },
];
