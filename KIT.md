# Kit do Desafio 3 · Automação de controles internos

Todos os dados são **fictícios**: pessoas, e-mails (`@exemplo.test`), clientes, projetos e valores foram gerados para o hackathon.

Data de referência para todos os controles: **2026-10-23**.

Os arquivos estão em CSV (UTF-8) dentro de `dados/`, um diretório por controle. A mesma massa está em `massa-controles.xlsx`, uma aba por arquivo, para quem preferir planilha.

Cada controle tem uma pasta `esperado/` com o resultado da **regra sugerida**. Use para conferir a sua solução. Se você mudar a regra, explique no README e mostre o novo resultado nas evidências.

## 1. Horas não lançadas (`dados/horas/`)

| Arquivo | Conteúdo |
|---|---|
| `colaboradores.csv` | matrícula, nome, e-mail, gestor, cliente, projeto, regime, local |
| `lancamentos.csv` | matrícula, data, projeto, horas, status (`APROVADO`, `PENDENTE`) |
| `feriados.csv` | feriados do período |

**Regra sugerida:** para cada colaborador, listar os dias úteis de 2026-10-09 a 2026-10-22 sem nenhum lançamento, desconsiderando fins de semana e feriados. Lançamento pendente conta como lançado.

**Esperado:** `esperado/dias_sem_lancamento.csv`.

## 2. Consolidação de faturamento (`dados/faturamento/`)

Uma planilha por cliente, referente a setembro de 2026, **cada uma num formato diferente**:
- vírgula ou ponto e vírgula como separador;
- decimal com ponto ou vírgula;
- milhar com ponto;
- `R$` no valor;
- nomes de colunas diferentes;
- uma linha duplicada;
- uma linha vazia.

**Regra sugerida:** consolidar tudo numa visão única com `cliente, projeto, competencia, horas, valor`, descartando linha vazia e linha duplicada (mesmo projeto, horas e valor).

**Esperado:** `esperado/consolidado_2026-09.csv`.

## 3. Uso de licenças (`dados/licencas/`)

| Arquivo | Conteúdo |
|---|---|
| `licencas.csv` | ferramenta, plano, usuário, custo mensal, data do último acesso (vazio = nunca acessou) |

**Regra sugerida:** suspender licença sem acesso há **mais de 120 dias** (exatamente 120 dias não suspende) ou que nunca foi acessada. Mostrar a economia mensal total.

**Esperado:** `esperado/suspender.csv`.

## 4. Farol de desalocação (`dados/desalocacao/`)

| Arquivo | Conteúdo |
|---|---|
| `alocacoes.csv` | matrícula, nome, cliente, projeto, início, fim, percentual de alocação |

**Regra sugerida:**
- `ALERTA` quando a data fim está entre hoje e os próximos 30 dias, inclusive.
- `CRITICO` quando a data fim já passou e a pessoa segue na lista.
- Fim em 31 dias ou mais não entra.

**Esperado:** `esperado/farol.csv`.

## Ou traga o seu controle

Outro controle da operação vale, desde que aprovado pelo padrinho até 14h25. Nesse caso, gere a sua própria massa fictícia e descreva a regra no README.

## Entrega (`ideen-tech/hackathon-2026-d3-[seu-usuário]`)

- A solução: script, planilha, Apps Script, tela ou app. Se o código vive fora de arquivo, exporte para o repositório.
- `evidencias/` com prints das telas, a saída gerada e o log de uma execução completa.
- `README.md` com o problema, o que você fez, como reproduzir, as evidências e onde a IA errou.

Teste só com você mesmo: nenhum e-mail ou mensagem para outras pessoas.

Prazo: **segunda, 26/10, às 9h**. Continuar no fim de semana é opcional, e horas do hackathon no fim de semana não são lançadas.
