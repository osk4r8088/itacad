import type { Exchange, Source, Step } from '../../shared/schema';
import { textMessage, type TextPart } from '../../shared/headers/text';
import { CLIENT_LAN, TcpConversation, clientServer, dir, type Side } from './conversation';
import { BODY, HEADERS } from './smtp';

// Addresses: IPv4 RFC 5737, MAC RFC 7042, names RFC 2606. The password is made up.
const CLIENT_IP = '192.0.2.50';
const SERVER_IP = '203.0.113.25';

const conn = new TcpConversation({
  client: { mac: CLIENT_LAN.mac, ip: CLIENT_IP, port: 52011, isn: 4012239010 },
  server: { mac: '', ip: SERVER_IP, port: 143, isn: 2219004316 },
  link: 'lan',
  gatewayMac: CLIENT_LAN.gatewayMac,
  hops: 9,
  ipId: { client: 0x2e40, server: 0xb1a0 },
  window: { client: 502, server: 509 },
});

// The message as delivered by the SMTP exchange; the receiving server added Return-Path and Received.
const STORED =
  'Return-Path: <alice@example.org>\r\n' +
  'Received: from mail.example.org (mail.example.org [192.0.2.25])\r\n' +
  '\tby mx.example.com with ESMTP id 4F1A2B3C;\r\n' +
  '\tFri, 06 Nov 2026 09:20:00 +0000\r\n' +
  HEADERS +
  '\r\n' +
  BODY;
const STORED_LEN = new TextEncoder().encode(STORED).length;

const SOURCES: Source[] = [{ rfc: 9051 }];
const ABOUT =
  'IMAP commands start with a tag chosen by the client (a1, a2, ...). The server may send any number of untagged responses, lines starting with "*", and finishes each command with a tagged response carrying the same tag and OK, NO or BAD. Tags let a client send several commands without waiting and still match the results.';

const tagged = (text: string, about: string): TextPart => ({ id: 'tagged', name: 'Tagged response', text, about, source: { rfc: 9051, section: '7.1' } });
const untagged = (text: string, about: string): TextPart => ({ id: 'untagged', name: 'Untagged responses', text, about, source: { rfc: 9051, section: '2.2.2' } });
const command = (text: string, about: string, section: string): TextPart => ({ id: 'command', name: 'Command', text, about, source: { rfc: 9051, section } });

function msg(from: Side, parts: TextPart[], summary: string) {
  return textMessage({ id: 'imap', name: from === 'client' ? 'IMAP command' : 'IMAP response', short: 'IMAP', about: ABOUT, sources: SOURCES, summary, parts });
}

interface Turn {
  from: Side;
  id: string;
  label: string;
  parts: TextPart[];
  time: number;
  details: Step['details'];
  sources: Source[];
}

const turns: Turn[] = [
  {
    from: 'server',
    id: 'greeting',
    label: '* OK greeting',
    parts: [untagged('* OK [CAPABILITY IMAP4rev2 STARTTLS AUTH=PLAIN] mail.example.com ready\r\n', 'The greeting, an untagged OK, with the capabilities of the server in a response code.')],
    time: 0,
    details: {
      what: 'The connection to port 143 is open and the server greets with an untagged OK and its capabilities.',
      why: 'Listing the capabilities in the greeting saves the client a separate CAPABILITY command.',
      keyFields: [
        { layer: 'imap', field: 'untagged' },
        { layer: 'tcp', field: 'srcPort' },
      ],
      typical:
        'IMAP4rev2 (RFC 9051, 2021) is the current version; most servers also still offer IMAP4rev1. Mail programs today usually connect to port 993, where TLS starts right away (RFC 8314). This example uses port 143 without TLS so the commands stay readable.',
    },
    sources: [{ rfc: 9051, section: '7.1.1' }, { rfc: 9051, section: '7.2.2' }, { rfc: 8314 }],
  },
  {
    from: 'client',
    id: 'login',
    label: 'a1 LOGIN',
    parts: [command('a1 LOGIN bob s3cret\r\n', 'Tag a1, command LOGIN with user name and password.', '6.2.3')],
    time: 1,
    details: {
      what: 'Bob\'s mail program logs in with user name and password. It uses tag a1 for this command.',
      why: 'The session starts in the "not authenticated" state, where only a few commands are allowed.',
      keyFields: [{ layer: 'imap', field: 'command' }],
      wrong:
        'The password crosses the network in plain text. RFC 9051 says servers should not allow this without TLS; a real server would answer with LOGINDISABLED in its capabilities and expect STARTTLS or port 993.',
    },
    sources: [{ rfc: 9051, section: '6.2.3' }, { rfc: 9051, section: '3' }],
  },
  {
    from: 'server',
    id: 'login-ok',
    label: 'a1 OK',
    parts: [tagged('a1 OK LOGIN completed\r\n', 'Tag a1 again: this ends the LOGIN command.')],
    time: 31,
    details: {
      what: 'The tagged response a1 OK ends the LOGIN command: Bob is logged in.',
      why: 'The tag shows which command finished. Here there is only one outstanding, but a client may send several.',
      keyFields: [{ layer: 'imap', field: 'tagged' }],
    },
    sources: [{ rfc: 9051, section: '6.2.3' }, { rfc: 9051, section: '3' }],
  },
  {
    from: 'client',
    id: 'select',
    label: 'a2 SELECT',
    parts: [command('a2 SELECT INBOX\r\n', 'Opens the mailbox INBOX for reading and writing.', '6.3.2')],
    time: 32,
    details: {
      what: 'The client opens the mailbox INBOX.',
      why: 'IMAP works on mailboxes that stay on the server. Commands such as FETCH refer to messages of the selected mailbox.',
      keyFields: [{ layer: 'imap', field: 'command' }],
    },
    sources: [{ rfc: 9051, section: '6.3.2' }],
  },
  {
    from: 'server',
    id: 'selected',
    label: '* 3 EXISTS ... a2 OK',
    parts: [
      untagged(
        '* 3 EXISTS\r\n* OK [UIDVALIDITY 1793900000] UIDs valid\r\n* OK [UIDNEXT 104] Predicted next UID\r\n* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited\r\n* LIST () "/" INBOX\r\n',
        'The state of the mailbox: number of messages, UID information, the flags in use and which flags the client may change.',
      ),
      tagged('a2 OK [READ-WRITE] SELECT completed\r\n', 'Ends SELECT; READ-WRITE means the client may change the mailbox.'),
    ],
    time: 62,
    details: {
      what:
        'The server describes the mailbox in untagged responses: 3 messages (EXISTS), the UID validity and the next UID, the known flags. The tagged a2 OK ends the command. The newest message, number 3, is the mail from Alice.',
      why: 'The client learns everything it needs to synchronise its local view of the mailbox with one command.',
      keyFields: [
        { layer: 'imap', field: 'untagged' },
        { layer: 'imap', field: 'tagged' },
      ],
      typical:
        'Messages have two numbers: a sequence number (1 to 3 here), which shifts when messages are deleted, and a UID, which stays the same as long as UIDVALIDITY does not change. Mail programs store UIDs to know which messages they have already seen.',
    },
    sources: [{ rfc: 9051, section: '6.3.2' }, { rfc: 9051, section: '2.3.1.1' }, { rfc: 9051, section: '7.4.1' }],
  },
  {
    from: 'client',
    id: 'fetch',
    label: 'a3 FETCH 3 BODY[]',
    parts: [command('a3 FETCH 3 BODY[]\r\n', 'Fetch the complete message number 3.', '6.4.5')],
    time: 63,
    details: {
      what: 'The client fetches the full text of message 3.',
      why: 'IMAP can fetch exactly the parts a client needs: only headers for the message list, only one attachment, or, as here, everything.',
      keyFields: [{ layer: 'imap', field: 'command' }],
      typical: 'BODY[] marks the message as read (\\Seen). A client that only wants to look without changing that uses BODY.PEEK[].',
    },
    sources: [{ rfc: 9051, section: '6.4.5' }],
  },
  {
    from: 'server',
    id: 'fetched',
    label: '* 3 FETCH ... a3 OK',
    parts: [
      untagged(`* 3 FETCH (FLAGS (\\Seen) BODY[] {${STORED_LEN}}\r\n`, `Start of the FETCH response. {${STORED_LEN}} announces a literal: exactly ${STORED_LEN} octets of raw data follow.`),
      {
        id: 'literal',
        name: 'Literal (the message)',
        text: STORED,
        about: 'The message as stored on the server: the original from the SMTP exchange plus Return-Path and Received, added on delivery.',
        source: { rfc: 9051, section: '4.3' },
      },
      { id: 'close', name: 'End of FETCH response', text: ')\r\n', about: 'Closes the parenthesised list of the FETCH response.', source: { rfc: 9051, section: '7.5.2' } },
      tagged('a3 OK FETCH completed\r\n', 'Ends the FETCH command.'),
    ],
    time: 94,
    details: {
      what: `The server sends the message as a literal: {${STORED_LEN}} followed by exactly ${STORED_LEN} octets, then the closing parenthesis and the tagged a3 OK. FLAGS (\\Seen) reports that the message is now marked as read.`,
      why: 'A literal announces its length up front, so the message can contain any characters, including lines that look like IMAP responses, without confusing the parser.',
      keyFields: [
        { layer: 'imap', field: 'untagged' },
        { layer: 'imap', field: 'literal' },
        { layer: 'imap', field: 'tagged' },
      ],
      typical: 'Look at the top of the message: Return-Path holds the envelope sender from MAIL FROM, and the Received header was written by mx.example.com when it accepted the mail.',
      insight:
        'SMTP and IMAP meet at the mailbox: SMTP delivers into it, IMAP reads from it. The message stays on the server, so Bob sees the same mailbox, with the same read flags, on his laptop and his phone.',
    },
    sources: [{ rfc: 9051, section: '7.5.2' }, { rfc: 9051, section: '4.3' }, { rfc: 5321, section: '4.4' }],
  },
  {
    from: 'client',
    id: 'logout',
    label: 'a4 LOGOUT',
    parts: [command('a4 LOGOUT\r\n', 'Ends the session.', '6.1.3')],
    time: 95,
    details: {
      what: 'The client ends the session.',
      why: 'Many mail programs instead keep the connection open and send IDLE (RFC 2177, part of IMAP4rev2), so the server can push new mail the moment it arrives.',
      keyFields: [{ layer: 'imap', field: 'command' }],
    },
    sources: [{ rfc: 9051, section: '6.1.3' }, { rfc: 9051, section: '6.3.13' }],
  },
  {
    from: 'server',
    id: 'bye',
    label: '* BYE ... a4 OK',
    parts: [untagged('* BYE mail.example.com logging out\r\n', 'BYE: the server is about to close the connection.'), tagged('a4 OK LOGOUT completed\r\n', 'Ends LOGOUT.')],
    time: 125,
    details: {
      what: 'The server says BYE, confirms LOGOUT with the tag a4 and closes the connection.',
      why: 'The untagged BYE tells the client the close is intended and not an error.',
      keyFields: [
        { layer: 'imap', field: 'untagged' },
        { layer: 'imap', field: 'tagged' },
      ],
    },
    sources: [{ rfc: 9051, section: '6.1.3' }, { rfc: 9051, section: '7.1.5' }],
  },
];

const firstLine = (t: Turn) => t.parts[0].text.split('\r\n')[0];

const steps: Step[] = turns.map((t) => ({
  id: t.id,
  ...dir(t.from),
  label: t.label,
  time: t.time,
  category: t.from === 'client' ? 'command' : 'response',
  protocol: 'IMAP',
  info: `${t.from === 'client' ? 'Request' : 'Response'}: ${firstLine(t)}`,
  details: t.details,
  captures: [conn.segment(t.from, msg(t.from, t.parts, t.label))],
  sources: t.sources,
}));

export const imapExchange: Exchange = {
  id: 'imap',
  title: 'IMAP',
  summary: 'Bob reads the mail Alice sent: login, select the inbox, fetch the message, log out.',
  group: 'Application',
  scenario:
    'Bob opens his mail program. It connects to mail.example.com, port 143 (TCP handshake not shown), and reads the message that arrived in the SMTP exchange.',
  intro:
    'SMTP delivers mail to the server of the recipient; IMAP lets the recipient read it there. The mailbox stays on the server and the mail program works on it remotely: it lists folders, fetches headers or whole messages, sets flags such as \\Seen, and moves or deletes messages. Every command carries a tag, and the server ends each command with a tagged response, while untagged responses (starting with "*") report data and changes. Real clients use TLS (port 993); this example shows the session in plain text. Times are illustrative, with a round trip of 30 ms.',
  sources: [
    { rfc: 9051, note: 'IMAP4rev2' },
    { rfc: 3501, note: 'IMAP4rev1, the previous version' },
    { rfc: 8314, note: 'TLS for mail access' },
    { rfc: 2177, note: 'IDLE' },
    { rfc: 5321, section: '4.4', note: 'Trace information (Received, Return-Path)' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
  ],
  ...clientServer({ client: { label: 'Mail client', ip: CLIENT_IP, note: "Bob's laptop" }, server: { label: 'IMAP server', ip: SERVER_IP, note: 'mail.example.com, port 143' } }),
  categories: [
    { id: 'command', label: 'Command', color: 'blue' },
    { id: 'response', label: 'Response', color: 'green' },
  ],
  steps,
};
