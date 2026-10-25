# Assistente de Horas PSOffice

Desafio 3 · Automação de controles internos · controle **1. Horas não lançadas**, resolvido do lado de quem lança.

## 1. O problema

Quem esquece de lançar horas no PSOffice todo dia acaba reconstruindo a semana de memória: precisa lembrar onde atuou para justificar ao cliente, alguém precisa cobrar o dia zerado que na verdade era ausência, a semana precisa ser enviada para aprovação e toda segunda as atividades precisam ser selecionadas de novo.

## 2. O que eu fiz

Uma **extensão do Chrome/Edge** que usa a **sessão do PSOffice que já está aberta no navegador** (nenhuma senha é guardada) e uma **ponte local** que lê o GitHub com o `gh` já logado no computador (nenhum token é criado ou copiado). Ela cruza o que está lançado no PSOffice com a sua atividade no **GitHub** (pushes por branch, PRs, revisões, comentários e commits) e:

| Dor | O que a extensão faz |
|---|---|
| Esquecer de lançar | Notificação diária (padrão 17:30) só quando há dia útil sem horas e sem ausência |
| Retroativo sem contexto | Para cada dia, sugere as horas e a **justificativa pronta com os links do Jira** tirados de branches, PRs e commits do dia (o mesmo formato de comentário já usado no PSOffice). Sem chave do Jira no dia, a justificativa fica em branco para você escrever: títulos de PR/commit só entram se você ligar a opção |
| Hora extra (deploy em PRD, plantão) | Aponta atividade fora do expediente e itens `[PRD]`/`hotfix`/`release/producao`, com um botão `+Xh` para somar; nunca soma sozinho |
| Ausência deixada como dia zerado | Dia útil sem horas **e sem nenhuma atividade no GitHub** vira sugestão de ausência, registrada pelo painel no formulário oficial (tipo, dia inteiro, justificativa) |
| Ausência com trabalho no dia | Avisa quando há ausência registrada mas houve atividade no GitHub naquele dia (hora possivelmente não lançada) |
| Enviar no fim da semana | Lembrete na sexta (padrão 16:00) e botão "Enviar semana para aprovação" com o resumo para confirmar |
| Semana começa sem atividades | Na primeira verificação da semana, repete automaticamente as atividades da semana anterior |

Fluxo:

```
gh (já logado) ─> ponte local (só 4 GETs) ─┐
                                           ├─> regras (extensao/lib/regras.js) ─> painel na tela de Horas ─> PSOffice
PSOffice (semana, ausências, sessão) ──────┘                                   └─> notificações (lembrete diário / sexta)
```

A regra de exceção é a mesma do kit (**dia útil sem nenhum lançamento, desconsiderando fim de semana e feriado; pendente conta como lançado**), acrescida de:

- dia com ausência registrada (que não esteja rejeitada) não é pendência;
- dia sem lançamento **com** atividade no GitHub → sugestão de horas (jornada padrão, 8h) + justificativa;
- dia sem lançamento **sem** atividade no GitHub → sugestão de ausência;
- dia lançado sem justificativa e com chave do Jira nas evidências do dia → sugestão de justificativa;
- atividade antes do início ou depois do fim do expediente (padrão 08:00–18:00) → aviso de possível hora extra, com teto arredondado em 0,5h.

Nada é gravado sem um clique de confirmação, exceto a seleção das atividades da semana (que só repete as da semana anterior e pode ser desligada nas opções). Cada gravação é **conferida relendo o PSOffice** e o painel mostra erro se o sistema não confirmar.

### Como a integração funciona

O PSOffice não expõe API REST documentada. Existe um web service SOAP genérico (`/services`, `WBCService` com `wsLogin`), mas ele exige usuário e senha de integração e liberação do administrador. Por isso a extensão reproduz exatamente as chamadas que as próprias telas fazem, com a sessão do usuário:

| Ação | Chamada |
|---|---|
| Ler a semana | `GET horasnew.do?state=Select&dtRef=dd/mm/aaaa` |
| Lançar horas | `POST /api/horas/apontamento` (JSON `{data, atribId, aponId?, minutos, ept}`) |
| Justificativa | `POST core/util/ajax.do?service=comentapon&action=ADD_UPDATE` |
| Selecionar atividades | formulário `button_UpdateAtividadesNew` em `atividades.do` |
| Registrar ausência | formulário `button_Submete` em `minhas/ausencias.do` |
| Enviar para aprovação | formulário `button_SubmeteSemanal` em `horasnew.do` |

Os formulários são serializados como o navegador faria (incluindo a codificação `windows-1252` das telas).

No GitHub, a extensão não guarda token. Ela pergunta a uma **ponte local** ([native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), em `extensao/ponte/`), que roda `gh api` com a conta escolhida na instalação:

- o token continua só no cofre do sistema, onde o `gh` já o guarda; a ponte o pede ao `gh` a cada execução e não o grava;
- a ponte entende só duas perguntas ("quem sou eu" e "evidências entre as datas X e Y") e só faz `GET` em `/user`, `/users/<você>/events`, `/search/issues` e `/search/commits`. Qualquer outro caminho é recusado, então nem uma extensão comprometida consegue escrever no GitHub por ela;
- só a extensão com o ID fixo (chave no `manifest.json`) pode falar com a ponte.

## 3. Como reproduzir

### Usar no dia a dia (extensão)

Requer Node 18+ e o [GitHub CLI](https://cli.github.com/) logado (`gh auth login`).

1. Instale a ponte local, uma vez, na pasta do projeto, **num terminal comum** (no Windows: Iniciar > Terminal). Terminais embutidos em apps empacotados, como o do app desktop do Claude, gravam numa cópia privada que o navegador não enxerga; o instalador detecta isso e avisa. Com mais de uma conta no `gh`, informe qual usar (`gh auth status` lista as contas):

   ```bash
   node extensao/ponte/instalar.js --usuario <sua-conta-do-gh>
   ```

   Ela é registrada só para o seu usuário do sistema (no Windows, em `HKCU`, sem admin), para Chrome e Edge, e termina com um teste real. Para desfazer: `node extensao/ponte/instalar.js --remover`.
2. No Chrome, abra `chrome://extensions`, ligue o **Modo do desenvolvedor** e clique em **Carregar sem compactação**, escolhendo a pasta `extensao/`. A página de opções abre e mostra **"Ponte ok: lendo o GitHub como <conta>"**. O resto tem padrão e é opcional (jornada, horários, link do Jira, feriados municipais).
3. Faça login no PSOffice normalmente e abra **Horas**. O painel **Assistente de horas** aparece acima da grade semanal.
4. Revise as sugestões, ajuste horas/justificativas se quiser e clique em **Lançar**, **Registrar ausência**, **Aplicar sugestões** ou **Enviar semana para aprovação**.
5. O ícone da extensão abre direto a tela de Horas. Em **Opções → Salvar e verificar agora** dá para disparar os lembretes na hora.

Para outra pessoa da Ideen usar, basta repetir os passos 1 e 2 com a conta do `gh` dela: atividades, usuário e link do Jira são descobertos sozinhos no PSOffice. Sem a ponte, a extensão funciona do mesmo jeito, só sem as sugestões vindas do GitHub.

### Conferir a regra com a massa fictícia do kit

Requer Node 18+.

```bash
node kit/verificar-kit.js
```

Lê `dados/horas/*.csv`, aplica a regra (o mesmo `extensao/lib/regras.js` da extensão), grava `evidencias/dias_sem_lancamento.csv` e compara com `dados/horas/esperado/dias_sem_lancamento.csv`. Aceita outra pasta e outro período: `node kit/verificar-kit.js <pasta> <inicio> <fim>`.

```bash
node kit/testar.js
```

Testes das regras (calendário, fuso, chaves do Jira, análise da semana, hora extra), da lista de chamadas permitidas da ponte e da serialização dos formulários, incluindo o HTML malformado real do PSOffice.

## 4. Evidências

- `evidencias/log-verificacao-kit.txt`: execução completa sobre a massa do kit. Resultado **idêntico ao esperado (61 linhas)**; rodar duas vezes gera o mesmo arquivo.
- `evidencias/dias_sem_lancamento.csv`: saída gerada.
- `evidencias/log-testes.txt`: 13 testes passando.
- Ponte local testada com o `gh` real: o instalador recusa escolher sozinho quando há várias contas e confirma a conta; duas semanas de evidências (58 KB) passam pelo lançador sem perda; perguntas desconhecidas e períodos inválidos são recusados. Rodado de dentro de um terminal empacotado, o instalador detecta que o navegador não vai enxergar o registro e para com instruções.
- Extensão carregada no Chrome real: o painel aparece na tela de Horas e lê a semana do PSOffice (ausência, dias enviados, nada a enviar).
- Uso real no PSOffice (23/10/2026), com autorização e só na conta do autor: leitura da semana, das ausências e das justificativas; regravação das mesmas horas e da mesma justificativa, relida em seguida e idêntica; seleção automática das atividades da semana seguinte; envio da semana para aprovação (status passou a "Enviado para Aprovação"). Os formulários de ausência, atividades e envio foram comparados campo a campo com o que o navegador envia. Prints da tela real **não** estão no repositório porque mostram dados de cliente (regra do hackathon).

## 5. Onde a IA errou (e como foi corrigido)

1. **Propôs um mock** do PSOffice para caber nas regras do hackathon. O objetivo era usar de verdade a partir de segunda; o desenho virou integração real pela sessão do navegador, e a massa fictícia ficou para validar a regra.
2. **Usou a URL da semana que aparece nos links da tela** (`state=ExibeSemanal`). Sem `usuId`, ela devolve uma página "Acesso Negado" com **HTTP 200**. Corrigido para `state=Select&dtRef=...` e criada a detecção de página de erro.
3. **Assumiu que a API de eventos do GitHub traz título de PR e lista de commits.** Hoje ela traz só número do PR e branch. Os títulos passaram a vir da busca de PRs.
4. **Serializador de formulário com regex ingênua.** O teste unitário pegou que um `<input>` "engolia" os campos seguintes até o próximo `</select>`. Os testes reais tinham passado por sorte. Depois, a comparação com o formulário real de ausência mostrou HTML malformado (`name="DT_INICIO""`) e `>` dentro de atributo. A regex passou a seguir a regra do navegador e há teste para os dois casos.
5. **Estimou hora extra pelo intervalo entre a primeira e a última atividade do dia.** Calibrando com a semana real, superestimava (ex.: 12h sugeridas para um dia lançado com 10h). Virou um aviso com teto e botão, nunca um valor aplicado sozinho.
6. **Leu o HTML como UTF-8.** As telas são `windows-1252`. Corrigido na leitura (`TextDecoder`) e no envio dos formulários.
7. **Mandou colar o token do `gh` na extensão.** Funcionava, mas criava uma segunda cópia, em texto puro no perfil do navegador, de um token do cliente com permissão de escrita e sem expiração. Também usava, sem necessidade, títulos de PR do cliente como justificativa. Trocado pela ponte local (o token não sai do `gh` e só 4 GETs são possíveis), com justificativa só com links do Jira por padrão.
8. **Instalou a ponte de dentro do app desktop do Claude e declarou "instalada e testada".** O teste do instalador passou, mas o app é um pacote MSIX: o Windows gravou o registro e os arquivos numa cópia privada do pacote, e o Chrome respondia `Specified native messaging host not found`. Descoberto ao abrir o painel no Chrome real, com um log no lançador que nunca foi chamado. O instalador agora detecta esse caso e pede um terminal comum.

## Limitações e próximos passos

- A busca de commits do GitHub só enxerga a branch padrão; para dias além dos ~300 eventos recentes (cerca de 1 a 2 semanas) as evidências ficam mais pobres.
- Uma só atividade recebe a sugestão (a configurada ou a com mais horas na semana). Mapear repositório → atividade fica para depois.
- Jira como fonte direta (issues em que trabalhei no dia) e o web service SOAP oficial do PSOffice, se a administração liberar.
- Se a JExperts mudar as telas, o painel avisa "a tela do PSOffice mudou?" em vez de gravar errado.

## Segurança e dados

- Nenhuma senha passa pela extensão, e nenhum token do GitHub é criado, copiado ou guardado por ela: a leitura é feita pela ponte local com o `gh` já logado.
- Do GitHub só são lidos metadados (títulos, branches, mensagens, horários), nunca código, e só por `GET` em quatro caminhos fixos.
- Para o PSOffice vão, por padrão, só os links do Jira (como já se fazia à mão); textos dos repositórios do cliente só com a opção ligada.
- As chamadas aparecem nos logs do GitHub como uso do GitHub CLI da própria pessoa. Se o cliente restringir automações pessoais com a credencial dele, vale confirmar com a segurança do cliente antes de usar.
- O repositório não contém token, senha ou dado de cliente; a massa usada nas evidências é a fictícia do kit (`KIT.md` é o README original do kit).
