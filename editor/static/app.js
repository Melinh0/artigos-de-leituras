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

let abasAbertas = new Map(); 
let indiceTabAtual = -1;

function criarBarraTabas() {
  let barra = document.querySelector(".barra-tabas");
  if (!barra) {
    barra = document.createElement("div");
    barra.className = "barra-tabas";
    const headerCtrl = document.querySelector(".header-ctrls");
    if (headerCtrl) {
      headerCtrl.insertBefore(barra, btnTema);
    } else {
      const topo = document.getElementById("topo-sistema");
      if (!topo) {
        const area = document.getElementById("area-principal");
        topo = document.createElement("div");
        topo.id = "topo-sistema";
        topo.style.display = "flex";
        topo.style.alignItems = "center";
        topo.style.gap = "8px";
        topo.style.padding = "8px 12px";
        topo.style.background = "var(--fundo)";
        topo.style.borderBottom = "1px solid var(--borda)";
        area.insertBefore(topo, area.firstChild);
      }
      topo.insertBefore(barra, btnTema);
    }
    barra.appendChild(criarBotaoTab("Novo", true, null, true));
  }
  return barra;
}

function criarBotaoTab(titulo, isNovo = false, slug = null, isFocado = false) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-tab";
  btn.title = titulo;
  btn.textContent = titulo;
  if (isFocado) btn.classList.add("ativo");
  if (isNovo) {
    btn.classList.add("novo-tab");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirArtigoNovo();
    });
  } else {
    btn.dataset.slug = slug;
    btn.addEventListener("click", () => SelecionarTab(slug));
    const fechar = document.createElement("span");
    fechar.className = "fechar-tab";
    fechar.title = "Fechar aba";
    fechar.textContent = "×";
    fechar.addEventListener("click", (e) => {
      e.stopPropagation();
      fecharTab(slug);
    });
    btn.appendChild(fechar);
  }
  return btn;
}

function SelecionarTab(slug) {
  if (abasAbertas.has(slug)) {
    const info = abasAbertas.get(slug);
    const dados = await api(`/api/artigos/${slug}`);
    editor.setValue(dados.conteudo);
    slugAtual = dados.slug;
    sujo = false;
    atualEl.textContent = dados.titulo || dados.slug;
    btnSalvar.disabled = true;
    btnCompilar.disabled = false;
    limparPrevia();
    fecharLog();
    abasAbertas.forEach((info, s) => {
      const b = info.elemento;
      b.classList.toggle("ativo", s === slug);
    });
    indicador("");
  }
}

function fecharTab(slug) {
  if (sujo && slug === slugAtual && !confirm("Há alterações não salvas na aba atual. Fechar mesmo assim?")) return;
  const info = abasAbertas.get(slug);
  if (!info) return;

  abasAbertas.delete(slug);
  info.elemento.remove();

  if (slugAtual === slug) {
    const slugs = Array.from(abasAbertas.keys());
    if (slugs.length > 0) {
const proximo = slugs[0]; 
      SelecionarTab(proximo);
    } else {
      slugAtual = null;
      editor.setValue("");
      atualEl.textContent = "";
      btnSalvar.disabled = true;
      btnCompilar.disabled = true;
      indicador("Nenhuma aba aberta");
    }
  }
  marcarBotoesTabs();
}

function marcarBotoesTabs() {
  const botoes = document.querySelectorAll(".btn-tab:not(.novo-tab)");
  abasAbertas.forEach((info, s) => {
    const b = info.elemento;
    b.classList.toggle("ativo", s === slugAtual);
    b.disabled = false;
  });
  const novoBtn = document.querySelector(".btn-tab.novo-tab");
  if (novoBtn) {
    novoBtn.disabled = slugAtual === null && abasAbertas.size === 0;
  }
}

function abrirArtigo(slug) {
  return new Promise((resolver) => {
    if (sujo && !confirm("Há alterações não salvas. Abrir outro artigo mesmo assim?")) {
      return resolver();
    }
    try {
      indicador("carregando…", true);
      const dados = await api(`/api/artigos/${slug}`);
      slugAtual = dados.slug;
      sujo = false;

      if (abasAbertas.has(slug)) {
        SelecionarTab(slug);
      } else {
        const info = abasAbertas.get(slug);
        if (!info) {
          const barra = criarBarraTabas();
          const btn = criarBotaoTab(dados.titulo || dados.slug, false, slug, true);
          barra.appendChild(btn);
          abasAbertas.set(slug, { elemento: btn, indice: abasAbertas.size });

          editor.setValue(dados.conteudo);
          slugAtual = dados.slug;
          sujo = false;
          atualEl.textContent = dados.titulo || dados.slug;
          btnSalvar.disabled = true;
          btnCompilar.disabled = false;
          limparPrevia();
          fecharLog();
        }
        SelecionarTab(slug);
      }
      indicador("");
      resolver();
    } catch (e) {
      indicador("");
      alert(e.message);
      resolver();
    }
  });
}

function abrirArtigoNovo() {
  const slug = prompt("Nome do novo artigo (slug):");
  if (!slug) return;
  slug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!slug) return;
  const existe = document.querySelector(`[data-slug="${slug}"]`);
  if (existe) {
    alert("Já existe um artigo com este slug. Selecione-o na lista.");
    return;
  }
  api("/api/artigos", {
    method: "POST",
    body: JSON.stringify({ slug, titulo: "Novo artigo" }),
  }).then(() => {
    carregarLista();
    abrirArtigo(slug).then(resolver);
  }).catch((e) => {
    alert(e.message);
    resolver();
  });
}

function fecharTodosTabs() {
  if (sujo) {
    if (!confirm("Há alterações não salvas em alguma aba. Deseja salvar antes de fechar?")) return;
  }
  const slugs = Array.from(abasAbertas.keys());
  slugs.forEach(fecharTab);
  if (slugAtual) {
    slugAtual = null;
    editor.setValue("");
    atualEl.textContent = "";
    btnSalvar.disabled = true;
    btnCompilar.disabled = true;
  }
  marcarBotoesTabs();
}


async function carregarListaParaTabs() {
  const artigos = await api("/api/artigos");
  const slugsExistentes = Array.from(abasAbertas.keys());
  artigos.forEach((a) => {
    if (!abasAbertas.has(a.slug)) {
    }
  });
  marcarBotoesTabs();
}

async function carregarListaAtualizada() {
  const artigos = await api("/api/artigos");
  listaEl.innerHTML = "";
  for (const a of artigos) {
    const li = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "item-lista";
    botao.dataset.slug = a.slug;
    if (abasAbertas.has(a.slug)) botao.classList.add("ativo");
    const titulo = document.createElement("span");
    titulo.className = "titulo-item";
    titulo.textContent = a.titulo || a.slug;
    const slugEl = document.createElement("small");
    slugEl.textContent = a.slug;
    botao.append(titulo, slugEl);
    botao.addEventListener("click", () => abrirArtigo(a.slug));
    li.appendChild(botao);
    listaEl.appendChild(li);
  }
  marcarBotoesTabs();
}

(async function iniciar() {
  aplicarTema(temaAtual());
  aplicarTemaPdf(temaPdfAtual());
  const larguraLateralSalva = lerNumero("largura-lateral");
  if (larguraLateralSalva) definirLarguraLateral(larguraLateralSalva);
  await carregarStatus();
  await carregarListaAtualizada();
  const artigos = await api("/api/artigos");
  if (artigos.length) await abrirArtigo(artigos[0].slug);
})();