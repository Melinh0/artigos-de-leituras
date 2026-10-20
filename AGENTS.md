# AGENTS.md

Instruções para agentes (opencode/IA) que trabalham neste repositório.

## O que é este repositório

Coleção de artigos de opinião em LaTeX sobre livros lidos pelo autor em 2026, com um editor web (FastAPI + CodeMirror) para editar e recompilar os textos. Todo o conteúdo é em **português (pt-BR)**.

## Estrutura e convenções

- `artigos/NN-slug/artigo.tex` — um artigo por pasta. O prefixo `NN` (01–05) é a **ordem de leitura** e foi definido pelos próprios diálogos entre os textos. **Não renumere nem reordene pastas** sem pedido explícito.
- `template/sbc-template.sty` — estilo SBC compartilhado; nunca mova para dentro das pastas de artigo.
- `template/novo-artigo.tex` — modelo usado pela API ao criar artigos; o marcador `{TITULO}` é substituído no criação.
- `editor/` — código Python do servidor (`main.py` = rotas, `compiler.py` = pdflatex). `editor/static/` é o front-end sem build step (vanilla JS).
- `build/` — saídas de compilação (gitignored). Nunca versione.
- Arquivos `.tex` são **UTF-8 sem BOM**; mantenha a codificação ao editar.
- Artigos são autocontidos: bibliografia em `thebibliography` inline, sem `.bib`, sem imagens externas.
- Padrão do preâmbulo: `\documentclass[12pt]{article}` + `sbc-template`, `babel` (brazil), `graphicx`, `times`, `url`, `\sloppy`. Prefira manter esse padrão em novos artigos.

## Estilo dos artigos

Registro ensaístico, calibrado nos 5 artigos (revisão anti-IA). Ao escrever ou editar `artigos/**/artigo.tex`, siga:

- **Voz**: 1ª pessoa desde a introdução/resumo não; corpo inteiro ensaístico com "eu/li/me" concreto. Resumo e abstract permanecem impessoais (convenção de gênero).
- **Extensão**: 2.500–3.000 palavras por artigo (semântica nunca sacrificada por páginas; cortar redundância libera espaço para análise).
- **Proibido**: listas de eventos/séries de acontecimentos resumindo o enredo; enumerações anunciadas ("A primeira… A segunda…", "Dois recursos…", "Três movimentos"); andaimes metatextuais ("Note-se", "Vale registrar", "Registre-se", "O achado é preciso", "anatomia", "operação", "método", "diagnóstico", "contrato didático", "economia da imagem"); "não é X, é Y" com Y abstração sem referente apresentado (reescrever como sujeito concreto + verbo + complemento, ou definição positiva primeiro); intensificadores ("exatamente", "Não por acaso"); anglicismos/calques ("currency", "standard", "portalegal" — e corrige-se "defeitura", "admisão", concordância).
- **Sem fórmulas clonadas entre artigos**: nenhuma abertura de resumo do tipo "Este artigo apresenta… Examinam-se… Demonstra-se… O artigo conclui…"; cada resumo/abstract tem abertura própria; títulos de abertura e fechamento de seção nunca se repetem entre os cinco textos; frases de abertura ("A edição que li", "O que levo…") só aparecem em um artigo.
- **Tiques limitados**: `e não` no máximo 2 por artigo (nunca em parágrafos consecutivos); `o que se + verbo` no máximo 2 por artigo (substituir por sujeito nomeado: "a decisão que se toma" → "a decisão que a casa toma"); repitações de frase de abertura entre artigos ("O livro registra", "O livro não", "O que me") zeradas.
- **Teste do contrário**: todo predicado abstrato precisa (a) de referente concreto na mesma frase, ou (b) de conteúdo que o seu contrário não teria. Se falhar, sai. Proibido: "geografia moral", "tribunal sem absolvições", "duplo vínculo elegante", "forma mercadoria", "arquipélago periférico", "planilha de auditoria", "cartografia", "capítulo-vitrine", "inverso geométrico" (e congêneres sem referente). Metáfora do próprio livro citado (ex.: "porta das decisões", "liquidificador") só com aspas e atribuição; a análise usa as palavras do livro ou as minhas, sem terceira camada de metáfora.
- **Curvas distintas**: cada artigo tem desenho próprio (01 memória familiar; 02 a decisão e o balde; 03 o vocabulário; 04 a escala; 05 a memória coletiva), sem repetir a mesma curva anedota→tese→conexões→moral entre textos.
- **Exige-se**: artigos e referentes definidos antes de qualquer abstrato; articulação explícita com conjunções (`e, ou, mas, porque, para, quando, se, embora, como`, ≤3 travessões por artigo, só em aposto curto ou citação literal); títulos de seção concretos ligados ao conteúdo do livro; cada parágrafo uma prova de uma tese, ligada à anterior por conjunção.
- **Não se inventa**: citações e páginas só existem se conferidas na fonte (`livros/*.pdf` ou transcrição); honestidade de acesso declarada (ex.: "amostra de 2 páginas", "transcrição sem paginação"); preserva-se título do artigo, bibliografia e `thebibliography`.
- **Corpus de modelo**: ensaística pré-2020 calibra a prosa — Antonio Candido, Roberto Schwarz, Davi Arrigucci Jr., Alfredo Bosi, Sérgio Buarque de Holanda; de Portugal, Eduardo Lourenço, Vergílio Ferreira, João Barrento. Traços a copiar: tese na 1ª frase sem anúncio metatextual; citação seguida de análise de palavras; conceito definido pelo uso no parágrafo; nenhuma conclusão moralizante; parágrafos de extensão desigual. **Fontes de língua**: gramáticas de referência (Neves, *Gramática de usos*; Bechara; Cunha & Cintra; Perini; Castilho) — não tradução literal de camada inglesa.
- **Validação esperada**: contagem 2.500–3.000 (`contar_palavras`), grep zero para padrões proibidos, `e não` ≤2 e `o que se` ≤2 por artigo, zero abstrações da lista do "teste do contrário", ≤3 `---`, sem CJK/BOM/CRLF, compilação `ok: true` via API, e nenhuma fórmula de abertura/fechamento repetida entre os cinco arquivos.

## Como executar

```bash
uv sync                      # instala dependências (fastapi, uvicorn)
uv run uvicorn editor.main:app --reload   # http://localhost:8000
```

Compilação LaTeX: a máquina local pode não ter `pdflatex` — usar `docker compose up --build` (imagem já inclui o TeX Live). A API responde `pdflatex: false` em `/api/status` quando indisponível; isso não é bug.

## Validação

Não há testes automatizados. Antes de concluir mudanças em Python:

```bash
uv run python -m compileall editor
```

E suba o servidor uma vez para checar `GET /api/artigos` e `GET /api/status`. Mudanças em `editor/static/` podem ser validadas pelo navegador (sem etapa de build).

## Regras importantes

- Nunca apague ou sobrescreva um `artigos/**/artigo.tex` sem confirmação explícita do usuário.
- Não introduza dependências novas sem necessidade; o projeto é intencionalmente enxuto (FastAPI + uvicorn apenas).
- `pyproject.toml` e `uv.lock` devem permanecer consistentes: após mudar dependências, rode `uv lock` (ou `uv sync`).
- Commits: o repositório é privado no GitHub; siga o histórico existente para mensagens curtas em português.
