import type { Topic } from '../../schema';

export const buildSystems: Topic = {
  id: 'build-systems',
  category: 'software',
  title: 'Build systems',
  level: 2,
  definition: 'A build system turns the sources of a project into its finished artifacts by running the needed tools in the right order, and on the next run repeats only the steps whose inputs have changed.',
  why: 'A real project is hundreds of files, several tools and dozens of libraries from other people. Nobody types those commands by hand, and nobody wants to wait for a full rebuild after changing one line. The build system also answers the question behind "works on my machine": what exactly went into this binary, and can someone else produce the same one?',
  sections: [
    {
      heading: 'Targets, dependencies and rules',
      blocks: [
        {
          kind: 'text',
          text: 'A build description says three things for each thing to produce: what it is called (the target), what it is made from (its dependencies), and which command makes it (the rule). The program app is made from main.o and square.o by linking; each .o file is made from its .c file by compiling.',
        },
        {
          kind: 'text',
          text: 'Together these statements form a graph. The build system walks it from the wanted target down to the sources and runs the rules in an order in which every input exists before it is used. Steps that do not depend on each other can run in parallel on all cores.',
        },
        {
          kind: 'text',
          text: 'On the next run it skips whatever is still current. The classic test compares time stamps: a target older than one of its dependencies is rebuilt. Change square.c, and only square.o is compiled again and the program linked again; main.o is left alone. Newer systems compare content hashes instead of times, which is more reliable and lets results be shared between machines through a cache.',
        },
      ],
    },
    {
      heading: 'Dependencies from other people',
      blocks: [
        {
          kind: 'text',
          text: 'Most code in a program comes from libraries. A package manager downloads them from a registry, together with the libraries they need in turn, the transitive dependencies. A project that names twenty packages easily ends up with several hundred.',
        },
        {
          kind: 'text',
          text: 'The project states which versions it accepts, often as a range such as "any 4.x". Which exact versions were chosen is then written to a lock file, with a checksum for each package. Committing the lock file means every developer and every build server gets the same set until someone updates it on purpose.',
        },
        {
          kind: 'table',
          caption: 'Semantic versioning: what a version number MAJOR.MINOR.PATCH promises',
          columns: ['Part', 'Raised when', 'Example'],
          rows: [
            ['MAJOR', 'Something changed in a way that can break users of the library', '2.7.1 to 3.0.0'],
            ['MINOR', 'Features were added, existing use keeps working', '2.7.1 to 2.8.0'],
            ['PATCH', 'Bugs were fixed, nothing else changed', '2.7.1 to 2.7.2'],
          ],
        },
        {
          kind: 'note',
          text: 'The version number is a promise by the author, not a guarantee. A patch release can break a program; that is what the lock file and tests are for.',
        },
      ],
    },
    {
      heading: 'The tools',
      blocks: [
        {
          kind: 'table',
          caption: 'Common build tools and package managers',
          columns: ['Ecosystem', 'Build tool', 'Packages and lock file'],
          rows: [
            ['C, C++', 'make, CMake, Ninja', 'System packages, vcpkg, Conan'],
            ['Java, Kotlin', 'Maven, Gradle', 'Maven Central'],
            ['JavaScript, TypeScript', 'npm scripts, Vite, esbuild', 'npm, pnpm; package-lock.json, pnpm-lock.yaml'],
            ['Python', 'pip, uv, Poetry', 'PyPI; requirements.txt, uv.lock'],
            ['Rust', 'cargo', 'crates.io; Cargo.lock'],
            ['Go', 'go build', 'Module proxy; go.sum'],
            ['Many languages, very large projects', 'Bazel', 'Pinned in the build description'],
          ],
        },
        {
          kind: 'text',
          text: 'In newer languages one tool does everything: fetch packages, compile, test, package. In C and C++ the parts are separate, and a generator such as CMake writes the files that make or Ninja then executes.',
        },
      ],
    },
    {
      heading: 'Builds that can be repeated',
      blocks: [
        {
          kind: 'text',
          text: 'A build is reproducible if the same sources always give the same artifact, bit for bit, on any machine. That takes discipline: pinned versions of all dependencies and tools, no downloads of "latest", no time stamps, user names or absolute paths baked into the output, and no reliance on whatever happens to be installed.',
        },
        {
          kind: 'text',
          text: 'The reward is trust and speed. A release can be traced back to an exact commit, anyone can check that a published binary really was built from the published source, and an unchanged step can be taken from a cache instead of being run. Dependencies are also an attack surface: a package with a similar name or a compromised release runs with the rights of the build. Lock files with checksums, a private mirror and reviewing updates limit that risk.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'A build system is only needed for compiled languages.', truth: 'Interpreted projects also fetch dependencies, generate code, bundle, minify, run tests and package. The same questions of order, caching and pinned versions apply.' },
    { myth: 'If in doubt, a clean rebuild is the safe habit.', truth: 'Needing "clean" is a symptom that the build description misses a dependency. A correct incremental build gives the same result as a full one, in a fraction of the time.' },
    { myth: 'The lock file is generated, so it does not belong in version control.', truth: 'It is the record of which exact versions were tested. Without it, two builds of the same commit can contain different code.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'make', shows: 'Builds the default target of the Makefile. Run twice, the second run reports that the target is up to date.' },
      { os: 'Linux', command: 'touch square.c && make', shows: 'After a change to one source, only its object file is compiled again and the program linked.' },
      { os: 'Linux', command: 'make -n', shows: 'A dry run: prints the commands that would run without running them.' },
      { os: 'Linux', command: 'make -j8', shows: 'Runs up to eight independent steps in parallel.' },
      { os: 'Linux', command: 'pnpm install --frozen-lockfile', shows: 'Installs exactly the versions in the lock file and fails if it does not match the package description; the usual mode on a build server.' },
      { os: 'Linux', command: 'pnpm why react', shows: 'Which packages pull a given dependency in, and in which version.' },
      { os: 'Windows', command: 'dotnet build; dotnet list package --include-transitive', shows: 'Builds a .NET project and lists its direct and transitive packages.' },
      { os: 'macOS', command: 'cmake -S . -B build && cmake --build build', shows: 'Generates build files into a separate directory and runs the build.' },
    ],
    examples: [
      'This site: pnpm install fetches the packages named in pnpm-lock.yaml, and pnpm build runs the TypeScript compiler and Vite to produce the static files.',
      'A build that passed on Friday fails on Monday without any commit in between: a dependency without a pinned version published a new release over the weekend.',
    ],
  },
  terms: [
    { term: 'Build system', definition: 'A tool that produces the artifacts of a project from its sources by running the needed steps in dependency order.' },
    { term: 'Build target', definition: 'Something a build can produce, such as an object file, a program or a package.' },
    { term: 'Dependency', definition: 'Something another thing needs: an input file of a build step, or a library a program uses.' },
    { term: 'Transitive dependency', definition: 'A library that is needed only because another dependency needs it.' },
    { term: 'Incremental build', definition: 'A build that repeats only the steps whose inputs changed since the last run.' },
    { term: 'Artifact', definition: 'A file produced by a build and meant to be kept or shipped: a binary, a package, a container image.' },
    { term: 'Package manager', definition: 'A tool that downloads, installs and updates libraries or programs together with what they depend on.' },
    { term: 'Lock file', definition: 'A file that records the exact version and checksum of every dependency chosen for a project.' },
    { term: 'Semantic versioning', definition: 'The convention MAJOR.MINOR.PATCH, in which the part that changes tells whether a release breaks, extends or only fixes.' },
    { term: 'Reproducible build', definition: 'A build that gives a bit-identical result whenever it is run on the same sources.' },
  ],
  related: [{ topic: 'compiler' }, { topic: 'linker' }, { topic: 'ci-cd' }, { topic: 'version-control' }, { topic: 'images' }],
  sources: [
    { spec: 'GNU Make Manual, chapter 2: An Introduction to Makefiles', url: 'https://www.gnu.org/software/make/manual/', note: 'targets, prerequisites, recipes; rebuilding by time stamp' },
    { spec: 'POSIX.1-2017, Shell and Utilities: make' },
    { spec: 'Semantic Versioning 2.0.0', url: 'https://semver.org/', note: 'MAJOR, MINOR, PATCH' },
    { spec: 'Reproducible Builds: Definitions', url: 'https://reproducible-builds.org/docs/definition/' },
    { spec: 'Feldman: Make, A Program for Maintaining Computer Programs. Software: Practice and Experience 9(4), 1979' },
  ],
  quiz: [
    {
      id: 'incremental',
      prompt: 'A project has 400 source files. One is changed. What does a correct build system do?',
      options: ['Compile all 400 files again', 'Compile the changed file and repeat the steps that depend on its result', 'Only link again', 'Nothing until a clean is run'],
      answer: 1,
      explanation: 'The dependency graph tells which results are out of date: the object file of the changed source and everything built from it.',
    },
    {
      id: 'lock',
      prompt: 'What is the purpose of a lock file?',
      options: ['It prevents two people from editing the same file', 'It records the exact versions of all dependencies so that every build uses the same ones', 'It encrypts the dependencies', 'It lists the files to ignore'],
      answer: 1,
      explanation: 'The package description gives ranges; the lock file pins what was actually chosen, including transitive dependencies and checksums.',
    },
    {
      id: 'semver',
      prompt: 'A library goes from version 4.2.1 to 5.0.0. What does semantic versioning say about the update?',
      options: ['Only bugs were fixed', 'New features, fully compatible', 'It may break code that uses the library', 'Nothing; numbers are arbitrary'],
      answer: 2,
      explanation: 'A new major version announces incompatible changes. Minor versions add features, patch versions fix bugs.',
    },
    {
      id: 'repro',
      prompt: 'Which habit works against reproducible builds?',
      options: ['Committing the lock file', 'Downloading the "latest" version of a tool during the build', 'Building in a fresh environment', 'Pinning the compiler version'],
      answer: 1,
      explanation: '"Latest" is a different thing on different days, so the same commit can produce different artifacts.',
    },
  ],
};
