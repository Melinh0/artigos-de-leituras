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
LIMITE_LOG = 50000


def _atualizar_path_do_registro() -> None:
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
    return "... (inicio do log omitido)\n" + log[-LIMITE_LOG:]


def _executar_passe(slug: str, artigo: Path, saida: Path) -> tuple[int, str]:
    env = os.environ.copy()
    env["TEXINPUTS"] = f"{TEMPLATE_DIR}{os.pathsep}{env.get('TEXINPUTS', '')}"
    cmd = [
        "pdflatex",
        "-interaction=nonstopmode",
        "-synctex=1",
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


def _executar_bibtex(slug: str, saida: Path) -> tuple[int, str]:
    pasta_artigo = ARTIGOS_DIR / slug
    env = os.environ.copy()
    env["TEXINPUTS"] = f"{pasta_artigo}{os.pathsep}{TEMPLATE_DIR}{os.pathsep}{env.get('TEXINPUTS', '')}"
    env["BIBINPUTS"] = f"{pasta_artigo}{os.pathsep}{env.get('BIBINPUTS', '')}"
    env["BSTINPUTS"] = f"{TEMPLATE_DIR}{os.pathsep}{env.get('BSTINPUTS', '')}"
    cmd = ["bibtex", "-terse", "artigo"]
    proc = subprocess.run(
        cmd,
        cwd=saida,
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
            mensagem=f"Artigo nao encontrado: {slug}",
        )

    if not pdflatex_disponivel():
        return ResultadoCompilacao(
            ok=False,
            pdf=None,
            log="",
            erros=[],
            mensagem=(
                "pdflatex nao encontrado nesta maquina. "
                "Execute o editor com Docker (docker compose up) "
                "ou instale uma distribuicao LaTeX (ex.: MiKTeX/TeX Live)."
            ),
        )

    saida = BUILD_DIR / slug
    saida.mkdir(parents=True, exist_ok=True)

    logs: list[str] = []
    usar_bibtex = any((ARTIGOS_DIR / slug).glob("*.bib"))
    try:
        codigo, texto = _executar_passe(slug, artigo, saida)
        logs.append(texto)
        if codigo != 0:
            raise RuntimeError("pdflatex falhou na primeira passagem")

        if usar_bibtex:
            codigo_bib, texto_bib = _executar_bibtex(slug, saida)
            logs.append(f"--- bibtex ---\n{texto_bib}")
            if codigo_bib != 0:
                logs.append("--- aviso: bibtex falhou, prosseguindo sem referencias ---")

        for _ in range(2):
            codigo, texto = _executar_passe(slug, artigo, saida)
            logs.append(texto)
            if codigo != 0:
                raise RuntimeError("pdflatex falhou nas passagens finais")
    except (subprocess.TimeoutExpired, RuntimeError) as exc:
        if isinstance(exc, subprocess.TimeoutExpired):
            return ResultadoCompilacao(
                ok=False,
                pdf=None,
                log="\n".join(logs) + "\n\nTempo limite de compilacao excedido.",
                erros=["Tempo limite excedido."],
                mensagem="A compilacao excedeu o tempo limite.",
            )
        return ResultadoCompilacao(
            ok=False,
            pdf=None,
            log="\n".join(logs),
            erros=[str(exc)],
            mensagem="A compilacao falhou. Veja o log abaixo.",
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
        erros=erros or ["Falha na compilacao (sem erro explicito no log)."],
        mensagem="A compilacao falhou. Veja o log abaixo.",
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


TIMEOUT_SYNCTEX = 15


def synctex_disponivel() -> bool:
    return shutil.which("synctex") is not None


def caminho_pdf(slug: str) -> Path:
    return BUILD_DIR / slug / "artigo.pdf"


def _synctex_existe(slug: str) -> bool:
    pasta = BUILD_DIR / slug
    return (pasta / "artigo.synctex.gz").is_file() or (
        pasta / "artigo.synctex"
    ).is_file()


def _executar_synctex(argumentos: list[str]) -> tuple[int, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    env["LANG"] = "C"
    proc = subprocess.run(
        ["synctex", *argumentos],
        cwd=RAIZ,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=TIMEOUT_SYNCTEX,
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def _analisar_caixas_view(saida: str) -> list[dict]:
    caixas: list[dict] = []
    atual: dict = {}
    for linha in saida.splitlines():
        if linha.startswith("Page:"):
            if atual:
                caixas.append(atual)
            try:
                atual = {"pagina": int(linha.split(":", 1)[1].strip())}
            except ValueError:
                atual = {}
        elif atual and ":" in linha:
            chave, valor = linha.split(":", 1)
            if chave in {"h", "v", "W", "H"}:
                try:
                    atual[chave] = float(valor)
                except ValueError:
                    pass
    if atual:
        caixas.append(atual)

    validas: list[dict] = []
    vistas: set[tuple] = set()
    for caixa in caixas:
        if not all(k in caixa for k in ("pagina", "h", "v", "W", "H")):
            continue
        if caixa["W"] <= 0 or caixa["H"] <= 0:
            continue
        chave = (
            caixa["pagina"],
            round(caixa["h"], 2),
            round(caixa["v"], 2),
            round(caixa["W"], 2),
            round(caixa["H"], 2),
        )
        if chave in vistas:
            continue
        vistas.add(chave)
        validas.append(caixa)

    validas.sort(key=lambda c: (c["pagina"], c["v"], c["h"]))
    return validas


def _analisar_edit(saida: str) -> dict:
    dados: dict = {}
    for linha in saida.splitlines():
        if linha.startswith("Input:"):
            dados["arquivo"] = linha.split(":", 1)[1].strip()
        elif linha.startswith("Line:"):
            try:
                dados["linha"] = int(linha.split(":", 1)[1].strip())
            except ValueError:
                pass
        elif linha.startswith("Column:"):
            try:
                dados["coluna"] = int(linha.split(":", 1)[1].strip())
            except ValueError:
                pass
    return dados


def sincronizar_fonte(slug: str, linha: int, coluna: int = 1) -> dict:
    artigo = caminho_artigo(slug)
    pdf = caminho_pdf(slug)
    if not artigo.is_file():
        return {"ok": False, "mensagem": f"Artigo nao encontrado: {slug}"}
    if not synctex_disponivel():
        return {
            "ok": False,
            "mensagem": "O comando synctex nao esta disponivel nesta maquina.",
        }
    if not pdf.is_file() or not _synctex_existe(slug):
        return {
            "ok": False,
            "mensagem": (
                "Compile o artigo novamente para gerar os dados de sincronizacao."
            ),
        }

    linha = max(1, int(linha))
    coluna = max(1, int(coluna))
    entrada = f"{linha}:{coluna}:{artigo.name}"
    saida_pdf = str(pdf.relative_to(RAIZ))
    try:
        codigo, saida = _executar_synctex(
            ["view", "-i", entrada, "-o", saida_pdf]
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {"ok": False, "mensagem": f"Falha ao consultar o SyncTeX: {exc}"}

    caixas = _analisar_caixas_view(saida)
    if codigo != 0 or not caixas:
        return {
            "ok": False,
            "mensagem": "O SyncTeX nao encontrou correspondencia para esta linha.",
        }
    return {
        "ok": True,
        "pagina": caixas[0]["pagina"],
        "caixas": caixas,
    }


def sincronizar_pdf(slug: str, pagina: int, x: float, y: float) -> dict:
    artigo = caminho_artigo(slug)
    pdf = caminho_pdf(slug)
    if not artigo.is_file():
        return {"ok": False, "mensagem": f"Artigo nao encontrado: {slug}"}
    if not synctex_disponivel():
        return {
            "ok": False,
            "mensagem": "O comando synctex nao esta disponivel nesta maquina.",
        }
    if not pdf.is_file() or not _synctex_existe(slug):
        return {
            "ok": False,
            "mensagem": (
                "Compile o artigo novamente para gerar os dados de sincronizacao."
            ),
        }

    pagina = max(1, int(pagina))
    x = max(0.0, float(x))
    y = max(0.0, float(y))
    alvo = f"{pagina}:{x:.2f}:{y:.2f}:{pdf.relative_to(RAIZ)}"
    try:
        codigo, saida = _executar_synctex(["edit", "-o", alvo])
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {"ok": False, "mensagem": f"Falha ao consultar o SyncTeX: {exc}"}

    dados = _analisar_edit(saida)
    if codigo != 0 or "linha" not in dados:
        return {
            "ok": False,
            "mensagem": "O SyncTeX nao encontrou correspondencia para este ponto.",
        }

    arquivo = dados.get("arquivo")
    if arquivo:
        try:
            if Path(arquivo).resolve() != artigo.resolve():
                return {
                    "ok": False,
                    "mensagem": "A posicao do PDF nao corresponde a este artigo.",
                }
        except OSError:
            pass

    return {
        "ok": True,
        "linha": dados["linha"],
        "coluna": dados.get("coluna", -1),
    }