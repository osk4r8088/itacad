import type { Level } from '../shared/levels';
import type { Topic } from './schema';

export interface Category {
  id: string;
  title: string;
  about: string;
  /** GitHub issue that tracks the category. */
  issue: number;
  /** A diagram or interactive piece from src/basics/figures shown on the category page. */
  figure?: { id: string; caption: string };
}

/** Topic metadata for overviews; the topic itself loads when it is opened. */
export interface TopicEntry {
  id: string;
  category: string;
  title: string;
  summary: string;
  level: Level;
  status: 'ready' | 'planned';
  load?: () => Promise<Topic>;
}

/** Category order follows the path from the machine upwards. */
export const CATEGORIES: Category[] = [
  {
    id: 'hardware',
    title: 'Hardware',
    about: 'What is inside a computer and a network: processor, memory, storage, network card, switches and routers.',
    issue: 59,
    figure: { id: 'computer', caption: 'Inside a computer: select a part to open its topic.' },
  },
  { id: 'os', title: 'Operating systems', about: 'Kernel and user space, processes, virtual memory, file systems, booting, permissions.', issue: 60 },
  { id: 'virtualization', title: 'Virtualization and containers', about: 'Hypervisors, virtual machines, containers, images and orchestration.', issue: 61 },
  { id: 'software', title: 'Software development', about: 'From source code to a running program: compiler, linker, interpreter, debugger, build and CI.', issue: 62 },
  { id: 'data', title: 'Data and encoding', about: 'Number systems, data units, character encoding, compression and serialization.', issue: 63 },
  { id: 'cloud', title: 'Cloud and operations', about: 'IaaS, PaaS, SaaS and who is responsible for what; availability, backup and monitoring.', issue: 64 },
  { id: 'security', title: 'Security basics', about: 'Confidentiality, integrity, availability; authentication, hashing, encryption and certificates.', issue: 65 },
  { id: 'databases', title: 'Databases', about: 'Relational and NoSQL databases, SQL, transactions and indexes.', issue: 66 },
];

export const TOPICS: TopicEntry[] = [
  {
    id: 'cpu',
    category: 'hardware',
    title: 'CPU',
    summary: 'The processor: cores, threads, clock and caches, and why more GHz is not always faster.',
    level: 1,
    status: 'ready',
    load: () => import('./topics/hardware/cpu').then((m) => m.cpu),
  },
  {
    id: 'memory',
    category: 'hardware',
    title: 'RAM and the memory hierarchy',
    summary: 'Registers, caches, RAM and disks: why fast memory is small, and how much a cache miss costs.',
    level: 1,
    status: 'ready',
    load: () => import('./topics/hardware/memory').then((m) => m.memory),
  },
  {
    id: 'storage',
    category: 'hardware',
    title: 'Storage: HDD, SSD, NVMe',
    summary: 'Spinning disks and flash, SATA and NVMe, and why M.2 says nothing about speed.',
    level: 1,
    status: 'ready',
    load: () => import('./topics/hardware/storage').then((m) => m.storage),
  },
  {
    id: 'nic',
    category: 'hardware',
    title: 'Network interface card',
    summary: 'Where a computer meets the network: MAC address, link speed, and the offloads that confuse packet captures.',
    level: 2,
    status: 'ready',
    load: () => import('./topics/hardware/nic').then((m) => m.nic),
  },
  {
    id: 'network-devices',
    category: 'hardware',
    title: 'Switch, router, firewall, access point',
    summary: 'What each box in a network decides, by which address, and why a home router is four devices in one.',
    level: 1,
    status: 'ready',
    load: () => import('./topics/hardware/network-devices').then((m) => m.networkDevices),
  },
  { id: 'gpu', category: 'hardware', title: 'GPU', summary: 'Thousands of simple cores for graphics and parallel computing.', level: 1, status: 'planned' },
  { id: 'mainboard', category: 'hardware', title: 'Mainboard and buses', summary: 'How the parts are connected: chipset, PCIe lanes and generations.', level: 2, status: 'planned' },
  { id: 'server', category: 'hardware', title: 'Server vs desktop', summary: 'ECC memory, redundant power, remote management and rack form factors.', level: 1, status: 'planned' },
  { id: 'virtualization-hardware', category: 'hardware', title: 'Hardware support for virtualization', summary: 'VT-x, AMD-V, nested page tables and IOMMU.', level: 3, status: 'planned' },
  { id: 'power', category: 'hardware', title: 'Power and UPS', summary: 'Power supplies, efficiency and uninterruptible power.', level: 1, status: 'planned' },
];

export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id);
export const topicsOf = (category: string) => TOPICS.filter((t) => t.category === category);
export const findTopic = (id: string) => TOPICS.find((t) => t.id === id);
export const readyTopics = () => TOPICS.filter((t) => t.status === 'ready');
