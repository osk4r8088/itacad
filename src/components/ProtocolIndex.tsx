import { exchanges } from '../exchanges';

export function ProtocolIndex() {
  const groups = [...new Set(exchanges.map((e) => e.group))];
  return (
    <div className="index">
      <p className="lead">
        Step through real protocol exchanges. Each step shows the message on the network, in a sequence diagram, and as a packet with every header field, layer by layer.
      </p>
      {groups.map((g) => (
        <section key={g}>
          <h2>{g}</h2>
          <ul className="cards">
            {exchanges
              .filter((e) => e.group === g)
              .map((e) => (
                <li key={e.id}>
                  <a className="card" href={`#/${e.id}/1`}>
                    <strong>{e.title}</strong>
                    <span>{e.summary}</span>
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
