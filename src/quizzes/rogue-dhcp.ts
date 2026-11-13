import type { Quiz } from './schema';

export const rogueDhcpQuiz: Quiz = {
  id: 'rogue-dhcp',
  questions: [
    {
      id: 'broadcast',
      prompt: 'Why can any host in the LAN answer the laptop\'s Discover?',
      options: ['The Discover is a broadcast that every host receives, and DHCP has no way to tell a real server from another', 'The switch forwards it to the fastest host', 'The laptop names the rogue in the Discover', 'DHCP servers are found through DNS'],
      answer: 0,
      explanation: 'The client does not know which server to ask, so it asks everybody. The transaction ID and its MAC address, all a server needs to answer, are in the broadcast.',
      step: 'discover',
      source: { rfc: 2131, section: '3.1' },
    },
    {
      id: 'first',
      prompt: 'The real server answers a few milliseconds after the rogue. Why does the laptop take the rogue\'s offer?',
      options: ['The rogue offers a longer lease', 'The rogue has the lower MAC address', 'Most clients take the first offer that arrives', 'The real offer is invalid'],
      answer: 2,
      explanation: 'A client may collect several offers, but most take the first. Being fastest on the same switch is all the rogue needs.',
      step: 'real-offer',
      source: { rfc: 2131, section: '3.1' },
    },
    {
      id: 'options',
      prompt: 'Which two DHCP options put the attacker into the path of the laptop\'s traffic?',
      options: ['Lease time (51) and server identifier (54)', 'Subnet mask (1) and domain name (15)', 'Message type (53) and requested address (50)', 'Router (3) and domain name server (6)'],
      answer: 3,
      explanation: 'The laptop sends everything for the Internet to the router it was given, and every name lookup to the DNS server it was given. The rogue names itself for both.',
      step: 'rogue-offer',
      source: { rfc: 2132, section: '3.5' },
    },
    {
      id: 'withdraw',
      prompt: 'The laptop broadcasts its Request naming the rogue as server. What does the real server do?',
      options: ['It sends a Nak', 'It withdraws its offer, as for any other server that was not chosen', 'It reports the rogue', 'It answers with its own Ack'],
      answer: 1,
      explanation: 'The Request is broadcast so that all servers learn the decision. A server that sees another server identifier takes its offer back. Nothing in the protocol marks the chosen server as illegitimate.',
      step: 'request',
      source: { rfc: 2131, section: '4.3.2' },
    },
    {
      id: 'snooping',
      prompt: 'What does a switch with DHCP snooping do with a DHCPOFFER that arrives on an untrusted port?',
      options: ['It drops it: server messages are accepted only on trusted ports', 'It forwards it with a warning', 'It rewrites the router option', 'It disables the port of the client'],
      answer: 0,
      explanation: 'Ports are trusted or untrusted. Offer, Ack and Nak come from servers and may only arrive on trusted ports, here the port of the router.',
      step: 'snoop-drop',
    },
    {
      id: 'binding',
      prompt: 'What does DHCP snooping record when the real Ack passes the switch?',
      options: ['The lease time for billing', 'The DNS server for filtering', 'A binding: this IP address belongs to this MAC address on this port', 'Nothing, it only filters'],
      answer: 2,
      explanation: 'The binding table is the second half of the feature. Dynamic ARP Inspection checks ARP packets against it, and IP Source Guard drops packets with addresses a port was never given.',
      step: 'snoop-ack',
    },
  ],
};
