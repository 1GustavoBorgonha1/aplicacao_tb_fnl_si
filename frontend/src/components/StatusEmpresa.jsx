import { useAuth } from '../auth.jsx';
import { Alert } from './ui.jsx';

/** Aviso exibido ao restaurante enquanto a empresa não está aprovada. */
export default function StatusEmpresa() {
  const { restaurante } = useAuth();
  if (!restaurante || restaurante.status === 'aprovado') return null;
  if (restaurante.status === 'bloqueado') {
    return <Alert>Sua empresa está bloqueada. Entre em contato com o administrador.</Alert>;
  }
  return (
    <Alert type="info">
      Sua empresa está <strong>aguardando aprovação</strong> do administrador. Você já pode cadastrar marmitas;
      elas ficarão visíveis aos clientes após a aprovação.
    </Alert>
  );
}
