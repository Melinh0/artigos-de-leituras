"""Compilação dos artigos LaTeX com pdflatex."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARTIGOS_DIR = RAIZ / "artigos"
TEMPLATE_DIR = RAIZ / "template"
BUILD_DIR = RAIZ / "build"

ARQUIVO_ARTIGO = "artigo.tex"
TIMEOUT_SEGUNDOS = 90
LIMITE_LOG = 12000


def _atualizar_path_do_registro() -> None:
    """No Windows, absorve o PATH do registro (ex.: apos instalar o MiKTeX).

    Terminais abertos antes da instalacao ficam com o PATH antigo; ler o
    registro na inicializacao faz o servidor achar o pdflatex sem exigir
    um terminal novo.
    """
    if os.name != "nt":
        return
    try:
        import winreg
    except ImportError:
        return
    chaves = (
        (
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
        ),
        (winreg.HKEY_CURRENT_USER, "Environment"),
    )
    novas: list[str] = []
    for raiz, subchave in chaves:
        try:
            with winreg.OpenKey(raiz, subchave) as chave:
                valor, tipo = winreg.QueryValueEx(chave, "Path")
        except OSError:
            continue
        if not valor:
            continue
        if tipo == winreg.REG_EXPAND_SZ:
            valor = os.path.expandvars(valor)
        novas.extend(p for p in valor.split(os.pathsep) if p)
    atual = os.environ.get("PATH", "")
    atuais = set(atual.split(os.pathsep))
    extras = [p for p in novas if p not in atuais]
    if extras:
        os.environ["PATH"] = os.pathsep.join([*extras, atual])


_atualizar_path_do_registro()


@dataclass
class ResultadoCompilacao:
    ok: bool
    pdf: Path | None
    log: str
    erros: list[str] = field(default_factory=list)
    mensagem: str = ""


def pdflatex_disponivel() -> bool:
    return shutil.which("pdflatex") is not None


def caminho_artigo(slug: str) -> Path:
    return ARTIGOS_DIR / slug / ARQUIVO_ARTIGO


def _extrair_erros(log: str) -> list[str]:
    erros: list[str] = []
    linhas = log.splitlines()
    for i, linha in enumerate(linhas):
        if linha.startswith("!"):
            contexto = [linha.strip()]
            for proxima in linhas[i + 1 : i + 4]:
                contexto.append(proxima.rstrip())
                if proxima.startswith("l."):
                    break
            erros.append("\n".join(contexto))
    return erros


def _log_resumido(log: str) -> str:
    if len(log) <= LIMITE_LOG:
        return log
    return "... (início do log omitido)\n" + log[-LIMITE_LOG:]


def _executar_passe(slug: str, artigo: Path, saida: Path) -> tuple[int, str]:
    env = os.environ.copy()
    env["TEXINPUTS"] = f"{TEMPLATE_DIR}{os.pathsep}{env.get('TEXINPUTS', '')}"
    cmd = [
        "pdflatex",
        "-interaction=nonstopmode",
        f"-output-directory={saida}",
        artigo.name,
    ]
    proc = subprocess.run(
        cmd,
        cwd=artigo.parent,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=TIMEOUT_SEGUNDOS,
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def compilar(slug: str) -> ResultadoCompilacao:
    artigo = caminho_artigo(slug)
    if not artigo.is_file():
        return ResultadoCompilacao(
            ok=False,
            pdf=None,
            log="",
            erros=[],
            mensagem=f"Artigo não encontrado: {slug}",
        )

    if not pdflatex_disponivel():
        return ResultadoCompilacao(
            ok=False,
            pdf=None,
            log="",
            erros=[],
            mensagem=(
                "pdflatex não encontrado nesta máquina. "
                "Execute o editor com Docker (docker compose up) "
                "ou instale uma distribuição LaTeX (ex.: MiKTeX/TeX Live)."
            ),
        )

    saida = BUILD_DIR / slug
    saida.mkdir(parents=True, exist_ok=True)

    logs: list[str] = []
    try:
        for _ in range(2):
            codigo, texto = _executar_passe(slug, artigo, saida)
            logs.append(texto)
            if codigo != 0:
                break
    except subprocess.TimeoutExpired:
        return ResultadoCompilacao(
            ok=False,
            pdf=None,
            log="\n".join(logs) + "\n\nTempo limite de compilação excedido.",
            erros=["Tempo limite excedido."],
            mensagem="A compilação excedeu o tempo limite.",
        )

    log_completo = "\n".join(logs)
    pdf = saida / "artigo.pdf"
    erros = _extrair_erros(log_completo)
    ok = pdf.is_file() and not erros

    if ok:
        return ResultadoCompilacao(
            ok=True, pdf=pdf, log=_log_resumido(log_completo), erros=[], mensagem=""
        )
    return ResultadoCompilacao(
        ok=False,
        pdf=None,
        log=_log_resumido(log_completo),
        erros=erros or ["Falha na compilação (sem erro explícito no log)."],
        mensagem="A compilação falhou. Veja o log abaixo.",
    )


def extrair_titulo(conteudo: str) -> str:
    m = re.search(r"\\title\s*\{", conteudo)
    if not m:
        return ""
    inicio = m.end()
    nivel = 1
    i = inicio
    while i < len(conteudo) and nivel:
        if conteudo[i] == "{":
            nivel += 1
        elif conteudo[i] == "}":
            nivel -= 1
        i += 1
    titulo = conteudo[inicio : i - 1] if nivel == 0 else conteudo[inicio:]
    titulo = re.sub(r"\\(emph|textbf|textit|texttt)\s*", "", titulo)
    titulo = re.sub(r"\\[a-zA-Z]+\s*", "", titulo)
    titulo = titulo.replace("{", "").replace("}", "")
    return re.sub(r"\s+", " ", titulo).strip()
