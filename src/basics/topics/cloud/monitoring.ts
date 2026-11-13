import type { Topic } from '../../schema';

export const monitoring: Topic = {
  id: 'monitoring',
  category: 'cloud',
  title: 'Monitoring',
  level: 2,
  definition: 'Monitoring means continuously collecting data about running systems, mainly metrics, logs and traces, in order to notice problems, alert the right people and understand what happened.',
  why: 'A system that is not observed fails silently, and the first report comes from a customer. Monitoring turns "the site feels slow" into a number with a time and a place. It is also the basis of every other operations topic: failover needs health checks, a canary release needs metrics, and an availability promise needs something that measures it.',
  sections: [
    {
      heading: 'Three kinds of data',
      blocks: [
        {
          kind: 'table',
          caption: 'Metrics, logs and traces',
          columns: ['', 'What it is', 'Answers', 'Cost'],
          rows: [
            ['Metric', 'A number measured at regular intervals: requests per second, memory in use', 'How much, how fast, since when? Trends and alerts', 'Small and constant, however busy the system is'],
            ['Log', 'A time-stamped record of a single event, as text or structured fields', 'What exactly happened in this case?', 'Grows with every event'],
            ['Trace', 'The path of one request through all services it touched, with the time spent in each', 'Where in the chain was the time lost or the error made?', 'High; usually only a sample is kept'],
          ],
        },
        {
          kind: 'text',
          text: 'They work together. A metric shows that the error rate rose at 14:02; a trace shows that the failing requests all pass through one service; its logs show the message with the cause. A system built so that such questions can be answered from the outside, including ones nobody anticipated, is called observable.',
        },
      ],
    },
    {
      heading: 'What to measure',
      blocks: [
        {
          kind: 'text',
          text: 'There is always more that could be measured than anyone can look at. For a service that answers requests, four measurements, known as the four golden signals, cover most of what matters.',
        },
        {
          kind: 'table',
          caption: 'The four golden signals',
          columns: ['Signal', 'Question', 'Example'],
          rows: [
            ['Latency', 'How long do requests take?', 'Response time, for successful and failed requests separately'],
            ['Traffic', 'How much demand is there?', 'Requests per second'],
            ['Errors', 'How many requests fail?', 'Share of answers with a server error'],
            ['Saturation', 'How full is the system?', 'Memory, disk, queue length, connections in use'],
          ],
        },
        {
          kind: 'text',
          text: 'Latency should be read as percentiles, not as an average. If the 99th percentile is two seconds, one request in a hundred takes at least that long, and an average of 80 milliseconds hides it completely. Since one page view often causes many requests, a large share of users meets that slow one.',
        },
        {
          kind: 'text',
          text: 'Two viewpoints complement each other. Measuring from outside, like a user, shows whether the service works at all (black-box: is the page reachable, can someone log in). Measuring inside shows why (white-box: queue lengths, database timings, internal errors).',
        },
      ],
    },
    {
      heading: 'Alerts that deserve attention',
      blocks: [
        {
          kind: 'text',
          text: 'An alert interrupts a person, perhaps at night. It should therefore fire only for something that is urgent, real, and that the person can act on. The best alerts are about symptoms users feel, such as a high error rate or slow answers, and not about causes such as a busy processor, which may be perfectly fine.',
        },
        {
          kind: 'list',
          items: [
            'Too many alerts are as dangerous as none: people who are paged for nothing stop reacting, which is called alert fatigue.',
            'Things that need attention within days, such as a disk filling slowly or a certificate expiring next month, belong in a ticket, not in a page.',
            'Every alert should link to a description of what it means and what to check first.',
            'Silence is a signal too: an alert for missing data catches the monitoring system or the reporting service having died.',
          ],
        },
      ],
    },
    {
      heading: 'Targets: SLI, SLO and error budget',
      blocks: [
        {
          kind: 'text',
          text: 'A service level indicator (SLI) is a measured quantity that reflects what users experience, for example the share of requests answered correctly within 300 milliseconds. A service level objective (SLO) is the target for it, such as 99.9 percent over 30 days. The agreement with a customer (SLA) is the contract on top and is usually set looser than the internal objective.',
        },
        {
          kind: 'text',
          text: 'The gap between the objective and 100 percent is the error budget: at 99.9 percent, one request in a thousand may fail. As long as budget is left, the team can release and take risks; when it is used up, stability comes first. This replaces the argument between "ship faster" and "change nothing" with a number both sides accept.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'More dashboards and more alerts mean better monitoring.', truth: 'What counts is whether a real problem is noticed quickly and understood. A few meaningful signals beat hundreds of graphs nobody reads and alerts everybody ignores.' },
    { myth: 'The average response time shows how fast the service is.', truth: 'The average hides the slow requests. Percentiles such as the 95th and 99th show what the unluckiest users get.' },
    { myth: 'The server is up, so the service works.', truth: 'A machine can answer a ping while the application returns errors. Health has to be checked the way a user uses the service.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'uptime', shows: 'The load averages over 1, 5 and 15 minutes: a first hint at saturation, to be read against the number of cores.' },
      { os: 'Linux', command: 'vmstat 1 5', shows: 'Five samples one second apart of processes, memory, swap, disk activity and processor use: metrics by hand.' },
      { os: 'Linux', command: 'df -h; free -h', shows: 'How full the disks and the memory are.' },
      { os: 'Linux', command: 'journalctl -p err --since "1 hour ago"', shows: 'The log entries of the last hour with priority error or worse.' },
      { os: 'Linux', command: 'curl -s -o /dev/null -w "%{http_code} %{time_total}s\\n" https://example.com/', shows: 'A black-box check by hand: status code and total response time of one request.' },
      { os: 'Linux', command: 'curl -s http://localhost:9100/metrics | head', shows: 'If a Prometheus node exporter runs on the machine: its metrics as plain text, one name and value per line.' },
      { os: 'Windows', command: 'Get-Counter "\\Processor(_Total)\\% Processor Time" -SampleInterval 1 -MaxSamples 5', shows: 'Five samples of processor use from the Windows performance counters (PowerShell).' },
      { os: 'Windows', command: 'Get-WinEvent -FilterHashtable @{LogName="System"; Level=2} -MaxEvents 10', shows: 'The last ten error events of the system log.' },
      { os: 'macOS', command: 'log show --last 10m --predicate "messageType == error" | tail', shows: 'Error messages of the last ten minutes from the unified log.' },
    ],
    numbers: [
      { label: 'Error budget at an objective of 99.9 %', value: '1 failed request in 1,000', note: 'or 43.2 minutes of full outage in 30 days, calculated: 0.001 x 30 x 24 x 60' },
      { label: 'Requests slower than the 99th percentile', value: '1 in 100', note: 'by definition' },
    ],
    examples: [
      'A disk fills up over three weeks. A graph of free space with a forecast creates a ticket ten days before it is full; without it, the database stops on a Saturday night.',
      'The average response time of a shop is a steady 120 ms, yet customers complain. The 99th percentile shows 6 seconds: one database query is slow for customers with long order histories.',
    ],
  },
  terms: [
    { term: 'Monitoring', definition: 'Continuously collecting and evaluating data about running systems to detect and understand problems.' },
    { term: 'Metric', definition: 'A numeric measurement taken at regular intervals and stored as a time series.' },
    { term: 'Log', definition: 'A time-stamped record of an event in a system.' },
    { term: 'Trace', definition: 'The recorded path of one request through the services it passed, with timings.' },
    { term: 'Observability', definition: 'The property of a system that its internal state can be understood from the data it emits.' },
    { term: 'Alert', definition: 'A notification sent when a measured condition needs attention.' },
    { term: 'Golden signals', definition: 'Latency, traffic, errors and saturation: four measurements that describe the health of a request-serving system.' },
    { term: 'Percentile', definition: 'The value below which a given share of measurements lies; the 99th percentile of latency is exceeded by one request in a hundred.' },
    { term: 'Service level indicator (SLI)', definition: 'A measured quantity that reflects the quality of a service as users experience it.' },
    { term: 'Service level objective (SLO)', definition: 'The target value for a service level indicator over a period.' },
    { term: 'Error budget', definition: 'The amount of failure an objective allows: the difference between the objective and 100 percent.' },
  ],
  related: [{ topic: 'high-availability' }, { topic: 'backup' }, { topic: 'ci-cd' }, { topic: 'processes' }, { topic: 'orchestration' }, { protocol: 'icmp' }, { protocol: 'ntp' }],
  sources: [
    { spec: 'Beyer, Jones, Petoff, Murphy (eds.): Site Reliability Engineering, chapter 6: Monitoring Distributed Systems', url: 'https://sre.google/sre-book/monitoring-distributed-systems/', note: 'the four golden signals, symptoms and causes, black-box and white-box monitoring' },
    { spec: 'Site Reliability Engineering, chapter 4: Service Level Objectives', url: 'https://sre.google/sre-book/service-level-objectives/', note: 'SLI, SLO, SLA' },
    { spec: 'OpenTelemetry Specification', url: 'https://opentelemetry.io/docs/specs/otel/', note: 'traces, metrics and logs as signals; not checked for this page' },
    { rfc: 5424, note: 'the syslog protocol: severity levels of log messages' },
    { spec: 'Prometheus documentation: Exposition formats', url: 'https://prometheus.io/docs/instrumenting/exposition_formats/', note: 'metrics as text; not checked for this page' },
  ],
  quiz: [
    {
      id: 'signals',
      prompt: 'Which set are the four golden signals?',
      options: ['CPU, memory, disk, network', 'Latency, traffic, errors, saturation', 'Logs, metrics, traces, alerts', 'Uptime, downtime, RPO, RTO'],
      answer: 1,
      explanation: 'How long requests take, how many there are, how many fail, and how full the system is.',
    },
    {
      id: 'p99',
      prompt: 'The 99th percentile of the response time is 2 seconds. What does that mean?',
      options: ['The average is 2 seconds', '99 percent of requests take 2 seconds', '1 percent of requests take 2 seconds or longer', 'The slowest request took 2 seconds'],
      answer: 2,
      explanation: 'Ninety-nine of a hundred requests are faster than this value, one is as slow or slower.',
    },
    {
      id: 'kind',
      prompt: 'A request is slow, and it passes through five services. Which kind of data shows best where the time is spent?',
      options: ['A metric of total requests', 'A trace of the request', 'The system log of one server', 'The uptime of each server'],
      answer: 1,
      explanation: 'A trace follows one request across services and records the time in each of them.',
    },
    {
      id: 'alert',
      prompt: 'Which of these is the best reason to wake someone at night?',
      options: ['Processor use reached 85 percent for one minute', 'One in five customer requests has been failing for ten minutes', 'A disk will be full in three weeks', 'A deployment finished successfully'],
      answer: 1,
      explanation: 'It is a symptom users feel, it is happening now, and someone can act. The disk belongs in a ticket; the processor reading may be harmless.',
    },
  ],
};
