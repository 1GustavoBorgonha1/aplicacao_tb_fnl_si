// Pequenos componentes reutilizáveis.
import { useCallback, useEffect, useState } from 'react';
import { errorText } from '../api.js';

export function Alert({ type = 'error', children }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function Badge({ value, labels }) {
  return <span className={`badge badge-${value}`}>{labels[value] ?? value}</span>;
}

/** Carrega dados de uma função async e expõe { data, error, loading, reload }. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  // `deps` controla quando recarregar (mesma semântica do useEffect).
  const load = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await load(), error: '', loading: false });
    } catch (err) {
      setState({ data: null, error: errorText(err), loading: false });
    }
  }, [load]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ...state, reload };
}
