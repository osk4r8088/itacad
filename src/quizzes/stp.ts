import type { Quiz } from './schema';

const D = { spec: 'IEEE 802.1D-2004' };
const D98 = { spec: 'IEEE 802.1D-1998', note: 'classic STP' };

export const stpQuiz: Quiz = {
  id: 'stp',
  questions: [
    {
      id: 'no-ttl',
      prompt: 'Why does a broadcast in a switch loop circle forever, while a routing loop eventually ends?',
      options: [
        'Switches are faster than routers.',
        'Ethernet frames have no hop limit; IP packets have a TTL that runs out.',
        'Broadcasts are never dropped.',
        'Routers detect loops, switches do not.',
      ],
      answer: 1,
      explanation: 'Nothing in an Ethernet frame changes on the way. Each switch floods the broadcast again, so copies multiply until a link is cut.',
      step: 'storm-3',
      source: D,
    },
    {
      id: 'flap',
      prompt: 'What happens to the switches\' MAC tables during the loop?',
      options: [
        'Nothing; MAC tables only change for unicast frames.',
        'They are cleared.',
        'The entry for PC A keeps jumping between ports, as copies of its frame arrive on different ports.',
        'They fill with random addresses.',
      ],
      answer: 2,
      explanation: 'A switch learns the source address on the port a frame arrives on. Copies from the loop arrive on the wrong ports, so traffic to PC A goes astray.',
      step: 'storm-2',
      source: D,
    },
    {
      id: 'root',
      prompt: 'All three switches have priority 32768. Which one becomes the root bridge?',
      options: ['The one with the lowest MAC address', 'The one with the most ports', 'The one that boots first', 'The one with the fastest links'],
      answer: 0,
      explanation: 'The lowest bridge identifier wins: priority first, then MAC address. Administrators lower the priority of the switch that should be root.',
      step: 'bpdu-root',
      source: D,
    },
    {
      id: 'frame',
      prompt: 'How are BPDUs carried?',
      options: [
        'In UDP packets to the root\'s IP address.',
        'In Ethernet II frames with their own EtherType.',
        'In ICMP messages.',
        'In IEEE 802.3 frames with a length field and an LLC header (SAP 0x42), sent to 01:80:c2:00:00:00.',
      ],
      answer: 3,
      explanation: 'Spanning Tree runs between neighboring switches at layer 2 and never uses IP. Switches consume frames to that multicast address instead of forwarding them.',
      step: 'bpdu-root',
      source: { spec: 'IEEE 802.1D-2004', section: 'Clause 9 (encoding of BPDUs)' },
    },
    {
      id: 'tie',
      prompt: 'Switch 2 and switch 3 are both 20,000 from the root. Which of their ports on the link between them becomes designated?',
      options: ['Both', 'Switch 2\'s, because its bridge identifier is lower', 'Switch 3\'s, because it sent its BPDU last', 'Neither; the link is shut down'],
      answer: 1,
      explanation: 'The comparison order is root identifier, root path cost, sender bridge identifier, sender port identifier. Here the bridge identifier decides.',
      step: 'bpdu-sw3',
      source: D,
    },
    {
      id: 'blocked',
      prompt: 'What does switch 3\'s blocked port still do?',
      options: [
        'Forwards broadcasts only.',
        'Nothing at all; it is shut down.',
        'Receives BPDUs, but neither forwards data frames nor learns addresses.',
        'Sends BPDUs as the designated port.',
      ],
      answer: 2,
      explanation: 'Listening to BPDUs is how it notices when it is needed. Data frames are dropped, as the broadcast copy from switch 2 shows.',
      step: 'tree-blocked',
      source: D,
    },
    {
      id: 'classic-time',
      prompt: 'With classic STP and default timers, how long does a blocked port take to forward after its switch loses its root port?',
      options: ['Immediately', 'About 2 seconds', '30 seconds: 15 s listening and 15 s learning', '5 minutes'],
      answer: 2,
      explanation: 'Each of the two states lasts Forward Delay, 15 s. If the failure is only noticed by missing BPDUs, Max Age (20 s) comes first: up to 50 s.',
      step: 'failure-bpdu',
      source: D98,
    },
    {
      id: 'rstp',
      prompt: 'Why does Rapid STP recover in well under a second?',
      options: [
        'It sends BPDUs every millisecond.',
        'Blocked ports are kept as alternate ports and take over at once, and neighbors agree by handshake instead of waiting for timers.',
        'It does not block any ports.',
        'It uses IP routing instead of a tree.',
      ],
      answer: 1,
      explanation: 'RSTP (802.1w, now in 802.1D-2004 and 802.1Q) knows the backup path in advance. Its BPDUs have version 2 and carry the port role in the flags.',
      step: 'failure-forward',
      source: D,
    },
  ],
};
