# Versões

Versionamento semântico: depois da entrega, cada versão só acrescenta e corrige, sem quebrar nada para quem já usa (atualiza recarregando a extensão e mantém as configurações), por isso são versões menores.

## v1.3.0 · 08/11/2026

- **Correção:** "Salvar justificativa" não gravava em dia lançado e ainda não enviado (lia o campo vazio do Ajustar e respondia "Escreva a justificativa.").
- **Fim de semana e feriado como dia útil:** com atividade e sem horas, o dia ganha o mesmo formulário (horas estimadas da atividade, links do Jira e **Lançar**), sem precisar lançar nada na grade antes. Não conta como pendência e, na revisão, entra desmarcado.
- **Revisão mais legível:** os links do Jira não quebram no meio nas colunas Antes e Depois.

Para atualizar: em `chrome://extensions`, recarregue a extensão.

## v1.2.0 · 04/11/2026

Refinamentos depois da entrega, a partir do uso no dia a dia:

- **Justificativa só com o seu trabalho:** os links do Jira vêm dos seus commits, pushes, branches e PRs. Revisões e comentários aparecem no painel, mas não entram na justificativa.
- **Hora extra mais justa:** revisões e comentários pesam menos (um review isolado vale cerca de 0,25h).
- **Opções mais simples:** cada regra numa frase, com o valor editável dentro dela; o que é raro fica em "Avançado"; salva sozinha.
- **Selo no ícone da extensão** com o número de dias pendentes, mesmo com as notificações do Windows desligadas.
- **Painel recolhível**, com um resumo de uma linha, e dias mais enxutos.
- **Teste de lembretes seguro:** não grava nada no PSOffice, não cancela o aviso do dia e diz o que aconteceu.
- **Demonstração sem PSOffice:** `kit/demo/painel.html` roda o painel com dados fictícios; o GIF do README vem dela.
- **Correção:** os formulários escondidos do painel (Ajustar, ausência) não dependem mais do CSS da página do PSOffice.

Para atualizar: em `chrome://extensions`, recarregue a extensão. As configurações são mantidas.

## v1.1.0 · 26/10/2026 · Entrega do hackathon

Primeira versão publicada, entregue no prazo do Desafio 3:

- Painel na tela de Horas do PSOffice que sugere horas e justificativa (links do Jira) a partir do GitHub.
- "Revisar sugestões": mostra o antes → depois de cada dia e grava só o que for marcado.
- Registro de ausência, ajuste antes da aprovação, envio e cancelamento do envio da semana.
- Aviso de possível hora extra, calculado por sessões de atividade e comparado com o que já foi lançado.
- Lembrete diário e de sexta; seleção automática das atividades na semana nova.
- Ponte local com o `gh`: nenhum token fica guardado na extensão.
- Regra do kit validada com a massa fictícia (resultado idêntico ao esperado).

## v1.0.0 · não publicada

Primeira versão funcional, usada só localmente durante o hackathon. Pedia um token do GitHub nas Opções; como o cliente monitora os tokens gerados, ela foi trocada pela ponte local antes do primeiro commit. Por isso o repositório começa na v1.1.0.
