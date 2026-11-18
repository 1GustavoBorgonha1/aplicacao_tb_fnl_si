// Spec 002 (CA-002-06) — horário de retirada estruturado: dias da semana + abre/fecha.
// Só UX: quem valida (dias 0–6, abertura antes do fechamento) é o backend.
import { Field } from './ui.jsx';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const HORARIO_PADRAO = { dias_retirada: [1, 2, 3, 4, 5], abre_as: '', fecha_as: '' };

/** Converte a resposta da API (null) para os campos do formulário (''). */
export const horarioDoRestaurante = (r) => ({
  dias_retirada: r.dias_retirada ?? HORARIO_PADRAO.dias_retirada,
  abre_as: r.abre_as ?? '',
  fecha_as: r.fecha_as ?? '',
});

/**
 * @param {{ value: { dias_retirada: number[], abre_as: string, fecha_as: string }, onChange: (v: object) => void }} props
 */
export default function HorarioRetirada({ value, onChange }) {
  const alternarDia = (dia) => {
    const dias = value.dias_retirada.includes(dia)
      ? value.dias_retirada.filter((d) => d !== dia)
      : [...value.dias_retirada, dia].sort((a, b) => a - b);
    onChange({ ...value, dias_retirada: dias });
  };

  return (
    <fieldset>
      <legend>Horário de retirada</legend>
      <div className="dias" role="group" aria-label="Dias de retirada">
        {DIAS.map((nome, dia) => (
          <label key={nome} className="check dia">
            <input type="checkbox" checked={value.dias_retirada.includes(dia)} onChange={() => alternarDia(dia)} />
            {nome}
          </label>
        ))}
      </div>
      <div className="grid-2">
        <Field label="Abre às">
          <input
            type="time"
            required={Boolean(value.fecha_as)}
            value={value.abre_as}
            onChange={(e) => onChange({ ...value, abre_as: e.target.value })}
          />
        </Field>
        <Field label="Fecha às">
          <input
            type="time"
            required={Boolean(value.abre_as)}
            min={value.abre_as || undefined}
            value={value.fecha_as}
            onChange={(e) => onChange({ ...value, fecha_as: e.target.value })}
          />
        </Field>
      </div>
      <small className="muted">Os clientes só conseguem marcar a retirada nesses dias e horários (horário de Brasília).</small>
    </fieldset>
  );
}
