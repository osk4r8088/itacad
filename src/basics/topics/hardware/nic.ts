import type { Topic } from '../../schema';

export const nic: Topic = {
  id: 'nic',
  category: 'hardware',
  title: 'Network interface card',
  level: 2,
  definition: 'A network interface card (NIC, network adapter) connects a computer to a network: it turns frames into signals on a cable or radio and back, and filters what arrives by MAC address.',
  why: 'Every packet in every protocol on this site starts and ends at a NIC. Knowing what the card does on its own explains MAC addresses, link speed problems, and why a packet capture on the sending machine shows wrong checksums and packets larger than the MTU.',
  sections: [
    {
      heading: 'What the card does',
      blocks: [
        {
          kind: 'text',
          text: 'A NIC implements the two lowest layers of a network technology such as Ethernet or Wi-Fi. Its physical layer part (PHY) turns bits into electrical signals, light or radio waves. Its MAC part (medium access control) builds and checks frames: it adds the frame check sequence (FCS), a CRC-32 over the frame, when sending, and drops frames with a wrong FCS when receiving.',
        },
        {
          kind: 'text',
          text: 'The card moves frames to and from RAM by itself (direct memory access, DMA). The driver gives it ring buffers in memory; the card writes received frames there and signals the CPU with an interrupt, and takes frames to send from them. Under heavy load the operating system switches to polling the rings instead of handling an interrupt per frame.',
        },
      ],
    },
    {
      heading: 'The MAC address',
      blocks: [
        {
          kind: 'text',
          text: 'Each Ethernet and Wi-Fi interface has a 48-bit MAC address, written as six octets such as 00:00:5e:00:53:01 (an address reserved for documentation). In the address burned in by the manufacturer, the first three octets are usually the organizationally unique identifier (OUI) that the IEEE assigns to the manufacturer (smaller blocks get a longer prefix); the manufacturer numbers its cards with the rest.',
        },
        {
          kind: 'table',
          caption: 'The two flag bits in the first octet',
          columns: ['Bit', 'Value 0', 'Value 1'],
          rows: [
            ['Least significant bit: I/G (individual or group)', 'Unicast: one interface', 'Group: multicast, or broadcast ff:ff:ff:ff:ff:ff'],
            ['Second bit: U/L (universal or local)', 'Universally administered: assigned by the manufacturer', 'Locally administered: set by software, for example a virtual machine or a randomized Wi-Fi address'],
          ],
        },
        {
          kind: 'text',
          text: 'Phones and laptops now often use a random, locally administered MAC address per Wi-Fi network so that they cannot be tracked from network to network. Such an address has the U/L bit set: the second hex digit is 2, 6, a or e.',
        },
      ],
    },
    {
      heading: 'Receive filtering',
      blocks: [
        {
          kind: 'text',
          text: 'The card looks at the destination MAC address of every frame. It passes frames to the operating system that are addressed to its own address, to the broadcast address, or to a multicast group it was told to join, and drops everything else in hardware. That is why a computer on a switched network normally does not see the traffic of others, and why ARP needs broadcast to find an unknown address.',
        },
        {
          kind: 'text',
          text: 'In promiscuous mode the card passes every frame up. Packet capture tools turn it on, but on a switched network it only reveals frames the switch delivers to that port anyway.',
        },
      ],
    },
    {
      heading: 'Offloads: work the card takes from the CPU',
      blocks: [
        {
          kind: 'list',
          items: [
            'Checksum offload: the card computes the IPv4, TCP and UDP checksums when sending and checks them when receiving.',
            'Segmentation offload (TSO): the operating system hands the card one large TCP segment, typically up to 64 KiB, and the card cuts it into packets that fit the MTU, each with its own headers.',
            'Receive coalescing (LRO, or GRO in software): the reverse, merging consecutive received segments of a connection before the stack processes them.',
            'Receive side scaling (RSS): the card hashes the addresses and ports of each received packet and spreads the connections over several queues, each handled by a different CPU core.',
          ],
        },
        {
          kind: 'note',
          text: 'Because of offloads, a capture taken on the sending machine sees packets before the card has finished them: checksums appear as wrong or zero, and TCP segments appear larger than the MTU. A capture on the wire, or on the receiving side with receive offloads disabled, shows the real packets.',
        },
      ],
    },
    {
      heading: 'Link speed and duplex',
      blocks: [
        {
          kind: 'text',
          text: 'When a cable is plugged in, both ends exchange their abilities (auto-negotiation) and agree on the fastest speed and duplex mode both support, for example 1000BASE-T, gigabit Ethernet over twisted pair, in full duplex. If one side is fixed to a speed and the other negotiates, they can end up in a duplex mismatch: the link works, but with errors and very poor throughput.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'A MAC address is permanent and identifies a device everywhere.', truth: 'Software can set any MAC address, virtual machines get generated ones, and many devices use a random address per Wi-Fi network. It identifies an interface on one link, and it never leaves the local network: routers replace the Ethernet header on every hop.' },
    { myth: 'Wireshark shows bad checksums, so the network card is broken.', truth: 'On the sending host this is checksum offload: the capture happens before the card fills in the checksum. Only checksum errors seen on the receiving side or on the wire point to a real problem.' },
    { myth: 'A gigabit card means a gigabit of downloads.', truth: 'The link speed is the limit of the first hop only. The slowest link on the path, the server and TCP set the real rate, and protocol headers take a few percent of the link.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'ip -br link', shows: 'Every interface with its state and MAC address.' },
      { os: 'Linux', command: 'ethtool eth0', shows: 'Negotiated speed, duplex and auto-negotiation of a wired interface (replace eth0 with the name from ip link).' },
      { os: 'Linux', command: 'ethtool -k eth0', shows: 'Which offloads are on: tx-checksumming, tcp-segmentation-offload, generic-receive-offload and more.' },
      { os: 'Linux', command: 'ip -s link show eth0', shows: 'Counters of packets, errors and drops; growing error counters point to cabling or duplex problems.' },
      { os: 'Windows', command: 'Get-NetAdapter | Select-Object Name, MacAddress, LinkSpeed, Status', shows: 'Each adapter with MAC address, link speed and state (PowerShell).' },
      { os: 'macOS', command: 'ifconfig en0', shows: 'MAC address (ether), addresses and media type of the first network interface.' },
    ],
    numbers: [
      { label: 'MAC address length', value: '48 bits, 6 octets' },
      { label: 'Largest TSO segment', value: 'typically 64 KiB', note: 'the limit of the 16-bit IP length fields; newer Linux kernels can go beyond it (BIG TCP)' },
    ],
    examples: ['Servers often have two or more NICs bonded together for redundancy or bandwidth; virtual machines get virtual NICs that the hypervisor connects to a virtual switch.'],
  },
  terms: [
    { term: 'NIC', definition: 'Network interface card: the hardware that connects a computer to a network.' },
    { term: 'MAC address', definition: 'The 48-bit hardware address of a network interface, used to deliver frames on one link.' },
    { term: 'OUI', definition: 'Organizationally unique identifier: the first 24 bits of a manufacturer-assigned MAC address, registered with the IEEE.' },
    { term: 'Promiscuous mode', definition: 'A NIC mode that passes every received frame to the operating system, not only those addressed to it.' },
    { term: 'Checksum offload', definition: 'Computing and checking IP, TCP and UDP checksums in the network card instead of the CPU.' },
    { term: 'TCP segmentation offload (TSO)', definition: 'The network card cuts a large TCP segment from the operating system into packets that fit the MTU.' },
    { term: 'Receive side scaling (RSS)', definition: 'Spreading received connections over several receive queues and CPU cores by a hash of addresses and ports.' },
    { term: 'Auto-negotiation', definition: 'The exchange in which both ends of an Ethernet link agree on speed and duplex mode.' },
  ],
  related: [{ protocol: 'arp' }, { protocol: 'vlan' }, { topic: 'network-devices' }, { entry: 'decoder' }, { entry: 'ipv6' }],
  sources: [
    { spec: 'IEEE 802-2014, Overview and Architecture', section: 'Clause 8 (MAC address structure, I/G and U/L bits)' },
    { spec: 'IEEE 802.3-2022, Ethernet', section: 'Clause 3 (frame format, FCS) and Clause 28 (auto-negotiation for twisted pair)' },
    { rfc: 9542, section: '2.1', note: 'MAC address structure, group and local bits, documentation addresses' },
    { spec: 'Linux kernel documentation: Scaling in the Linux Networking Stack', url: 'https://docs.kernel.org/networking/scaling.html', note: 'RSS, receive queues' },
    { spec: 'Linux kernel documentation: Segmentation Offloads', url: 'https://docs.kernel.org/networking/segmentation-offloads.html', note: 'TSO, GSO, GRO' },
    { spec: 'Wireshark User\'s Guide: Checksums', url: 'https://www.wireshark.org/docs/wsug_html_chunked/ChAdvChecksums.html', note: 'why captures on the sender show wrong checksums' },
  ],
  quiz: [
    {
      id: 'ul',
      prompt: 'A phone joins Wi-Fi with the MAC address 4a:9c:21:07:b3:10. What does the first octet tell you?',
      options: ['It is a multicast address', 'It is a locally administered address, likely randomized', 'It was assigned by the manufacturer', 'It is the broadcast address'],
      answer: 1,
      explanation: '0x4a is 0100 1010 in binary. The least significant bit (I/G) is 0, so unicast; the second bit (U/L) is 1, so locally administered. Phones use such addresses for Wi-Fi privacy.',
    },
    {
      id: 'filter',
      prompt: 'Which frame does a NIC in normal mode pass to the operating system?',
      options: ['Every frame on the cable', 'Only frames with its own MAC address as source', 'Frames to its own MAC address, to broadcast, and to multicast groups it joined', 'Only frames with a correct IP checksum'],
      answer: 2,
      explanation: 'The card filters by destination MAC address: its own unicast address, the broadcast address and subscribed multicast groups. Everything else is dropped in hardware unless promiscuous mode is on.',
    },
    {
      id: 'tso',
      prompt: 'A capture on a web server shows outgoing TCP segments of 30,000 bytes on an Ethernet link with MTU 1500. What is the most likely explanation?',
      options: ['Jumbo frames are on', 'TCP segmentation offload: the card splits them after the capture point', 'IP fragmentation', 'The capture is corrupted'],
      answer: 1,
      explanation: 'With TSO the operating system hands large segments to the card, and the capture sees them before the card cuts them into MTU-sized packets. On the wire they are ordinary packets of up to 1500 bytes.',
    },
    {
      id: 'duplex',
      prompt: 'A link works but is very slow, and the error counters grow steadily. One side was set to a fixed speed. What should you check first?',
      options: ['The DNS server', 'A duplex mismatch between the two ends', 'The MAC address', 'The TCP window size'],
      answer: 1,
      explanation: 'If one side is fixed and the other negotiates, the negotiating side can fall back to half duplex while the fixed side uses full duplex. The result is collisions and errors on a link that otherwise looks up.',
    },
  ],
};
