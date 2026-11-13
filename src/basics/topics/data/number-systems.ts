import type { Topic } from '../../schema';

export const numberSystems: Topic = {
  id: 'number-systems',
  category: 'data',
  title: 'Number systems',
  level: 1,
  definition: 'A number system is a way of writing numbers with a fixed set of digits; computers store everything as binary digits (bits), and people write those bits in hexadecimal because it is shorter.',
  why: 'Addresses, masks, colors, permissions, memory dumps and packet headers are all written in binary or hexadecimal. Reading them fluently, and knowing what a fixed number of bits can and cannot hold, removes a whole class of "magic numbers" and explains bugs like 0.1 + 0.2 not being 0.3.',
  sections: [
    {
      heading: 'Positions and bases',
      blocks: [
        {
          kind: 'text',
          text: 'In the decimal system each position is worth ten times the one to its right: 375 is 3 x 100 + 7 x 10 + 5 x 1. The base is ten, and there are ten digits. Any other base works the same way. In binary the base is two, the digits are 0 and 1, and each position is worth twice the one to its right: 1011 is 1 x 8 + 0 x 4 + 1 x 2 + 1 x 1 = 11.',
        },
        {
          kind: 'text',
          text: 'One binary digit is a bit. With n bits there are 2^n different patterns: 8 bits give 256, 16 bits 65,536, 32 bits about 4.3 billion. That is why an IPv4 address (32 bits) cannot number more than 4.3 billion hosts, and why a port number (16 bits) ends at 65535. A group of 8 bits is a byte.',
        },
      ],
    },
    {
      heading: 'Hexadecimal: binary for humans',
      blocks: [
        {
          kind: 'text',
          text: 'Long rows of zeros and ones are hard to read, and decimal hides the bit pattern. Hexadecimal, base 16, fits exactly: one hex digit stands for four bits, so a byte is always two hex digits. The sixteen digits are 0 to 9 and then a to f for the values 10 to 15.',
        },
        {
          kind: 'table',
          caption: 'The same values in three systems',
          columns: ['Decimal', 'Binary', 'Hexadecimal'],
          rows: [
            ['0', '0000 0000', '00'],
            ['10', '0000 1010', '0a'],
            ['15', '0000 1111', '0f'],
            ['16', '0001 0000', '10'],
            ['127', '0111 1111', '7f'],
            ['192', '1100 0000', 'c0'],
            ['255', '1111 1111', 'ff'],
          ],
        },
        {
          kind: 'text',
          text: 'To tell the systems apart, hexadecimal numbers are written with the prefix 0x (0xff) and binary ones with 0b (0b1010). Octal, base 8 with three bits per digit, survives mainly in Unix file permissions, where 755 means the bit patterns 111, 101 and 101.',
        },
      ],
    },
    {
      heading: 'Negative numbers and limits',
      blocks: [
        {
          kind: 'text',
          text: 'A fixed number of bits has a largest value, and adding one to it wraps around to zero, like an odometer. An unsigned byte counts from 0 to 255; 255 + 1 gives 0. Programs that ignore this limit have overflow bugs.',
        },
        {
          kind: 'text',
          text: 'Negative numbers are stored in two\'s complement: the highest bit counts negative. In 8 bits it is worth -128 instead of +128, so the range is -128 to 127, and 1111 1111 means -1. The same bit pattern is therefore 255 or -1, depending on whether the program reads it as unsigned or signed. The bits do not say which; the type does.',
        },
      ],
    },
    {
      heading: 'Byte order and fractions',
      blocks: [
        {
          kind: 'text',
          text: 'A number larger than one byte has to be stored in some order. Big-endian puts the most significant byte first, the way numbers are written; little-endian puts the least significant byte first. The value 0x12345678 is stored as 12 34 56 78 or as 78 56 34 12. Network protocols use big-endian, also called network byte order, while the common processors are little-endian, so programs convert at the boundary.',
        },
        {
          kind: 'text',
          text: 'Numbers with fractions are stored as floating point: a sign, a significand and an exponent, as in scientific notation but in base two. The usual 64-bit format has 53 bits for the significand, about 15 to 17 decimal digits. Many simple decimal fractions have no exact binary form, just as 1/3 has none in decimal: 0.1 is stored as the nearest representable value, and the small errors show when results are compared. That is why 0.1 + 0.2 prints as 0.30000000000000004, and why money is counted in integers of the smallest unit.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'Hexadecimal numbers are a different kind of data.', truth: 'Hexadecimal, decimal and binary are only ways of writing. 255, 0xff and 0b11111111 are the same value with the same bits in memory.' },
    { myth: 'Floating point arithmetic is imprecise because computers make mistakes.', truth: 'It is exact about what it does: every value is rounded to the nearest number the format can represent. The surprise comes from decimal fractions such as 0.1 that have no finite binary form.' },
    { myth: 'The bits of a value tell whether it is negative.', truth: '1111 1111 is 255 as an unsigned byte and -1 as a signed one. Which it is depends on how the program interprets the bits.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'printf "%d %x %o\\n" 255 255 255', shows: 'The same number in decimal, hexadecimal and octal: 255 ff 377.' },
      { os: 'Linux', command: 'echo $((0xc0)) $((2#11000000))', shows: 'The shell converts hexadecimal and binary (base#digits) to decimal: 192 192.' },
      { os: 'Linux', command: 'echo "obase=2; 192" | bc', shows: 'A decimal number in binary: 11000000.' },
      { os: 'Linux', command: 'python3 -c "print(0.1 + 0.2, 2**53 + 1.0)"', shows: 'Two limits of 64-bit floating point: the sum is 0.30000000000000004, and 2^53 + 1 cannot be told from 2^53.' },
      { os: 'Windows', command: '[Convert]::ToString(192, 2); "{0:x}" -f 255; 0xff', shows: 'Decimal to binary, decimal to hexadecimal, and hexadecimal to decimal (PowerShell).' },
      { os: 'macOS', command: 'printf "%d %x\\n" 0x7f 127', shows: 'Conversion in both directions with printf: 127 7f.' },
    ],
    numbers: [
      { label: 'Patterns of 8, 16 and 32 bits', value: '256; 65,536; 4,294,967,296', note: 'calculated: 2^8, 2^16, 2^32' },
      { label: 'Range of a signed byte', value: '-128 to 127', note: 'two\'s complement' },
      { label: 'Bits per hexadecimal digit', value: '4', note: 'so one byte is two hex digits' },
      { label: 'Integers a 64-bit float holds exactly', value: 'up to 2^53 = 9,007,199,254,740,992', note: '53 bits of significand' },
    ],
    examples: [
      'The subnet mask 255.255.255.192 is 26 one bits followed by 6 zero bits; in binary the last byte is 1100 0000.',
      'A color written as #ff8800 is three bytes: red 255, green 136, blue 0.',
    ],
  },
  terms: [
    { term: 'Bit', definition: 'A binary digit: one position that is 0 or 1, the smallest unit of information.' },
    { term: 'Byte', definition: 'A group of 8 bits, with 256 possible values; the unit in which memory and files are counted.' },
    { term: 'Binary', definition: 'The number system with base 2 and the digits 0 and 1.' },
    { term: 'Hexadecimal', definition: 'The number system with base 16 and the digits 0 to 9 and a to f; one digit stands for four bits.' },
    { term: 'Two\'s complement', definition: 'The usual way to store signed integers, in which the highest bit counts negative.' },
    { term: 'Overflow', definition: 'A result that needs more bits than the type has, so that it wraps around or is cut off.' },
    { term: 'Endianness', definition: 'The order in which the bytes of a multi-byte number are stored or sent: most significant first (big-endian) or least significant first (little-endian).' },
    { term: 'Floating point', definition: 'A way to store numbers with fractions as sign, significand and exponent in base two, with a fixed number of bits.' },
  ],
  related: [{ entry: 'numbers' }, { entry: 'subnet' }, { topic: 'data-units' }, { topic: 'character-encoding' }, { topic: 'permissions' }],
  sources: [
    { spec: 'IEEE Std 754-2019: IEEE Standard for Floating-Point Arithmetic', note: 'binary64: 53 bits of precision' },
    { rfc: 791, section: 'Appendix B', note: 'data transmission order in Internet protocols: most significant octet first' },
    { spec: 'ISO/IEC 9899 (C language): integer types and their representation', note: 'unsigned wrap-around; two\'s complement for signed integers' },
    { spec: 'Patterson, Hennessy: Computer Organization and Design, chapters 2 and 3', note: 'number representation, two\'s complement, floating point' },
  ],
  quiz: [
    {
      id: 'hex',
      prompt: 'Which decimal value is 0x2f?',
      options: ['29', '47', '215', '2f is not a number'],
      answer: 1,
      explanation: 'The digit 2 is worth 2 x 16 = 32, and f is 15: 32 + 15 = 47.',
    },
    {
      id: 'bits',
      prompt: 'How many different values can 10 bits hold?',
      options: ['20', '100', '512', '1024'],
      answer: 3,
      explanation: 'Each additional bit doubles the number of patterns: 2^10 = 1024.',
    },
    {
      id: 'signed',
      prompt: 'A byte holds the bits 1111 1111. Which value is it?',
      options: ['255', '-1', '255 if read as unsigned, -1 if read as signed', '-127'],
      answer: 2,
      explanation: 'The bits are the same. In two\'s complement the highest bit counts -128, which gives -1; read as unsigned, all eight bits add up to 255.',
    },
    {
      id: 'float',
      prompt: 'Why does 0.1 + 0.2 not give exactly 0.3 in most programming languages?',
      options: ['The processor makes rounding mistakes at random', '0.1 and 0.2 have no exact binary representation and are stored as the nearest values', 'Addition of small numbers is not supported', 'The numbers are converted to integers first'],
      answer: 1,
      explanation: 'Like 1/3 in decimal, 0.1 is an endless fraction in binary. The stored values are rounded, and the sum of the rounded values differs slightly from the rounded 0.3.',
    },
  ],
};
