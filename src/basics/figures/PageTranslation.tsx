import { useState } from 'react';
import {
  FRAME_COUNT,
  PAGE_TABLES,
  frameOwners,
  hexAddress,
  hexOffset,
  hexPage,
  hexPhysical,
  parseAddress,
  presets,
  rights,
  translate,
  type Access,
  type ProcessId,
  type Translation,
} from './paging';

const PROCESSES: ProcessId[] = ['A', 'B'];
const OWNERS = frameOwners();

/** Two processes, their page tables and physical memory: follow one address from virtual to physical. */
export default function PageTranslation() {
  const [process, setProcess] = useState<ProcessId>('A');
  const [access, setAccess] = useState<Access>('read');
  const [text, setText] = useState(hexAddress(0x00400a2c));
  const address = parseAddress(text);
  const t = address === undefined ? undefined : translate(process, address, access);
  const hitFrame = t?.outcome.kind === 'ok' ? t.outcome.frame : undefined;
  const hitPage = t && t.outcome.kind !== 'unmapped' ? t.outcome.entry.page : undefined;

  return (
    <div className="vm-figure">
      <div className="vm-controls">
        <div className="vm-choice" role="group" aria-label="Process">
          <span>Process</span>
          {PROCESSES.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={process === p} onClick={() => setProcess(p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="vm-choice" role="group" aria-label="Access">
          <span>Access</span>
          {(['read', 'write'] as Access[]).map((a) => (
            <button key={a} type="button" className="chip" aria-pressed={access === a} onClick={() => setAccess(a)}>
              {a === 'read' ? 'Read' : 'Write'}
            </button>
          ))}
        </div>
        <label className="vm-address">
          <span>Virtual address</span>
          <input value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoComplete="off" aria-invalid={address === undefined} />
        </label>
      </div>
      <div className="vm-presets" role="group" aria-label="Examples">
        {presets(process).map((p) => (
          <button
            key={p.label}
            type="button"
            className="link-button"
            onClick={() => {
              setText(hexAddress(p.address));
              setAccess(p.access);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {t ? <Split t={t} /> : <p className="vm-split notice">Enter a hexadecimal address, for example 0x00400a2c, up to {hexAddress(2 ** 47 - 1)}.</p>}

      <div className="vm-tables">
        {PROCESSES.map((p) => (
          <table key={p} className={`vm-table${p === process ? ' is-active' : ''}`}>
            <caption>Page table of process {p}</caption>
            <thead>
              <tr>
                <th scope="col">Virtual page</th>
                <th scope="col">Holds</th>
                <th scope="col">Frame</th>
                <th scope="col">Rights</th>
              </tr>
            </thead>
            <tbody>
              {PAGE_TABLES[p].map((e) => {
                const hit = p === process && e.page === hitPage;
                return (
                  <tr key={e.page} className={hit ? `is-hit is-${t!.outcome.kind}` : undefined}>
                    <td className="mono">{hexPage(e.page)}</td>
                    <td>{e.what}</td>
                    <td className="mono">{e.frame === undefined ? 'not present' : e.frame}</td>
                    <td className="mono">{rights(e)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>

      <div className="vm-memory" role="list" aria-label={`Physical memory, ${FRAME_COUNT} frames of 4 KiB`}>
        {OWNERS.map(({ frame, owners }) => (
          <div key={frame} role="listitem" className={`vm-frame${frame === hitFrame ? ' is-hit' : ''}${owners.length ? '' : ' is-free'}`}>
            <span className="vm-frame-no">Frame {frame}</span>
            <span className="vm-frame-owner">{owners.length ? owners.join(', ') : 'free'}</span>
          </div>
        ))}
      </div>

      {t && (
        <p className="vm-result" aria-live="polite">
          <Result t={t} process={process} access={access} />
        </p>
      )}
      <p className="vm-note">
        Simplified for the picture: real x86-64 page tables are a tree of four levels, which this figure shows as one list of the pages in use, and physical memory has only {FRAME_COUNT} frames. Addresses and frame numbers are invented; the rules are real.
      </p>
    </div>
  );
}

/** The address with page number and offset apart: with 4 KiB pages the offset is exactly the last three hex digits. */
function Split({ t }: { t: Translation }) {
  const hex = hexAddress(t.address).slice(2);
  return (
    <p className="vm-split">
      <code className="vm-bits">
        0x<span className="vm-page">{hex.slice(0, -3)}</span>
        <span className="vm-offset">{hex.slice(-3)}</span>
      </code>{' '}
      page <span className="mono">{hexPage(t.page)}</span>, offset <span className="mono">{hexOffset(t.offset)}</span> (the lowest 12 bits)
    </p>
  );
}

function Result({ t, process, access }: { t: Translation; process: ProcessId; access: Access }) {
  const o = t.outcome;
  const other: ProcessId = process === 'A' ? 'B' : 'A';
  switch (o.kind) {
    case 'ok': {
      const shared = PAGE_TABLES[other].find((e) => e.frame === o.frame);
      const sameAddress = PAGE_TABLES[other].find((e) => e.page === t.page && e.frame !== undefined && e.frame !== o.frame);
      return (
        <>
          <strong>Allowed.</strong> The page table of process {process} maps page {hexPage(t.page)} to frame {o.frame}, rights {rights(o.entry)}. Physical address: frame {o.frame} x 4096 + offset {hexOffset(t.offset)} ={' '}
          <span className="mono">{hexPhysical(o.physical)}</span>.
          {shared && <> Process {other} reaches the same frame through its own address {hexPage(shared.page)}: one copy of the library in memory, mapped into both.</>}
          {sameAddress && <> In process {other} the same address leads to frame {sameAddress.frame}: same virtual address, different memory.</>}
        </>
      );
    }
    case 'not-present':
      return (
        <>
          <strong>Page fault, then allowed.</strong> The entry for page {hexPage(t.page)} says not present: this page was {o.entry.absent}. The processor stops and hands over to the kernel, which reads the page back into a free frame, fills in the entry and lets the instruction run again. The program does not notice, apart from the delay.
        </>
      );
    case 'protection':
      return (
        <>
          <strong>Segmentation fault.</strong> Page {hexPage(t.page)} is mapped, but its rights are {rights(o.entry)}: no {access === 'write' ? 'writing' : 'access'}. The processor raises a page fault, the kernel sees a forbidden access and ends the process (on Windows: access violation).
        </>
      );
    case 'unmapped':
      return (
        <>
          <strong>Segmentation fault.</strong> No entry covers page {hexPage(t.page)}: the address belongs to nothing in process {process}. The processor raises a page fault, the kernel finds no mapping and ends the process.
          {t.page === 0 && <> An address this close to 0 is what using a null pointer looks like. Linux does not let ordinary programs map the lowest pages at all (the setting vm.mmap_min_addr), so such an access always fails.</>}
        </>
      );
  }
}
