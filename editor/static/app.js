/* Editor de Artigos de Leitura - lógica da interface */

const temaAtual = () => document.documentElement.dataset.tema || "escuro";

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
const iframePrevia = document.getElementById("iframe-previa");
const btnBaixar = document.getElementById("btn-baixar");
const btnPdfClaro = document.getElementById("btn-pdf-claro");
const btnPdfEscuro = document.getElementById("btn-pdf-escuro");
const painelLog = document.getElementById("painel-log");
const logEl = document.getElementById("log");
const modalNovo = document.getElementById("modal-novo");

let slugAtual = null;
let sujo = false;
let urlPrevia = null;

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
  iframePrevia.classList.toggle("invertido", tema === "escuro");
  btnPdfClaro.classList.toggle("ativo", tema === "claro");
  btnPdfEscuro.classList.toggle("ativo", tema === "escuro");
  if (persistir) {
    try {
      localStorage.setItem("tema-pdf", tema);
    } catch (e) {}
  }
}

function mostrarPrevia(url) {
  urlPrevia = url;
  iframePrevia.src = url;
  btnBaixar.href = url + (url.includes("?") ? "&" : "?") + "download=1";
  painelPrevia.classList.remove("oculto");
  btnPrevia.classList.remove("oculto");
}

function fecharPrevia() {
  painelPrevia.classList.add("oculto");
}

function limparPrevia() {
  urlPrevia = null;
  fecharPrevia();
  btnPrevia.classList.add("oculto");
  iframePrevia.src = "about:blank";
}

async function carregarStatus() {
  try {
    const s = await api("/api/status");
    statusEl.textContent = `${s.artigos} artigos · pdflatex ${s.pdflatex ? "ok" : "ausente"}`;
    statusEl.title = s.pdflatex
      ? "Compilação disponível nesta máquina."
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
      mostrarPrevia(dados.pdf);
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

btnTema.addEventListener("click", alternarTema);
btnPdfClaro.addEventListener("click", () => aplicarTemaPdf("claro", true));
btnPdfEscuro.addEventListener("click", () => aplicarTemaPdf("escuro", true));
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
  await carregarStatus();
  await carregarLista();
  const artigos = await api("/api/artigos");
  if (artigos.length) await abrirArtigo(artigos[0].slug);
})();
