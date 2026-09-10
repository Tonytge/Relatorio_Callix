# Relatório da Discadora — Lopes Imobiliária

Site estático que recria o dashboard mensal (discadora + receptivo) a partir dos
6 arquivos exportados do Callix/LopesCloud. Tudo roda **no navegador** — nenhum
arquivo é enviado para nenhum servidor.

## Como publicar no Netlify (uma vez só)

1. Acesse https://app.netlify.com/drop
2. Arraste esta pasta inteira (`index.html`, `styles.css`, `app.js`) para a área
   de upload da página.
3. Pronto — o Netlify gera um link (algo como `nome-aleatorio.netlify.app`).
   Você pode renomear o site em **Site settings → Change site name** para algo
   como `lopes-relatorio-discadora.netlify.app`.

Guarde esse link: é ele que você vai abrir todo mês.

## Como usar todo mês

1. Abra o link do site.
2. Arraste os 6 arquivos exportados do Callix/LopesCloud (os mesmos nomes de
   sempre, só muda a data):
   - Resumo das campanhas
   - Resumo do receptivo
   - **Performance por usuário** — export com uma linha por agente **por dia**
     (colunas como "Nome do agente", "Data", "Chamadas atendidas de campanha",
     "Total", "Pausa", "Disponível", "Equipe" etc.)
   - Dados campanha — chamadas completadas
   - Dados chamadas recebidas — completadas
   - Equipes_Lopes.xlsx
3. O site reconhece cada arquivo pelo conteúdo das colunas, não pelo nome do
   arquivo — pode soltar todos de uma vez, em qualquer ordem.
4. Quando o botão **Gerar relatório** ficar ativo, clique nele.
5. Use as abas (Todas / Equipe Flávio / Equipe Márcia / Equipe Scarton / Equipe
   Thiago) para ver os números por equipe.
6. Use o **Filtro de período** para selecionar a data inicial e a data final.
   O dashboard recalcula tudo — KPIs, ranking, tempo ativo/disponível e
   desempenho por agente — só para o intervalo escolhido, inclusive um único
   dia.
7. Botões disponíveis: **Copiar texto p/ WhatsApp** (resumo pronto pra
   enviar), **Exportar HTML** e **Exportar PDF** (abre a caixa de impressão do
   navegador; escolha "Salvar como PDF" como destino).

   O **Exportar HTML** se comporta diferente dependendo da aba selecionada na
   hora do clique:
   - Com uma **equipe específica** selecionada, baixa um arquivo estático só
     com os dados daquela equipe, já refletindo o filtro de período que
     estiver ativo no momento — sem gráfico de comparação entre equipes, sem
     senha (é pra mandar direto pro responsável daquela equipe).
   - Com **Todas** selecionado, o site pede pra você **criar uma senha** e
     baixa um arquivo chamado **`index.html`** já pronto pra publicar (ex.: no
     GitHub Pages) — só abre com a senha certa. Dentro dele, o diretor tem as
     mesmas abas de equipe **e o mesmo filtro de período** que você tem aqui —
     pode explorar qualquer equipe e qualquer intervalo de datas sozinho, sem
     precisar que você gere um arquivo novo pra cada reunião. Guarde a senha
     em lugar seguro e passe só pra ele.
8. O **tempo de operação** (tempo logado, pausa, tempo ativo e disponível
   para a discadora) agora aparece direto nas colunas da tabela **Desempenho
   por agente** — não é mais um painel separado. O KPI **"Tempo ativo total"**
   soma o tempo ativo de todos os agentes da seleção atual (equipe + período),
   pra dar uma noção de quanto tempo a equipe/empresa funcionou no total.
9. O **Ranking de eficiência** mostra os top 10 agentes por % de conversão
   (leads ÷ completadas), com um mínimo de 5 chamadas completadas pra entrar
   no ranking — isso evita que um agente com 1 chamada e 1 lead apareça como
   "100% eficiente". Respeita a aba de equipe e o filtro de período.
10. **Tendência diária** mostra completadas e leads dia a dia dentro do
    período selecionado — bom pra ver se teve queda em algum dia específico.
11. **Ranking de equipes** compara as 4 equipes por % de conversão (não entra
    na exportação de uma equipe específica, por privacidade — só na "Todas").
12. A tabela de agentes agora também mostra **% Ocioso** (tempo logado mas
    parado, sem estar em pausa formal nem em chamada) — bom indicador pra
    coaching.

## Sobre os números

- Os KPIs de "Tentativas", "% de atendimento" e "TMA" da visão **Todas** vêm
  direto do arquivo *Resumo das campanhas / receptivo* (fonte oficial do
  Callix), somando os dias dentro do período selecionado.
- Quando você filtra por equipe, "Tentativas" e "TMA" são **estimados**
  proporcionalmente à participação de cada equipe nas chamadas completadas
  (o Callix não exporta tentativas por operador, só o total geral) — por isso
  aparece "(estimado)" ao lado desses cards.
- "Tempo ativo" = Total − (Pausa + Descanso + Refeição + Banheiro). "Disponível"
  vem direto da coluna "Disponível" do export por usuário — não é mais uma
  estimativa.
- A equipe de cada agente vem primeiro do Equipes_Lopes.xlsx; se o agente não
  estiver lá, o site usa a equipe que já vem no próprio arquivo de
  performance (convertendo "SCARTON.ES" → "Equipe Scarton", etc.).
- Um lead é qualquer chamada com qualificação começando em "LEAD:".
- Chamadas do receptivo atendidas pelo número de bot/URA (WhatsApp automático)
  aparecem como "Atendimento automático" e não entram na contagem de nenhuma
  equipe, já que não foram atendidas por um operador humano.
- A "% Conversão" e a coluna "Leads" na tabela de agentes vêm dos leads reais
  gerados por cada agente (chamadas com qualificação "LEAD:"), não de nenhuma
  coluna de "sucesso" do Callix.
- A lista "Qualificação das chamadas completadas" mostra **todas** as
  qualificações que apareceram nas chamadas, incluindo "Chamada sem
  qualificação", "Chamada caiu" e "Engano" — ordenadas da mais frequente pra
  menos frequente, com a % calculada sobre o total de chamadas completadas.
- O site não guarda nem exporta nome ou telefone de cliente em nenhum lugar
  (isso foi removido junto com o painel de "Leads (contatos qualificados)") —
  só os agregados por operador/equipe/qualificação.

## Arquivos

- `index.html` — estrutura da página
- `styles.css` — visual (cores Lopes: vermelho crimson, cinza grafite)
- `app.js` — leitura dos arquivos, cálculos e renderização (usa PapaParse,
  SheetJS e Chart.js via CDN, sem build necessário)

Para atualizar o site no futuro (mudar cor, adicionar um KPI, etc.), basta
editar esses 3 arquivos e arrastar a pasta de novo em
https://app.netlify.com/drop — o Netlify substitui o site anterior mantendo o
mesmo link.
