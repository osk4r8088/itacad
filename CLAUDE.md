# Brief: Protocol Explorer (paste into a new Claude Code session)

You are helping me build an interactive learning site for internet protocols. I want to understand them deeply, so correctness matters more than visual effects. Work in this repo with me step by step. Ask before big structural decisions; for small ones, decide and tell me.

## The idea

For each protocol, the site shows an example exchange (for example "a browser requests a web page") as:

1. **Network view:** the participants (client, router, DNS resolver, server, ...) as nodes; each message travels as an animated packet along the path.
2. **Sequence view:** a sequence diagram of the same exchange, one row per message.
3. **Clickable steps:** step forward and back, or click any message. The current step is highlighted in both views at the same time.
4. **Step details panel:** what happens in this step and why, which fields matter, typical values, what can go wrong, plus an "insight" line (for example why the TCP handshake has three steps, not two).
5. **Packet view per step:** the encapsulation, layer by layer along the OSI model (and the TCP/IP model next to it), with the real header fields of each layer and example values. Clicking a layer explains it.

## The 15 protocols (proposal, confirm with me first)

ARP, IPv4 with a note on IPv6, ICMP (ping and traceroute), UDP, TCP (handshake, data, teardown), DHCP (DORA), DNS (recursive resolution), TLS 1.3 handshake, HTTP/1.1, HTTP/2, HTTP/3 with QUIC, WebSocket upgrade, SMTP, SSH (connection setup), NTP.

Ethernet frames appear in every exchange as the bottom layer. Later possible: an end-to-end scenario that chains them ("typing a URL and pressing Enter": DHCP, ARP, DNS, TCP, TLS, HTTP).

## Data first

- Every exchange is **data, not code**: one typed file per protocol (TypeScript or JSON with a schema) listing participants, steps, per-step headers per layer, explanation texts and sources.
- The visual components only render that data. Adding protocol 16 must not need new component code.
- Every factual claim (header layouts, field sizes, flags, state names) follows the RFCs. Each protocol file lists the RFCs it is based on, and the site shows them. If you are unsure about a detail, mark it and tell me instead of guessing.
- Build one protocol completely (I suggest TCP), review it with me, and only then do the others.

## Technical requirements

- **Static output only.** Recommended: Vite with React and TypeScript, diagrams in hand-written SVG (full control, small bundle), animations with CSS or a small library. If you prefer something else (Astro islands, Svelte), argue it before starting.
- **Package manager:** pnpm.
- **No external requests at runtime:** no CDNs, no analytics, fonts self-hosted.
- **Usable:** keyboard navigation through steps (arrow keys), works on a phone (views stack vertically), respects reduced-motion settings, good contrast in light and dark mode.
- **Language:** ask me whether the UI and explanations are German or English. Protocol field names stay in their original form.

## Where it runs (self-hosted)

- Static site at `https://<project>-dev.home.example.com`, behind my login proxy. Caddy serves `/var/www/<project>` on the server; extensionless URLs resolve via `try_files`. Use a client-side router that works with static hosting (hash routes or one HTML file per route).
- Project name suggestion: `protocols`; ask me.
- Add a publish script:
  ```bash
  P=<project>
  ssh user@server "mkdir -p /var/www/$P && find /var/www/$P -mindepth 1 -delete"
  tar -C dist -cf - . | ssh user@server "tar -C /var/www/$P -xf -"
  # offline: mv to /var/www/.off/$P, online: move back
  ```
  `ssh user@server` works with my key from the PC (Git Bash on Windows).

## How I want to work

- Start with: data schema for one exchange, component structure, a rough layout sketch in words or ASCII. Wait for my OK.
- Then TCP end to end, then review, then the remaining protocols in small batches. Commit after each step.
- A short `README.md`: how to add a protocol, how to publish.
- Style: no emojis in code or UI, no em dashes in text, clean structure.
