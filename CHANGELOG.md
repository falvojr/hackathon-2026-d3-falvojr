# Versões

## v2.0.0 · 04/11/2026 · Versão refinada

Melhorias desde a entrega do hackathon:

- **Justificativa só com o seu trabalho:** os links do Jira vêm dos seus commits, pushes, branches e PRs. Revisões e comentários aparecem no painel, mas não entram na justificativa.
- **Hora extra mais justa:** revisões e comentários pesam menos (um review isolado vale cerca de 0,25h).
- **Opções mais simples:** cada regra numa frase, com o valor editável dentro dela; o que é raro fica em "Avançado"; salva sozinha.
- **Selo no ícone da extensão** com o número de dias pendentes, mesmo com as notificações do Windows desligadas.
- **Painel recolhível**, com um resumo de uma linha, e dias mais enxutos.
- **Teste de lembretes seguro:** não grava nada no PSOffice, não cancela o aviso do dia e diz o que aconteceu.

Para atualizar: em `chrome://extensions`, recarregue a extensão. As configurações são mantidas.

## v1.1.0 · 26/10/2026 · Entrega do hackathon

Primeira versão, entregue no prazo do Desafio 3:

- Painel na tela de Horas do PSOffice que sugere horas e justificativa (links do Jira) a partir do GitHub.
- "Revisar sugestões": mostra o antes → depois de cada dia e grava só o que for marcado.
- Registro de ausência, ajuste antes da aprovação, envio e cancelamento do envio da semana.
- Aviso de possível hora extra, calculado por sessões de atividade e comparado com o que já foi lançado.
- Lembrete diário e de sexta; seleção automática das atividades na semana nova.
- Ponte local com o `gh`: nenhum token fica guardado na extensão.
- Regra do kit validada com a massa fictícia (resultado idêntico ao esperado).
