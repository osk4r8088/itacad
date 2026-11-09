# Protocol Explorer

An interactive learning site for Internet protocols. For each protocol it shows an example exchange in a network view, a sequence diagram, step-by-step explanations and the full packet of every step, layer by layer, with the OSI and TCP/IP models side by side.

Static site, Vite + React + TypeScript, no requests at runtime.

## Develop

```bash
pnpm install
pnpm dev        # local dev server
pnpm test       # data checks (references, lengths, checksums, FCS, sequence numbers)
pnpm build      # type check and static build into dist/
```

### In the browser (no local install needed)

- **Codespaces:** on GitHub, Code > Codespaces > Create codespace on a branch. The dev container (`.devcontainer/`) installs Node, pnpm and the dependencies. Run `pnpm dev`; port 5173 opens as a preview.
- **Quick edits:** press `.` on any repo page to open github.dev, a browser editor without a terminal. Good for texts in `src/exchanges/`.

### GitHub automation

- `.github/workflows/ci.yml` runs typecheck, tests and build on every push and pull request. The built `dist/` is attached to each run as an artifact.
- `.github/workflows/pages.yml` publishes `main` to GitHub Pages: `https://osk4r8088.github.io/networkprotocol-webvisualizer/`.
- `.github/dependabot.yml` opens pull requests for dependency and action updates.

Workflow: create a branch, commit, open a pull request, wait for CI to be green, merge. Merging deploys.

## How the data is organized

```
src/schema.ts         the data model
src/headers/*.ts      header definitions: fields, sizes, explanations, RFC sources,
                      plus a builder that encodes real bytes and computes lengths and checksums
src/headers/stacks.ts common encapsulations, for example Ethernet / IPv4 / TCP
src/headers/text.ts   messages of text protocols (HTTP/1.1, SMTP, FTP, IMAP), one field per part
src/layers.ts         OSI and TCP/IP layer descriptions
src/exchanges/*.ts    one file per protocol exchange
src/exchanges/conversation.ts  TCP connection helper (consistent seq/ack) and the shared
                      client, router, Internet, server topology
src/exchanges/index.ts registry of all exchanges
src/components/       renderers; they contain no protocol-specific code
```

Field names, sizes and meanings are defined once per header in `src/headers`. An exchange only supplies participants, steps, texts and field values; the builders encode the actual bytes, so checksums, lengths and the Ethernet FCS shown on the site are computed, not typed in.

## Adding a protocol

1. If the protocol has a header that does not exist yet, add `src/headers/<name>.ts` with a `LayerDef` (fields with their RFC names and sizes, `about` texts, sources) and a builder function. Add a stack helper to `stacks.ts` if the encapsulation is new. Text protocols over TCP need no new header code: build their messages with `textMessage` and send them with `TcpConversation`.
2. Create `src/exchanges/<name>.ts` exporting an `Exchange`: participants with positions, links, initial states and steps. Each step has a sender, receiver, the path through the network, details texts, key fields and one capture per link of interest. For the packet flow table each step also has a send time, a category (colors and legend come from `categories`), a protocol name and an info line in the style of a packet analyzer.
3. Register it in `src/exchanges/index.ts` and remove its entry from `PLANNED`. Its `group` (Application, Security, Transport, Internet, Link) decides where it appears in the protocol menu and on the overview page.
4. Run `pnpm test`. The tests check references between participants, links, steps and fields, header lengths, IPv4 and TCP checksums, the Ethernet FCS and protocol-specific invariants.

Conventions:

- Every factual statement follows the RFCs (or IEEE for Ethernet). Each exchange lists its sources; steps and fields cite sections.
- Where a value or statement is not verified, set `unverified` on the field (via the `unverified` annotation of a builder). The site marks it and `pnpm test` lists it.
- Example addresses come from documentation ranges: IPv4 RFC 5737, IPv6 RFC 3849, MAC RFC 7042, domains RFC 2606.
- English texts, no emojis, no em dashes.

## Routes

Hash routes work on any static host: `#/` is the overview, `#/tcp/3` is step 3 of the TCP exchange.

## Publish

```bash
scripts/publish.sh            # test, build, upload to core:/var/www/protocols
scripts/publish.sh offline    # move to /var/www/.off/protocols
scripts/publish.sh online     # move back
```

The site is then at `https://protocols-dev.home.example.com`. Requires `ssh user@server` with a key (Git Bash on Windows works).
