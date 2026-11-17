import { Navigate, Route, Routes } from 'react-router-dom';
import { Protected } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import CadastroCliente from './pages/CadastroCliente.jsx';
import CadastroEmpresa from './pages/CadastroEmpresa.jsx';
import Restaurantes from './pages/cliente/Restaurantes.jsx';
import Catalogo from './pages/cliente/Catalogo.jsx';
import MeusPedidos from './pages/cliente/MeusPedidos.jsx';
import MinhaEmpresa from './pages/restaurante/MinhaEmpresa.jsx';
import MinhasMarmitas from './pages/restaurante/MinhasMarmitas.jsx';
import PedidosRecebidos from './pages/restaurante/PedidosRecebidos.jsx';
import Painel from './pages/admin/Painel.jsx';
import MinhaConta from './pages/MinhaConta.jsx';

const as = (role, el) => <Protected role={role}>{el}</Protected>;

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="cadastro/cliente" element={<CadastroCliente />} />
        <Route path="cadastro/empresa" element={<CadastroEmpresa />} />

        {/* Spec 002/003/004 — cliente */}
        <Route path="cliente" element={as('cliente', <Restaurantes />)} />
        <Route path="cliente/restaurantes/:id" element={as('cliente', <Catalogo />)} />
        <Route path="cliente/pedidos" element={as('cliente', <MeusPedidos />)} />

        {/* Spec 002/003/004 — restaurante */}
        <Route path="restaurante" element={as('restaurante', <PedidosRecebidos />)} />
        <Route path="restaurante/marmitas" element={as('restaurante', <MinhasMarmitas />)} />
        <Route path="restaurante/empresa" element={as('restaurante', <MinhaEmpresa />)} />

        {/* Spec 005 — admin */}
        <Route path="admin" element={as('admin', <Painel />)} />

        {/* Spec 006 — qualquer perfil autenticado */}
        <Route path="conta" element={as(undefined, <MinhaConta />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
