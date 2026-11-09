# Netkit

An interactive learning site for computer networks. It shows what really happens on the wire, down to every bit of every header, and offers tools to work with addresses and packets yourself.

**Live:** https://osk4r8088.github.io/netkit-webvisualizer/

Static site, Vite + React + TypeScript. Everything runs in the browser: no server, no tracking, no requests at runtime.

## What is inside

### Protocols

17 protocol exchanges, from ARP to HTTP/3, each stepped through message by message:

- **Network view:** the participants and an animated packet for every message.
- **Packet flow and sequence diagram:** the whole exchange at a glance, in the style of a packet analyzer.
- **Step details:** what happens, why it works this way, typical values, what can go wrong.
- **Packet view:** the frame layer by layer in the OSI and TCP/IP models, with every header field, its value, size, position and meaning.

| Group | Protocols |
|---|---|
| Application | DHCP, DNS, NTP, HTTP/1.1, HTTP/2, HTTP/3 and QUIC, SMTP, IMAP, FTP, WebSocket |
| Security | TLS 1.3, SSH |
| Transport | TCP, UDP |
| Internet | IPv4, ICMP |
| Link | ARP |

Planned: IPv6 with NDP and SLAAC ([#27](https://github.com/osk4r8088/netkit-webvisualizer/issues/27)), NAT and PAT ([#28](https://github.com/osk4r8088/netkit-webvisualizer/issues/28)), VLAN tagging and trunks ([#29](https://github.com/osk4r8088/netkit-webvisualizer/issues/29)), Spanning Tree ([#30](https://github.com/osk4r8088/netkit-webvisualizer/issues/30)).

### Tools

**Everyday tools:** for real tasks.

| Tool | Status |
|---|---|
| Subnet calculator: network, broadcast, host range and mask of an IPv4 prefix, bit by bit | ready |
| Header decoder: paste a frame as hex and see every field of Ethernet, ARP, IPv4, TCP, UDP and ICMP, with checksums verified | ready |
| Well-known ports: searchable reference of common ports with transport, purpose and source, plus the port ranges | ready |
| Number converter: decimal, binary, hexadecimal and octal, bit widths, two's complement, byte order | ready |
| Passwords: passphrase and password generator with entropy, and a pattern-based strength check (zxcvbn) | ready |
| VLSM subnet planner | planned, [#31](https://github.com/osk4r8088/netkit-webvisualizer/issues/31) |
| IPv6 address tool | planned, [#32](https://github.com/osk4r8088/netkit-webvisualizer/issues/32) |
| Bandwidth calculator | planned, [#33](https://github.com/osk4r8088/netkit-webvisualizer/issues/33) |

**Explore and understand:** interactive models of how something works.

| Tool | Status |
|---|---|
| TCP state machine: the RFC 9293 state diagram, walked through event by event, with scenarios and links into the TCP exchange | ready |
| DNS record explorer: 15 record types with their fields and wire format, an example zone with mail, DNSSEC and reverse DNS, common mistakes | ready |
| RAID visualizer: layouts of RAID 0, 1, 5, 6 and 10, failing disks, parity and Reed-Solomon reconstruction bit by bit, rebuild risk | ready |

### Learn

- **From URL to page:** a laptop joins a network and opens https://www.example.com, frame by frame in 25 steps: DHCP, ARP for the resolver, DNS, ARP for the gateway, TCP, TLS 1.3 and HTTP/2. A phase bar, a "known so far" panel and links to each protocol page show how the protocols hand over to each other.
- **Attack: ARP spoofing:** an attacker in the LAN poisons the ARP caches of a laptop and its gateway, the traffic runs through the attacker (with the TTL as a trace), and a switch with Dynamic ARP Inspection stops it. The frames show how the attack works; no tooling.
- Planned: OSI and TCP/IP overview ([#34](https://github.com/osk4r8088/netkit-webvisualizer/issues/34)), more attack scenarios: SYN flood, DNS cache poisoning, rogue DHCP ([#8](https://github.com/osk4r8088/netkit-webvisualizer/issues/8)), quizzes ([#7](https://github.com/osk4r8088/netkit-webvisualizer/issues/7)).

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
4. Squash and merge. The merge deploys the site to GitHub Pages, and the issue closes.

Dependabot opens pull requests for dependency and action updates.

## How the code is organized

```
src/app/                  shell: router, site header, start page, section pages
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
  decoder/                header decoder
  numbers/                number converter
  tcp-states/             TCP state machine
  ports/                  well-known ports
  passwords/              password generator and analyzer
  dns-records/            DNS record explorer
  raid/                   RAID visualizer
src/learn/
  registry.ts             all lessons
  url-to-page/            the chained exchange "From URL to page"
  arp-spoofing/           attack scenario: ARP spoofing and Dynamic ARP Inspection
  exchanges.ts            all lesson exchanges, for the tests
  LessonExchange.tsx      shows a lesson exchange on the exchange page
```

Each protocol, tool and lesson is loaded only when it is opened.

## Adding a protocol

1. If the protocol has a header that does not exist yet, add `src/shared/headers/<name>.ts` with a `LayerDef` (fields with their RFC names and sizes, `about` texts, sources) and a builder function. Add a stack helper to `stacks.ts` if the encapsulation is new. Text protocols over TCP need no new header code: build their messages with `textMessage` and send them with `TcpConversation`.
2. Create `src/protocols/exchanges/<name>.ts` exporting an `Exchange`: participants with positions, links, initial states and steps. Each step has a sender, receiver, the path through the network, details texts, key fields and one capture per link of interest. For the packet flow table each step also has a send time, a category, a protocol name and an info line in the style of a packet analyzer.
3. Add it to `src/protocols/exchanges/index.ts` and to `src/protocols/catalog.ts` (id, title, summary, group, loader; `featured` puts it on the start page). Its `group` (Application, Security, Transport, Internet, Link) decides where it appears in the menu.
4. Run `pnpm test`.

## Adding a tool or lesson

1. Create `src/tools/<id>/` with the logic as plain functions, its tests, and a component with a default export.
2. In `src/tools/registry.ts`, give the entry a `purpose` (`use` for everyday tools, `understand` for models), set it to `status: 'ready'` and `component: lazy(() => import('./<id>/<Component>'))`. The start page, the tools page and the route `#/tools/<id>` pick it up.

Lessons work the same way in `src/learn/`. A lesson can also be an exchange: give its registry entry an `exchange` loader instead of a component, and it opens on the exchange page at `#/learn/<id>/<step>`. Exchanges that chain protocols set `phases` (with a `deepDive` exchange each), a `phase` on every step, and `learned` facts where the client learns something; the page then shows the phase bar and the "known so far" panel. A fact can be learned again with a new value (a poisoned cache entry), which the panel marks as changed. Add every lesson exchange to `src/learn/exchanges.ts` so the tests cover it. `src/learn/url-to-page/` is the example; it reuses the frames of the protocol exchanges, so the bytes always match.

## Conventions

- Every factual statement follows the RFCs (or IEEE for Ethernet), with sources on the page; steps and fields cite sections.
- Where a value or statement is not verified, set `unverified` on the field. The site marks it and `pnpm test` lists it.
- Example addresses come from documentation ranges: IPv4 RFC 5737, IPv6 RFC 3849, MAC RFC 7042, domains RFC 2606.
- English texts, no emojis, no em dashes.
- The repository is public: no personal data, private hostnames or infrastructure details.

## Routes

Hash routes work on any static host:

| Route | Page |
|---|---|
| `#/` | start page |
| `#/protocols` | protocol overview |
| `#/protocols/tcp/3` | step 3 of the TCP exchange |
| `#/tools`, `#/tools/<id>` | tool overview, one tool |
| `#/learn`, `#/learn/<id>` | lessons |
| `#/learn/url-to-page/7` | step 7 of a lesson that is an exchange |

Old links of the form `#/tcp/3` redirect to `#/protocols/tcp/3`. Build links with the `href` helpers in `src/app/router.ts`.

## Third-party content

- [zxcvbn-ts](https://github.com/zxcvbn-ts/zxcvbn) (MIT) for the password strength estimate, loaded only on the password page.
- [EFF Large Wordlist for Passphrases](https://www.eff.org/dice) (CC BY 3.0 US) for generated passphrases, see `src/tools/passwords/WORDLIST.md`.
- Inter and JetBrains Mono fonts (SIL Open Font License), self-hosted.

## Deploy

Every push to `main` builds the site and publishes it to GitHub Pages (`.github/workflows/pages.yml`). The output in `dist/` is plain static files with relative paths, so it also runs from any other static host or subfolder.
