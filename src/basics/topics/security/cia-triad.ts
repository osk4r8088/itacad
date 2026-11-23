import type { Topic } from '../../schema';

export const ciaTriad: Topic = {
  id: 'cia-triad',
  category: 'security',
  title: 'CIA triad',
  level: 1,
  definition: 'The CIA triad names the three goals of information security: confidentiality (only the right people can read it), integrity (it is not changed wrongly or unnoticed) and availability (it is there when needed).',
  why: 'Security is easily mistaken for "keeping secrets". The triad is the simplest tool to think more completely: for any system, ask what happens if its data leaks, if it is altered, and if it is gone. The answers differ per system, and they decide which protection is worth its cost.',
  sections: [
    {
      heading: 'Three goals',
      blocks: [
        {
          kind: 'table',
          caption: 'The three security objectives',
          columns: ['Goal', 'Means', 'Is broken by', 'Typical protection'],
          rows: [
            ['Confidentiality', 'Information is disclosed only to those authorized', 'A leaked database, a lost laptop, traffic read on the way', 'Access control, encryption'],
            ['Integrity', 'Information is not modified or destroyed improperly, and its origin is genuine', 'A changed bank transfer, a manipulated update, a forged sender', 'Hashes, signatures, write permissions, logs'],
            ['Availability', 'Information and systems can be used when needed', 'An overload attack, ransomware, a failed disk, a deleted backup', 'Spare capacity, backups, protection against overload'],
          ],
        },
        {
          kind: 'text',
          text: 'These definitions follow US law and the standard FIPS 199, which are the usual reference. Note that integrity there includes authenticity, knowing that something really comes from where it claims, and non-repudiation, that its author cannot credibly deny it later.',
        },
      ],
    },
    {
      heading: 'The goals pull against each other',
      blocks: [
        {
          kind: 'text',
          text: 'Maximum confidentiality is a disk in a safe that nobody can open, which is useless. Maximum availability is data copied everywhere, which leaks. Every real design is a balance, and the right one depends on the system.',
        },
        {
          kind: 'table',
          caption: 'The same three questions, different priorities',
          columns: ['System', 'Most important', 'Why'],
          rows: [
            ['Public website of a city', 'Integrity, availability', 'The content is public anyway; it must be correct and reachable'],
            ['Patient records', 'All three', 'Private by law, wrong data endangers treatment, and doctors need them at once'],
            ['Control system of a water plant', 'Availability, integrity', 'It must keep running and obey only genuine commands'],
            ['Password database', 'Confidentiality', 'A leak endangers every account at once'],
          ],
        },
      ],
    },
    {
      heading: 'From goals to risk',
      blocks: [
        {
          kind: 'text',
          text: 'The triad says what to protect. Three more words describe against what. A threat is something that could cause harm: an attacker, a careless employee, a flood. A vulnerability is a weakness a threat can use: an unpatched server, a guessable password, a missing backup. Risk combines how likely the two meet with how bad the result would be.',
        },
        {
          kind: 'text',
          text: 'Security work is deciding which risks to reduce, and how far. No single measure is trusted alone; several independent layers are stacked so that the failure of one is caught by the next, which is called defense in depth: a firewall and patched systems and limited rights and monitoring and backups.',
        },
        {
          kind: 'note',
          text: 'Not all threats are attacks. A large share of incidents are mistakes: a wrong configuration, a mail to the wrong recipient, a deleted folder. The triad covers them just as well, and so should the protection.',
        },
      ],
    },
    {
      heading: 'The attacks on this site, sorted',
      blocks: [
        {
          kind: 'table',
          caption: 'Which goal each attack lesson breaks',
          columns: ['Attack', 'Breaks', 'How'],
          rows: [
            ['ARP spoofing', 'Confidentiality, integrity', 'The attacker places itself between two hosts and can read and change their traffic'],
            ['DNS cache poisoning', 'Integrity', 'A resolver is made to store a false answer and sends users to the wrong server'],
            ['Rogue DHCP server', 'Integrity, confidentiality', 'Clients receive a false gateway or resolver and route their traffic through the attacker'],
            ['SYN flood', 'Availability', 'Half-open connections fill the server\'s table until real clients are turned away'],
          ],
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'Security means keeping things secret.', truth: 'Secrecy is one of three goals. Data that is silently changed or unavailable when needed is a security failure too.' },
    { myth: 'A system is either secure or insecure.', truth: 'Security is a level of risk that someone has accepted. The useful questions are: secure against whom, for which goal, at what cost?' },
    { myth: 'Encryption takes care of security.', truth: 'Encryption protects confidentiality, and with authentication also integrity, of data on the way or at rest. It does nothing against deletion, overload, or a legitimate user doing the wrong thing.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'ls -l /etc/shadow /etc/passwd', shows: 'Confidentiality by permissions: the password hashes are readable only by root, the account list by everyone.' },
      { os: 'Linux', command: 'sha256sum download.iso', shows: 'Integrity: the hash of a downloaded file, to compare with the value the publisher states.' },
      { os: 'Linux', command: 'uptime; df -h /', shows: 'Availability starts with trivial things: a system that is running and a disk that is not full.' },
      { os: 'Linux', command: 'last -n 5; sudo journalctl -u ssh -n 20', shows: 'Who logged in recently and what the SSH service recorded: logs are how integrity violations are noticed afterwards.' },
      { os: 'Windows', command: 'Get-FileHash .\\download.iso -Algorithm SHA256', shows: 'The SHA-256 hash of a file (PowerShell).' },
      { os: 'Windows', command: 'Get-Acl C:\\Users\\Public | Format-List', shows: 'Who may do what with a folder.' },
      { os: 'macOS', command: 'shasum -a 256 download.dmg', shows: 'The SHA-256 hash of a file.' },
    ],
    examples: [
      'A hospital is hit by ransomware. No patient data leaves the building, so confidentiality holds, yet operations stop for days: an availability failure.',
      'An attacker changes one account number in a payment file. Nothing was stolen and every system runs; the damage is an integrity failure.',
    ],
  },
  terms: [
    { term: 'CIA triad', definition: 'Confidentiality, integrity and availability: the three goals of information security.' },
    { term: 'Confidentiality', definition: 'The property that information is disclosed only to those authorized to have it.' },
    { term: 'Integrity', definition: 'The property that information is not modified or destroyed improperly; it includes authenticity and non-repudiation.' },
    { term: 'Authenticity', definition: 'The property that something is genuine and comes from the source it claims.' },
    { term: 'Non-repudiation', definition: 'The property that the author of an action or message cannot credibly deny it afterwards.' },
    { term: 'Threat', definition: 'A possible cause of harm, such as an attacker, an error or a natural event.' },
    { term: 'Vulnerability', definition: 'A weakness that a threat can exploit.' },
    { term: 'Risk', definition: 'The combination of how likely a harmful event is and how severe its consequences would be.' },
    { term: 'Defense in depth', definition: 'Stacking several independent protections so that the failure of one does not expose the system.' },
  ],
  related: [{ topic: 'authn-authz' }, { topic: 'hashing-encryption' }, { topic: 'least-privilege' }, { topic: 'high-availability' }, { topic: 'backup' }, { entry: 'arp-spoofing' }, { entry: 'syn-flood' }, { entry: 'dns-poisoning' }, { entry: 'rogue-dhcp' }],
  sources: [
    { spec: 'FIPS PUB 199: Standards for Security Categorization of Federal Information and Information Systems, 2004', note: 'the three security objectives with their definitions from 44 U.S.C. 3542' },
    { spec: 'NIST Computer Security Resource Center: Glossary', url: 'https://csrc.nist.gov/glossary/term/information_security', note: 'information security, confidentiality, integrity, availability' },
    { spec: 'ISO/IEC 27000:2018: Information security management systems, Overview and vocabulary', url: 'https://www.iso.org/standard/73906.html', note: 'threat, vulnerability, risk; withdrawn in July 2026, and the 2026 edition is an overview without this vocabulary; the standard itself was not opened' },
    { rfc: 4949, note: 'Internet Security Glossary, Version 2' },
  ],
  quiz: [
    {
      id: 'ransom',
      prompt: 'Ransomware encrypts all files of a company, and nothing is copied out. Which goal is broken first of all?',
      options: ['Confidentiality', 'Integrity', 'Availability', 'None'],
      answer: 2,
      explanation: 'The data can no longer be used when needed. If the attackers also copied it, confidentiality would be broken as well.',
    },
    {
      id: 'integrity',
      prompt: 'A downloaded installer is compared with the SHA-256 hash on the publisher\'s site. Which goal does this serve?',
      options: ['Confidentiality', 'Integrity', 'Availability', 'Anonymity'],
      answer: 1,
      explanation: 'The comparison shows whether the file was changed on the way. It keeps nothing secret.',
    },
    {
      id: 'flood',
      prompt: 'Which goal does a SYN flood attack?',
      options: ['Confidentiality', 'Integrity', 'Availability', 'Authenticity'],
      answer: 2,
      explanation: 'It reads and changes nothing. It fills the server with half-open connections so that real clients are not served.',
    },
    {
      id: 'risk',
      prompt: 'A server has a known flaw but is not connected to any network and stands in a locked room. How is that best described?',
      options: ['No vulnerability', 'A vulnerability with a low risk, because hardly any threat can reach it', 'A high risk, because the flaw exists', 'An integrity violation'],
      answer: 1,
      explanation: 'The weakness is real. Risk also depends on how likely a threat can use it, and here that is small.',
    },
  ],
};
