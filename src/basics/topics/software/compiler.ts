import type { Topic } from '../../schema';

export const compiler: Topic = {
  id: 'compiler',
  category: 'software',
  title: 'Compiler',
  level: 2,
  definition: 'A compiler is a program that translates source code written in a programming language into another form, usually the machine code of a processor, before the program runs.',
  why: 'A processor executes only its own instructions, and nobody writes large programs in them. The compiler is the step in between, and it explains everyday facts: why a program built for one processor or system does not run on another, why an error shows up at build time in one language and at run time in another, and why the same source can be slow or fast depending on how it was built.',
  sections: [
    {
      heading: 'From text to instructions',
      blocks: [
        {
          kind: 'text',
          text: 'Source code is text for people. A processor needs instructions of its own instruction set, as bytes. A compiler reads the whole source ahead of time, checks it, and writes the translation to a file. After that the source is no longer needed to run the program, and neither is the compiler.',
        },
        {
          kind: 'text',
          text: 'The work happens in stages, each turning one representation into the next. The first half, the front end, understands the language; the second half, the back end, knows the target processor. An intermediate representation between them lets one front end serve many processors and one back end many languages.',
        },
        {
          kind: 'table',
          caption: 'The stages of a compiler, for the line "return x * x;"',
          columns: ['Stage', 'What it does', 'Result'],
          rows: [
            ['Lexical analysis', 'Splits the characters into tokens', 'return, x, *, x, ;'],
            ['Syntax analysis', 'Checks the grammar and builds a tree', 'return( multiply( x, x ) )'],
            ['Semantic analysis', 'Checks meaning: is x declared, do the types fit', 'The tree with types: int times int gives int'],
            ['Intermediate code', 'Rewrites the tree as simple, processor-independent steps', 't1 = x * x; return t1'],
            ['Optimization', 'Makes the steps faster or smaller without changing the result', 'Unused work removed, constants computed'],
            ['Code generation', 'Chooses real instructions and registers', 'imul edi, edi; mov eax, edi; ret'],
          ],
        },
      ],
    },
    {
      heading: 'What the compiler catches, and what it does not',
      blocks: [
        {
          kind: 'text',
          text: 'Because it sees the whole program before anything runs, a compiler finds a class of mistakes early: a misspelled name, a missing bracket, a text passed where a number is expected. How much it can check depends on the language. With static typing every variable has a type known at compile time, and a mismatch is a compile error.',
        },
        {
          kind: 'text',
          text: 'It cannot tell whether the program does what was intended. A wrong formula, an index past the end of a list, a file that does not exist: those show at run time. Warnings sit in between. They mark code that is legal and suspicious, and treating them as errors is a cheap way to find bugs.',
        },
      ],
    },
    {
      heading: 'Optimization and build types',
      blocks: [
        {
          kind: 'text',
          text: 'The optimizer rewrites the program into an equivalent one that runs faster: it computes constant expressions at compile time, removes code that can never run, puts small functions directly into their callers, and keeps values in registers. The gain is often several times in speed.',
        },
        {
          kind: 'text',
          text: 'The price is compile time and a looser link between source and machine code: variables vanish, lines are reordered, and stepping through such a program in a debugger jumps around. Projects therefore build twice, a debug build with little optimization and full debug information, and a release build with optimization.',
        },
      ],
    },
    {
      heading: 'Targets',
      blocks: [
        {
          kind: 'text',
          text: 'The output fits one target: a processor architecture (x86-64, ARM64), an operating system and its conventions for calling functions and laying out files. A program compiled for ARM64 Linux does not run on x86-64 Windows. Building on one kind of machine for another is cross compilation, the normal case for phones and embedded devices.',
        },
        {
          kind: 'text',
          text: 'In C and similar languages the compiler works on one source file at a time and produces one object file each. Joining the object files into a program is the job of the linker. Not every compiler targets a processor: some produce bytecode for a virtual machine, and some translate one source language into another.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'If it compiles, it works.', truth: 'Compiling proves that the program is well-formed and that the types fit. Whether it computes the right thing is a question for tests.' },
    { myth: 'A language is either compiled or interpreted.', truth: 'That is a property of an implementation, not of a language. Python is compiled to bytecode first, Java is compiled twice, and there are interpreters for C.' },
    { myth: 'Compiler optimization can change what a correct program does.', truth: 'Optimizations must keep the behavior the language defines. Programs that change under optimization almost always rely on behavior the language leaves undefined.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'gcc -E main.c | tail', shows: 'Stops after preprocessing: the source with all includes and macros expanded.' },
      { os: 'Linux', command: 'gcc -O1 -S -o - square.c', shows: 'Stops after compilation proper and prints the assembly code the compiler generated.' },
      { os: 'Linux', command: 'gcc -c square.c && file square.o', shows: 'Compiles and assembles without linking; the result is a relocatable object file.' },
      { os: 'Linux', command: 'gcc -Wall -Wextra -o app main.c square.c', shows: 'A full build with the common warnings switched on.' },
      { os: 'Linux', command: 'gcc -dumpmachine', shows: 'The target the compiler builds for, such as x86_64-linux-gnu.' },
      { os: 'macOS', command: 'clang -S -emit-llvm -o - square.c', shows: 'The intermediate representation of the LLVM compiler for a C file.' },
      { os: 'Windows', command: 'cl /FA /c square.c', shows: 'Compiles with the Microsoft compiler and writes an assembly listing (square.asm), in a developer command prompt.' },
    ],
    numbers: [
      { label: 'Stages of a GCC build', value: '4', note: 'preprocessing, compilation proper, assembly, linking' },
    ],
    examples: [
      'The function int square(int x) { return x * x; } compiles with optimization to three instructions on x86-64: multiply the argument register with itself, copy it to the result register, return.',
      'A download page offers the same program for "x86-64" and "ARM64", for Windows, macOS and Linux: six builds of one source.',
    ],
  },
  terms: [
    { term: 'Compiler', definition: 'A program that translates source code into another form, usually machine code, ahead of running it.' },
    { term: 'Source code', definition: 'The text of a program as written by people in a programming language.' },
    { term: 'Machine code', definition: 'Instructions in the binary form a processor executes directly.' },
    { term: 'Token', definition: 'The smallest meaningful unit of source code: a name, a number, an operator or a keyword.' },
    { term: 'Abstract syntax tree (AST)', definition: 'The tree a compiler builds from the tokens, showing how expressions and statements nest.' },
    { term: 'Intermediate representation (IR)', definition: 'The processor-independent form a compiler works on between the front end and the back end.' },
    { term: 'Optimization', definition: 'Rewriting a program into an equivalent one that is faster or smaller.' },
    { term: 'Static typing', definition: 'Checking the types of all values at compile time, before the program runs.' },
    { term: 'Cross compilation', definition: 'Building a program on one kind of machine for another kind.' },
    { term: 'Assembly language', definition: 'A readable notation for machine code, one line per instruction; an assembler translates it to bytes.' },
  ],
  related: [{ topic: 'linker' }, { topic: 'interpreter' }, { topic: 'jit-bytecode' }, { topic: 'debugger' }, { topic: 'cpu' }, { topic: 'number-systems' }],
  sources: [
    { spec: 'Aho, Lam, Sethi, Ullman: Compilers: Principles, Techniques, and Tools, 2nd edition, chapter 1', note: 'the phases of a compiler' },
    { spec: 'Using the GNU Compiler Collection: Options Controlling the Kind of Output', url: 'https://gcc.gnu.org/onlinedocs/gcc/Overall-Options.html', note: 'four stages; -E, -S, -c' },
    { spec: 'ISO/IEC 9899 (C language), section 5.1.1.2: Translation phases' },
    { spec: 'LLVM Language Reference Manual', url: 'https://llvm.org/docs/LangRef.html', note: 'an intermediate representation in practice' },
  ],
  quiz: [
    {
      id: 'stage',
      prompt: 'Which stage of a compiler notices that a variable is used and was never declared?',
      options: ['Lexical analysis', 'Semantic analysis', 'Code generation', 'Linking'],
      answer: 1,
      explanation: 'The lexer only forms tokens and the parser only checks the grammar. Whether a name exists and has a fitting type is a question of meaning.',
    },
    {
      id: 'target',
      prompt: 'Why does a program compiled for ARM64 Linux not run on an x86-64 Linux machine?',
      options: ['The file name is different', 'The machine code uses the instruction set of another processor', 'Linux forbids it', 'It needs a newer kernel'],
      answer: 1,
      explanation: 'The compiler emitted ARM64 instructions. An x86-64 processor cannot decode them; the program has to be compiled for that target.',
    },
    {
      id: 'works',
      prompt: 'A program compiles without errors or warnings. What is known?',
      options: ['It has no bugs', 'It is well-formed and its types fit', 'It will run on every system', 'It is optimized'],
      answer: 1,
      explanation: 'The compiler checks form and types. Logic errors, bad input and missing files only show when the program runs.',
    },
    {
      id: 'opt',
      prompt: 'Why is a debug build usually compiled with little optimization?',
      options: ['Optimized code is incorrect', 'Optimization removes and reorders code, so lines and variables no longer match the source', 'The debugger cannot load large files', 'Optimization needs a license'],
      answer: 1,
      explanation: 'The optimized program behaves the same, but variables may live only in registers or vanish, which makes stepping and inspecting hard.',
    },
  ],
};
