/**
 * Reserva Fácil - Colégio Augustus
 * Backend em Google Apps Script (planilha vinculada).
 *
 * Configure em: Configurações do projeto > Propriedades de scripts
 *   ADMIN_SENHA = a senha do responsável (obrigatória para a área admin)
 *
 * Implantar: Implantar > Nova implantação > Aplicativo da web
 *   Executar como: Eu  |  Quem tem acesso: Qualquer pessoa
 * Depois copie a URL (termina com /exec) e cole no config.js do app.
 */

var ABA_RESERVAS = "Reservas";
var ABA_AVALIACOES = "Avaliacoes";
var CABECALHO_RESERVAS = ["ID", "Criado em", "Nome", "Telefone", "Email", "Data", "Inicio", "Fim", "Espaco", "Equipamentos", "Status", "Cancelado em"];
var CABECALHO_AVALIACOES = ["ID", "Criado em", "Nome", "Cargo", "Nota", "Comentario"];

function doGet() {
  return jsonResposta({ ok: true, app: "reserva-facil", versao: 1 });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.action === "criar_reserva") return criarReserva(body);
    if (body.action === "cancelar_reserva") return cancelarReserva(body);
    if (body.action === "criar_avaliacao") return criarAvaliacao(body);
    if (body.action === "consultar_dia") return consultarDia(body);
    if (body.action === "admin_listar") return adminListar(body);
    if (body.action === "admin_cancelar") return adminCancelar(body);
    return jsonResposta({ ok: false, erro: "Ação desconhecida." });
  } catch (err) {
    return jsonResposta({ ok: false, erro: "Erro no servidor: " + err });
  }
}

/* ---------------- utilitários ---------------- */

function jsonResposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function uid() {
  return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getPlanilha() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getAba(nome, cabecalho) {
  var ss = getPlanilha();
  var aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
  }
  if (aba.getLastRow() === 0 && cabecalho) {
    aba.appendRow(cabecalho);
    aba.getRange(1, 1, 1, cabecalho.length).setFontWeight("bold");
  }
  // Força formato texto: evita o Sheets converter "2026-10-26" e "10:00" em valores de data/hora
  aba.getRange(1, 1, aba.getMaxRows(), cabecalho.length).setNumberFormat("@");
  return aba;
}

function celString(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  }
  return String(v);
}

function lerLinhas(aba) {
  var dados = aba.getDataRange().getValues();
  if (dados.length < 2) return [];
  var cab = dados[0];
  var linhas = [];
  for (var i = 1; i < dados.length; i++) {
    var obj = {};
    for (var j = 0; j < cab.length; j++) {
      obj[String(cab[j])] = celString(dados[i][j]);
    }
    linhas.push({ obj: obj, linha: i + 1 });
  }
  return linhas;
}

function sobrepoe(aIni, aFim, bIni, bFim) {
  return String(aIni) < String(bFim) && String(aFim) > String(bIni);
}

function paraMinutos(hhmm) {
  var p = String(hhmm).split(":");
  return Number(p[0]) * 60 + Number(p[1] || 0);
}

function paraHora(mins) {
  var h = Math.floor(mins / 60), m = mins % 60;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}

/**
 * Encontra a primeira janela em que cabe uma duração, considerando
 * os intervalos ocupados (busy = [[inicioMin, fimMin], ...]).
 * Retorna minutos desde00:00, ou null se não couber no dia.
 */
function janelaLivre(busy, inicioMin, durMin) {
  var blocos = busy.slice().sort(function (a, b) { return a[0] - b[0]; });
  var t = Math.max(0, inicioMin);
  for (var i = 0; i < blocos.length; i++) {
    var s = blocos[i][0], f = blocos[i][1];
    if (t + durMin <= s) return t;
    if (t < f) t = f;
  }
  return (t + durMin <= 24 * 60) ? t : null;
}

function conflitoResposta(mensagem, livreMin) {
  if (livreMin == null) {
    return jsonResposta({
      ok: false,
      conflito: true,
      erro: mensagem + " Nenhuma janela livre coube para a duração escolhida neste dia — tente outra data ou reduza o tempo."
    });
  }
  return jsonResposta({
    ok: false,
    conflito: true,
    livreApartirDe: paraHora(livreMin),
    erro: mensagem + " Você poderá agendar a partir das " + paraHora(livreMin) + "."
  });
}

function hojeISO() {
  var d = new Date();
  var m = String(d.getMonth() + 1);
  var dia = String(d.getDate());
  return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (dia.length < 2 ? "0" + dia : dia);
}

function verificarSenha(senha) {
  var esperado = PropertiesService.getScriptProperties().getProperty("ADMIN_SENHA");
  if (!esperado) return false;
  return String(senha || "") === esperado;
}

/* ---------------- estoque (quantidades) ---------------- */

var ABA_ESTOQUE = "Estoque";
var ESTOQUE_PADRAO = [
  ["Data Show", 3],
  ["Notebook", 3],
  ["Caixa de som Bluetooth", 1],
  ["Extensão", 1],
  ["Cabo HDMI", 1],
  ["Carregador da caixa de som", 1]
];

/**
 * Lê a aba "Estoque" (Item | Quantidade). Cria semeada na 1ª chamada.
 * Item ausente da aba é tratado como 1 (conservador).
 */
function getEstoque() {
  var ss = getPlanilha();
  var aba = ss.getSheetByName(ABA_ESTOQUE);
  if (!aba) aba = ss.insertSheet(ABA_ESTOQUE);
  if (aba.getLastRow() === 0) {
    aba.appendRow(["Item", "Quantidade"]);
    ESTOQUE_PADRAO.forEach(function (l) { aba.appendRow(l); });
    aba.getRange(1, 1, 1, 2).setFontWeight("bold");
    aba.setColumnWidth(1, 220);
  }
  var estoque = {};
  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    var nome = celString(dados[i][0]).trim();
    if (!nome) continue;
    var q = Number(dados[i][1]);
    estoque[nome] = isNaN(q) ? 1 : q;
  }
  return estoque;
}

function qtdEstoque(estoque, item) {
  if (estoque.hasOwnProperty(item)) return estoque[item];
  return 1;
}

/**
 * Varredura: dados os intervalos de uso [[ini,fim],...], devolve os
 * sub-intervalos em que há Q ou mais usos simultâneos (lotado).
 */
function intervalosCheios(intervalos, q) {
  var evs = [];
  intervalos.forEach(function (iv) {
    evs.push([iv[0], 1]);
    evs.push([iv[1], -1]);
  });
  // no mesmo instante, fim (-1) antes de início (+1)
  evs.sort(function (a, b) { return a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]; });
  var count = 0, start = null, out = [];
  for (var i = 0; i < evs.length; i++) {
    var anterior = count;
    count += evs[i][1];
    if (anterior < q && count >= q) start = evs[i][0];
    else if (anterior >= q && count < q && start !== null) {
      out.push([start, evs[i][0]]);
      start = null;
    }
  }
  return out;
}

/* ---------------- reservas ---------------- */

function criarReserva(body) {
  var nome = String(body.nome || "").trim();
  var telefone = String(body.telefone || "").trim();
  var email = String(body.email || "").trim();
  var data = String(body.data || "").trim();
  var inicio = String(body.inicio || "").trim();
  var fim = String(body.fim || "").trim();
  var espaco = String(body.espaco || "").trim();
  var equipamentos = Array.isArray(body.equipamentos) ? body.equipamentos.map(String) : [];

  if (nome.length < 3) return jsonResposta({ ok: false, erro: "Informe seu nome completo." });
  if (telefone.replace(/\D/g, "").length < 10) return jsonResposta({ ok: false, erro: "Informe um telefone válido com DDD." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResposta({ ok: false, erro: "Informe um e-mail válido." });
  if (!data || !inicio || !fim || !espaco) return jsonResposta({ ok: false, erro: "Preencha data, horários e espaço." });
  if (data < hojeISO()) return jsonResposta({ ok: false, erro: "A data não pode ser anterior a hoje." });
  if (fim <= inicio) return jsonResposta({ ok: false, erro: "O horário de término deve ser posterior ao início." });

  var aba = getAba(ABA_RESERVAS, CABECALHO_RESERVAS);
  var linhas = lerLinhas(aba);
  var durMin = paraMinutos(fim) - paraMinutos(inicio);
  var semEspaco = espaco.indexOf("Nenhum") === 0; // "Nenhum (Apenas equipamento)" não conflita

  var conflEspaco = null;
  var busyEspaco = [];
  var ivsItem = {};    // item -> [[ini,fim], ...] das reservas ativas do dia
  var conflResItem = {}; // item -> reserva que sobrepõe o pedido
  equipamentos.forEach(function (it) { ivsItem[it] = []; });

  for (var i = 0; i < linhas.length; i++) {
    var r = linhas[i].obj;
    if (String(r.Status) === "Cancelada") continue;
    if (String(r.Data) !== data) continue;

    var rIni = paraMinutos(r.Inicio), rFim = paraMinutos(r.Fim);
    var sobrepoeAqui = sobrepoe(String(r.Inicio), String(r.Fim), inicio, fim);

    var mesmaSala = !semEspaco && String(r.Espaco) === espaco;
    if (mesmaSala) {
      busyEspaco.push([rIni, rFim]);
      if (sobrepoeAqui && !conflEspaco) conflEspaco = r;
    }

    var equipReservados = String(r.Equipamentos || "").split(", ");
    for (var k = 0; k < equipamentos.length; k++) {
      if (equipReservados.indexOf(equipamentos[k]) !== -1) {
        ivsItem[equipamentos[k]].push([rIni, rFim]);
        if (sobrepoeAqui && !conflResItem[equipamentos[k]]) conflResItem[equipamentos[k]] = r;
      }
    }
  }

  // Conflito de espaço (sempre 1 por sala)
  if (conflEspaco) {
    return conflitoResposta(
      "Já existe uma reserva das " + conflEspaco.Inicio + " às " + conflEspaco.Fim +
      " em " + espaco + " feita por outro usuário.",
      janelaLivre(busyEspaco, paraMinutos(inicio), durMin)
    );
  }

  // Conflito de equipamentos por QUANTIDADE em estoque
  if (equipamentos.length) {
    var estoque = getEstoque();
    for (var k2 = 0; k2 < equipamentos.length; k2++) {
      var item = equipamentos[k2];
      var q = qtdEstoque(estoque, item);

      if (q <= 0) {
        return jsonResposta({
          ok: false, conflito: true,
          erro: "O item \"" + item + "\" está indisponível no momento (estoque 0). Retire-o da seleção."
        });
      }

      var cheios = intervalosCheios(ivsItem[item], q);
      var faixa = null;
      for (var f = 0; f < cheios.length; f++) {
        if (sobrepoe(paraHora(cheios[f][0]), paraHora(cheios[f][1]), inicio, fim)) { faixa = cheios[f]; break; }
      }
      if (!faixa) continue; // item com folga no horário pedido

      if (q === 1) {
        var rMsg = conflResItem[item];
        return conflitoResposta(
          "Já existe uma reserva das " +
          (rMsg ? rMsg.Inicio + " às " + rMsg.Fim : paraHora(faixa[0]) + " às " + paraHora(faixa[1])) +
          " do item \"" + item + "\" feita por outro usuário.",
          janelaLivre(cheios, paraMinutos(inicio), durMin)
        );
      }

      var n = 0;
      ivsItem[item].forEach(function (iv) {
        if (sobrepoe(paraHora(iv[0]), paraHora(iv[1]), inicio, fim)) n++;
      });
      return conflitoResposta(
        "Não há mais " + item + " livre neste horário (" + Math.min(n, q) + " de " + q +
        " já reservados, das " + paraHora(faixa[0]) + " às " + paraHora(faixa[1]) + ").",
        janelaLivre(cheios, paraMinutos(inicio), durMin)
      );
    }
  }

  var id = uid();
  var agora = new Date().toISOString();
  aba.appendRow([id, agora, nome, telefone, email, data, inicio, fim, espaco, equipamentos.join(", "), "Confirmada", ""]);

  return jsonResposta({ ok: true, id: id, criadoEm: agora });
}

function cancelarReserva(body) {
  var id = String(body.id || "").trim();
  if (!id) return jsonResposta({ ok: false, erro: "ID da reserva ausente." });

  var aba = getAba(ABA_RESERVAS, CABECALHO_RESERVAS);
  var linhas = lerLinhas(aba);
  for (var i = 0; i < linhas.length; i++) {
    if (String(linhas[i].obj.ID) === id) {
      var colStatus = CABECALHO_RESERVAS.indexOf("Status") + 1;
      var colCancel = CABECALHO_RESERVAS.indexOf("Cancelado em") + 1;
      aba.getRange(linhas[i].linha, colStatus).setValue("Cancelada");
      aba.getRange(linhas[i].linha, colCancel).setValue(new Date().toISOString());
      return jsonResposta({ ok: true });
    }
  }
  // Já não existe na nuvem: o app pode remover o registro local
  return jsonResposta({ ok: true, naoEncontrada: true });
}

/* ---------------- disponibilidade do dia ---------------- */

/**
 * Devolve as reservas ativas de uma data com apenas horários,
 * espaço e equipamentos (sem dados pessoais) para a linha do tempo.
 */
function consultarDia(body) {
  var data = String(body.data || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return jsonResposta({ ok: false, erro: "Data inválida." });

  var linhas = lerLinhas(getAba(ABA_RESERVAS, CABECALHO_RESERVAS));
  var reservas = [];
  for (var i = 0; i < linhas.length; i++) {
    var r = linhas[i].obj;
    if (String(r.Status) === "Cancelada") continue;
    if (String(r.Data) !== data) continue;
    var equip = String(r.Equipamentos || "");
    reservas.push({
      inicio: String(r.Inicio),
      fim: String(r.Fim),
      espaco: String(r.Espaco),
      equipamentos: equip ? equip.split(", ") : []
    });
  }
  return jsonResposta({ ok: true, data: data, reservas: reservas, estoque: getEstoque() });
}

/* ---------------- avaliações ---------------- */
function criarAvaliacao(body) {
  var nome = String(body.nome || "").trim();
  var cargo = String(body.cargo || "").trim();
  var comentario = String(body.comentario || "").trim();
  var nota = body.nota ? Number(body.nota) : "";

  if (nome.length < 2) return jsonResposta({ ok: false, erro: "Informe seu nome." });
  if (comentario.length < 5) return jsonResposta({ ok: false, erro: "Conte um pouco mais sobre sua experiência." });
  if (nota !== "" && (isNaN(nota) || nota < 1 || nota > 5)) nota = "";

  var aba = getAba(ABA_AVALIACOES, CABECALHO_AVALIACOES);
  var agora = new Date().toISOString();
  var id = uid();
  aba.appendRow([id, agora, nome, cargo, nota, comentario]);

  return jsonResposta({ ok: true, id: id });
}

/* ---------------- área do responsável ---------------- */

/**
 * Cancela uma reserva validando a senha do responsável.
 * Libera o horário e o estoque dos itens na hora.
 */
function adminCancelar(body) {
  if (!PropertiesService.getScriptProperties().getProperty("ADMIN_SENHA")) {
    return jsonResposta({ ok: false, erro: "Defina a propriedade ADMIN_SENHA nas configurações do script." });
  }
  if (!verificarSenha(body.senha)) {
    return jsonResposta({ ok: false, erro: "Senha incorreta." });
  }
  var id = String(body.id || "").trim();
  if (!id) return jsonResposta({ ok: false, erro: "ID da reserva ausente." });

  var aba = getAba(ABA_RESERVAS, CABECALHO_RESERVAS);
  var linhas = lerLinhas(aba);
  for (var i = 0; i < linhas.length; i++) {
    if (String(linhas[i].obj.ID) === id) {
      if (String(linhas[i].obj.Status) === "Cancelada") {
        return jsonResposta({ ok: true, jaCancelada: true });
      }
      var colStatus = CABECALHO_RESERVAS.indexOf("Status") + 1;
      var colCancel = CABECALHO_RESERVAS.indexOf("Cancelado em") + 1;
      aba.getRange(linhas[i].linha, colStatus).setValue("Cancelada");
      aba.getRange(linhas[i].linha, colCancel).setValue(new Date().toISOString());
      return jsonResposta({ ok: true });
    }
  }
  return jsonResposta({ ok: true, naoEncontrada: true });
}

function adminListar(body) {
  if (!PropertiesService.getScriptProperties().getProperty("ADMIN_SENHA")) {
    return jsonResposta({ ok: false, erro: "Defina a propriedade ADMIN_SENHA nas configurações do script." });
  }
  if (!verificarSenha(body.senha)) {
    return jsonResposta({ ok: false, erro: "Senha incorreta." });
  }

  var reservas = [];
  var linhasR = lerLinhas(getAba(ABA_RESERVAS, CABECALHO_RESERVAS));
  var totalCanceladas = 0;
  for (var i = 0; i < linhasR.length; i++) {
    var r = linhasR[i].obj;
    var equip = String(r.Equipamentos || "");
    reservas.push({
      id: String(r.ID),
      criadoEm: String(r["Criado em"]),
      nome: String(r.Nome),
      telefone: String(r.Telefone),
      email: String(r.Email),
      data: String(r.Data),
      inicio: String(r.Inicio),
      fim: String(r.Fim),
      espaco: String(r.Espaco),
      equipamentos: equip ? equip.split(", ") : [],
      status: String(r.Status || "Confirmada")
    });
    if (String(r.Status) === "Cancelada") totalCanceladas++;
  }
  reservas.sort(function (a, b) { return a.data === b.data ? (a.inicio < b.inicio ? 1 : -1) : (a.data < b.data ? 1 : -1); });

  var avaliacoes = [];
  var soma = 0, qtdNota = 0;
  var linhasA = lerLinhas(getAba(ABA_AVALIACOES, CABECALHO_AVALIACOES));
  for (var j = 0; j < linhasA.length; j++) {
    var a = linhasA[j].obj;
    var n = a.Nota === "" || a.Nota == null ? null : Number(a.Nota);
    avaliacoes.push({
      id: String(a.ID),
      criadoEm: String(a["Criado em"]),
      nome: String(a.Nome),
      cargo: String(a.Cargo || ""),
      nota: n,
      comentario: String(a.Comentario)
    });
    if (n) { soma += n; qtdNota++; }
  }
  avaliacoes.sort(function (x, y) { return x.criadoEm < y.criadoEm ? 1 : -1; });

  return jsonResposta({
    ok: true,
    reservas: reservas,
    avaliacoes: avaliacoes,
    totais: {
      reservas: reservas.length,
      canceladas: totalCanceladas,
      confirmadas: reservas.length - totalCanceladas,
      avaliacoes: avaliacoes.length,
      media: qtdNota ? Math.round((soma / qtdNota) * 10) / 10 : null
    }
  });
}
