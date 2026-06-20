import { useEffect, useRef } from 'react';
import './styles.css';
import markupHtml from './markup.html?raw';
import logicCode from './safesea-logic.js?raw';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}

export default function App() {
  const ref = useRef(null);

  useEffect(() => {
    // Guard against React StrictMode double-invocation in dev
    if (window.__safesea_booted) return;
    window.__safesea_booted = true;

    const el = ref.current;
    el.innerHTML = markupHtml; // exact original markup, untouched

    let cancelled = false;
    (async () => {
      try { if (!window.L) await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'); } catch (e) { /* map self-retries */ }
      try { if (!window.io) await loadScript('https://cdn.socket.io/4.7.5/socket.io.min.js'); } catch (e) { /* realtime self-retries */ }
      if (cancelled) return;

      // Inject the application logic as a CLASSIC script so its top-level
      // function declarations become globals — required by the original
      // inline onclick="..." handlers in the markup.
      const s = document.createElement('script');
      s.id = 'safesea-logic';
      s.textContent = logicCode;
      document.body.appendChild(s);
    })();

    return () => { cancelled = true; };
  }, []);

  return <div ref={ref} id="safesea-root" />;
}
