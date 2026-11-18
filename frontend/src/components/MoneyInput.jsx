// UX-003-01 — campo de dinheiro com máscara "caixa registradora".
// O valor (prop `value`) é sempre em centavos inteiros ou null (vazio); quem valida é o backend.
import { brl, centavosDeTexto } from '../format.js';

/** Mantém o cursor no fim: os dígitos sempre entram pela direita. */
const cursorNoFim = (e) => {
  const fim = e.target.value.length;
  e.target.setSelectionRange(fim, fim);
};

/**
 * @param {{ value: number | null, onChange: (centavos: number | null) => void, max: number } & object} props
 */
export default function MoneyInput({ value, onChange, max, ...props }) {
  function alterar(e) {
    const centavos = centavosDeTexto(e.target.value);
    if (centavos === null || centavos <= max) onChange(centavos); // acima do máximo: ignora a tecla
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="R$ 0,00"
      value={value ? brl(value) : ''}
      onChange={alterar}
      onFocus={cursorNoFim}
      onClick={cursorNoFim}
      {...props}
    />
  );
}
