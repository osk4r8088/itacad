import { useEffect } from 'react';
import { useHashRoute } from './hooks/useHashRoute';
import { findExchange } from './exchanges';
import { ProtocolIndex } from './components/ProtocolIndex';
import { ExchangePage } from './components/ExchangePage';

export function App() {
  const route = useHashRoute();
  const exchange = route.page === 'exchange' ? findExchange(route.id) : undefined;

  useEffect(() => {
    document.title = exchange ? `${exchange.title} | Protocol Explorer` : 'Protocol Explorer';
  }, [exchange]);

  return (
    <>
      <header className="site-header">
        <a href="#/" className="site-title">
          Protocol Explorer
        </a>
        {exchange && <span className="crumb">{exchange.title}</span>}
      </header>
      <main>
        {route.page === 'index' && <ProtocolIndex />}
        {route.page === 'exchange' && exchange && <ExchangePage key={exchange.id} exchange={exchange} stepNumber={route.step} />}
        {route.page === 'exchange' && !exchange && (
          <p className="notice">
            Unknown protocol "{route.id}". <a href="#/">Back to the overview</a>.
          </p>
        )}
      </main>
    </>
  );
}
