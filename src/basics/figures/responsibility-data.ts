/** Who manages which layer in each cloud service model, after the service models of NIST SP 800-145. */
export type Owner = 'customer' | 'provider' | 'shared';

export interface Model {
  id: 'onprem' | 'iaas' | 'paas' | 'saas';
  short: string;
  name: string;
  about: string;
}

export interface Layer {
  id: string;
  name: string;
  /** One owner per model, in the order of MODELS. */
  owners: [Owner, Owner, Owner, Owner];
  note?: string;
}

export const MODELS: Model[] = [
  { id: 'onprem', short: 'Own', name: 'On-premises', about: 'Everything is yours: the room, the hardware and every layer of software. Full control, and every task from replacing disks to patching the application is your own.' },
  { id: 'iaas', short: 'IaaS', name: 'Infrastructure as a Service', about: 'The provider runs the data center, the hardware and the virtualization. You get virtual machines, disks and networks, and run everything from the operating system upwards, including its updates.' },
  { id: 'paas', short: 'PaaS', name: 'Platform as a Service', about: 'The provider also runs the operating system and the runtime or database. You deploy your application or data and set a few options of the platform.' },
  { id: 'saas', short: 'SaaS', name: 'Software as a Service', about: 'The provider runs the complete application. What remains with you is who may use it, how it is configured, and the data you put into it.' },
];

export const LAYERS: Layer[] = [
  { id: 'access', name: 'Users and access rights', owners: ['customer', 'customer', 'customer', 'customer'], note: 'Always yours: who has an account, with which rights, protected how.' },
  { id: 'data', name: 'Data', owners: ['customer', 'customer', 'customer', 'customer'], note: 'Always yours: what is stored, whether that is allowed, and whether a backup exists.' },
  { id: 'app', name: 'Application', owners: ['customer', 'customer', 'customer', 'shared'], note: 'In SaaS the provider runs the application and you control its settings.' },
  { id: 'runtime', name: 'Runtime, middleware, database', owners: ['customer', 'customer', 'provider', 'provider'] },
  { id: 'os', name: 'Operating system', owners: ['customer', 'customer', 'provider', 'provider'] },
  { id: 'network', name: 'Network', owners: ['customer', 'shared', 'provider', 'provider'], note: 'In IaaS the provider runs the physical network and you configure virtual networks and firewall rules.' },
  { id: 'virt', name: 'Virtualization', owners: ['customer', 'provider', 'provider', 'provider'] },
  { id: 'hardware', name: 'Servers and storage', owners: ['customer', 'provider', 'provider', 'provider'] },
  { id: 'facility', name: 'Building, power, cooling', owners: ['customer', 'provider', 'provider', 'provider'] },
];

export const OWNER_LABEL: Record<Owner, string> = { customer: 'You', provider: 'Provider', shared: 'Both' };
