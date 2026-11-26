import type { Quiz } from './schema';

const S = (section: string) => ({ rfc: 2328, section });

export const ospfQuiz: Quiz = {
  id: 'ospf',
  questions: [
    {
      id: 'transport',
      prompt: 'How are OSPF packets carried?',
      options: ['Over TCP port 89', 'Over UDP port 520', 'Directly in IP, as protocol 89', 'Directly in Ethernet, with an EtherType of its own'],
      answer: 2,
      explanation: 'OSPF has no transport header. It brings its own reliability for LSAs with acknowledgments and retransmissions.',
      step: 'hello-r1',
      source: S('A.1'),
    },
    {
      id: 'mismatch',
      prompt: 'Two routers on a LAN never become neighbors. Which difference can cause this?',
      options: ['Different Router Priorities', 'Different HelloIntervals', 'Different Router IDs', 'Different DD sequence numbers'],
      answer: 1,
      explanation: 'Network mask, HelloInterval and RouterDeadInterval must match, or the Hello is dropped. Priorities and Router IDs are supposed to differ.',
      step: 'hello-r1',
      source: S('10.5'),
    },
    {
      id: 'dr',
      prompt: 'R2 is DR when R1 comes up. What decides that R2 stays DR?',
      options: [
        'R2 has the higher Router ID.',
        'A router that comes up on a network with a DR accepts that DR, whatever its own priority.',
        'R2 has the lower IP address.',
        'The DR is configured by hand.',
      ],
      answer: 1,
      explanation: 'Priority and Router ID only decide when there is no DR yet. Keeping the existing DR avoids rebuilding all adjacencies.',
      step: 'hello-r2',
      source: S('7.3'),
    },
    {
      id: 'master',
      prompt: 'Both routers claim master in their first Database Description packet. Who becomes master?',
      options: ['The DR', 'The router that sent first', 'The router with the higher Router ID', 'The router with the larger MTU'],
      answer: 2,
      explanation: 'Here that is R2. R1 sees the higher Router ID with I, M and MS set and becomes slave.',
      step: 'dd-r2-init',
      source: S('10.6'),
    },
    {
      id: 'headers',
      prompt: 'What do Database Description packets contain?',
      options: ['Complete LSAs', 'Only LSA headers', 'The routing table', 'Hellos from all neighbors'],
      answer: 1,
      explanation: 'A 20-octet header identifies an LSA and its instance. Complete LSAs follow only for those that are requested.',
      step: 'dd-r1-ack',
      source: S('A.3.3'),
    },
    {
      id: 'full',
      prompt: 'When does R1 consider its neighbor R2 Full?',
      options: [
        'As soon as it sees itself in R2\'s Hello',
        'When the DR election is finished',
        'When its request list is empty after the database exchange',
        'After RouterDeadInterval',
      ],
      answer: 2,
      explanation: 'Loading lasts until every LSA R1 was missing has arrived. Then both databases are the same.',
      step: 'lsu',
      source: S('10.3'),
    },
    {
      id: 'route',
      prompt: 'What does R1 receive from R2 that lets it install a route to 203.0.113.0/24?',
      options: ['A route with a metric, like in RIP', 'LSAs describing R2\'s links and the LAN, from which R1 computes the route itself', 'An ICMP Redirect', 'An ARP reply'],
      answer: 1,
      explanation: 'Link-state routers exchange descriptions of links, not routes. Each router runs the shortest-path calculation over the shared database.',
      step: 'flood',
      source: S('16.1'),
    },
  ],
};
