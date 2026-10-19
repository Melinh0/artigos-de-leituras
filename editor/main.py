"""API e servidor do editor web de artigos LaTeX."""

from __future__ import annotations

import re
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .compiler import (
    ARQUIVO_ARTIGO,
    ARTIGOS_DIR,
    BUILD_DIR,
    TEMPLATE_DIR,
    compilar,
    extrair_titulo,
    pdflatex_disponivel,
)

STATIC_DIR = Path(__file__).resolve().parent / "static"
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

app = FastAPI(title="Editor de Artigos de Leitura", version="0.1.0")


class ArtigoNovo(BaseModel):
    slug: str = Field(min_length=3, max_length=80)
    titulo: str = Field(default="Novo artigo", max_length=300)


class ArtigoConteudo(BaseModel):
    conteudo: str = Field(min_length=1)


def _validar_slug(slug: str) -> str:
    if not SLUG_RE.fullmatch(slug):
        raise HTTPException(status_code=400, detail="Slug inválido.")
    caminho = (ARTIGOS_DIR / slug).resolve()
    if ARTIGOS_DIR.resolve() not in caminho.parents:
        raise HTTPException(status_code=400, detail="Caminho inválido.")
    return slug


def _ler_texto(caminho: Path) -> str:
    with open(caminho, "r", encoding="utf-8", newline="") as arquivo:
        return arquivo.read()


def _escrever_texto(caminho: Path, conteudo: str) -> None:
    with open(caminho, "w", encoding="utf-8", newline="") as arquivo:
        arquivo.write(conteudo)


def _ler_artigo(slug: str) -> str:
    _validar_slug(slug)
    arquivo = ARTIGOS_DIR / slug / ARQUIVO_ARTIGO
    if not arquivo.is_file():
        raise HTTPException(status_code=404, detail="Artigo não encontrado.")
    return _ler_texto(arquivo)


@app.get("/", response_class=HTMLResponse)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status")
def status() -> dict:
    quantidade = (
        sum(1 for p in ARTIGOS_DIR.iterdir() if (p / ARQUIVO_ARTIGO).is_file())
        if ARTIGOS_DIR.is_dir()
        else 0
    )
    return {"pdflatex": pdflatex_disponivel(), "artigos": quantidade}


@app.get("/api/artigos")
def listar_artigos() -> list[dict]:
    if not ARTIGOS_DIR.is_dir():
        return []
    artigos = []
    for pasta in sorted(ARTIGOS_DIR.iterdir()):
        arquivo = pasta / ARQUIVO_ARTIGO
        if not arquivo.is_file():
            continue
        conteudo = _ler_texto(arquivo)
        artigos.append(
            {
                "slug": pasta.name,
                "titulo": extrair_titulo(conteudo) or pasta.name,
                "atualizado": int(arquivo.stat().st_mtime),
            }
        )
    return artigos


@app.get("/api/artigos/{slug}")
def obter_artigo(slug: str) -> dict:
    conteudo = _ler_artigo(slug)
    return {"slug": slug, "titulo": extrair_titulo(conteudo), "conteudo": conteudo}


@app.put("/api/artigos/{slug}")
def salvar_artigo(slug: str, artigo: ArtigoConteudo) -> dict:
    _validar_slug(slug)
    arquivo = ARTIGOS_DIR / slug / ARQUIVO_ARTIGO
    if not arquivo.is_file():
        raise HTTPException(status_code=404, detail="Artigo não encontrado.")
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    _escrever_texto(arquivo, artigo.conteudo)
    return {"ok": True, "salvo_em": int(time.time())}


@app.post("/api/artigos", status_code=201)
def criar_artigo(artigo: ArtigoNovo) -> dict:
    slug = artigo.slug.strip().lower()
    _validar_slug(slug)
    destino = ARTIGOS_DIR / slug / ARQUIVO_ARTIGO
    if destino.exists():
        raise HTTPException(status_code=409, detail="Já existe um artigo com esse slug.")
    modelo = _ler_texto(TEMPLATE_DIR / "novo-artigo.tex")
    titulo = artigo.titulo.strip() or "Novo artigo"
    conteudo = modelo.replace("{TITULO}", titulo.replace("{", "").replace("}", ""))
    destino.parent.mkdir(parents=True, exist_ok=True)
    _escrever_texto(destino, conteudo)
    return {"ok": True, "slug": slug, "titulo": titulo}


@app.post("/api/artigos/{slug}/compilar")
def compilar_artigo(slug: str) -> dict:
    _validar_slug(slug)
    resultado = compilar(slug)
    resposta = {
        "ok": resultado.ok,
        "mensagem": resultado.mensagem,
        "erros": resultado.erros,
        "log": resultado.log,
        "pdf": None,
    }
    if resultado.ok and resultado.pdf is not None:
        versao = int(resultado.pdf.stat().st_mtime)
        resposta["pdf"] = f"/api/artigos/{slug}/pdf?v={versao}"
    return resposta


@app.get("/api/artigos/{slug}/pdf")
def servir_pdf(slug: str, download: bool = False) -> FileResponse:
    _validar_slug(slug)
    pdf = BUILD_DIR / slug / "artigo.pdf"
    if not pdf.is_file():
        raise HTTPException(status_code=404, detail="PDF ainda não foi compilado.")
    return FileResponse(
        pdf,
        media_type="application/pdf",
        filename=f"{slug}.pdf",
        content_disposition_type="attachment" if download else "inline",
    )


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
