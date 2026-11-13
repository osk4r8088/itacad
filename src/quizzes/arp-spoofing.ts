import type { Quiz } from './schema';

export const arpSpoofingQuiz: Quiz = {
  id: 'arp-spoofing',
  questions: [
    {
      id: 'unsolicited',
      prompt: 'The laptop never asked, yet it accepts the forged ARP reply. Why?',
      options: [
        'The attacker guessed a secret',
        'ARP has no authentication, and a host updates an existing entry from any ARP packet that mentions it',
        'The switch vouched for the reply',
        'The reply came from the gateway address',
      ],
      answer: 1,
      explanation: 'RFC 826 tells a host to update an entry it already has whenever an ARP packet carries that address. Nothing proves who sent it.',
      step: 'spoof-laptop',
      source: { rfc: 826 },
    },
    {
      id: 'both',
      prompt: 'Why does the attacker poison the cache of the router as well?',
      options: ['To crash the router', 'To hide its MAC address', 'Otherwise only the outgoing traffic would pass the attacker; replies would go straight to the laptop', 'The router would otherwise warn the laptop'],
      answer: 2,
      explanation: 'Each direction depends on one cache: the laptop\'s for the way out, the router\'s for the way back. Only with both poisoned is the attacker in the middle of the whole conversation.',
      step: 'spoof-router',
      source: { rfc: 826 },
    },
    {
      id: 'switch',
      prompt: 'The laptop sends a ping for the Internet, and the switch delivers the frame to the attacker. What did the switch do wrong?',
      options: ['Nothing: it forwards by destination MAC address, and the frame carries the attacker\'s', 'It learned a wrong MAC address', 'It flooded the frame', 'It ignored the IP address'],
      answer: 0,
      explanation: 'The deception is in the mapping from IP address to MAC address inside the laptop. The frame is correctly addressed to the attacker, and the switch delivers it.',
      step: 'mitm-request-in',
    },
    {
      id: 'ttl',
      prompt: 'Before the attack, replies arrived with TTL 55. With the attacker forwarding them like a router, what does the laptop see?',
      options: ['TTL 56', 'TTL 55, unchanged', 'TTL 54', 'TTL 64'],
      answer: 2,
      explanation: 'The attacker routes the packet and decrements the TTL like any router, so one more hop shows. Attack tools can avoid this by forwarding frames without touching the IP header.',
      step: 'mitm-reply-out',
      source: { rfc: 791, section: '3.2' },
    },
    {
      id: 'dai',
      prompt: 'Against what does Dynamic ARP Inspection check an ARP packet from an untrusted port?',
      options: ['A list of known attackers', 'The spanning tree', 'The routing table', 'The table of DHCP snooping: which IP address was given to which MAC address on which port'],
      answer: 3,
      explanation: 'The attacker\'s port is bound to its own address. An ARP reply from that port claiming the gateway address does not match the binding and is dropped.',
      step: 'dai-drop',
    },
    {
      id: 'tls',
      prompt: 'The attacker sits in the middle. What can it do with a connection protected by TLS?',
      options: ['Read it, but not change it', 'See encrypted records only; a forged certificate would fail validation', 'Decrypt it with the MAC address', 'Nothing at all, it cannot even see packets'],
      answer: 1,
      explanation: 'Encryption does not prevent ARP spoofing, but it makes the position in the middle nearly worthless. Unencrypted protocols can be read and changed.',
      step: 'mitm-reply-out',
    },
  ],
};
