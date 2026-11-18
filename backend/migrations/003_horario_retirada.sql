-- Spec 002 (CA-002-06/07) — Horário de retirada estruturado.
-- dias_retirada: 0 = domingo … 6 = sábado. abre_as/fecha_as nulos = "sem horário configurado".
-- A coluna "horario" continua existindo como texto de exibição, agora gerado pelo servidor.
ALTER TABLE restaurants
  ADD COLUMN dias_retirada SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}'
    CONSTRAINT restaurants_dias_retirada_validos
    CHECK (dias_retirada <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]
           AND cardinality(dias_retirada) BETWEEN 1 AND 7),
  ADD COLUMN abre_as TIME,
  ADD COLUMN fecha_as TIME,
  ADD CONSTRAINT restaurants_janela_retirada
    CHECK ((abre_as IS NULL AND fecha_as IS NULL)
           OR (abre_as IS NOT NULL AND fecha_as IS NOT NULL AND abre_as < fecha_as));
