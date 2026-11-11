import type { Topic } from '../../schema';

const SDM = { spec: 'Intel 64 and IA-32 Architectures Software Developer\'s Manual', url: 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html' };
const HP = { spec: 'Hennessy, Patterson: Computer Architecture, A Quantitative Approach, 6th edition (2017)' };

export const cpu: Topic = {
  id: 'cpu',
  category: 'hardware',
  title: 'CPU',
  level: 1,
  definition: 'The CPU (central processing unit, the processor) executes the instructions of programs: it calculates, compares, and moves data between memory and its registers.',
  why: 'Every program, from the operating system to a web browser, is in the end a long list of CPU instructions. Knowing what cores, threads, clock and caches do explains why one machine is faster than another, and why the numbers on the box only tell part of the story.',
  sections: [
    {
      heading: 'Instructions, one cycle at a time',
      blocks: [
        {
          kind: 'text',
          text: 'A program on disk is a sequence of machine instructions such as "add these two registers" or "load 8 bytes from this address". The CPU fetches an instruction from memory, decodes what it means, executes it, and moves on to the next one. Which instructions exist, and how they are encoded, is the instruction set architecture (ISA). Today\'s common ISAs are x86-64 (Intel and AMD processors in PCs and most servers) and ARM 64-bit (AArch64: phones, Apple computers, a growing share of servers).',
        },
        {
          kind: 'text',
          text: 'A program compiled for one ISA does not run natively on another: an x86-64 binary needs an emulator or translator to run on an ARM processor. That is why software downloads often offer separate builds per architecture.',
        },
        {
          kind: 'text',
          text: 'The CPU works in steps driven by a clock. A clock rate of 3 GHz means 3 billion cycles per second, so one cycle lasts a third of a nanosecond. Modern CPUs overlap the steps of many instructions (pipelining) and can finish several instructions per cycle, so the work done per second depends on both the clock and the instructions per cycle (IPC).',
        },
      ],
    },
    {
      heading: 'Cores and threads',
      blocks: [
        {
          kind: 'text',
          text: 'A core is a complete processing unit with its own registers, execution units and small caches. A CPU with 8 cores can run 8 instruction streams truly at the same time. Before multi-core CPUs, a single core gave the illusion of parallel programs by switching between them many times per second; operating systems still do this when there are more programs than cores.',
        },
        {
          kind: 'text',
          text: 'Simultaneous multithreading (SMT, Intel calls it Hyper-Threading) lets one core hold the state of two hardware threads and interleave their instructions. The operating system sees two logical processors per core. Both threads share the core\'s execution units, so a second thread fills gaps (for example while the first waits for memory) but does not double performance.',
        },
        {
          kind: 'table',
          caption: 'What the counts mean',
          columns: ['Term', 'What it is', 'Example'],
          rows: [
            ['Socket', 'A physical processor package on the mainboard', 'Desktops have 1, many servers 2'],
            ['Core', 'An independent processing unit inside the package', '8 cores'],
            ['Logical processor (hardware thread)', 'What the operating system schedules on; cores times threads per core', '8 cores with SMT: 16 logical processors'],
          ],
        },
      ],
    },
    {
      heading: 'Clock is not everything',
      blocks: [
        {
          kind: 'text',
          text: 'The clock rate on the box is a range: a base clock the CPU holds under sustained load, and a higher boost clock it reaches for short bursts or on few cores, as long as power and temperature allow. A laptop CPU and a desktop CPU with the same boost clock can perform very differently because the laptop is allowed far less power.',
        },
        {
          kind: 'text',
          text: 'Two CPUs from different generations or vendors do different amounts of work per cycle. Comparing GHz across them says little; comparing benchmarks of the workload you care about says much more.',
        },
      ],
    },
    {
      heading: 'Caches inside the CPU',
      blocks: [
        {
          kind: 'text',
          text: 'Fetching data from main memory takes far longer than a cycle, so CPUs keep copies of recently used data in small, fast caches on the chip. Typically each core has a level 1 cache (separate for instructions and data) and a level 2 cache, and all cores share a larger level 3 cache. Data moves between memory and caches in fixed blocks called cache lines, 64 bytes on current x86 processors.',
        },
        { kind: 'text', text: 'How large the gap between cache and memory is, and what that means for programs, is the subject of the memory hierarchy topic.' },
      ],
    },
  ],
  misconceptions: [
    { myth: 'More GHz always means a faster CPU.', truth: 'Performance is roughly instructions per cycle times cycles per second, times the cores a program can use. A newer CPU at a lower clock can beat an older one at a higher clock.' },
    { myth: '16 threads means 16 cores.', truth: 'With SMT, 8 cores show up as 16 logical processors. The two threads of a core share its execution units; the gain is usually much less than a second core.' },
    { myth: 'A program with twice the cores runs twice as fast.', truth: 'Only the parts of a program that are written to run in parallel benefit. A single-threaded program uses one core no matter how many there are.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'lscpu', shows: 'Architecture, sockets, cores per socket, threads per core, cache sizes and clock range.' },
      { os: 'Linux', command: 'nproc', shows: 'The number of logical processors available to programs.' },
      { os: 'Windows', command: 'Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed', shows: 'Model, cores, logical processors and clock in MHz (PowerShell).' },
      { os: 'macOS', command: 'sysctl hw.physicalcpu hw.logicalcpu', shows: 'Cores and logical processors.' },
    ],
    numbers: [
      { label: 'One clock cycle at 3 GHz', value: 'about 0.33 ns', note: 'calculated: 1 / 3,000,000,000 s' },
      { label: 'Cache line on x86-64', value: '64 bytes' },
      { label: 'Cores in a desktop CPU', value: 'about 4 to 24', note: 'typical range, varies by model and year' },
    ],
    examples: [
      'Task Manager (Windows) or top/htop (Linux) show the load per logical processor: one core at 100 % and the rest idle usually means a single-threaded program.',
      'Cloud providers sell virtual CPUs (vCPUs); a vCPU is commonly one hardware thread, not one core. Check the provider\'s documentation.',
    ],
  },
  terms: [
    { term: 'CPU', definition: 'Central processing unit: the processor that executes program instructions.' },
    { term: 'Instruction set architecture (ISA)', definition: 'The set of instructions a processor understands and how they are encoded, for example x86-64 or AArch64.' },
    { term: 'Clock rate', definition: 'Cycles per second of the CPU clock, given in GHz; one of several factors in performance.' },
    { term: 'Core', definition: 'An independent processing unit inside a CPU with its own registers and execution units.' },
    { term: 'Simultaneous multithreading (SMT)', definition: 'Running two or more hardware threads on one core so that they share its execution units; Intel calls it Hyper-Threading.' },
    { term: 'Logical processor', definition: 'A hardware thread as the operating system sees it: cores times threads per core.' },
    { term: 'Cache line', definition: 'The fixed-size block in which data moves between memory and the CPU caches; 64 bytes on current x86 processors.' },
  ],
  related: [{ topic: 'memory' }, { topic: 'mainboard' }, { topic: 'virtualization-hardware' }, { entry: 'numbers' }],
  sources: [
    { ...SDM, section: 'Volume 1, chapter Intel 64 and IA-32 Architectures (cores, Hyper-Threading)' },
    { ...SDM, section: 'Volume 3A, chapter Memory Cache Control (cache levels, 64-byte cache lines)' },
    { ...HP, section: 'Chapter 1 (quantitative principles: CPU performance equation) and Chapter 3 (instruction-level parallelism, SMT)' },
  ],
  quiz: [
    {
      id: 'cycle',
      prompt: 'How long is one clock cycle of a CPU running at 4 GHz?',
      options: ['0.25 ns', '4 ns', '0.25 microseconds', '4 microseconds'],
      answer: 0,
      explanation: 'One cycle is 1 / 4,000,000,000 seconds, which is 0.25 nanoseconds.',
    },
    {
      id: 'smt',
      prompt: 'A CPU has 6 cores with SMT (2 threads per core). How many logical processors does the operating system see?',
      options: ['6', '8', '12', '24'],
      answer: 2,
      explanation: '6 cores times 2 hardware threads per core gives 12 logical processors. They are not 12 full cores: the two threads of a core share its execution units.',
    },
    {
      id: 'ghz',
      prompt: 'CPU A runs at 3.0 GHz, CPU B at 4.0 GHz. What can you conclude about their speed?',
      options: ['B is a third faster', 'B is faster for single-threaded programs', 'Nothing reliable without knowing the work per cycle and the cores', 'A is faster because it runs cooler'],
      answer: 2,
      explanation: 'Performance depends on instructions per cycle, clock and the number of cores a program can use. Different designs do different amounts of work per cycle, so the clock alone decides nothing.',
    },
    {
      id: 'isa',
      prompt: 'Why can you not simply copy a program built for x86-64 to an ARM computer and run it natively?',
      options: ['ARM computers use a different file system', 'The two processors understand different instruction sets', 'ARM processors have no caches', 'x86-64 programs need more RAM'],
      answer: 1,
      explanation: 'A compiled program consists of machine instructions of one instruction set architecture. An ARM processor does not understand x86-64 instructions; the program has to be recompiled, or translated by an emulator.',
    },
  ],
};
