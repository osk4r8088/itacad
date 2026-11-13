import type { Topic } from '../../schema';
import { MAN } from './sources';

export const hypervisors: Topic = {
  id: 'hypervisors',
  category: 'virtualization',
  title: 'Hypervisors',
  level: 1,
  definition: 'A hypervisor is the software that runs virtual machines: it divides the processor, memory, storage and network of one physical computer among several guest systems and keeps them apart.',
  why: 'Nearly every server today is a virtual machine, and so is every cloud instance. Whether a hypervisor runs directly on the hardware or inside an operating system decides how fast it is, what it is used for, and how much of the machine it can give away.',
  sections: [
    {
      heading: 'Host, guest and the machine in between',
      blocks: [
        {
          kind: 'text',
          text: 'The physical computer and the system that owns it are the host. Each operating system running inside is a guest, and what it runs on is a virtual machine: processor, memory, disks and network cards that look like hardware but are provided by the hypervisor. The guest is not changed for this and usually cannot tell the difference, although it can often find out by looking.',
        },
        {
          kind: 'text',
          text: 'The hypervisor gives each guest a share of the real machine. Processor time is scheduled between the virtual CPUs of all guests, much as an operating system schedules processes. Memory is assigned in pages and translated a second time, so the guest-physical addresses a guest believes in become machine addresses. Storage is a file or a volume that the guest sees as a disk, and the network card is virtual, connected to a software switch on the host.',
        },
      ],
    },
    {
      heading: 'Type 1 and type 2',
      blocks: [
        {
          kind: 'text',
          text: 'Hypervisors are grouped by what they run on. A type 1 or bare-metal hypervisor is itself the system on the hardware: it boots and has no operating system under it. A type 2 or hosted hypervisor is a program inside an ordinary operating system, which also runs browsers and editors.',
        },
        {
          kind: 'table',
          caption: 'The two kinds',
          columns: ['', 'Type 1 (bare metal)', 'Type 2 (hosted)'],
          rows: [
            ['Runs on', 'The hardware itself', 'An ordinary operating system'],
            ['Used for', 'Servers and data centers, the base of clouds', 'Desktops: testing, development, another system beside the usual one'],
            ['Overhead', 'Small: nothing else competes for the machine', 'Larger: the host system and its programs run too'],
            ['Examples', 'VMware ESXi, Microsoft Hyper-V, Xen', 'VirtualBox, VMware Workstation, Parallels Desktop'],
          ],
        },
        {
          kind: 'text',
          text: 'The line is not always sharp. KVM turns the Linux kernel itself into a hypervisor: Linux keeps being a normal operating system, and a virtual machine is a process in it, so KVM is counted as type 1 by some and type 2 by others. What matters in practice is how much else competes for the hardware.',
        },
      ],
    },
    {
      heading: 'Three ways to virtualize, and why only one is used',
      blocks: [
        {
          kind: 'list',
          items: [
            'Full virtualization in software: the hypervisor inspects and rewrites the privileged instructions of the guest while it runs (binary translation). It needs no special hardware and no changed guest, but it costs a great deal of work.',
            'Paravirtualization: the guest knows it is virtualized and calls the hypervisor directly instead of pretending to drive hardware. That is fast but needs a modified guest, which rules out systems that cannot be changed.',
            'Hardware-assisted virtualization: the processor has a guest mode, and a second level of address translation, so the instructions of the guest run directly on the real CPU. This is what every current hypervisor uses.',
          ],
        },
        {
          kind: 'text',
          text: 'Paravirtualization survives where it helps most: in the drivers. A guest that drives an emulated network card of 1999 causes an exit into the hypervisor for every register access. A paravirtualized driver (virtio on Linux, the integration services on Hyper-V) instead hands whole buffers to the host, which is far cheaper. Installing those drivers is often the single largest speed difference in a virtual machine.',
        },
      ],
    },
    {
      heading: 'More virtual than real',
      blocks: [
        {
          kind: 'text',
          text: 'A host can promise its guests more resources than it has, because guests rarely need everything at once. Overcommitting processors is normal: twenty guests with four virtual CPUs each on a host with sixteen cores works as long as they are not all busy. Overcommitting memory is riskier, since memory in use cannot be taken back; the hypervisor can only reclaim pages that guests do not touch, share identical pages between guests, or swap guest memory to disk, which is slow.',
        },
        {
          kind: 'text',
          text: 'Because a virtual machine is a set of files plus the state of its memory, it can also be moved. Live migration copies the memory of a running guest to another host while it keeps running, sends the last changed pages during a pause of a fraction of a second, and continues there. That is how hosts are freed for maintenance without stopping anything.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'Type 1 is always better than type 2.', truth: 'They are for different jobs. On a server, where the machine should do nothing else, type 1 wins. On a laptop, a type 2 hypervisor runs a test system beside the browser, which no bare-metal hypervisor can do.' },
    { myth: 'A virtual machine emulates a different processor and is therefore slow.', truth: 'The guest instructions run directly on the real processor through hardware support. Emulating another architecture is a different technique and much slower.' },
    { myth: 'Overcommitting memory works like overcommitting CPUs.', truth: 'Processor time not used is simply gone and can be given to someone else. Memory that a guest has written stays occupied, so overcommitting it ends in swapping or in failed allocations.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'systemd-detect-virt', shows: 'Whether this system is itself virtualized, and which hypervisor it runs on (kvm, vmware, microsoft, none).' },
      { os: 'Linux', command: 'lscpu | grep -i -E "hypervisor|virtualization"', shows: 'The hypervisor vendor if the system is a guest, and the virtualization feature of the processor if it is a host.' },
      { os: 'Linux', command: 'virsh list --all', shows: 'The virtual machines known to libvirt on this host, running or stopped.' },
      { os: 'Linux', command: 'lsmod | grep -E "^kvm|virtio"', shows: 'Whether KVM is loaded (on a host) and which paravirtualized drivers are in use (in a guest).' },
      { os: 'Windows', command: 'Get-ComputerInfo -Property HyperVRequirement*, CsModel', shows: 'Whether the machine can run Hyper-V, and the model, which in a guest names the hypervisor (PowerShell).' },
      { os: 'macOS', command: 'sysctl kern.hv_support', shows: '1 if the hypervisor framework of macOS can be used on this machine.' },
    ],
    numbers: [
      { label: 'Typical processor overcommitment', value: 'several virtual CPUs per core', note: 'depends entirely on how busy the guests are; measured by the run queue of the host' },
      { label: 'Pause during a live migration', value: 'well under a second', note: 'typical for a guest whose memory does not change quickly; a busy guest takes longer' },
    ],
    examples: [
      'A guest with an emulated network card reaches a fraction of the throughput it gets after the virtio drivers are installed.',
      'Before a firmware update the virtual machines are migrated to other hosts, the host is updated and rebooted, and they come back.',
    ],
  },
  terms: [
    { term: 'Virtualization', definition: 'Running several isolated systems on one physical computer by giving each a share of its resources that looks like a machine of its own.' },
    { term: 'Hypervisor', definition: 'The software that creates and runs virtual machines and keeps them apart; also called virtual machine monitor.' },
    { term: 'Host and guest', definition: 'The physical machine and the system that owns it, and an operating system running inside a virtual machine on it.' },
    { term: 'Type 1 hypervisor', definition: 'A hypervisor that runs directly on the hardware, with no operating system under it; also called bare metal.' },
    { term: 'Type 2 hypervisor', definition: 'A hypervisor that runs as a program inside an ordinary operating system.' },
    { term: 'Paravirtualization', definition: 'Letting a guest know it is virtualized so that it calls the hypervisor directly instead of driving emulated hardware; today used mainly for drivers.' },
    { term: 'Overcommitment', definition: 'Promising guests more processors or memory in total than the host has, in the expectation that they will not all be used at once.' },
    { term: 'Live migration', definition: 'Moving a running virtual machine to another host by copying its memory while it runs, with a pause of a fraction of a second.' },
  ],
  related: [{ topic: 'virtualization-hardware' }, { topic: 'virtual-machines' }, { topic: 'containers' }, { topic: 'kernel' }],
  sources: [
    { spec: 'Popek, Goldberg: Formal Requirements for Virtualizable Third Generation Architectures, Communications of the ACM 17(7), 1974', url: 'https://doi.org/10.1145/361011.361073' },
    { spec: 'Barham et al.: Xen and the Art of Virtualization, SOSP 2003', url: 'https://doi.org/10.1145/945445.945462', note: 'paravirtualization' },
    { spec: 'Kivity et al.: kvm: the Linux Virtual Machine Monitor, Ottawa Linux Symposium 2007', url: 'https://www.kernel.org/doc/ols/2007/ols2007v1-pages-225-230.pdf' },
    { spec: 'OASIS: Virtual I/O Device (VIRTIO) Specification', url: 'https://docs.oasis-open.org/virtio/virtio/v1.2/virtio-v1.2.html', note: 'paravirtualized devices' },
    { spec: 'Clark et al.: Live Migration of Virtual Machines, NSDI 2005', url: 'https://www.usenix.org/legacy/events/nsdi05/tech/full_papers/clark/clark.pdf' },
    MAN('systemd-detect-virt', 1),
  ],
  quiz: [
    {
      id: 'type',
      prompt: 'A hypervisor runs as a program on a laptop, beside the browser. Which kind is it?',
      options: ['Type 1, bare metal', 'Type 2, hosted', 'A container runtime', 'Paravirtualized'],
      answer: 1,
      explanation: 'A type 2 hypervisor is a program inside an ordinary operating system. A type 1 hypervisor is itself the system on the hardware.',
    },
    {
      id: 'virtio',
      prompt: 'Why is a paravirtualized network driver faster than an emulated card in a guest?',
      options: ['It uses a faster cable', 'It compresses the data', 'It hands whole buffers to the host instead of causing an exit for every register access', 'It skips the TCP checksum'],
      answer: 2,
      explanation: 'Emulating a real card means the hypervisor must react to each access to its registers. A paravirtualized driver is written for the hypervisor and exchanges data in large pieces.',
    },
    {
      id: 'overcommit',
      prompt: 'Why is overcommitting memory riskier than overcommitting processors?',
      options: ['Memory is more expensive', 'Unused processor time is simply gone, while memory a guest has written stays occupied', 'Processors can be added later', 'Memory cannot be shared at all'],
      answer: 1,
      explanation: 'A guest that does not compute gives its share away by itself. A guest that has filled its memory keeps it, so the host can only swap or reclaim untouched pages.',
    },
    {
      id: 'migration',
      prompt: 'What makes live migration possible?',
      options: ['The guest is restarted on the other host', 'The guest is a set of files plus memory state, which can be copied to another host while it runs', 'The disk is moved physically', 'The guest runs on both hosts at once'],
      answer: 1,
      explanation: 'The hypervisor copies the memory while the guest keeps running, then pauses briefly to send the last changed pages and continues on the other host.',
    },
  ],
};
