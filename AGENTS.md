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
