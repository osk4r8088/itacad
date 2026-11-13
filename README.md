# ITACAD

A visual learning site for IT, meant to grow from basic concepts down to the details. Its core today is networking: what really happens on the wire, down to every bit of every header, with tools to work with addresses and packets yourself. Formerly called Netkit.

**Live:** https://osk4r8088.github.io/itacad/

Static site, Vite + React + TypeScript. Everything runs in the browser: no server, no tracking, no requests at runtime.

## What is inside

### Basics & Concepts

The building blocks of IT around the network, from level 1 (no prior knowledge) upwards. Eight categories: hardware, operating systems, virtualization and containers, software development, data and encoding, cloud and operations, security basics, databases. Every topic follows one template: definition and why it matters, the explanation in short sections, misconceptions, commands to try on Linux, Windows and macOS, typical numbers, key terms (collected in a glossary), a quiz, related pages and sources.

- **Hardware:** CPU, RAM and the memory hierarchy (with a latency scale that can stretch nanoseconds to human time), storage (HDD, SSD, SATA, NVMe), GPU, mainboard and buses (PCI Express, USB), the network interface card, switch, router, firewall and access point, server vs desktop, hardware support for virtualization, and power and UPS. An "inside a computer" diagram links each part to its topic.
- **Operating systems:** kernel and user space (with a diagram of the boundary, one explanation per part), processes and threads, virtual memory, file systems, the boot process, device drivers, and users and permissions.
- **Virtualization and containers:** hypervisors, virtual machines, containers and virtual machines compared (with both stacks side by side), images and registries, and orchestration basics.
- **Data and encoding:** number systems, data units, character encoding (ASCII, Unicode, UTF-8, with an encoder that shows the bits of any text typed in), compression and serialization (JSON, XML, YAML).
- **Software development:** compiler, linker, interpreter, JIT and bytecode, debugger, with a step-through of one function from source text to a linked program. Build systems, version control, testing and CI/CD are planned.

### Protocols

21 protocol exchanges, from ARP to HTTP/3, each stepped through message by message:

- **Network view:** the participants and an animated packet for every message.
- **Packet flow and sequence diagram:** the whole exchange at a glance, in the style of a packet analyzer.
- **Step details:** what happens, why it works this way, typical values, what can go wrong.
- **Packet view:** the frame layer by layer in the OSI and TCP/IP models, with every header field, its value, size, position and meaning.

| Group | Protocols |
|---|---|
| Application | DHCP, DNS, NTP, HTTP/1.1, HTTP/2, HTTP/3 and QUIC, SMTP, IMAP, FTP, WebSocket |
| Security | TLS 1.3, SSH |
| Transport | TCP, UDP |
| Internet | IPv4, IPv6 with NDP and SLAAC, ICMP, NAT and PAT |
| Link | ARP, VLAN (802.1Q), Spanning Tree |


### Tools

For real tasks: calculate, decode, plan, generate. Section `#/tools`.

| Tool | Status |
|---|---|
| Subnet calculator: network, broadcast, host range and mask of an IPv4 prefix, bit by bit | ready |
| Header decoder: paste a frame as hex and see every field of Ethernet, 802.1Q, ARP, IPv4, IPv6 (extension headers skipped by length), TCP, UDP, ICMP and ICMPv6 with Neighbor Discovery, and of DNS, DHCP and NTP inside UDP, with checksums verified | ready |
| Number converter: decimal, binary, hexadecimal and octal, bit widths, two's complement, byte order | ready |
| Passwords: passphrase and password generator with entropy, and a pattern-based strength check (zxcvbn) | ready |
| VLSM subnet planner: one block split into subnets for a list of networks, largest first on aligned boundaries, with a block map, bit view, wasted and free space | ready |
| IPv6 address tool: recommended text form (RFC 5952), prefix and range, address type from the IANA special-purpose registry, multicast scope, EUI-64, solicited-node group, reverse DNS name | ready |
| Bandwidth calculator: bits and bytes with decimal and binary prefixes, transfer time with Ethernet, IP and TCP overhead, bandwidth-delay product and the window needed | ready |

### Explore and understand

Interactive models and references that show how something works inside. A section of its own, `#/explore`.

| Entry | Status |
|---|---|
| TCP state machine: the RFC 9293 state diagram, walked through event by event, with scenarios and links into the TCP exchange | ready |
| DNS record explorer: 15 record types with their fields and wire format, an example zone with mail, DNSSEC and reverse DNS, common mistakes | ready |
| RAID visualizer: layouts of RAID 0, 1, 5, 6 and 10, failing disks, parity and Reed-Solomon reconstruction bit by bit, rebuild risk | ready |
| Well-known ports: searchable reference of common ports with transport, purpose and source, plus the port ranges | ready |

### Learn

- **From URL to page:** a laptop joins a network and opens https://www.example.com, frame by frame in 25 steps: DHCP, ARP for the resolver, DNS, ARP for the gateway, TCP, TLS 1.3 and HTTP/2. A phase bar, a "known so far" panel and links to each protocol page show how the protocols hand over to each other.
- **Attack: ARP spoofing:** an attacker in the LAN poisons the ARP caches of a laptop and its gateway, the traffic runs through the attacker (with the TTL as a trace), and a switch with Dynamic ARP Inspection stops it. The frames show how the attack works; no tooling.
- **Attack: SYN flood:** SYNs from forged addresses fill a server's queue of half-open connections until a real client is turned away; SYN cookies pack the connection state into the sequence number.
- **Attack: DNS cache poisoning:** an off-path attacker triggers lookups of random names and races the real name server with forged answers (Kaminsky), plants a false delegation, and receives every question about the zone; random source ports and DNSSEC stop it.
- **Attack: rogue DHCP server:** a host in the LAN answers DHCP first and configures itself as gateway and DNS server; DHCP snooping drops server messages from untrusted ports.
- **OSI and TCP/IP:** both models side by side. Each layer shows its job, unit of data, addresses, devices, the protocols and tools of this site that belong to it, and typical problems with Linux commands to diagnose them. Picking a protocol shows where it sits (with notes for borderline cases like TLS, QUIC, ICMP and ARP), and one real HTTP request grows from 37 to 115 octets on its way down.
- **Quizzes:** multiple-choice questions for every protocol and every lesson; each answer is explained and links to the step that shows it (for the OSI and TCP/IP overview: to the layer). Protocol and lesson pages link to their quiz in the header.

### Search

One search field for the whole site, in the header of every page (shortcut `/`). It finds topics, protocols, tools, lessons, single steps, header fields, glossary terms, ports and quiz questions, grouped by kind. A header field opens in the packet view of a step that shows it. The index is built together with the site and loaded when the search is opened; nothing is sent anywhere.

### Correct by construction

- Every field name, size and meaning follows the RFCs (IEEE 802.3 for Ethernet), and every page lists its sources.
- Bytes on the protocol pages are encoded by builders, so lengths, checksums and the Ethernet FCS are computed, not typed in.
- The tests check references, lengths, checksums and sequence numbers of every exchange. They also decode every frame of every exchange with the header decoder and compare the result field by field.
- Values that are not verified against a source are marked on the site.

## Develop

```bash
pnpm install
pnpm dev        # local dev server
pnpm test       # all tests
pnpm build      # type check and static build into dist/
```

### In the browser, no local install needed

- **Codespaces:** Code > Codespaces > Create codespace on a branch. The dev container installs Node, pnpm and the dependencies. Run `pnpm dev`; port 5173 opens as a preview.
- **Quick edits:** press `.` on any repo page to open github.dev, an editor without a terminal. Good for texts in `src/protocols/exchanges/`.

### Workflow

1. Pick or open an issue.
2. Create a branch, commit, and open a pull request that says `Closes #<issue>`.
3. CI runs typecheck, tests and build on the pull request. `main` is protected, so merging requires a green CI.
4. A preview of the pull request is published at `https://osk4r8088.github.io/itacad/pr-<number>/`, and a comment on the pull request links to it.
5. Squash and merge. The merge deploys the site to GitHub Pages, removes the preview, and closes the issue.

Dependabot opens pull requests for dependency and action updates.

## How the code is organized

```
src/app/                  shell: router, site header, start page, section pages;
                          entries.ts resolves references, levels and start page paths
src/shared/               used by every section; never imports from a section
  schema.ts               the data model
  headers/*.ts            header definitions: fields, sizes, explanations, RFC sources,
                          plus builders that encode real bytes and compute lengths and checksums
  headers/stacks.ts       common encapsulations, for example Ethernet / IPv4 / TCP
  headers/text.ts         messages of text protocols (HTTP/1.1, SMTP, FTP, IMAP)
  layers.ts               OSI and TCP/IP layer descriptions
  components/             packet view (CaptureView), header diagram, field info, sources
  hub.ts                  entry type for the tool and lesson registries
src/protocols/
  catalog.ts              all exchanges with title, summary and group; loads each on demand
  exchanges/*.ts          one file per protocol exchange
  exchanges/conversation.ts  TCP connection helper and the shared client, router, server topology
  exchanges/index.ts      all exchanges loaded at once, for the tests
  components/             exchange page; no protocol-specific code
src/tools/
  registry.ts             all tools, ready and planned
  subnet/                 subnet calculator
  decoder/                header decoder: decode.ts for the link, internet and transport layers,
                          dns.ts, dhcp.ts and ntp.ts for the application protocols inside UDP
  numbers/                number converter
  tcp-states/             TCP state machine
  ports/                  well-known ports
  passwords/              password generator and analyzer
  dns-records/            DNS record explorer
  ipv6/                   IPv6 address tool
  vlsm/                   VLSM subnet planner (reuses the subnet logic)
  bandwidth/              bandwidth calculator
  raid/                   RAID visualizer
src/learn/
  registry.ts             all lessons
  layers/                 OSI and TCP/IP overview: layer facts in data.ts, the page in LayersPage.tsx
  url-to-page/            the chained exchange "From URL to page"
  arp-spoofing/           attack scenario: ARP spoofing and Dynamic ARP Inspection
  syn-flood/              attack scenario: SYN flood and SYN cookies
  dns-poisoning/          attack scenario: DNS cache poisoning, port randomization, DNSSEC
  rogue-dhcp/             attack scenario: rogue DHCP server and DHCP snooping
  spec.ts                 flat step format shared by the lessons
  exchanges.ts            all lesson exchanges, for the tests
  LessonExchange.tsx      shows a lesson exchange on the exchange page
src/basics/
  schema.ts               topic template
  catalog.ts              categories and topics (metadata; topics load on demand)
  topics/<category>/      one file per topic
  figures/                diagrams and interactive pieces that topics refer to by id
  BasicsPages.tsx         overview, category, topic and glossary pages
src/search/
  build.ts                builds the index from catalogs, registries, exchanges, topics, ports and quizzes
  built.ts                entry for the plugin in vite.config.ts, which turns the index into a file of its own
  search.ts               matching and ranking, without React
  SearchButton.tsx, SearchDialog.tsx
src/quizzes/
  schema.ts               question format
  catalog.ts              quizzes by protocol or lesson id, loaded on demand
  all.ts                  all quizzes, for the tests
  tcp.ts                  one file per protocol
  QuizIndex.tsx, QuizPage.tsx
```

Each protocol, tool and lesson is loaded only when it is opened.

## Adding a protocol

1. If the protocol has a header that does not exist yet, add `src/shared/headers/<name>.ts` with a `LayerDef` (fields with their RFC names and sizes, `about` texts, sources) and a builder function. Add a stack helper to `stacks.ts` if the encapsulation is new. Text protocols over TCP need no new header code: build their messages with `textMessage` and send them with `TcpConversation`.
2. Create `src/protocols/exchanges/<name>.ts` exporting an `Exchange`: participants with positions, links, initial states and steps. Each step has a sender, receiver, the path through the network, details texts, key fields and one capture per link of interest. For the packet flow table each step also has a send time, a category, a protocol name and an info line in the style of a packet analyzer.
3. Add it to `src/protocols/exchanges/index.ts` and to `src/protocols/catalog.ts` (id, title, summary, group, loader). To show it as a highlight on the start page, add it to `src/app/sections.ts`. Its `group` (Application, Security, Transport, Internet, Link) decides where it appears in the menu.
4. Run `pnpm test`.

## Adding a tool or lesson

1. Create `src/tools/<id>/` with the logic as plain functions, its tests, and a component with a default export.
2. In `src/tools/registry.ts`, give the entry a `purpose`, set it to `status: 'ready'` and `component: lazy(() => import('./<id>/<Component>'))`. `use` puts it under Tools (`#/tools/<id>`), `understand` under Explore and understand (`#/explore/<id>`); the section pages and the header pick it up (start page highlights are chosen in `src/app/sections.ts`). Link to an entry with `entryHref(id)`, which knows its section; a link to the other section redirects.

Lessons work the same way in `src/learn/`. A lesson can also be an exchange: give its registry entry an `exchange` loader instead of a component, and it opens on the exchange page at `#/learn/<id>/<step>`. Exchanges that chain protocols set `phases` (with a `deepDive` exchange each), a `phase` on every step, and `learned` facts where the client learns something; the page then shows the phase bar and the "known so far" panel. A fact can be learned again with a new value (a poisoned cache entry), which the panel marks as changed. Add every lesson exchange to `src/learn/exchanges.ts` so the tests cover it. `src/learn/url-to-page/` is the example; it reuses the frames of the protocol exchanges, so the bytes always match.

## Levels and prerequisites

Every topic, protocol, tool and lesson has a `level` (1 Foundations, 2 Practitioner, 3 Deep dive; see `src/shared/levels.ts`) and optional `prereqs`, references to other entries shown as "Read first" links. Cards show the level, and overview pages filter by it. The start page suggests a path per level, defined in `PATHS` in `src/app/entries.ts`. `pnpm test` checks that prerequisites exist, are never at a higher level than the entry, and form no cycles, and that the paths link only to ready pages. Nothing is stored about the reader.

## Adding a Basics & Concepts topic

1. Create `src/basics/topics/<category>/<id>.ts` exporting a `Topic` (see `src/basics/schema.ts`). Sections are made of blocks: text, list, comparison table, note, or a figure by id.
2. Add the topic to `TOPICS` in `src/basics/catalog.ts` with its level, prerequisites and a loader, or flip a planned entry to ready.
3. An interactive piece is a small component in `src/basics/figures/`, registered in `figures/index.ts`; topics refer to it by id.
4. `pnpm test` checks that every part of the template is there, that related links and figures resolve, that quiz answers are valid, that glossary terms are unique, and that no source is Wikipedia.

Sources for topics without RFCs: formal standards first (ISO/IEC, IEEE, JEDEC, NIST, vendor-neutral specifications), then official documentation, then established textbooks. Values that vary between machines are given as typical ranges and say so.

## Search index

New protocols, tools, lessons, topics, ports and quizzes appear in the search without extra work: `src/search/build.ts` reads the same lists and data the pages render. `pnpm test` checks that every entry is in the index, that every result links to a place that exists (down to the header field), and that a set of known queries finds the expected page first. A new kind of content needs a few lines in `build.ts` and a label in `src/search/schema.ts`.

## Adding a quiz

1. Create `src/quizzes/<protocol or lesson id>.ts` exporting a `Quiz` (see `src/quizzes/schema.ts`): for each question a prompt, three or four options, the index of the right one, an explanation, the id of the step that shows it, and the source.
2. Add it to `QUIZZES` in `src/quizzes/catalog.ts` and to `src/quizzes/all.ts`.
3. `pnpm test` checks the format, that every step id exists in the exchange, and that the right answers are not all in the same position. It also fails if a protocol or a lesson has no quiz, so a new one needs its quiz.

Answers follow the exchange and its RFCs; a question that needs a fact the exchange does not show should cite its own source. A lesson without steps sets `layer` instead of `step`: that is the OSI and TCP/IP overview, whose questions link to `#/learn/layers/<layer>`.

## Conventions

- Every factual statement follows the RFCs (or IEEE for Ethernet), with sources on the page; steps and fields cite sections.
- Where a value or statement is not verified, set `unverified` on the field. The site marks it and `pnpm test` lists it.
- Example addresses come from documentation ranges: IPv4 RFC 5737, IPv6 RFC 3849, MAC RFC 9542, domains RFC 2606.
- English texts, no emojis, no em dashes.
- The repository is public: no personal data, private hostnames or infrastructure details.

## Routes

Hash routes work on any static host:

| Route | Page |
|---|---|
| `#/` | start page |
| `#/protocols` | protocol overview |
| `#/protocols/tcp/3` | step 3 of the TCP exchange |
| `#/protocols/tcp/3/tcp/window` | the same step with a header (and optionally a field) selected in the packet view |
| `#/tools`, `#/tools/<id>` | everyday tools, one tool |
| `#/explore`, `#/explore/<id>` | models and references to explore, one of them |
| `#/learn`, `#/learn/<id>` | lessons |
| `#/learn/url-to-page/7` | step 7 of a lesson that is an exchange |
| `#/learn/layers/4` | the OSI and TCP/IP overview with layer 4 selected |
| `#/learn/quizzes/tcp`, `#/learn/quizzes/syn-flood` | the quiz of one protocol or lesson |
| `#/basics`, `#/basics/<category>` | Basics & Concepts, one category |
| `#/basics/<category>/<topic>` | one topic |
| `#/basics/glossary` | all key terms |

Old links of the form `#/tcp/3` redirect to `#/protocols/tcp/3`. Build links with the `href` helpers in `src/app/router.ts`.

## Third-party content

- [zxcvbn-ts](https://github.com/zxcvbn-ts/zxcvbn) (MIT) for the password strength estimate, loaded only on the password page.
- [EFF Large Wordlist for Passphrases](https://www.eff.org/dice) (CC BY 3.0 US) for generated passphrases, see `src/tools/passwords/WORDLIST.md`.
- Inter and JetBrains Mono fonts (SIL Open Font License), self-hosted.

## Deploy

GitHub Pages serves the `gh-pages` branch (Settings > Pages > Source: "Deploy from a branch", `gh-pages`, `/ (root)`). Nobody edits that branch by hand; two workflows write to it through `.github/scripts/publish-pages.sh`:

- `.github/workflows/deploy.yml`: every push to `main` builds the site and replaces the top level of the branch.
- `.github/workflows/preview.yml`: every pull request from this repository gets its build in `pr-<number>/`, updated on each push and removed when the pull request closes. Pull requests from forks and from Dependabot get no preview, because their runs only have a read-only token; CI still attaches the build as an artifact (`dist`) to every run.

The output in `dist/` is plain static files with relative paths, so it also runs from any other static host or subfolder.
