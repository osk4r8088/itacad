# Netkit

An interactive learning site for computer networks, in three sections:

- **Protocols:** for each protocol an example exchange in a network view, a sequence diagram, step-by-step explanations and the full packet of every step, layer by layer, with the OSI and TCP/IP models side by side.
- **Tools:** helpers such as a subnet calculator and a header decoder, built on the same header definitions.
- **Learn:** content across protocols, such as the end-to-end path from URL to page.

Live: https://osk4r8088.github.io/netkit-webvisualizer/

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
- **Quick edits:** press `.` on any repo page to open github.dev, a browser editor without a terminal. Good for texts in `src/protocols/exchanges/`.

### GitHub automation

- `.github/workflows/ci.yml` runs typecheck, tests and build on every push and pull request. The built `dist/` is attached to each run as an artifact.
- `.github/workflows/pages.yml` publishes `main` to GitHub Pages: `https://osk4r8088.github.io/netkit-webvisualizer/`.
- `.github/dependabot.yml` opens pull requests for dependency and action updates.

Workflow: create a branch, commit, open a pull request, wait for CI to be green, merge. Merging deploys.

## How the code is organized

```
src/app/                  shell: router, site header, start page, section pages
src/shared/               used by every section
  schema.ts               the data model
  headers/*.ts            header definitions: fields, sizes, explanations, RFC sources,
                          plus a builder that encodes real bytes and computes lengths and checksums
  headers/stacks.ts       common encapsulations, for example Ethernet / IPv4 / TCP
  headers/text.ts         messages of text protocols (HTTP/1.1, SMTP, FTP, IMAP), one field per part
  layers.ts               OSI and TCP/IP layer descriptions
  components/             packet view, header diagram, field info, prose, source list
  hub.ts                  entry type for the tool and lesson registries
src/protocols/
  catalog.ts              list of all exchanges with title, summary, group; loads each on demand
  exchanges/*.ts          one file per protocol exchange
  exchanges/conversation.ts  TCP connection helper (consistent seq/ack) and the shared
                          client, router, Internet, server topology
  exchanges/index.ts      all exchanges loaded at once, for the tests
  components/             exchange page renderers; no protocol-specific code
src/tools/registry.ts     all tools, one folder per tool
src/learn/registry.ts     all lessons
```

Code in `shared/` never imports from a section. Field names, sizes and meanings are defined once per header in `src/shared/headers`. An exchange only supplies participants, steps, texts and field values; the builders encode the actual bytes, so checksums, lengths and the Ethernet FCS shown on the site are computed, not typed in.

## Adding a protocol

1. If the protocol has a header that does not exist yet, add `src/shared/headers/<name>.ts` with a `LayerDef` (fields with their RFC names and sizes, `about` texts, sources) and a builder function. Add a stack helper to `stacks.ts` if the encapsulation is new. Text protocols over TCP need no new header code: build their messages with `textMessage` and send them with `TcpConversation`.
2. Create `src/protocols/exchanges/<name>.ts` exporting an `Exchange`: participants with positions, links, initial states and steps. Each step has a sender, receiver, the path through the network, details texts, key fields and one capture per link of interest. For the packet flow table each step also has a send time, a category (colors and legend come from `categories`), a protocol name and an info line in the style of a packet analyzer.
3. Add it to `src/protocols/exchanges/index.ts` and to `src/protocols/catalog.ts` (id, title, summary, group, loader; `featured` puts it on the start page), and remove its entry from `PLANNED`. Its `group` (Application, Security, Transport, Internet, Link) decides where it appears in the protocol menu and on the overview page.
4. Run `pnpm test`. The tests check that the catalog matches the exchange files, references between participants, links, steps and fields, header lengths, IPv4 and TCP checksums, the Ethernet FCS and protocol-specific invariants.

## Adding a tool or lesson

1. Create `src/tools/<id>/` with the logic, its tests and a component with a default export. Keep logic in plain functions so it can be tested without the UI.
2. In `src/tools/registry.ts`, set the entry to `status: 'ready'` and `component: lazy(() => import('./<id>/<Component>'))`. The start page, the tools page and the route `#/tools/<id>` pick it up.

Lessons work the same way in `src/learn/`.

Conventions:

- Every factual statement follows the RFCs (or IEEE for Ethernet). Each exchange lists its sources; steps and fields cite sections.
- Where a value or statement is not verified, set `unverified` on the field (via the `unverified` annotation of a builder). The site marks it and `pnpm test` lists it.
- Example addresses come from documentation ranges: IPv4 RFC 5737, IPv6 RFC 3849, MAC RFC 7042, domains RFC 2606.
- English texts, no emojis, no em dashes.

## Routes

Hash routes work on any static host:

| Route | Page |
|---|---|
| `#/` | start page |
| `#/protocols` | protocol overview |
| `#/protocols/tcp/3` | step 3 of the TCP exchange |
| `#/tools`, `#/tools/<id>` | tool overview, one tool |
| `#/learn`, `#/learn/<id>` | lessons |

Old links of the form `#/tcp/3` redirect to `#/protocols/tcp/3`. Build links with the `href` helpers in `src/app/router.ts` instead of writing hashes by hand.

## Deploy

Every push to `main` builds the site and publishes it to GitHub Pages (`.github/workflows/pages.yml`):
https://osk4r8088.github.io/netkit-webvisualizer/

The output in `dist/` is plain static files with relative paths, so it also runs from any other static host or subfolder.
