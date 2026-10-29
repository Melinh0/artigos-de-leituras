
const temaAtual = () => document.documentElement.dataset.tema || "escuro";

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/static/vendor/pdf.worker.min.js";
}

const editor = CodeMirror(document.getElementById("editor"), {
  mode: "stex",
  theme: temaAtual() === "claro" ? "default" : "material-darker",
  lineNumbers: true,
  lineWrapping: true,
  indentUnit: 2,
  autofocus: true,
});

const listaEl = document.getElementById("lista-artigos");
const atualEl = document.getElementById("artigo-atual");
const statusEl = document.getElementById("resumo-status");
const indicadorEl = document.getElementById("indicador");
const btnSalvar = document.getElementById("btn-salvar");
const btnCompilar = document.getElementById("btn-compilar");
const btnPrevia = document.getElementById("btn-previa");
const btnTema = document.getElementById("btn-tema");
const painelPrevia = document.getElementById("painel-previa");
const divisores = {
  lateral: document.getElementById("divisor-lateral"),
  previa: document.getElementById("divisor-previa"),
};
const lateralEl = document.getElementById("lateral");
const areaPrincipal = document.getElementById("area-principal");
const visualizadorPdf = document.getElementById("visualizador-pdf");
const paginasPdfEl = document.getElementById("paginas-pdf");
const estadoPdfEl = document.getElementById("estado-pdf");
const infoPdfEl = document.getElementById("info-pdf");
const btnZoomMenos = document.getElementById("btn-zoom-menos");
const btnZoomMais = document.getElementById("btn-zoom-mais");
const btnZoomAjustar = document.getElementById("btn-zoom-ajustar");
const btnBaixar = document.getElementById("btn-baixar");
const btnPdfClaro = document.getElementById("btn-pdf-claro");
const btnPdfEscuro = document.getElementById("btn-pdf-escuro");
const painelLog = document.getElementById("painel-log");
const logEl = document.getElementById("log");
const modalNovo = document.getElementById("modal-novo");

let slugAtual = null;
let sujo = false;
let urlPrevia = null;
let pdfAtual = null;
let totalPaginas = 0;
let geracaoPdf = 0;
let geracaoDesenho = 0;
let tarefasDesenho = [];
let ajustarPdf = true;
let zoomPdf = 1;
let timerDesenho = null;
let pdfPaginas = [];
let timerDestaquePdf = null;
let timerDestaqueLinha = null;
let linhaDestaque = null;
let sincronizando = false;

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    headers: { "Content-Type": "application/json" },
    ...opcoes,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const detalhe = dados.detail;
    const texto = Array.isArray(detalhe)
      ? detalhe.map((d) => d.msg || JSON.stringify(d)).join("; ")
      : detalhe || `Erro ${resposta.status}`;
    throw new Error(texto);
  }
  return dados;
}

function indicador(texto, ocupado = false) {
  indicadorEl.textContent = texto;
  indicadorEl.classList.toggle("ocupado", ocupado);
  indicadorEl.classList.toggle("oculto", !texto);
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  editor.setOption("theme", tema === "claro" ? "default" : "material-darker");
  btnTema.textContent = tema === "claro" ? "Tema: claro" : "Tema: escuro";
  try {
    localStorage.setItem("tema", tema);
  } catch (e) {}
  aplicarTemaPdf(temaPdfAtual());
}

function alternarTema() {
  aplicarTema(temaAtual() === "claro" ? "escuro" : "claro");
}

function temaPdfAtual() {
  try {
    return localStorage.getItem("tema-pdf") || temaAtual();
  } catch (e) {
    return temaAtual();
  }
}

function aplicarTemaPdf(tema, persistir = false) {
  paginasPdfEl.classList.toggle("invertido", tema === "escuro");
  btnPdfClaro.classList.toggle("ativo", tema === "claro");
  btnPdfEscuro.classList.toggle("ativo", tema === "escuro");
  if (persistir) {
    try {
      localStorage.setItem("tema-pdf", tema);
    } catch (e) {}
  }
}


const LATERAL_PADRAO = 280;
const LATERAL_MIN = 210;
const LATERAL_MAX = 520;
const PREVIA_MIN = 300;
const EDITOR_MIN = 260;

function lerNumero(chave) {
  try {
    const valor = parseInt(localStorage.getItem(chave), 10);
    return Number.isFinite(valor) ? valor : null;
  } catch (e) {
    return null;
  }
}

function salvarNumero(chave, valor) {
  try {
    localStorage.setItem(chave, String(Math.round(valor)));
  } catch (e) {}
}

function limitarLateral(px) {
  const max = Math.min(LATERAL_MAX, Math.max(LATERAL_MIN, window.innerWidth * 0.45));
  return Math.round(Math.min(max, Math.max(LATERAL_MIN, px)));
}

function definirLarguraLateral(px, persistir = false) {
  const largura = limitarLateral(px);
  document.body.style.setProperty("--largura-lateral", `${largura}px`);
  if (persistir) salvarNumero("largura-lateral", largura);
  return largura;
}

function limitarPrevia(px) {
  const area = areaPrincipal.getBoundingClientRect().width;
  const max = Math.max(PREVIA_MIN, area - 6 - EDITOR_MIN);
  return Math.round(Math.min(max, Math.max(PREVIA_MIN, px)));
}

function definirLarguraPrevia(px, persistir = false) {
  const largura = limitarPrevia(px);
  document.body.style.setProperty("--largura-previa", `${largura}px`);
  if (persistir) salvarNumero("largura-previa", largura);
  return largura;
}

function larguraLateralAtual() {
  return Math.round(lateralEl.getBoundingClientRect().width);
}

function larguraPreviaAtual() {
  return Math.round(painelPrevia.getBoundingClientRect().width);
}

function aplicarLarguraPreviaSalva() {
  const salva = lerNumero("largura-previa");
  if (salva) definirLarguraPrevia(salva);
}

function tornarArrastavel(divisor, opcoes) {
  const { lerBase, mover, finalizar, restaurar, inverter = false } = opcoes;

  divisor.addEventListener("pointerdown", (evento) => {
    if (evento.button !== 0) return;
    evento.preventDefault();
    const base = lerBase();
    const xInicial = evento.clientX;
    divisor.setPointerCapture(evento.pointerId);
    divisor.classList.add("arrastando");
    document.body.classList.add("redimensionando");

    const aoMover = (e) => {
      const delta = e.clientX - xInicial;
      mover(base + (inverter ? -delta : delta));
    };
    const aoSoltar = () => {
      divisor.removeEventListener("pointermove", aoMover);
      divisor.removeEventListener("pointerup", aoSoltar);
      divisor.removeEventListener("pointercancel", aoSoltar);
      divisor.classList.remove("arrastando");
      document.body.classList.remove("redimensionando");
      finalizar();
    };

    divisor.addEventListener("pointermove", aoMover);
    divisor.addEventListener("pointerup", aoSoltar);
    divisor.addEventListener("pointercancel", aoSoltar);
  });

  divisor.addEventListener("dblclick", () => {
    restaurar();
    finalizar();
  });

  divisor.addEventListener("keydown", (evento) => {
    if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return;
    evento.preventDefault();
    const passo = evento.shiftKey ? 40 : 12;
    const direcao = evento.key === "ArrowLeft" ? -1 : 1;
    const valor = lerBase() + (inverter ? -direcao : direcao) * passo;
    mover(valor);
    finalizar();
  });
}

tornarArrastavel(divisores.lateral, {
  lerBase: larguraLateralAtual,
  mover: (px) => {
    definirLarguraLateral(px);
    if (!painelPrevia.classList.contains("oculto")) {
      definirLarguraPrevia(larguraPreviaAtual());
    }
  },
  restaurar: () => definirLarguraLateral(LATERAL_PADRAO),
  finalizar: () => {
    salvarNumero("largura-lateral", larguraLateralAtual());
    editor.refresh();
  },
});

tornarArrastavel(divisores.previa, {
  lerBase: larguraPreviaAtual,
  mover: (px) => definirLarguraPrevia(px),
  inverter: true,
  restaurar: () => definirLarguraPrevia(areaPrincipal.clientWidth / 2),
  finalizar: () => {
    salvarNumero("largura-previa", larguraPreviaAtual());
    editor.refresh();
  },
});

const observadorPrevia = new ResizeObserver(() => {
  if (!pdfAtual || sincronizando || painelPrevia.classList.contains("oculto")) return;
  agendarDesenho();
});
observadorPrevia.observe(painelPrevia);

window.addEventListener("resize", () => {
  if (window.innerWidth > 760) {
    definirLarguraLateral(larguraLateralAtual());
    if (!painelPrevia.classList.contains("oculto")) {
      definirLarguraPrevia(larguraPreviaAtual());
    }
  }
  editor.refresh();
});


function estadoPdf(texto) {
  estadoPdfEl.textContent = texto || "";
  estadoPdfEl.classList.toggle("oculto", !texto);
}

function atualizarInfoPdf() {
  if (!totalPaginas) {
    infoPdfEl.textContent = "";
    return;
  }
  const partes = [totalPaginas === 1 ? "1 página" : `${totalPaginas} páginas`];
  if (!ajustarPdf) partes.push(`${Math.round(zoomPdf * 100)}%`);
  infoPdfEl.textContent = partes.join(" · ");
}

function larguraPaginaPdf() {
  const estilo = getComputedStyle(visualizadorPdf);
  const espacamento =
    parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight);
  if (ajustarPdf) {
    return Math.max(240, visualizadorPdf.clientWidth - espacamento);
  }
  return Math.max(240, 794 * zoomPdf);
}

function cancelarDesenhos() {
  geracaoDesenho += 1;
  for (const tarefa of tarefasDesenho) {
    try {
      tarefa.cancel();
    } catch (e) {}
  }
  tarefasDesenho = [];
}

async function carregarPdf(url) {
  const geracao = ++geracaoPdf;
  cancelarDesenhos();
  paginasPdfEl.innerHTML = "";
  pdfPaginas = [];
  totalPaginas = 0;
  atualizarInfoPdf();
  estadoPdf("Carregando PDF…");

  if (!window.pdfjsLib) {
    estadoPdf("Visualizador de PDF indisponível neste navegador. Use o botão Baixar PDF.");
    return;
  }

  try {
    const resposta = await fetch(url, { cache: "no-store" });
    if (!resposta.ok) throw new Error(`não foi possível abrir o PDF (${resposta.status})`);
    const dados = await resposta.arrayBuffer();
    if (geracao !== geracaoPdf) return;

    if (pdfAtual) {
      pdfAtual.destroy();
      pdfAtual = null;
    }
    const documento = await pdfjsLib.getDocument({ data: dados }).promise;
    if (geracao !== geracaoPdf) {
      documento.destroy();
      return;
    }
    pdfAtual = documento;
    totalPaginas = documento.numPages;
    atualizarInfoPdf();
    await desenharPdf(geracao);
  } catch (erro) {
    if (geracao !== geracaoPdf) return;
    estadoPdf(`Não foi possível mostrar o PDF: ${erro.message}`);
  }
}

async function desenharPdf(geracao = geracaoPdf) {
  if (!pdfAtual || geracao !== geracaoPdf) return;
  const desenho = ++geracaoDesenho;
  for (const tarefa of tarefasDesenho) {
    try {
      tarefa.cancel();
    } catch (e) {}
  }
  tarefasDesenho = [];

  const percorrivel = Math.max(0, visualizadorPdf.scrollHeight - visualizadorPdf.clientHeight);
  const proporcao = percorrivel > 0 ? visualizadorPdf.scrollTop / percorrivel : 0;

  paginasPdfEl.innerHTML = "";
  pdfPaginas = [];
  estadoPdf("");
  const largura = larguraPaginaPdf();
  const densidade = Math.min(window.devicePixelRatio || 1, 1.5);

  try {
    for (let numero = 1; numero <= pdfAtual.numPages; numero++) {
      if (desenho !== geracaoDesenho || geracao !== geracaoPdf) return;
      const pagina = await pdfAtual.getPage(numero);
      const base = pagina.getViewport({ scale: 1 });
      const escala = (largura / base.width) * densidade;
      const viewport = pagina.getViewport({ scale: escala });

      const moldura = document.createElement("div");
      moldura.className = "pagina-pdf";
      moldura.style.width = `${largura}px`;
      moldura.dataset.pagina = String(numero);
      moldura.dataset.baseWidth = String(base.width);
      moldura.dataset.baseHeight = String(base.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      moldura.appendChild(canvas);
      paginasPdfEl.appendChild(moldura);
      pdfPaginas.push({
        numero,
        moldura,
        baseWidth: base.width,
        baseHeight: base.height,
      });

      const tarefa = pagina.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
      });
      tarefasDesenho.push(tarefa);
      try {
        await tarefa.promise;
      } catch (erro) {
        if (erro.name !== "RenderingCancelledException") throw erro;
        return;
      }
    }

    if (desenho !== geracaoDesenho || geracao !== geracaoPdf) return;
    await new Promise((resolver) => {
      requestAnimationFrame(() => {
        const novo = Math.max(
          0,
          visualizadorPdf.scrollHeight - visualizadorPdf.clientHeight,
        );
        visualizadorPdf.scrollTop = proporcao * novo;
        resolver();
      });
    });
  } catch (erro) {
    if (desenho !== geracaoDesenho) return;
    estadoPdf(`Não foi possível mostrar o PDF: ${erro.message}`);
  }
}

function agendarDesenho() {
  clearTimeout(timerDesenho);
  timerDesenho = setTimeout(() => desenharPdf(), 180);
}


function limparDestaquesPdf() {
  clearTimeout(timerDestaquePdf);
  paginasPdfEl.querySelectorAll(".destaque-synctex").forEach((el) => el.remove());
}

function destacarCaixasPdf(caixas) {
  limparDestaquesPdf();
  if (!Array.isArray(caixas)) return;
  for (const caixa of caixas) {
    const meta = pdfPaginas.find((p) => p.numero === Number(caixa.pagina));
    if (!meta) continue;
    const destaque = document.createElement("div");
    destaque.className = "destaque-synctex";
    destaque.style.left = `${(Number(caixa.h) / meta.baseWidth) * 100}%`;
    destaque.style.top = `${(Number(caixa.v) / meta.baseHeight) * 100}%`;
    destaque.style.width = `${(Number(caixa.W) / meta.baseWidth) * 100}%`;
    destaque.style.height = `${(Number(caixa.H) / meta.baseHeight) * 100}%`;
    meta.moldura.appendChild(destaque);
  }
  timerDestaquePdf = setTimeout(limparDestaquesPdf, 2600);
}

function rolarParaCaixaPdf(caixa) {
  if (!caixa) return;
  const meta = pdfPaginas.find((p) => p.numero === Number(caixa.pagina));
  if (!meta) return;
  const rect = meta.moldura.getBoundingClientRect();
  const topoPagina =
    rect.top - visualizadorPdf.getBoundingClientRect().top + visualizadorPdf.scrollTop;
  const topoCaixa = (Number(caixa.v) / meta.baseHeight) * rect.height;
  const margem = Math.min(120, visualizadorPdf.clientHeight * 0.2);
  visualizadorPdf.scrollTo({
    top: Math.max(0, topoPagina + topoCaixa - margem),
    behavior: "smooth",
  });
}

function destacarLinhaEditor(linha) {
  const zero = Math.max(0, Number(linha) - 1);
  editor.setCursor({ line: zero, ch: 0 });
  editor.scrollIntoView({ line: zero, ch: 0 }, 120);
  editor.focus();
  if (linhaDestaque !== null) {
    editor.removeLineClass(linhaDestaque, "background", "linha-synctex");
  }
  editor.addLineClass(zero, "background", "linha-synctex");
  linhaDestaque = zero;
  clearTimeout(timerDestaqueLinha);
  timerDestaqueLinha = setTimeout(() => {
    editor.removeLineClass(zero, "background", "linha-synctex");
    if (linhaDestaque === zero) linhaDestaque = null;
  }, 2600);
}

async function sincronizarEditorParaPdf() {
  if (!slugAtual || sincronizando) return;
  if (!urlPrevia) {
    indicador("Compile o artigo para sincronizar.");
    setTimeout(() => indicador(""), 2500);
    return;
  }
  sincronizando = true;
  try {
    if (painelPrevia.classList.contains("oculto") || !pdfAtual) {
      await mostrarPrevia(urlPrevia);
    }
    if (!pdfPaginas.length) await desenharPdf();
    if (!pdfPaginas.length) {
      indicador("Prévia do PDF indisponível.");
      setTimeout(() => indicador(""), 2500);
      return;
    }
    const cursor = editor.getCursor();
    const dados = await api(
      `/api/artigos/${slugAtual}/synctex/ida?linha=${cursor.line + 1}&coluna=${cursor.ch + 1}`,
    );
    if (!dados.ok) {
      indicador(dados.mensagem || "Sem correspondência no PDF.");
      setTimeout(() => indicador(""), 3000);
      return;
    }
    destacarCaixasPdf(dados.caixas || []);
    rolarParaCaixaPdf((dados.caixas || [])[0]);
    indicador("PDF sincronizado");
    setTimeout(() => indicador(""), 1200);
  } catch (erro) {
    indicador("");
    alert(erro.message);
  } finally {
    sincronizando = false;
  }
}

async function sincronizarPdfParaEditor(evento) {
  if (!slugAtual || sincronizando) return;
  const moldura = evento.target.closest(".pagina-pdf");
  if (!moldura) return;
  const pagina = Number(moldura.dataset.pagina);
  const baseWidth = Number(moldura.dataset.baseWidth);
  const baseHeight = Number(moldura.dataset.baseHeight);
  const rect = moldura.getBoundingClientRect();
  if (!pagina || !baseWidth || !baseHeight || !rect.width || !rect.height) return;
  const x = ((evento.clientX - rect.left) / rect.width) * baseWidth;
  const y = ((evento.clientY - rect.top) / rect.height) * baseHeight;
  sincronizando = true;
  try {
    const dados = await api(
      `/api/artigos/${slugAtual}/synctex/volta?pagina=${pagina}&x=${x.toFixed(2)}&y=${y.toFixed(2)}`,
    );
    if (!dados.ok) {
      indicador(dados.mensagem || "Sem correspondência no texto.");
      setTimeout(() => indicador(""), 3000);
      return;
    }
    destacarLinhaEditor(dados.linha);
    indicador("Texto sincronizado");
    setTimeout(() => indicador(""), 1200);
  } catch (erro) {
    indicador("");
    alert(erro.message);
  } finally {
    sincronizando = false;
  }
}

function aplicarZoom(ajustar, fator) {
  ajustarPdf = ajustar;
  zoomPdf = Math.max(0.5, Math.min(3, fator));
  btnZoomAjustar.classList.toggle("ativo", ajustarPdf);
  atualizarInfoPdf();
  if (pdfAtual) desenharPdf();
}

function zoomRelativo(passo) {
  const larguraAtual = ajustarPdf ? larguraPaginaPdf() : 794 * zoomPdf;
  aplicarZoom(false, (larguraAtual + passo) / 794);
}

function mostrarPrevia(url) {
  const urlMudou = url !== urlPrevia;
  urlPrevia = url;
  btnBaixar.href = url + (url.includes("?") ? "&" : "?") + "download=1";
  painelPrevia.classList.remove("oculto");
  divisores.previa.classList.remove("oculto");
  btnPrevia.classList.remove("oculto");
  aplicarLarguraPreviaSalva();

  if (urlMudou || !pdfAtual) {
    return carregarPdf(url);
  }
  return desenharPdf();
}

function fecharPrevia() {
  painelPrevia.classList.add("oculto");
  divisores.previa.classList.add("oculto");
  editor.refresh();
}

function limparPrevia() {
  urlPrevia = null;
  fecharPrevia();
  btnPrevia.classList.add("oculto");
  geracaoPdf += 1;
  cancelarDesenhos();
  limparDestaquesPdf();
  if (pdfAtual) {
    pdfAtual.destroy();
    pdfAtual = null;
  }
  paginasPdfEl.innerHTML = "";
  pdfPaginas = [];
  totalPaginas = 0;
  atualizarInfoPdf();
  estadoPdf("Compile o artigo para ver o PDF aqui.");
}

async function carregarStatus() {
  try {
    const s = await api("/api/status");
    const sincronia = s.synctex ? "sincronia ok" : "sincronia ausente";
    statusEl.textContent = `${s.artigos} artigos · pdflatex ${
      s.pdflatex ? "ok" : "ausente"
    } · ${sincronia}`;
    statusEl.title = s.pdflatex
      ? s.synctex
        ? "Compilação e sincronia PDF↔texto disponíveis nesta máquina."
        : "Compilação disponível; instale o synctex para sincronizar PDF e texto."
      : "Sem pdflatex local: use Docker (docker compose up) para compilar.";
  } catch (e) {
    statusEl.textContent = "sem conexão com a API";
  }
}

async function carregarLista() {
  const artigos = await api("/api/artigos");
  listaEl.innerHTML = "";
  for (const a of artigos) {
    const li = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "item-lista";
    botao.dataset.slug = a.slug;
    if (a.slug === slugAtual) botao.classList.add("ativo");
    const titulo = document.createElement("span");
    titulo.className = "titulo-item";
    titulo.textContent = a.titulo || a.slug;
    const slug = document.createElement("small");
    slug.textContent = a.slug;
    botao.append(titulo, slug);
    botao.addEventListener("click", () => abrirArtigo(a.slug));
    li.appendChild(botao);
    listaEl.appendChild(li);
  }
}

function marcarAtivo() {
  listaEl.querySelectorAll(".item-lista").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.slug === slugAtual);
  });
}

async function abrirArtigo(slug) {
  if (sujo && !confirm("Há alterações não salvas. Abrir outro artigo mesmo assim?")) return;
  try {
    indicador("carregando…", true);
    const dados = await api(`/api/artigos/${slug}`);
    slugAtual = dados.slug;
    editor.setValue(dados.conteudo);
    sujo = false;
    atualEl.textContent = dados.titulo || dados.slug;
    btnSalvar.disabled = true;
    btnCompilar.disabled = false;
    limparPrevia();
    fecharLog();
    marcarAtivo();
    indicador("");
  } catch (e) {
    indicador("");
    alert(e.message);
  }
}

async function salvar() {
  if (!slugAtual) return;
  try {
    indicador("salvando…", true);
    await api(`/api/artigos/${slugAtual}`, {
      method: "PUT",
      body: JSON.stringify({ conteudo: editor.getValue() }),
    });
    sujo = false;
    btnSalvar.disabled = true;
    indicador("salvo");
    setTimeout(() => indicador(""), 1500);
    carregarLista();
  } catch (e) {
    indicador("");
    alert(e.message);
  }
}

function mostrarLog(dados) {
  const partes = [];
  if (dados.mensagem) partes.push(dados.mensagem);
  if (dados.erros && dados.erros.length) {
    partes.push("Erros:\n" + dados.erros.join("\n\n"));
  }
  if (dados.log) partes.push(dados.log);
  logEl.textContent = partes.join("\n\n") || "Sem saída.";
  painelLog.classList.remove("oculto");
}

function fecharLog() {
  painelLog.classList.add("oculto");
}

async function compilar() {
  if (!slugAtual) return;
  if (sujo) await salvar();
  try {
    indicador("compilando…", true);
    btnCompilar.disabled = true;
    const dados = await api(`/api/artigos/${slugAtual}/compilar`, { method: "POST" });
    mostrarLog(dados);
    if (dados.ok && dados.pdf) {
      await mostrarPrevia(dados.pdf);
      indicador("PDF pronto");
    } else {
      limparPrevia();
      indicador("falhou");
    }
  } catch (e) {
    indicador("");
    alert(e.message);
  } finally {
    btnCompilar.disabled = false;
  }
}

function abrirModal() {
  document.getElementById("novo-slug").value = "";
  document.getElementById("novo-titulo").value = "";
  document.getElementById("erro-novo").classList.add("oculto");
  modalNovo.classList.remove("oculto");
  document.getElementById("novo-slug").focus();
}

function fecharModal() {
  modalNovo.classList.add("oculto");
}

async function criarArtigo() {
  const slug = document.getElementById("novo-slug").value.trim().toLowerCase();
  const titulo = document.getElementById("novo-titulo").value.trim();
  const erroEl = document.getElementById("erro-novo");
  try {
    await api("/api/artigos", {
      method: "POST",
      body: JSON.stringify({ slug, titulo: titulo || "Novo artigo" }),
    });
    fecharModal();
    await carregarLista();
    await abrirArtigo(slug);
  } catch (e) {
    erroEl.textContent = e.message;
    erroEl.classList.remove("oculto");
  }
}

editor.on("change", () => {
  sujo = true;
  btnSalvar.disabled = false;
});

editor.getWrapperElement().addEventListener("click", (evento) => {
  if (evento.button !== 0) return;
  if (!evento.target.closest(".CodeMirror-lines")) return;
  sincronizarEditorParaPdf();
});
visualizadorPdf.addEventListener("click", sincronizarPdfParaEditor);

btnTema.addEventListener("click", alternarTema);
btnPdfClaro.addEventListener("click", () => aplicarTemaPdf("claro", true));
btnPdfEscuro.addEventListener("click", () => aplicarTemaPdf("escuro", true));
btnZoomMenos.addEventListener("click", () => zoomRelativo(-80));
btnZoomMais.addEventListener("click", () => zoomRelativo(80));
btnZoomAjustar.addEventListener("click", () => aplicarZoom(true, zoomPdf));
document.getElementById("btn-salvar").addEventListener("click", salvar);
document.getElementById("btn-compilar").addEventListener("click", compilar);
document.getElementById("btn-fechar-log").addEventListener("click", fecharLog);
document.getElementById("btn-fechar-previa").addEventListener("click", fecharPrevia);
btnPrevia.addEventListener("click", () => {
  if (urlPrevia) mostrarPrevia(urlPrevia);
});
document.getElementById("btn-novo").addEventListener("click", abrirModal);
document.getElementById("btn-cancelar-novo").addEventListener("click", fecharModal);
document.getElementById("btn-criar-novo").addEventListener("click", criarArtigo);
modalNovo.addEventListener("click", (e) => {
  if (e.target === modalNovo) fecharModal();
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    salvar();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    compilar();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (sujo) {
    e.preventDefault();
    e.returnValue = "";
  }
});

(async function iniciar() {
  aplicarTema(temaAtual());
  aplicarTemaPdf(temaPdfAtual());
  const larguraLateralSalva = lerNumero("largura-lateral");
  if (larguraLateralSalva) definirLarguraLateral(larguraLateralSalva);
  await carregarStatus();
  await carregarLista();
  const artigos = await api("/api/artigos");
  if (artigos.length) await abrirArtigo(artigos[0].slug);
})();
