# Artigos de Leitura

Repositório com os artigos de opinião escritos sobre os livros lidos em 2026, mais um **editor web em LaTeX** para editar e recompilar os textos diretamente no navegador.

## Artigos

Os textos estão em sequência lógica de leitura (cada diálogo interno referencia os anteriores):

| # | Pasta | Obra / Tema | Autor |
|---|-------|-------------|-------|
| 1 | `artigos/01-a-metamorfose` | A Metamorfose | Franz Kafka |
| 2 | `artigos/02-o-conto-da-ilha-desconhecida` | O Conto da Ilha Desconhecida | José Saramago |
| 3 | `artigos/03-ideias-para-adiar-o-fim-do-mundo` | Ideias para adiar o fim do mundo | Ailton Krenak |
| 4 | `artigos/04-procognitiva-ciclo-1-volume-1` | Procognitiva — Ciclo 1, Volume 1 | Neufeld, Falcone e Rango (org.) |
| 5 | `artigos/05-breve-historia-da-psicologia-moderna-ocidental` | Breve História da Psicologia Moderna Ocidental | Teresa Sousa Machado |

Cada pasta contém um único `artigo.tex` autocontido (bibliografia inline, sem imagens externas), compilado com o estilo SBC (`template/sbc-template.sty`).

## Estrutura

```
artigos-de-leituras/
├── artigos/               # os artigos, numerados na ordem de leitura
├── template/
│   ├── sbc-template.sty   # estilo SBC usado por todos os artigos
│   └── novo-artigo.tex    # modelo para criar novos artigos
├── editor/
│   ├── main.py            # API FastAPI (listar, editar, compilar)
│   ├── compiler.py        # execução do pdflatex + extração de erros
│   └── static/            # interface (CodeMirror offline + CSS/JS)
├── build/                 # PDFs e logs gerados (não versionados)
├── Dockerfile             # imagem com Python + TeX Live completo
├── docker-compose.yml     # sobe o editor na porta 8000
├── pyproject.toml         # dependências gerenciadas com uv
└── uv.lock                # versões travadas
```

## Requisitos

- [uv](https://docs.astral.sh/uv/) (Python 3.11+)
- Para compilar PDF: `pdflatex` no host **ou** Docker (recomendado)

## Executar o editor

### Com Docker (recomendado — já inclui o TeX Live)

```bash
docker compose up --build
```

Acesse <http://localhost:8000>.

### Sem Docker (precisa de pdflatex local)

```bash
uv sync
uv run uvicorn editor.main:app --reload
```

Acesse <http://localhost:8000>. Sem `pdflatex` no PATH a interface funciona normalmente, mas a compilação avisa que ela está indisponível.

## Usando o editor

- **Editar**: clique num artigo na lateral e edite o código LaTeX (destaque de sintaxe via CodeMirror).
- **Salvar**: botão *Salvar* ou `Ctrl+S`.
- **Compilar**: botão *Compilar* ou `Ctrl+Enter` — a saída do `pdflatex` aparece no painel inferior e o PDF abre com *Ver PDF*.
- **Novo artigo**: botão *+ Novo artigo* cria uma pasta em `artigos/` a partir de `template/novo-artigo.tex`.

Também é possível editar os `.tex` diretamente (inclusive com o opencode) — o editor web só lê e grava os mesmos arquivos.

## Compilação manual (sem a interface)

```bash
pdflatex -interaction=nonstopmode -output-directory=build/<slug> artigos/<slug>/artigo.tex
```

O `template/` precisa estar no `TEXINPUTS` (o `editor/compiler.py` cuida disso automaticamente; cada compilação roda duas passagens para resolver `\cite`).

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/status` | disponibilidade do `pdflatex` e nº de artigos |
| GET | `/api/artigos` | lista de artigos com títulos |
| GET/PUT | `/api/artigos/{slug}` | ler/salvar o `.tex` |
| POST | `/api/artigos` | criar artigo a partir do modelo |
| POST | `/api/artigos/{slug}/compilar` | compilar e retornar log/erros |
| GET | `/api/artigos/{slug}/pdf` | servir o PDF gerado |
