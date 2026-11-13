import { useState } from 'react';

interface Stage {
  id: string;
  title: string;
  tool: string;
  code: string;
  about: string;
}

/**
 * One small C function on its way from source text to a linked program.
 * The assembly, bytes and addresses are from one build with GCC at -O1 on x86-64 Linux;
 * another compiler, version or option gives different values.
 */
const STAGES: Stage[] = [
  {
    id: 'source',
    title: 'Source code',
    tool: 'Editor',
    code: 'int square(int x) { return x * x; }',
    about: 'Text for people. To the machine this is a row of characters without meaning; main.c, which calls square(7), is a second file.',
  },
  {
    id: 'tokens',
    title: 'Tokens',
    tool: 'Compiler: lexical analysis',
    code: 'int  square  (  int  x  )  {  return  x  *  x  ;  }',
    about: 'The characters are grouped into the smallest meaningful units: keywords (int, return), names (square, x), operators and punctuation. Spaces and comments are gone.',
  },
  {
    id: 'tree',
    title: 'Syntax tree',
    tool: 'Compiler: syntax and semantic analysis',
    code: ['function square: int', '  parameter x: int', '  body', '    return', '      multiply: int', '        x', '        x'].join('\n'),
    about: 'The grammar of the language turns the tokens into a tree that shows what belongs to what. Then meaning is checked: x is declared, int times int gives int, and that matches the return type.',
  },
  {
    id: 'asm',
    title: 'Assembly code',
    tool: 'Compiler: optimization and code generation',
    code: ['square:', '    imul  edi, edi    ; x * x, the argument arrives in edi', '    mov   eax, edi    ; the result is returned in eax', '    ret'].join('\n'),
    about: 'The tree becomes instructions of one processor family, here x86-64. Where arguments arrive and results go is fixed by the calling convention of the system. (The build also emits a marker instruction, endbr64, at the start of each function; it is left out here.)',
  },
  {
    id: 'object',
    title: 'Object file',
    tool: 'Assembler',
    code: ['square.o   .text:  0f af ff  89 f8  c3', '           symbols: square  defined', '', 'main.o     .text:  ... bf 07 00 00 00  e8 00 00 00 00 ...', '           symbols: main  defined;  square, printf  undefined', '           relocation: fill in the address of square after e8'].join('\n'),
    about: 'Each instruction is now bytes: 0f af ff is the multiplication. Each source file gives one object file. main.o calls square with the instruction e8, but does not know where square will be, so the four address bytes are zero and a relocation entry marks the spot.',
  },
  {
    id: 'linked',
    title: 'Linked program',
    tool: 'Linker',
    code: ['401136 <main>:    ... bf 07 00 00 00   mov  edi, 7', '401143:               e8 22 00 00 00   call 40116a <square>', '401148:               ...', '40116a <square>:      0f af ff  89 f8  c3'].join('\n'),
    about: 'The linker places both pieces in one file, gives everything an address and patches the call: square is 0x22 bytes after the instruction that follows the call (0x401148 + 0x22 = 0x40116a). printf stays a reference to a shared library, which the dynamic linker resolves when the program starts.',
  },
];

/** A step-through from source code to a linked program, one representation per stage. */
export default function SourceToProgram() {
  const [at, setAt] = useState(0);
  const stage = STAGES[at];

  return (
    <div className="stp-figure">
      <ol className="stp-steps">
        {STAGES.map((s, i) => (
          <li key={s.id}>
            <button type="button" className={`stp-step${i === at ? ' is-selected' : ''}`} aria-current={i === at ? 'step' : undefined} onClick={() => setAt(i)}>
              <span className="stp-number">{i + 1}</span> {s.title}
            </button>
          </li>
        ))}
      </ol>
      <div className="stp-stage" aria-live="polite">
        <p className="stp-tool">
          Step {at + 1} of {STAGES.length}, produced by: {stage.tool}
        </p>
        <pre className="stp-code">
          <code>{stage.code}</code>
        </pre>
        <p className="stp-about">{stage.about}</p>
      </div>
      <div className="stp-nav">
        <button type="button" className="stp-button" disabled={at === 0} onClick={() => setAt(at - 1)}>
          Back
        </button>
        <button type="button" className="stp-button" disabled={at === STAGES.length - 1} onClick={() => setAt(at + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
