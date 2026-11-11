import type { Topic } from '../../schema';

const ATX = { spec: 'Intel: ATX Version 3.0 Multi Rail Desktop Platform Power Supply Design Guide (2022)' };
const EIGHTY = { spec: 'CLEAResult: 80 PLUS program details', url: 'https://www.clearesult.com/80plus/program-details' };

export const power: Topic = {
  id: 'power',
  category: 'hardware',
  title: 'Power and UPS',
  level: 1,
  definition: 'The power supply unit (PSU) turns the alternating current from the wall socket into the low direct-current voltages the parts of a computer need; an uninterruptible power supply (UPS) keeps that current flowing from a battery when the mains fail.',
  why: 'Every watt a computer draws is paid for twice in a server room, once as electricity and once as heat that has to be removed. And a power cut of a second is enough to crash every machine without a UPS. Sizing power supplies and UPS units is everyday work that needs only a few terms and some arithmetic.',
  sections: [
    {
      heading: 'From the socket to the chip',
      blocks: [
        {
          kind: 'text',
          text: 'The mains deliver alternating current (AC) at 230 V or 120 V, depending on the country. Chips need direct current (DC) at low voltage. The power supply converts in between and provides several fixed voltages, called rails: +12 V, +5 V and +3.3 V, plus a small +5 V standby rail that stays on while the computer is off but plugged in. Standby power is what lets a power button, a wake-up signal from the network or a management controller start the machine.',
        },
        {
          kind: 'text',
          text: 'Today almost all the power goes over the 12 V rail. Processors and graphics chips run at around 1 V and draw very high currents, so voltage regulators on the mainboard and on the graphics card step the 12 V down right next to the chip. Newer designs let the power supply deliver 12 V only and leave all other voltages to the mainboard.',
        },
      ],
    },
    {
      heading: 'Watts, efficiency and heat',
      blocks: [
        {
          kind: 'text',
          text: 'Power is measured in watts: voltage times current. Energy is power over time, billed in kilowatt-hours (kWh). A machine that draws 100 W all year uses 100 W x 24 h x 365 = 876 kWh.',
        },
        {
          kind: 'text',
          text: 'The wattage printed on a power supply is the most it can deliver, not what it draws. A 750 W supply in a computer that needs 150 W delivers 150 W. What it draws from the socket is a little more, because the conversion has losses: efficiency is output divided by input. A supply that delivers 450 W at 90 % efficiency draws 500 W, and the missing 50 W leave as heat.',
        },
        {
          kind: 'text',
          text: 'The 80 PLUS program certifies efficiency at set points of the rated load. Efficiency is best around half load and worse at very low load, which is one more reason not to choose a far oversized supply.',
        },
        {
          kind: 'table',
          caption: '80 PLUS levels: minimum efficiency at 115 V (internal, non-redundant supplies)',
          columns: ['Level', 'At 20 % load', 'At 50 % load', 'At 100 % load'],
          rows: [
            ['80 PLUS', '80 %', '80 %', '80 %'],
            ['Bronze', '82 %', '85 %', '82 %'],
            ['Silver', '85 %', '88 %', '85 %'],
            ['Gold', '87 %', '90 %', '87 %'],
            ['Platinum', '90 %', '92 %', '89 %'],
            ['Titanium', '92 %', '94 %', '90 %'],
          ],
        },
        {
          kind: 'note',
          text: 'Titanium also requires 90 % at 10 % load. The requirements for 230 V supplies are a few points higher. In the end all the power a computer draws becomes heat in the room, which is why the air conditioning of a server room is sized by the electrical load.',
        },
      ],
    },
    {
      heading: 'UPS: bridging the gap',
      blocks: [
        {
          kind: 'text',
          text: 'A UPS contains a battery and an inverter that makes alternating current from it. Its battery lasts for minutes, not hours. That is enough for the two things it is for: bridging short interruptions, which are by far the most common, and giving the machines time to shut down cleanly or a generator time to start.',
        },
        {
          kind: 'table',
          caption: 'UPS types, classified by how much the output depends on the input (IEC 62040-3)',
          columns: ['Class', 'Common name', 'How it works', 'Protects against'],
          rows: [
            ['VFD: voltage and frequency dependent', 'Standby, offline', 'Passes the mains through and switches to the battery when they fail', 'Power cuts; the switch takes a few milliseconds'],
            ['VI: voltage independent', 'Line-interactive', 'Also evens out too high or too low voltage without using the battery', 'Power cuts, sags and surges'],
            ['VFI: voltage and frequency independent', 'Online, double conversion', 'Always converts to DC and back, so the output is generated anew', 'All mains disturbances; no switch-over time'],
          ],
        },
        {
          kind: 'text',
          text: 'A UPS is rated in volt-amperes (VA) and in watts. VA is voltage times current as it flows; watts are the part of it that does work. The two differ by the power factor, and both limits apply: the connected load must stay below the watt rating and below the VA rating. The runtime depends on the load; the data sheet of a UPS gives it as a curve or table.',
        },
        {
          kind: 'text',
          text: 'A UPS that cannot tell the computers about a power cut only postpones the crash. It is therefore connected by USB or over the network, and a service on each machine shuts it down when the battery runs low.',
        },
      ],
    },
    {
      heading: 'Redundant power',
      blocks: [
        {
          kind: 'text',
          text: 'Servers have two power supplies, each strong enough alone. To make that worth something, they are plugged into two independent feeds, often called A and B, each with its own power distribution unit and ideally its own UPS. Then a failed supply, a tripped fuse or a UPS under maintenance does not stop the machine. In such a setup each feed must be able to carry the whole load, so in normal operation neither should be loaded above half.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'A 750 W power supply uses 750 W.', truth: 'The rating is the maximum output. The supply draws what the computer needs at the moment, plus its conversion losses.' },
    { myth: 'A UPS keeps the servers running through a power outage.', truth: 'Only for minutes. It bridges short interruptions and buys time for a clean shutdown or for a generator to take over.' },
    { myth: 'The VA number of a UPS is the wattage it can supply.', truth: 'The watt rating is lower than the VA rating. A load must fit under both; adding up the watts of the devices and comparing with the VA number overloads the UPS.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'upower -d', shows: 'Batteries and power sources the system knows, with charge, state and, on laptops, the current power draw.' },
      { os: 'Linux', command: 'upsc myups@localhost', shows: 'With Network UPS Tools installed and a UPS configured under the name myups: its status, battery charge, load and estimated runtime.' },
      { os: 'Linux', command: 'sudo ipmitool dcmi power reading', shows: 'On many servers: the power the machine draws right now, with minimum, maximum and average.' },
      { os: 'Windows', command: 'powercfg /batteryreport', shows: 'Writes an HTML report on the battery of a laptop: design capacity, current capacity and usage history.' },
      { os: 'macOS', command: 'pmset -g batt', shows: 'Whether the machine runs on mains or battery, the charge and the estimated time left; a UPS connected by USB is listed too.' },
    ],
    numbers: [
      { label: 'Energy of 100 W over a year', value: '876 kWh', note: 'calculated: 0.1 kW x 8760 h' },
      { label: 'Input of a supply delivering 450 W at 90 % efficiency', value: '500 W', note: 'calculated: 450 / 0.9; 50 W become heat in the supply' },
      { label: '80 PLUS Gold at half load (115 V)', value: 'at least 90 %' },
    ],
    examples: [
      'Sizing a UPS: add up what the devices really draw (measured, not the ratings of their power supplies), then pick a unit whose watt rating is comfortably above that sum.',
      'A server with two power supplies on the same power strip: the second supply protects against a failed supply, but not against the strip or its fuse.',
    ],
  },
  terms: [
    { term: 'Power supply unit (PSU)', definition: 'The part that converts mains alternating current into the direct-current voltages of the computer.' },
    { term: 'Rail', definition: 'One of the fixed output voltages of a power supply, for example +12 V.' },
    { term: 'Standby power', definition: 'A small supply that stays on while the computer is off, for the power button, wake-up signals and management controllers.' },
    { term: 'Efficiency', definition: 'Of a power supply: the power delivered divided by the power drawn. The difference becomes heat.' },
    { term: 'Kilowatt-hour (kWh)', definition: 'The unit of electrical energy: a power of 1000 W for one hour.' },
    { term: 'UPS', definition: 'Uninterruptible power supply: a device with a battery that keeps equipment powered for a short time when the mains fail.' },
    { term: 'Volt-ampere (VA)', definition: 'The unit of apparent power: voltage times current. Real power in watts is VA times the power factor.' },
    { term: 'Power factor', definition: 'The ratio of real power (watts) to apparent power (VA), between 0 and 1.' },
  ],
  related: [{ topic: 'server' }, { topic: 'mainboard' }, { topic: 'gpu' }, { topic: 'cpu' }],
  sources: [
    { ...ATX, note: 'output rails +12 V, +5 V, +3.3 V and +5 V standby' },
    { spec: 'Intel: ATX12VO (12V Only) Desktop Power Supply Design Guide', note: 'single 12 V rail, other voltages generated on the mainboard' },
    { ...EIGHTY, note: 'efficiency requirements per level and load point' },
    { spec: 'IEC 62040-3: Uninterruptible power systems (UPS), Part 3: Method of specifying the performance and test requirements', note: 'classification VFD, VI, VFI' },
    { spec: 'Network UPS Tools: user manual', url: 'https://networkupstools.org/docs/user-manual.chunked/index.html', note: 'monitoring a UPS and shutting down on low battery' },
  ],
  quiz: [
    {
      id: 'draw',
      prompt: 'A computer needs 180 W. Its power supply is rated 600 W and is 90 % efficient at this load. How much does it draw from the socket?',
      options: ['180 W', '200 W', '540 W', '600 W'],
      answer: 1,
      explanation: 'It delivers what is needed, 180 W, and draws 180 / 0.9 = 200 W. The rating of 600 W is only the upper limit.',
    },
    {
      id: 'kwh',
      prompt: 'A small server draws 50 W around the clock. How much energy is that per year?',
      options: ['about 44 kWh', 'about 438 kWh', 'about 1200 kWh', 'about 4380 kWh'],
      answer: 1,
      explanation: '0.05 kW x 24 h x 365 = 438 kWh.',
    },
    {
      id: 'online',
      prompt: 'Which UPS type has no switch-over time when the mains fail?',
      options: ['Standby (VFD)', 'Line-interactive (VI)', 'Online double conversion (VFI)', 'All of them'],
      answer: 2,
      explanation: 'An online UPS always feeds the load from its inverter, so nothing has to switch when the input disappears. The other two pass the mains through and switch to the battery.',
    },
    {
      id: 'purpose',
      prompt: 'What is a UPS in a server room mainly for?',
      options: ['Running the servers through a long outage', 'Bridging short interruptions and giving time for a clean shutdown or a generator start', 'Lowering the electricity bill', 'Cooling the servers'],
      answer: 1,
      explanation: 'Its battery lasts minutes. That covers the frequent short interruptions and leaves time to shut down in order or to switch to a generator.',
    },
  ],
};
