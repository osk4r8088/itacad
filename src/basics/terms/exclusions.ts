/**
 * Key terms that are not linked in topic texts, because the same word means something else in
 * other topics. Each entry was checked against the texts that contain the word; the reason names
 * the other meaning. Terms with a qualifier in parentheses, such as "Service (cluster)", are never
 * linked and need no entry here (see termForms in match.ts).
 *
 * A term that is linked must mean the same thing everywhere it appears outside its own topic.
 * When a new topic uses a linked term in another sense, add it here: to EXCLUDED when the word is
 * ambiguous in general, to EXCLUDED_IN when only that topic uses it differently.
 */
export const EXCLUDED: Record<string, string> = {
  Archive: 'archives of old data in general',
  Availability: 'availability zone, and availability as a general word',
  Binary: 'binary as an executable file, binary translation, binary prefixes',
  Branch: 'branches in program code that a CPU predicts',
  Core: 'the core of something, in general',
  Deployment: 'deploying software in general, not the cluster object',
  Distribution: 'power distribution',
  Environment: 'environment variables, environments in general',
  Group: 'multicast groups, control groups (cgroups)',
  Join: 'joining a network or a multicast group',
  Log: 'event logs, the journal of a file system',
  Merge: 'merging sections or data in general',
  Node: 'nodes of a database cluster or a tree',
  Page: 'pages of flash memory, web pages',
  Pipeline: 'the graphics pipeline',
  Privilege: 'privilege levels of the CPU',
  Process: 'to process, as a verb',
  Redundancy: 'redundancy in data that compression removes',
  Region: 'regions of a code page',
  Registry: 'the Windows registry',
  Repository: 'image repositories in a container registry',
  Restore: 'restoring a saved state in general',
  Risk: 'risk as a general word',
  Rollback: 'ROLLBACK of a database transaction',
  Root: 'VMX root operation, the root of a tree',
  Runner: 'test runners',
  Runtime: 'the runtime of a UPS, container runtimes',
  Schema: 'database schemas',
  Script: 'writing systems (scripts) in character encoding',
  Session: 'TLS sessions, database sessions',
  Signal: 'electrical signals on a cable or radio',
  Switch: 'to switch, as a verb',
  Symbol: 'symbols on the wire, unit symbols, symbols printed on ports',
  Table: 'MAC address tables, routing tables, page tables',
  Tag: 'tags in the TLB, VLAN tags, HTML tags',
  Test: 'to test, as a verb',
  Token: 'access tokens and secrets',
  Trace: 'stack traces',
  View: 'a view of something, in general',
  Volume: 'storage volumes of virtual machines',
};

/** Abbreviations that are not linked, because the same letters stand for something else in other topics. */
export const EXCLUDED_FORMS: Record<string, string> = {
  ECC: 'error-correcting code memory, not elliptic-curve cryptography',
  MAC: 'medium access control and MAC addresses, not message authentication code',
};

/** Terms that are linked in general, but not in the topics listed, where they mean something else. */
export const EXCLUDED_IN: Record<string, string[]> = {
  // To interrupt, as a verb: an outage interrupts a service, an alert interrupts a person.
  Interrupt: ['high-availability', 'monitoring'],
  // To swap, as a verb.
  Swap: ['images'],
  // A language virtual machine that runs bytecode, not a virtual computer.
  'Virtual machine': ['jit-bytecode', 'compiler', 'debugger'],
  // Garbage collection inside an SSD, not of a program's memory.
  'Garbage collection': ['storage'],
  // A commit as a snapshot of tracked files, not a file system snapshot.
  Snapshot: ['version-control'],
  // A GPU kernel is a function run on the GPU, not the operating system kernel.
  Kernel: ['gpu'],
  // Hardware threads of SMT, not threads of a process.
  Thread: ['cpu'],
  // The scheduler of a cluster, which places pods on nodes.
  Scheduler: ['orchestration'],
  // COMMIT of a database transaction, not a version control commit.
  Commit: ['transactions', 'sql-basics'],
};
