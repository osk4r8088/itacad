import type { Topic } from '../../schema';

export const transactions: Topic = {
  id: 'transactions',
  category: 'databases',
  title: 'Transactions and ACID',
  level: 2,
  definition: 'A transaction is a group of database operations that takes effect completely or not at all; the four guarantees a database gives for transactions are summed up as ACID: atomicity, consistency, isolation and durability.',
  why: 'Moving money means taking it from one account and adding it to another. If the system stops between the two steps, or two transfers run at the same moment, money must neither vanish nor appear. Transactions are how databases make that promise, and nearly every application silently relies on it. Knowing what exactly is promised, and at which isolation level, explains a family of rare and expensive bugs.',
  sections: [
    {
      heading: 'All or nothing',
      blocks: [
        {
          kind: 'text',
          text: 'A transaction starts with BEGIN, contains any number of statements, and ends in one of two ways. COMMIT makes all its changes permanent and visible to others at once. ROLLBACK discards all of them, as if the transaction had never started. If the connection breaks or the server crashes before the commit, the database rolls back by itself.',
        },
        {
          kind: 'list',
          items: [
            'BEGIN',
            'UPDATE accounts SET balance = balance - 100 WHERE id = 1',
            'UPDATE accounts SET balance = balance + 100 WHERE id = 2',
            'COMMIT',
          ],
        },
        {
          kind: 'text',
          text: 'No other session ever sees the state in between, with the money gone from one account and not yet in the other. A single statement outside an explicit transaction is a small transaction of its own.',
        },
      ],
    },
    {
      heading: 'The four letters',
      blocks: [
        {
          kind: 'table',
          caption: 'ACID',
          columns: ['Property', 'Guarantee', 'Protects against'],
          rows: [
            ['Atomicity', 'All operations of a transaction happen, or none', 'Half-finished changes after an error or crash'],
            ['Consistency', 'A transaction takes the database from one valid state to another; all declared rules hold at the end', 'Data that breaks constraints such as foreign keys or checks'],
            ['Isolation', 'Transactions running at the same time do not interfere; the result is as if they had run one after another', 'Wrong results from interleaved reads and writes'],
            ['Durability', 'Once committed, a change survives crashes and power loss', 'Losing work the user was told is saved'],
          ],
        },
        {
          kind: 'text',
          text: 'The acronym was coined in 1983. Consistency is the odd one: the database enforces only the rules it was told about in the schema. That an order total equals the sum of its lines is true only if the application, or a constraint, makes it so.',
        },
        {
          kind: 'text',
          text: 'Atomicity and durability rest on one technique. Before changing its data files, the database appends a description of the change to a log and forces it to disk; that is the write-ahead log. After a crash, the log is replayed: changes of committed transactions are completed, changes of unfinished ones are undone.',
        },
      ],
    },
    {
      heading: 'Isolation has levels',
      blocks: [
        {
          kind: 'text',
          text: 'Perfect isolation, called serializable, is costly, so databases offer weaker levels that allow certain anomalies in exchange for speed. The SQL standard names four levels by the phenomena they must prevent.',
        },
        {
          kind: 'table',
          caption: 'Isolation levels of the SQL standard and the phenomena each still allows',
          columns: ['Level', 'Dirty read', 'Non-repeatable read', 'Phantom read'],
          rows: [
            ['Read uncommitted', 'possible', 'possible', 'possible'],
            ['Read committed', 'no', 'possible', 'possible'],
            ['Repeatable read', 'no', 'no', 'possible'],
            ['Serializable', 'no', 'no', 'no'],
          ],
        },
        {
          kind: 'list',
          items: [
            'Dirty read: seeing data another transaction has written and not yet committed, which may still be rolled back.',
            'Non-repeatable read: reading the same row twice in one transaction and getting different values, because another transaction committed a change in between.',
            'Phantom read: running the same query twice and getting additional or missing rows, because another transaction inserted or deleted some.',
          ],
        },
        {
          kind: 'text',
          text: 'The default is rarely the strictest: PostgreSQL, for example, uses read committed unless told otherwise, and its repeatable read is stricter than the standard requires and shows no phantoms. A classic bug that weaker levels permit is the lost update: two sessions read a stock of 5, each subtracts 1 and writes 4. One sale has disappeared. The cures are an atomic statement (SET stock = stock - 1), locking the row when reading it (SELECT ... FOR UPDATE), or a stricter level with a retry.',
        },
      ],
    },
    {
      heading: 'Locks, versions and deadlocks',
      blocks: [
        {
          kind: 'text',
          text: 'Databases keep transactions apart in two ways. With locks, a transaction that changes a row holds it until commit, and others that want to change the same row wait. With multiversion concurrency control (MVCC), a change creates a new version of the row; readers keep seeing the version that was current when they started, so readers and writers do not block each other. Most current databases combine both.',
        },
        {
          kind: 'text',
          text: 'Waiting can go in a circle: transaction A holds row 1 and wants row 2, while B holds row 2 and wants row 1. This is a deadlock. The database detects it and aborts one of the two with an error; the application is expected to try that transaction again. Long transactions make all of this worse, since they hold locks and old row versions for their whole duration, so the rule is to keep them short and never wait for user input inside one.',
        },
        {
          kind: 'text',
          text: 'Across several databases or services, a single local transaction is not available. Distributed protocols such as two-phase commit exist and are slow and fragile, which is why many distributed systems settle for weaker guarantees and repair inconsistencies afterwards.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'Transactions are only for banks.', truth: 'Any change that touches more than one row or table needs one: placing an order, registering a user, moving a file record. Without it, a crash leaves half of the change behind.' },
    { myth: 'An ACID database makes concurrent access automatically correct.', truth: 'Only at the serializable level. At the usual default levels, anomalies such as lost updates are possible and must be handled in the queries.' },
    { myth: 'Consistency in ACID means the data is correct.', truth: 'It means the declared constraints hold. Rules the database was never told about can be violated by a perfectly valid transaction.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'psql -c "SHOW transaction_isolation;"', shows: 'The isolation level in effect for this PostgreSQL session; the default is read committed.' },
      { os: 'Linux', command: 'psql -c "BEGIN; UPDATE accounts SET balance = balance - 100 WHERE id = 1; ROLLBACK;"', shows: 'A change that is made and discarded again; afterwards the balance is as before.' },
      { os: 'Linux', command: 'psql -c "SELECT pid, state, xact_start, query FROM pg_stat_activity WHERE state <> \'idle\';"', shows: 'The sessions that are currently inside a transaction, with its start time: the place to look for long-running ones.' },
      { os: 'Linux', command: 'psql -c "SELECT * FROM pg_locks WHERE NOT granted;"', shows: 'Lock requests that are waiting for another transaction to finish.' },
      { os: 'Linux', command: 'sqlite3 shop.db "PRAGMA journal_mode;"', shows: 'How SQLite makes its transactions durable: a rollback journal (delete) or a write-ahead log (wal).' },
      { os: 'Windows', command: 'sqlcmd -Q "DBCC OPENTRAN"', shows: 'The oldest open transaction in a SQL Server database.' },
      { os: 'macOS', command: 'sqlite3 :memory: "CREATE TABLE t(x); BEGIN; INSERT INTO t VALUES (1); ROLLBACK; SELECT COUNT(*) FROM t;"', shows: 'A rolled-back insert leaves nothing behind: the count is 0.' },
    ],
    examples: [
      'Two customers buy the last concert ticket in the same second. Without the right isolation or locking, both orders succeed and the stock shows minus one.',
      'A nightly job updates a million rows in one transaction that runs for an hour. During that hour other sessions wait for its locks, and the application appears to hang.',
    ],
  },
  terms: [
    { term: 'Transaction', definition: 'A group of database operations that is committed as a whole or rolled back as a whole.' },
    { term: 'ACID', definition: 'Atomicity, consistency, isolation and durability: the guarantees a database gives for transactions.' },
    { term: 'Atomicity', definition: 'The guarantee that a transaction takes effect completely or not at all.' },
    { term: 'Durability', definition: 'The guarantee that a committed transaction survives crashes and power loss.' },
    { term: 'Isolation level', definition: 'The degree to which a transaction is shielded from the effects of others running at the same time.' },
    { term: 'Serializable', definition: 'The strictest isolation level: the outcome equals that of running the transactions one after another in some order.' },
    { term: 'Dirty read', definition: 'Reading data that another transaction has written and not yet committed.' },
    { term: 'Lost update', definition: 'An anomaly in which two transactions read a value, both change it, and one change overwrites the other.' },
    { term: 'Write-ahead log (WAL)', definition: 'The log to which a database writes every change before applying it to its data files, used for recovery after a crash.' },
    { term: 'Multiversion concurrency control (MVCC)', definition: 'Keeping several versions of a row so that readers see a stable state while writers create new versions.' },
    { term: 'Deadlock', definition: 'A state in which transactions wait for each other\'s locks in a circle, so that none can continue.' },
    { term: 'Two-phase commit', definition: 'A protocol that commits a transaction across several systems by first asking all to prepare and then telling all to commit.' },
  ],
  related: [{ topic: 'sql-basics' }, { topic: 'relational-nosql' }, { topic: 'indexes' }, { topic: 'file-systems' }, { topic: 'high-availability' }, { topic: 'processes' }],
  sources: [
    { spec: 'Haerder, Reuter: Principles of Transaction-Oriented Database Recovery. ACM Computing Surveys 15(4), 1983', note: 'atomicity, consistency, isolation, durability; origin of the acronym ACID' },
    { spec: 'PostgreSQL documentation: 13.2 Transaction Isolation', url: 'https://www.postgresql.org/docs/current/transaction-iso.html', note: 'the four standard levels and the phenomena; read committed as default; repeatable read without phantoms' },
    { spec: 'ISO/IEC 9075-2: SQL, Part 2: Foundation', note: 'isolation levels defined by the phenomena they exclude' },
    { spec: 'Berenson, Bernstein, Gray, Melton, O\'Neil, O\'Neil: A Critique of ANSI SQL Isolation Levels. SIGMOD 1995', note: 'lost update and other anomalies beyond the three of the standard; cited from memory' },
    { spec: 'PostgreSQL documentation: 28.3 Write-Ahead Logging (WAL)', note: 'section number not checked' },
    { spec: 'Gray, Reuter: Transaction Processing: Concepts and Techniques, 1992' },
  ],
  quiz: [
    {
      id: 'atomic',
      prompt: 'A transfer debits account A, then the server loses power before crediting account B. What does the database show after restart?',
      options: ['A is debited, B is unchanged', 'Neither account is changed', 'Both are changed', 'The database is corrupt'],
      answer: 1,
      explanation: 'The transaction was never committed, so recovery undoes its partial changes. That is atomicity.',
    },
    {
      id: 'c',
      prompt: 'Which of the ACID properties depends most on what the designer declared in the schema?',
      options: ['Atomicity', 'Consistency', 'Isolation', 'Durability'],
      answer: 1,
      explanation: 'The database keeps the rules it knows: keys, checks, types. Business rules it was never given are not enforced.',
    },
    {
      id: 'dirty',
      prompt: 'A report reads a balance that another transaction has changed and then rolls back. What is this called?',
      options: ['Phantom read', 'Dirty read', 'Deadlock', 'Lost update'],
      answer: 1,
      explanation: 'The report saw uncommitted data that never became real. Read committed and stricter levels prevent it.',
    },
    {
      id: 'deadlock',
      prompt: 'Transaction A holds a lock on row 1 and waits for row 2; transaction B holds row 2 and waits for row 1. What does the database do?',
      options: ['It waits forever', 'It aborts one of them with an error so the other can continue', 'It commits both', 'It deletes both rows'],
      answer: 1,
      explanation: 'Databases detect the cycle and choose a victim. The application should catch the error and run that transaction again.',
    },
  ],
};
