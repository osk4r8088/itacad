import type { Topic } from '../../schema';

const HP = { spec: 'Hennessy, Patterson: Computer Architecture, A Quantitative Approach, 6th edition (2017)' };
const OSTEP = (chapter: string, file: string) => ({
  spec: `Arpaci-Dusseau, Arpaci-Dusseau: Operating Systems, Three Easy Pieces, chapter ${chapter}`,
  url: `https://pages.cs.wisc.edu/~remzi/OSTEP/${file}`,
});

export const memory: Topic = {
  id: 'memory',
  category: 'hardware',
  title: 'RAM and the memory hierarchy',
  level: 1,
  definition: 'RAM (random access memory) is the working memory that holds the programs and data a computer is using right now; it is one level of a hierarchy that runs from tiny, very fast CPU registers to large, slow disks.',
  why: 'Most of the time a CPU is not limited by how fast it calculates but by how fast data arrives. The memory hierarchy explains why a computer slows down dramatically when RAM runs out, and why the same program can run ten times faster when its data fits in the cache.',
  sections: [
    {
      heading: 'Fast memory is small, large memory is slow',
      blocks: [
        {
          kind: 'text',
          text: 'No single kind of memory is fast, large, cheap and permanent at once. Computers therefore stack several kinds: a few registers inside each core, caches on the CPU chip, RAM on the mainboard, and SSDs or hard disks for everything that has to survive switching off. Each level is larger and slower than the one above it, and holds copies of what the level above needs next.',
        },
        {
          kind: 'figure',
          figure: 'latency',
          caption: 'Typical access times per level. Switch to human time to feel the gaps: if a CPU cycle took a third of a second, a hard disk read would take about three months.',
        },
        {
          kind: 'note',
          text: 'The values are typical orders of magnitude, not measurements of one machine. They vary with the processor, the memory and the drive; the ratios between the levels are what matters.',
        },
      ],
    },
    {
      heading: 'Why caches work: locality',
      blocks: [
        {
          kind: 'text',
          text: 'Caches pay off because programs are predictable in two ways. Temporal locality: data used now is likely to be used again soon (a loop counter, the current function). Spatial locality: data next to what was just used is likely to be used next (the next element of an array). A cache keeps recently used data, and it loads whole cache lines of 64 bytes, so neighbours arrive for free.',
        },
        {
          kind: 'text',
          text: 'When the CPU finds what it needs in a cache, that is a hit; otherwise a miss, and the request goes one level down. A program that walks through memory in order mostly hits; one that jumps randomly through a large data set misses constantly and can run many times slower on the same hardware.',
        },
      ],
    },
    {
      heading: 'RAM: DRAM and DDR',
      blocks: [
        {
          kind: 'text',
          text: 'Main memory is DRAM (dynamic RAM): each bit is a tiny capacitor that slowly loses its charge and must be refreshed all the time. DRAM is volatile, so its content is gone when the power is off. CPU caches use SRAM (static RAM), which needs no refresh and is much faster, but takes several times the chip area per bit, which is why caches are small.',
        },
        {
          kind: 'text',
          text: 'Memory modules are named after the DDR (double data rate) generation and their transfer rate: DDR5-4800 performs 4800 million transfers per second. A module transfers 64 data bits (8 bytes) per transfer, so its peak rate is 4800 million times 8 bytes, 38.4 GB/s. Computers with two or more memory channels add up the rates of the channels.',
        },
        {
          kind: 'table',
          caption: 'Levels compared',
          columns: ['Level', 'Technology', 'Keeps data without power', 'Managed by'],
          rows: [
            ['Registers', 'Flip-flops in the core', 'No', 'The compiler and the program'],
            ['L1, L2, L3 cache', 'SRAM on the CPU chip', 'No', 'The CPU, automatically'],
            ['Main memory', 'DRAM modules (DDR4, DDR5)', 'No', 'The operating system'],
            ['SSD, hard disk', 'Flash memory, magnetic platters', 'Yes', 'The operating system and file system'],
          ],
        },
      ],
    },
    {
      heading: 'When RAM runs out',
      blocks: [
        {
          kind: 'text',
          text: 'Programs do not use physical RAM addresses directly. The operating system gives each process its own virtual address space and maps it to physical memory in pages, usually 4 KiB on x86-64. When RAM is full, the operating system moves pages that were not used recently to disk (swap on Linux, the page file on Windows) and loads them back when they are needed.',
        },
        {
          kind: 'text',
          text: 'Moving a page to and from disk costs as much time as many thousands of RAM accesses. A system that swaps constantly becomes unresponsive although the CPU is mostly idle, waiting for the disk.',
        },
      ],
    },
    {
      heading: 'ECC memory',
      blocks: [
        {
          kind: 'text',
          text: 'Bits in DRAM can flip, for example through electrical interference or particles from cosmic radiation. ECC (error-correcting code) memory stores extra check bits with each word so that the memory controller can correct a single flipped bit and detect a double one. Servers use ECC memory as standard; most desktops do not.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'Free RAM is wasted RAM, so the system is fine as long as it is full.', truth: 'Using free RAM as file cache is good, and the operating system gives it back on demand. Swapping is the warning sign: free memory that is low together with constant disk activity.' },
    { myth: 'DDR5 has on-die ECC, so it is ECC memory.', truth: 'On-die ECC only corrects errors inside the memory chip. ECC modules add separate check bits that protect the data all the way to the memory controller, and the CPU and mainboard must support them.' },
    { myth: 'More RAM makes every computer faster.', truth: 'More RAM helps when the current amount is too small and the system swaps or cannot cache files. Beyond what the workload needs, more RAM changes nothing.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'free -h', shows: 'Total, used and available RAM, memory used as cache, and swap.' },
      { os: 'Linux', command: 'lscpu --caches', shows: 'The size of each cache level and how many cores share it.' },
      { os: 'Linux', command: 'vmstat 1', shows: 'Once per second: the si and so columns show pages swapped in and out; non-zero values all the time mean RAM is too small.' },
      { os: 'Windows', command: 'Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed, Manufacturer', shows: 'Each installed module with its size in bytes and its speed (PowerShell).' },
      { os: 'macOS', command: 'sysctl hw.memsize', shows: 'Installed RAM in bytes.' },
    ],
    numbers: [
      { label: 'Peak rate of one DDR5-4800 module', value: '38.4 GB/s', note: 'calculated: 4800 million transfers times 8 bytes' },
      { label: 'Memory page on x86-64', value: '4 KiB', note: 'standard size; larger pages of 2 MiB and 1 GiB exist' },
      { label: 'Main memory access', value: 'about 70 to 120 ns', note: 'typical, depends on the processor and memory' },
    ],
  },
  terms: [
    { term: 'RAM', definition: 'Random access memory: the working memory of a computer; in practice DRAM modules.' },
    { term: 'Memory hierarchy', definition: 'The levels of memory from registers over caches and RAM to disks, each larger and slower than the one above.' },
    { term: 'Cache hit and miss', definition: 'Whether the requested data was found in a cache (hit) or had to be fetched from the next level down (miss).' },
    { term: 'Locality', definition: 'The tendency of programs to reuse recent data (temporal) and to use data near recent data (spatial); the reason caches work.' },
    { term: 'DRAM', definition: 'Dynamic RAM: memory that stores each bit in a capacitor and must be refreshed constantly; used for main memory.' },
    { term: 'SRAM', definition: 'Static RAM: faster memory that needs no refresh but takes more chip area per bit; used for CPU caches.' },
    { term: 'Swap', definition: 'Disk space to which the operating system moves memory pages when RAM is full; called page file on Windows.' },
    { term: 'ECC memory', definition: 'Memory with extra check bits that let the memory controller correct single-bit errors and detect double-bit errors.' },
  ],
  related: [{ topic: 'cpu' }, { topic: 'storage' }, { topic: 'server' }, { entry: 'bandwidth' }],
  sources: [
    { ...HP, section: 'Chapter 2 (memory hierarchy design) and Appendix B (review of memory hierarchy)' },
    OSTEP('18 to 22 (paging, translation lookaside buffers, swapping)', 'vm-paging.pdf'),
    { spec: 'JEDEC JESD79-5C, DDR5 SDRAM standard (2024)', url: 'https://www.jedec.org/standards-documents/docs/jesd79-5c' },
  ],
  quiz: [
    {
      id: 'order',
      prompt: 'Which order goes from fastest to slowest?',
      options: ['RAM, L1 cache, SSD, hard disk', 'L1 cache, L3 cache, RAM, SSD', 'L3 cache, L1 cache, RAM, hard disk', 'SSD, RAM, L2 cache, registers'],
      answer: 1,
      explanation: 'Registers and the L1 cache are fastest, then L2 and L3, then main memory, then SSDs and hard disks. Each level down is larger and slower.',
    },
    {
      id: 'locality',
      prompt: 'Why does reading an array element by element run faster than reading the same elements in random order?',
      options: ['The CPU clock rises for sequential access', 'Each cache miss loads a whole cache line, so the next elements are already in the cache', 'Random access needs more instructions', 'RAM is faster for small addresses'],
      answer: 1,
      explanation: 'Spatial locality: a miss loads 64 bytes at once. Walking in order uses the neighbours that arrived with the first element; random jumps waste most of each line.',
    },
    {
      id: 'ddr',
      prompt: 'What is the peak transfer rate of one DDR5-6400 module?',
      options: ['6.4 GB/s', '25.6 GB/s', '51.2 GB/s', '102.4 GB/s'],
      answer: 2,
      explanation: '6400 million transfers per second times 8 bytes per transfer is 51.2 GB/s.',
    },
    {
      id: 'swap',
      prompt: 'A server feels extremely slow, the CPU is mostly idle and the disk is busy all the time. What is a likely cause?',
      options: ['The CPU clock is too low', 'RAM is full and the system is swapping', 'The L1 cache is too small', 'The network card is too slow'],
      answer: 1,
      explanation: 'When RAM is full, the operating system moves pages to disk and back. Each of those transfers is thousands of times slower than a RAM access, so programs wait on the disk while the CPU idles.',
    },
  ],
};
