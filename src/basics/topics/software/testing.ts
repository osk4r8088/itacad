import type { Topic } from '../../schema';

export const testing: Topic = {
  id: 'testing',
  category: 'software',
  title: 'Testing',
  level: 2,
  definition: 'Testing means running a program with known inputs and checking automatically that the results are the expected ones; the tests are code themselves and are run again after every change.',
  why: 'Software changes constantly, and every change can break something that used to work. Checking everything by hand after each change is impossible, so the checks are written down once and repeated by a machine. Tests are what make it safe to change code, to update a dependency, or to deploy on a Friday.',
  sections: [
    {
      heading: 'What a test is',
      blocks: [
        {
          kind: 'text',
          text: 'A test has three parts: arrange a known starting situation, act by calling the code, and assert that the outcome is the expected one. For the function square, a test calls square(7) and asserts that the result is 49. A test runner finds all tests, executes them and reports which assertions failed.',
        },
        {
          kind: 'text',
          text: 'The value lies in repetition. A test that passed yesterday and fails today points directly at today\'s change. A bug that comes back after having been fixed is a regression, and the standard answer to any bug is to first write a test that shows it, then fix it, so that it cannot return unnoticed.',
        },
      ],
    },
    {
      heading: 'Levels of testing',
      blocks: [
        {
          kind: 'table',
          caption: 'Three levels and what they trade',
          columns: ['Level', 'Checks', 'Speed', 'When it fails'],
          rows: [
            ['Unit test', 'One function or class in isolation', 'Milliseconds', 'The cause is in that unit'],
            ['Integration test', 'Several parts together: code with a real database, two services, a file system', 'Seconds', 'The cause is in one of the parts or in how they fit'],
            ['End-to-end test', 'The whole system from outside, as a user would: through the browser or the public interface', 'Seconds to minutes', 'Something is wrong somewhere'],
          ],
        },
        {
          kind: 'text',
          text: 'The usual advice is a pyramid: many unit tests, fewer integration tests, a small number of end-to-end tests for the most important paths. The lower levels are fast and precise; the upper ones are slow and vague about the cause, but they are the only ones that show the parts really work together.',
        },
        {
          kind: 'text',
          text: 'To test a unit in isolation, the things it depends on are replaced by test doubles: a fake clock, a pretend payment service that always answers "ok". This makes tests fast and repeatable. Overdone, it produces tests that pass while the real system fails, because only the stand-ins were tested.',
        },
      ],
    },
    {
      heading: 'Other kinds of checks',
      blocks: [
        {
          kind: 'list',
          items: [
            'Static analysis: the compiler, type checker and linters find mistakes without running the code at all.',
            'Property-based tests and fuzzing: instead of single examples, a tool generates thousands of random inputs and checks a rule that must always hold, such as "decoding what was encoded gives the original".',
            'Performance and load tests: does it stay fast enough, and what happens at ten times the traffic?',
            'Security tests: scanning dependencies for known vulnerabilities, and probing the running system.',
            'Manual and exploratory testing: a person trying the software finds what nobody thought to write a test for.',
          ],
        },
      ],
    },
    {
      heading: 'What tests can and cannot tell',
      blocks: [
        {
          kind: 'text',
          text: 'A passing test shows that the code behaves as expected for the inputs that were tried. It shows nothing about inputs nobody thought of. Tests can demonstrate that bugs exist; they cannot demonstrate that none are left.',
        },
        {
          kind: 'text',
          text: 'Code coverage measures which lines were executed while the tests ran. Low coverage reliably shows untested code. High coverage shows only that the lines ran, not that anything meaningful was asserted about them, so it is a poor target and a useful warning sign.',
        },
        {
          kind: 'text',
          text: 'A flaky test sometimes passes and sometimes fails without any change, typically because of timing, shared state or the network. Flaky tests are worse than missing ones: people learn to ignore red results, and then a real failure is ignored too.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'All tests pass, so the software has no bugs.', truth: 'The tested cases work. Every untested input, combination and environment is still open.' },
    { myth: '100 percent code coverage means the code is fully tested.', truth: 'Coverage counts executed lines. A test without assertions executes everything and checks nothing.' },
    { myth: 'Writing tests slows a project down.', truth: 'It costs time at first. Without tests every change needs manual rechecking or is a gamble, and that cost grows with the size of the code.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'pnpm test', shows: 'Runs the test suite of a JavaScript project and prints passed and failed tests. This site has more than a thousand tests over its data.' },
      { os: 'Linux', command: 'python3 -m pytest -q', shows: 'Runs the tests of a Python project, one character per test and a summary.' },
      { os: 'Linux', command: 'python3 -m pytest -k decode -x', shows: 'Runs only the tests whose name contains "decode" and stops at the first failure.' },
      { os: 'Linux', command: 'pnpm vitest run --coverage', shows: 'Runs the tests and reports for each file which share of lines was executed.' },
      { os: 'Linux', command: 'echo $?', shows: 'The exit status of the last command: a test runner returns 0 if everything passed and another value otherwise, which is how automation reads the result.' },
      { os: 'Windows', command: 'dotnet test', shows: 'Builds a .NET solution and runs its tests.' },
      { os: 'macOS', command: 'go test ./...', shows: 'Runs the tests of all packages of a Go project.' },
    ],
    examples: [
      'A test asserts that every protocol on this site lists its sources. Adding a protocol without sources fails the build before anyone reviews it.',
      'A date calculation passes all tests and fails on the last day of February in a leap year: nobody had written a test for that date. The fix starts with adding one.',
    ],
  },
  terms: [
    { term: 'Test', definition: 'Code that runs other code with known inputs and checks the result automatically.' },
    { term: 'Assertion', definition: 'A statement in a test that must be true; if it is not, the test fails.' },
    { term: 'Unit test', definition: 'A test of one small piece of code in isolation.' },
    { term: 'Integration test', definition: 'A test of several components working together.' },
    { term: 'End-to-end test', definition: 'A test of the complete system through its outer interface, as a user would use it.' },
    { term: 'Regression', definition: 'Something that worked before and is broken by a later change.' },
    { term: 'Test double', definition: 'A stand-in for a real dependency in a test, such as a mock, stub or fake.' },
    { term: 'Code coverage', definition: 'The share of the code that was executed while the tests ran.' },
    { term: 'Flaky test', definition: 'A test whose result changes between runs although nothing was changed.' },
    { term: 'Fuzzing', definition: 'Testing with large numbers of generated, often malformed inputs to find crashes and wrong behavior.' },
  ],
  related: [{ topic: 'ci-cd' }, { topic: 'version-control' }, { topic: 'debugger' }, { topic: 'build-systems' }, { entry: 'decoder' }],
  sources: [
    { spec: 'ISO/IEC/IEEE 29119-1: Software and systems engineering, Software testing, Part 1: General concepts', note: 'test levels and terms' },
    { spec: 'ISTQB Glossary of Testing Terms', url: 'https://glossary.istqb.org/', note: 'unit, integration and system testing, regression, coverage' },
    { spec: 'Dijkstra: Notes on Structured Programming, 1970', note: 'testing shows the presence of bugs, not their absence' },
    { spec: 'Cohn: Succeeding with Agile, 2009', note: 'the test pyramid' },
    { spec: 'Winters, Manshreck, Wright: Software Engineering at Google, chapters 11 to 14', url: 'https://abseil.io/resources/swe-book', note: 'test sizes, test doubles, flaky tests' },
  ],
  quiz: [
    {
      id: 'level',
      prompt: 'A test starts the application, opens it in a browser, logs in and places an order. Which level is that?',
      options: ['Unit test', 'Integration test', 'End-to-end test', 'Static analysis'],
      answer: 2,
      explanation: 'It exercises the whole system from the outside, the way a user does.',
    },
    {
      id: 'pass',
      prompt: 'What does a passing test suite prove?',
      options: ['The absence of bugs', 'That the tested cases behave as expected', 'That the code is fast', 'That the code is secure'],
      answer: 1,
      explanation: 'Tests cover the inputs someone wrote down. Everything else is unknown.',
    },
    {
      id: 'coverage',
      prompt: 'A project reports 95 percent code coverage. What is certain?',
      options: ['95 percent of all bugs are found', '95 percent of the lines were executed during the tests', '95 percent of the requirements are met', 'The remaining 5 percent are comments'],
      answer: 1,
      explanation: 'Coverage is about execution. Whether the tests check the results of those lines is a separate question.',
    },
    {
      id: 'regression',
      prompt: 'A bug is reported. What is the recommended first step before fixing it?',
      options: ['Delete the affected feature', 'Write a test that fails because of the bug', 'Raise the coverage target', 'Restart the server'],
      answer: 1,
      explanation: 'The failing test proves the bug is understood, shows when it is fixed, and stops it from coming back unnoticed.',
    },
  ],
};
