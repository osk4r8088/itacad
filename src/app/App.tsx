import { useEffect } from 'react';
import { useHashRoute } from './router';
import { findExchange } from '../protocols/exchanges';
import { ProtocolIndex } from '../protocols/components/ProtocolIndex';
import { ExchangePage } from '../protocols/components/ExchangePage';

export function App() {
  const route = useHashRoute();
  const exchange = route.page === 'exchange' ? findExchange(route.id) : undefined;

  useEffect(() => {
    document.title = exchange ? `${exchange.title} | Protocol Explorer` : 'Protocol Explorer';
  }, [exchange]);

  // Exchange pages render their own toolbar with the step controls.
  if (exchange && route.page === 'exchange') return <ExchangePage key={exchange.id} exchange={exchange} stepNumber={route.step} />;

  return (
    <>
      <header className="site-header">
        <a href="#/" className="site-title">
          Protocol Explorer
        </a>
      </header>
      <main>
        {route.page === 'index' ? (
          <ProtocolIndex />
        ) : (
          <p className="notice">
            Unknown protocol "{route.id}". <a href="#/">Back to the overview</a>.
          </p>
        )}
      </main>
    </>
  );
}
