import type { Topic } from '../../schema';

export const serialization: Topic = {
  id: 'serialization',
  category: 'data',
  title: 'Serialization',
  level: 2,
  definition: 'Serialization turns the data structures a program holds in memory into a sequence of bytes that can be stored or sent, and parsing turns the bytes back; JSON, XML and YAML are the common text formats for it.',
  why: 'Programs do not share memory, so everything that crosses a boundary (an API call, a configuration file, a message queue, a save file) passes through a serialization format. Much day-to-day trouble sits exactly there: a YAML file that parses to something else than intended, a number that loses digits in JSON, a field that one side added and the other does not expect.',
  sections: [
    {
      heading: 'From memory to bytes',
      blocks: [
        {
          kind: 'text',
          text: 'In memory, data is objects, lists and references laid out the way one language and one processor like it. None of that can be handed to another program as it is. Serialization writes the data in an agreed form, and the receiver parses that form into its own structures. The format is the contract: which types exist, how they are written, and what happens with unknown or missing fields.',
        },
        {
          kind: 'text',
          text: 'Nearly all formats describe the same few shapes: single values (text, numbers, true and false, nothing), ordered lists, and maps from names to values.',
        },
      ],
    },
    {
      heading: 'JSON, XML and YAML',
      blocks: [
        {
          kind: 'table',
          caption: 'Three text formats',
          columns: ['', 'JSON', 'XML', 'YAML'],
          rows: [
            ['Looks like', '{"name": "web", "ports": [80, 443]}', '<host name="web"><port>80</port></host>', 'name: web, then an indented list under ports:'],
            ['Structure by', 'Braces, brackets, commas', 'Opening and closing elements', 'Indentation'],
            ['Types', 'String, number, boolean, null, array, object', 'Everything is text unless a schema says otherwise', 'Like JSON, guessed from how a value looks'],
            ['Comments', 'No', 'Yes', 'Yes'],
            ['Typical use', 'Web APIs, data exchange', 'Documents, office files, older enterprise interfaces', 'Configuration written by people'],
          ],
        },
        {
          kind: 'text',
          text: 'JSON is small and strict: six kinds of value, strings in double quotes, no comments, no trailing commas. Exchanged between systems it is encoded in UTF-8. Its numbers have no stated size, and since many parsers store them as 64-bit floating point, integers are only safe up to 2^53; larger identifiers are sent as strings.',
        },
        {
          kind: 'text',
          text: 'XML marks up text with named elements and attributes. It is verbose, and it can do what the others cannot: text with markup inside it, namespaces to mix vocabularies, and mature schema languages. Every HTML-like document format and many standards are built on it.',
        },
        {
          kind: 'text',
          text: 'YAML is made to be written by hand. Indentation with spaces gives the structure (tabs are not allowed for indentation), and quotes are mostly optional. That convenience is also its trap: without quotes, the parser decides what a value is. YAML 1.2 was designed so that JSON documents are also YAML.',
        },
      ],
    },
    {
      heading: 'Where it goes wrong',
      blocks: [
        {
          kind: 'list',
          items: [
            'Guessed types in YAML: version: 1.10 becomes the number 1.1, and in parsers that follow the older YAML 1.1 rules the country code no becomes false. Quoting the value makes it a string.',
            'Indentation: one space too few in YAML moves a key to another level, and the file is still valid.',
            'Large numbers in JSON: an identifier above 2^53 comes back with its last digits changed after passing through a parser that uses floating point.',
            'Dates and binary data: JSON has no type for either. Dates travel as strings (usually ISO 8601, such as 2024-05-01T12:00:00Z) and bytes as Base64 text, which is a third larger.',
            'Duplicate keys, key order, and missing versus null: formats and parsers differ, so a contract should not depend on them.',
            'Untrusted input: a parser is an attack surface. XML external entities, YAML tags that create arbitrary objects, and deeply nested documents have all been used against servers. Parse data from strangers with the safe mode of the library.',
          ],
        },
      ],
    },
    {
      heading: 'Schemas and binary formats',
      blocks: [
        {
          kind: 'text',
          text: 'A schema writes the contract down: which fields exist, their types, which are required. JSON Schema and XML Schema let a program validate a document before using it, and let editors complete and check configuration files while they are written.',
        },
        {
          kind: 'text',
          text: 'Text formats are readable and easy to debug, and they are neither small nor fast. Binary formats such as Protocol Buffers, CBOR, MessagePack or Avro write numbers as bytes and often replace field names with numbers. They are smaller and quicker to parse, and unreadable without tools. Some of them need the schema to read the data at all, which makes the rule for changing a schema part of the format: add fields, never reuse or retype old ones, so that old and new programs can still talk.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'JSON is JavaScript.', truth: 'JSON borrows its notation from JavaScript and is a language-independent format with its own, much smaller grammar. Every language has parsers for it.' },
    { myth: 'A YAML value is a string unless it is obviously a number.', truth: 'An unquoted value is whatever the parser recognizes: number, boolean, null, date. Anything that must be a string, such as a version or a code, should be quoted.' },
    { myth: 'A text format is always the better choice because it is readable.', truth: 'Readability matters where people edit or debug. Between services exchanging millions of messages, a binary format with a schema is smaller, faster and stricter.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'echo \'{"name":"web","ports":[80,443]}\' | jq .', shows: 'Parses JSON and prints it formatted; a syntax error is reported with its position.' },
      { os: 'Linux', command: 'echo \'{"name":"web","ports":[80,443]}\' | jq \'.ports[1]\'', shows: 'Picks one value out of a document: 443.' },
      { os: 'Linux', command: 'python3 -m json.tool data.json', shows: 'Validates and formats a JSON file with nothing but Python installed.' },
      { os: 'Linux', command: 'python3 -c "import json; print(json.loads(\'9007199254740993\'), float(9007199254740993))"', shows: 'Python keeps the large integer exact; as a 64-bit float, which many JSON parsers use, it becomes 9007199254740992.0.' },
      { os: 'Linux', command: 'xmllint --format file.xml', shows: 'Checks that an XML file is well-formed and prints it indented.' },
      { os: 'Windows', command: '\'{"name":"web","ports":[80,443]}\' | ConvertFrom-Json', shows: 'Parses JSON into a PowerShell object; ConvertTo-Json goes the other way.' },
      { os: 'macOS', command: 'plutil -convert json -o - file.plist', shows: 'Converts a property list, the configuration format of macOS, to JSON.' },
    ],
    numbers: [
      { label: 'Kinds of value in JSON', value: '6', note: 'string, number, true/false, null, array, object' },
      { label: 'Largest safe integer in JSON', value: '2^53 - 1 = 9,007,199,254,740,991', note: 'RFC 8259 section 6' },
      { label: 'Size growth of Base64', value: 'about 33 %', note: 'calculated: 4 characters per 3 bytes' },
    ],
    examples: [
      'A deployment pulls the wrong release because the YAML line "tag: 1.10" was read as the number 1.1; quoting the value fixes it.',
      'An API returns {"id": 12345678901234567890}; the browser shows a different number, and the fix is to send the id as a string.',
    ],
  },
  terms: [
    { term: 'Serialization', definition: 'Writing in-memory data as a sequence of bytes in an agreed format; the reverse is deserialization or parsing.' },
    { term: 'Parser', definition: 'The code that reads a format and builds data structures from it, rejecting input that breaks the grammar.' },
    { term: 'JSON', definition: 'JavaScript Object Notation: a small text format of objects, arrays, strings, numbers, booleans and null.' },
    { term: 'XML', definition: 'Extensible Markup Language: a text format of nested, named elements with attributes.' },
    { term: 'YAML', definition: 'A text format for data that uses indentation for structure and is designed to be written by people.' },
    { term: 'Schema', definition: 'A formal description of what a valid document or message contains: fields, types and which are required.' },
    { term: 'Base64', definition: 'An encoding that writes arbitrary bytes with 64 printable characters, four characters for every three bytes.' },
    { term: 'Binary format', definition: 'A serialization format that is not readable text, such as Protocol Buffers or CBOR.' },
  ],
  related: [{ topic: 'character-encoding' }, { topic: 'number-systems' }, { topic: 'compression' }, { topic: 'orchestration' }, { protocol: 'http1' }],
  sources: [
    { rfc: 8259, note: 'JSON: grammar; section 6 numbers and the interoperable integer range; section 8.1 UTF-8' },
    { spec: 'Extensible Markup Language (XML) 1.0 (Fifth Edition), W3C Recommendation', url: 'https://www.w3.org/TR/xml/' },
    { spec: 'YAML Ain\'t Markup Language (YAML) version 1.2, revision 1.2.2', url: 'https://yaml.org/spec/1.2.2/', note: 'indentation with spaces; relation to JSON; the core schema' },
    { rfc: 4648, section: '4', note: 'Base64' },
    { rfc: 8949, note: 'CBOR, a binary format with the JSON data model' },
    { rfc: 3339, note: 'date and time format on the Internet, a profile of ISO 8601' },
  ],
  quiz: [
    {
      id: 'yaml',
      prompt: 'A YAML file contains the line "version: 1.20". What does a program most likely receive?',
      options: ['The text 1.20', 'The number 1.2', 'An error', 'A list of 1 and 20'],
      answer: 1,
      explanation: 'An unquoted value that looks like a number is read as one, and the trailing zero is gone. Writing version: "1.20" keeps it a string.',
    },
    {
      id: 'bigint',
      prompt: 'Why do many APIs send large identifiers as strings in JSON?',
      options: ['Strings are shorter', 'JSON forbids numbers with more than ten digits', 'Parsers that use 64-bit floating point cannot hold integers above 2^53 exactly', 'Numbers are not allowed as object values'],
      answer: 2,
      explanation: 'The JSON grammar allows any number, but many parsers store it as binary64, which is exact only up to 2^53. A string arrives unchanged.',
    },
    {
      id: 'comments',
      prompt: 'Which of the three formats does not allow comments?',
      options: ['JSON', 'XML', 'YAML', 'All three allow them'],
      answer: 0,
      explanation: 'JSON has no comment syntax. That is one reason configuration files for people are often written in YAML or in a JSON variant.',
    },
    {
      id: 'binary',
      prompt: 'What is the main price of a binary format such as Protocol Buffers compared with JSON?',
      options: ['Larger messages', 'Slower parsing', 'The data cannot be read without tools and usually the schema', 'It works in one programming language only'],
      answer: 2,
      explanation: 'Binary formats are smaller and faster. In return a person cannot read them directly, and often the schema is needed to interpret the bytes.',
    },
  ],
};
