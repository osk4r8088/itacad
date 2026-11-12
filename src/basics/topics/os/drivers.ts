import type { Topic } from '../../schema';
import { MAN, OSTEP } from './sources';

export const drivers: Topic = {
  id: 'drivers',
  category: 'os',
  title: 'Device drivers',
  level: 2,
  definition: 'A device driver is the part of an operating system that knows how to operate one kind of hardware: it turns the general requests of the kernel, such as "read this block" or "send this packet", into the specific commands of that device.',
  why: 'New hardware that does nothing, a network card that disappears after a kernel update, a blue screen naming a .sys file: these are driver problems. Knowing how devices are found, how a driver is matched to them and where drivers run makes such faults readable.',
  sections: [
    {
      heading: 'Why drivers exist',
      blocks: [
        {
          kind: 'text',
          text: 'Thousands of different network cards, disk controllers and graphics chips exist, each with its own registers and commands. The rest of the operating system should not have to know any of them. So the kernel defines an interface for every kind of device, for instance: a network device can send a packet, report a received one, and tell its link state. A driver implements that interface for one device or family. A file system then talks to "a block device" and the network stack to "a network device", whatever is behind it.',
        },
        {
          kind: 'text',
          text: 'Below the driver, talking to hardware means three things. The driver writes commands and reads status in the registers of the device. The device raises an interrupt when it has finished or received something, so the driver does not have to keep asking. And for bulk data the device reads and writes main memory itself (direct memory access, DMA), at addresses the driver gives it.',
        },
      ],
    },
    {
      heading: 'Finding the device and its driver',
      blocks: [
        {
          kind: 'text',
          text: 'Modern buses can be asked what is connected. On PCI Express every device reports a vendor ID and a device ID, two 16-bit numbers, and a class that says what kind of device it is. USB devices do the same. The kernel walks the buses at boot and whenever something is plugged in, and looks for a driver that has declared it handles these IDs or this class. This is what Plug and Play means.',
        },
        {
          kind: 'text',
          text: 'Many devices need no driver of their own, because they follow a class standard. Every USB stick speaks the USB mass storage protocol, keyboards and mice are human interface devices, NVMe SSDs all understand the same command set. One class driver in the operating system serves them all, which is why such devices work the moment they are plugged in.',
        },
        {
          kind: 'table',
          caption: 'Where drivers come from',
          columns: ['', 'Linux', 'Windows'],
          rows: [
            ['Usual source', 'Part of the kernel, shipped and updated with it', 'Windows Update, or a package from the hardware maker'],
            ['Form', 'Kernel modules, loaded when a matching device appears', 'Driver packages with .sys files and an .inf file that lists the device IDs'],
            ['Third-party drivers', 'Built outside the kernel tree; must be rebuilt for every new kernel', 'The normal case'],
            ['Signatures', 'Can be enforced, typically when Secure Boot is on', 'Required: 64-bit Windows loads only signed kernel drivers'],
          ],
        },
        {
          kind: 'text',
          text: 'On Unix systems a device then appears as a file under /dev. Block devices such as disks are read and written in blocks at any position; character devices such as terminals deliver a stream. Programs use them with the ordinary file system calls, and the kernel routes each call to the driver.',
        },
      ],
    },
    {
      heading: 'Drivers run in the kernel',
      blocks: [
        {
          kind: 'text',
          text: 'Most drivers run in kernel mode, because they must reach hardware and react to interrupts quickly. That also means they are not held back by anything: a fault in a driver can overwrite kernel memory and stop the whole system. Drivers are the largest part of a kernel and are written by many different companies, so they are the usual cause of crashes.',
        },
        {
          kind: 'text',
          text: 'Where speed allows, systems therefore move drivers out. Printers and scanners are typically driven from user space, and both Linux and Windows offer frameworks for user-mode drivers. Such a driver can crash and be restarted like any program.',
        },
      ],
    },
    {
      heading: 'Driver and firmware',
      blocks: [
        {
          kind: 'text',
          text: 'The two are often confused. Firmware is the program that runs on the device itself, on its own small processor: in the SSD controller, the Wi-Fi chip, the keyboard. The driver runs on the computer and talks to that firmware. Some devices keep no firmware of their own and get it uploaded by the driver each time they are switched on; on Linux these files come in a separate firmware package, and a device without its firmware file is detected but does not work.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'Every device needs a driver from its manufacturer.', truth: 'Devices that follow a class standard (USB storage, keyboards, webcams, NVMe drives) are served by generic drivers that come with the operating system.' },
    { myth: 'Driver and firmware are the same.', truth: 'Firmware runs inside the device, the driver runs in the operating system of the computer. Updating one does not update the other.' },
    { myth: 'A driver is just a normal program that happens to deal with hardware.', truth: 'Most drivers run in kernel mode with full access to memory. That is why a faulty driver can crash the system while a faulty application cannot.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'lspci -nnk', shows: 'Every PCI device with its vendor and device ID in brackets and the kernel driver in use.' },
      { os: 'Linux', command: 'lsusb', shows: 'USB devices with their vendor and product IDs.' },
      { os: 'Linux', command: 'modinfo e1000e | head', shows: 'Details of a kernel module (here a common Intel network driver): file, version, description and license.' },
      { os: 'Linux', command: 'sudo dmesg --follow', shows: 'Kernel messages as they appear. Plugging in a device shows how it is detected and which driver takes it.' },
      { os: 'Linux', command: 'ls -l /dev/sda /dev/null', shows: 'Two device files: the first letter is b for a block device and c for a character device.' },
      { os: 'Windows', command: 'Get-PnpDevice -PresentOnly | Where-Object Status -ne "OK"', shows: 'Devices that are present but not working, typically because a driver is missing (PowerShell).' },
      { os: 'Windows', command: 'driverquery /v', shows: 'All installed drivers with type, state and file path.' },
      { os: 'macOS', command: 'kmutil showloaded | head', shows: 'Kernel extensions that are loaded, which is where drivers in kernel mode live on macOS.' },
    ],
    numbers: [
      { label: 'Vendor ID and device ID on PCI', value: '16 bits each', note: 'written as four hex digits each, for example 8086:10d3' },
    ],
    examples: [
      'After a kernel update the graphics driver of a manufacturer no longer loads: it is built outside the kernel and has to be rebuilt for the new version.',
      'A Wi-Fi adapter shows up in lsusb but there is no network interface: no driver claims its ID, or its firmware file is missing (dmesg says which).',
    ],
  },
  terms: [
    { term: 'Device driver', definition: 'Software, usually part of the kernel, that operates one kind of hardware and offers it to the rest of the system through a standard interface.' },
    { term: 'Plug and Play', definition: 'Detecting devices automatically and loading a matching driver, at boot or when a device is connected.' },
    { term: 'Vendor ID and device ID', definition: 'The numbers by which a PCI or USB device identifies its maker and model, used to find its driver.' },
    { term: 'Class driver', definition: 'One generic driver for all devices that follow a standard, for example USB mass storage.' },
    { term: 'Direct memory access (DMA)', definition: 'A device reading or writing main memory itself, without the CPU copying each byte.' },
    { term: 'Device file', definition: 'A file under /dev on Unix systems through which programs reach a device; block or character device.' },
    { term: 'Driver signing', definition: 'A digital signature on a driver that the operating system checks before loading it into the kernel.' },
  ],
  related: [{ topic: 'kernel' }, { topic: 'mainboard' }, { topic: 'nic' }, { topic: 'boot' }, { topic: 'virtualization-hardware' }],
  sources: [
    OSTEP('36 (I/O devices: registers, interrupts, DMA, device drivers)', 'file-devices.pdf'),
    { spec: 'The Linux kernel documentation: How To Write Linux PCI Drivers', url: 'https://docs.kernel.org/PCI/pci.html', note: 'matching drivers to devices by vendor, device and class IDs' },
    { spec: 'PCI-SIG: PCI Express Base Specification', url: 'https://pcisig.com/specifications', note: 'configuration space with Vendor ID, Device ID and class code' },
    { spec: 'USB Implementers Forum: USB device class specifications', url: 'https://www.usb.org/defined-class-codes', note: 'mass storage, human interface devices and other classes' },
    { spec: 'Microsoft Learn: Driver signing', url: 'https://learn.microsoft.com/en-us/windows-hardware/drivers/install/driver-signing', note: 'kernel-mode drivers must be signed to load on 64-bit Windows' },
    { spec: 'Microsoft Learn: Overview of INF files', url: 'https://learn.microsoft.com/en-us/windows-hardware/drivers/install/overview-of-inf-files' },
    MAN('modinfo', 8),
  ],
  quiz: [
    {
      id: 'class',
      prompt: 'Why does a USB stick from an unknown maker work without installing anything?',
      options: ['Its driver is stored on the stick', 'It follows the USB mass storage class, for which the operating system has one generic driver', 'USB devices need no drivers', 'The firmware of the mainboard drives it'],
      answer: 1,
      explanation: 'Devices of a standard class all speak the same protocol, so one class driver serves every one of them.',
    },
    {
      id: 'match',
      prompt: 'How does the kernel decide which driver belongs to a newly found PCI device?',
      options: ['By the name printed on the device', 'By the vendor ID, device ID and class the device reports', 'By trying every driver until one works', 'The user has to choose'],
      answer: 1,
      explanation: 'Each driver declares the IDs or classes it handles. The kernel compares them with what the device reports on the bus.',
    },
    {
      id: 'crash',
      prompt: 'Why are drivers the usual cause of system crashes?',
      options: ['They are the oldest code', 'They run in kernel mode, are numerous and come from many different makers', 'They use the most memory', 'They are written in slow languages'],
      answer: 1,
      explanation: 'Code in kernel mode can damage anything. Drivers make up most of that code and are written outside the team that builds the kernel.',
    },
    {
      id: 'firmware',
      prompt: 'A Wi-Fi card is detected, its driver loads, but it reports a missing firmware file. What is missing?',
      options: ['The driver', 'The program that runs on the card itself, which the driver has to upload to it', 'A kernel update', 'The device ID'],
      answer: 1,
      explanation: 'Firmware runs inside the device. Some devices store none and need the driver to load it from a file each time.',
    },
  ],
};
