import type { Topic } from '../../schema';

export const compression: Topic = {
  id: 'compression',
  category: 'data',
  title: 'Compression',
  level: 2,
  definition: 'Compression stores or sends data in fewer bits by removing redundancy: lossless compression gives back the exact original, lossy compression gives back something close enough for eyes or ears and is much smaller.',
  why: 'Almost everything that travels or is stored is compressed: web pages, software packages, backups, images, video, logs. Knowing which kind of compression fits which data explains why a zipped video does not shrink, why a web server spends CPU to save bandwidth, and why a JPEG saved ten times looks worse each time.',
  sections: [
    {
      heading: 'Redundancy is what gets removed',
      blocks: [
        {
          kind: 'text',
          text: 'Data can be made smaller only where it is predictable. Text repeats words and uses some letters far more often than others; a log file repeats the same phrases on every line; a table of zeros says the same thing a million times. A compressor describes these patterns more briefly. Data without patterns, such as random bytes, encrypted data or data that is already compressed, cannot be made smaller.',
        },
        {
          kind: 'note',
          text: 'No lossless method can shrink every input. If it could, its own output could be shrunk again and again down to nothing. Any method that makes some inputs shorter must make others at least slightly longer.',
        },
      ],
    },
    {
      heading: 'Lossless: two ideas that carry most formats',
      blocks: [
        {
          kind: 'text',
          text: 'The first idea is to replace repetition with references. The compressor remembers the data it has just seen, and when a sequence appears again it writes "copy 12 bytes from 300 bytes back" instead of the bytes themselves. This is the LZ77 family, named after Lempel and Ziv.',
        },
        {
          kind: 'text',
          text: 'The second idea is to give frequent symbols short codes and rare symbols long ones, as Morse code gives the letter e a single dot. Huffman coding builds such a code from the measured frequencies, in a way that no code is the beginning of another, so the bit stream can be read without separators.',
        },
        {
          kind: 'text',
          text: 'DEFLATE, the method inside gzip, zip and PNG, combines both: it finds repeated strings in the previous 32 KiB, up to 258 bytes long, and then Huffman-codes the result. Newer methods such as Zstandard and Brotli use the same two steps with larger windows and better coding, and are both faster and tighter.',
        },
        {
          kind: 'table',
          caption: 'Common lossless methods',
          columns: ['Method', 'Where it is found', 'Character'],
          rows: [
            ['DEFLATE (gzip, zip, zlib)', 'Web transfer, archives, PNG', 'Supported everywhere, moderate ratio'],
            ['Zstandard (zstd)', 'Packages, backups, file systems, web transfer', 'Very fast in both directions, good ratio, wide range of levels'],
            ['Brotli', 'Web transfer of text', 'Tight for HTML, CSS and scripts, slow at high levels'],
            ['LZ4', 'File systems, memory, databases', 'Extremely fast, modest ratio'],
            ['xz (LZMA)', 'Software distribution', 'Very tight, slow to compress'],
          ],
        },
      ],
    },
    {
      heading: 'Lossy: leaving out what is not noticed',
      blocks: [
        {
          kind: 'text',
          text: 'Photos, sound and video contain more detail than people perceive. Lossy methods transform the data so that the unnoticed parts can be stored coarsely or dropped: fine color detail in JPEG, sounds masked by louder ones in MP3 and AAC, and in video everything that did not change since the previous picture. The result is often ten or more times smaller than lossless compression would reach, and it is not the original: decoding and encoding again loses a little more each time.',
        },
        {
          kind: 'text',
          text: 'Lossy compression is only for data meant for human senses. A program, a database or a document must come back bit for bit.',
        },
      ],
    },
    {
      heading: 'The trade: time for space',
      blocks: [
        {
          kind: 'text',
          text: 'Compression costs processor time and saves storage or bandwidth. Most tools have levels: a low level is fast and larger, a high level slow and smaller, with the gains shrinking at each step. Decompression is usually much faster than compression, which suits data that is packed once and read many times.',
        },
        {
          kind: 'list',
          items: [
            'Compress before encrypting. Encrypted data looks random and no longer compresses.',
            'Do not compress twice. JPEG, MP4, zip and gzip files are already compressed; another pass costs time and gains nothing.',
            'A compressed format is not an archive format. gzip compresses one stream; tar collects many files into one stream. A .tar.gz is the two together, while zip does both itself.',
            'A small file can expand enormously (a "decompression bomb"), so software that unpacks data from strangers limits the output size.',
          ],
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'A good enough compressor can shrink any file.', truth: 'Only redundancy can be removed. Random, encrypted or already compressed data stays the same size or grows by a few bytes of header.' },
    { myth: 'Zipping photos and videos saves a lot of space.', truth: 'JPEG and video files are already compressed with methods tuned to their content. A general compressor finds nearly nothing left.' },
    { myth: 'Lossy means poor quality.', truth: 'At sensible settings the loss is below what people notice. The problems come from very low bit rates and from encoding the same material repeatedly.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'gzip -k big.log && ls -l big.log big.log.gz', shows: 'A text file and its compressed copy; logs often shrink to a tenth or less.' },
      { os: 'Linux', command: 'head -c 1000000 /dev/urandom > r.bin; gzip -k r.bin; ls -l r.bin r.bin.gz', shows: 'Random data does not compress: the .gz file is slightly larger than the original.' },
      { os: 'Linux', command: 'head -c 1000000 /dev/zero | gzip | wc -c', shows: 'A megabyte of zeros shrinks to about a kilobyte: pure redundancy.' },
      { os: 'Linux', command: 'time zstd -3 -k big.log; time zstd -19 -k -f big.log', shows: 'The trade between level, time and size.' },
      { os: 'Linux', command: 'curl -sI --compressed https://example.com | grep -i content-encoding', shows: 'Whether a web server compresses its answer, and with which method (gzip, br, zstd).' },
      { os: 'Windows', command: 'Compress-Archive -Path .\\logs -DestinationPath logs.zip', shows: 'Creates a zip archive of a folder (PowerShell).' },
      { os: 'macOS', command: 'gzip -l file.gz', shows: 'Compressed size, original size and ratio of a gzip file.' },
    ],
    numbers: [
      { label: 'DEFLATE search window', value: '32 KiB back, matches up to 258 bytes', note: 'RFC 1951' },
      { label: 'English text with DEFLATE', value: 'smaller by a factor of 2.5 to 3', note: 'RFC 1951' },
      { label: 'gzip overhead', value: '18 bytes', note: 'calculated: 10 bytes of header and 8 of trailer (CRC-32 and size), RFC 1952' },
      { label: 'First bytes of a gzip file', value: '1f 8b', note: 'RFC 1952' },
    ],
    examples: [
      'A web server sends a 300 kB script as 80 kB with Content-Encoding: gzip; the browser asked for it with Accept-Encoding.',
      'A nightly backup of virtual disks that are mostly empty shrinks to a fraction, while the folder of camera videos next to it does not shrink at all.',
    ],
  },
  terms: [
    { term: 'Compression', definition: 'Encoding data in fewer bits by describing its redundancy more briefly.' },
    { term: 'Lossless compression', definition: 'Compression from which the exact original bits are restored.' },
    { term: 'Lossy compression', definition: 'Compression that discards detail people do not notice and restores only an approximation.' },
    { term: 'Compression ratio', definition: 'The original size divided by the compressed size.' },
    { term: 'LZ77', definition: 'The family of methods that replace a repeated sequence with a reference (distance and length) to its earlier occurrence.' },
    { term: 'Huffman coding', definition: 'A code that gives frequent symbols short bit sequences and rare ones long sequences, with no code being the start of another.' },
    { term: 'DEFLATE', definition: 'The lossless format that combines LZ77 and Huffman coding, used by gzip, zip and PNG.' },
    { term: 'Codec', definition: 'A method, or the software for it, that encodes and decodes a kind of media, such as JPEG for images or H.264 for video.' },
    { term: 'Archive', definition: 'One file that holds many files together with their names and attributes, such as tar or zip.' },
  ],
  related: [{ topic: 'data-units' }, { topic: 'number-systems' }, { topic: 'serialization' }, { topic: 'file-systems' }, { protocol: 'http1' }],
  sources: [
    { rfc: 1951, note: 'DEFLATE: LZ77 with Huffman coding, 32K window, lengths up to 258; no lossless method compresses every input' },
    { rfc: 1952, section: '2.3', note: 'gzip member format: header, CRC-32 and ISIZE trailer' },
    { rfc: 8878, note: 'Zstandard' },
    { rfc: 7932, note: 'Brotli' },
    { rfc: 9110, section: '8.4', note: 'HTTP Content-Encoding' },
    { spec: 'Salomon, Motta: Handbook of Data Compression', note: 'dictionary methods, statistical coding, image and audio compression' },
  ],
  quiz: [
    {
      id: 'random',
      prompt: 'Why does a file of random bytes not get smaller with gzip?',
      options: ['gzip only works on text files', 'There is no redundancy to describe more briefly', 'The file is too small', 'Random data is protected against compression'],
      answer: 1,
      explanation: 'Compression removes patterns. Random data has none, so the output is the input plus a few bytes of header.',
    },
    {
      id: 'lossy',
      prompt: 'For which of these is lossy compression acceptable?',
      options: ['A database backup', 'An executable program', 'A holiday photo', 'A spreadsheet'],
      answer: 2,
      explanation: 'A photo is meant for the eye, which does not notice the discarded detail. The other three must come back bit for bit.',
    },
    {
      id: 'order',
      prompt: 'Data is to be both compressed and encrypted. In which order?',
      options: ['Encrypt, then compress', 'Compress, then encrypt', 'The order makes no difference', 'Neither can be combined with the other'],
      answer: 1,
      explanation: 'Encrypted data looks random and does not compress. Compressing first removes the redundancy while it is still visible.',
    },
    {
      id: 'deflate',
      prompt: 'Which two ideas does DEFLATE combine?',
      options: ['Encryption and checksums', 'References to repeated strings and short codes for frequent symbols', 'Dropping unneeded detail and resampling', 'Sorting the bytes and counting them'],
      answer: 1,
      explanation: 'DEFLATE replaces repeated strings with references (LZ77) and then encodes the result with Huffman codes.',
    },
  ],
};
