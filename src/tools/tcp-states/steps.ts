// Step numbers of the TCP exchange, used for links like #/protocols/tcp/3.
// Kept as a small static list so the tool does not load the whole exchange; data.test checks it.

export const TCP_STEP_IDS = ['syn', 'synack', 'ack', 'request', 'response', 'ack-response', 'fin-client', 'ack-fin-client', 'fin-server', 'ack-fin-server'];

export function tcpStepNumbers(): Record<string, number> {
  return Object.fromEntries(TCP_STEP_IDS.map((id, i) => [id, i + 1]));
}
