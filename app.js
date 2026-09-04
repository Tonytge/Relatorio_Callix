/* ===================== Lopes · Relatório da Discadora ===================== */

const QUAL_COLORS = {
  'Chamada sem qualificação': '#CBD5E1',
  'Chamada caiu': '#94A3B8',
  'Engano': '#78716C',
  'Muda/Caixa postal': '#F59E0B',
  'Já comprou imóvel': '#0F9D58',
  'Tempo excedido': '#2563EB',
  'LEAD: Mais informações': '#E01A43',
  'LEAD: Interesse em outro produto': '#E01A43',
  'LEAD: Agendamento de atendimento': '#E01A43',
  'Chat finalizado por nova mensagem ativa': '#8B5CF6',
  'Busca aluguel': '#EC4899',
  'Transferência': '#6366F1',
};
const DEFAULT_QUAL_COLOR = '#CBD5E1';
const TEAM_ORDER = ['Equipe Flávio', 'Equipe Márcia', 'Equipe Scarton', 'Equipe Thiago'];

const state = {
  found: {},          // key -> true
  teamMap: {},         // AGENTE (upper) -> Equipe
  teams: [],           // list of team names present
  campanhaTotais: null,
  receptivoTotais: null,
  campanhaRows: [],
  receptivoRows: [],
  agentPerf: [],
  filterStart: '',
  filterEnd: '',
  discadoraCalls: [],
  receptivoCalls: [],
  periodLabel: '',
  activeTeam: 'Todas',
  teamChart: null,
  trendChart: null,
  agentSort: { key: 'comp', dir: -1 },
};

/* ---------- utils ---------- */
function stripBOM(s) { return s.replace(/^\uFEFF/, ''); }

function parseNum(v) {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim().replace(/"/g, '').replace('%', '');
  if (s === '') return 0;
  s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function timeToSeconds(t) {
  if (t === null || t === undefined || t === '') return 0;
  if (typeof t === 'number') return Math.max(0, Math.round(t));
  const raw = String(t).trim();
  if (!raw) return 0;
  const parts = raw.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  return 0;
}

function secondsToTime(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

function parseBRDateTime(str) {
  if (!str) return null;
  const raw = String(str).trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0), Number(iso[6] || 0));
  const [datePart, timePart] = raw.split(' ');
  if (!datePart) return null;
  const [d, m, y] = datePart.split('/').map(Number);
  let hh = 0, mm = 0, ss = 0;
  if (timePart) [hh, mm, ss] = timePart.split(':').map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
}

function pickField(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== '' && row[key] !== null && row[key] !== undefined) {
      return row[key];
    }
  }
  return '';
}

function extractRowDate(row) {
  const raw = pickField(row, ['Data', 'Data e hora', 'Data/Hora', 'Data Hora', 'Dia', 'Date', 'Data de início', 'Data início']);
  if (!raw) return '';
  const str = String(raw).trim();
  const date = parseBRDateTime(str.includes(' ') ? str : `${str} 00:00:00`);
  return date ? dateKey(date) : '';
}

function dateKey(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function dateKeyToBR(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return '';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

function rowMatchesFilter(row) {
  if (!state.filterStart && !state.filterEnd) return true;
  const key = row.dataDate || (row.data ? (() => { const d = parseBRDateTime(row.data); return d ? dateKey(d) : ''; })() : '') || extractRowDate(row);
  if (!key) return false;
  if (state.filterStart && key < state.filterStart) return false;
  if (state.filterEnd && key > state.filterEnd) return false;
  return true;
}

function selectedPeriodLabel() {
  const allDates = [...state.discadoraCalls, ...state.receptivoCalls]
    .map((c) => parseBRDateTime(c.data))
    .filter(Boolean);
  if (state.filterStart || state.filterEnd) {
    if (state.filterStart && state.filterEnd && state.filterStart === state.filterEnd) return dateKeyToBR(state.filterStart);
    const start = state.filterStart || (allDates.length ? dateKey(new Date(Math.min(...allDates))) : '');
    const end = state.filterEnd || (allDates.length ? dateKey(new Date(Math.max(...allDates))) : '');
    if (start && end) return `${dateKeyToBR(start)} – ${dateKeyToBR(end)}`;
  }
  return computePeriod();
}

function fmtInt(n) { return Math.round(n || 0).toLocaleString('pt-BR'); }
function fmtPct(n) { return (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%'; }

function isLead(qual) { return /^LEAD/i.test((qual || '').trim()); }

function prettyOperador(raw) {
  const v = (raw || '').trim();
  if (!v) return '—';
  if (/^\+?\d+$/.test(v)) return 'Atendimento automático';
  return v;
}

function normalizeEquipeLabel(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  const code = v.replace(/\.ES$/i, '').trim();
  const noAccent = code.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const known = { FLAVIO: 'Equipe Flávio', MARCIA: 'Equipe Márcia', SCARTON: 'Equipe Scarton', THIAGO: 'Equipe Thiago' };
  return known[noAccent] || v; // ex.: "Administração" continua como veio
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(() => (t.hidden = true), 2400);
}

/* ---------- file detection & parsing ---------- */
function detectCsvType(headers) {
  const h = headers.map((x) => x.trim());
  const has = (k) => h.includes(k);
  if (has('Tentativas') && has('Falta de agentes')) return 'campanhas';
  if (has('Recebidas') && has('Tempo Médio de Espera')) return 'receptivo';
  if (has('Nome do agente') && has('Chamadas atendidas de campanha')) return 'agentes';
  if (has('Qualificação') && has('Campanha')) return 'discadoraDetalhe';
  if (has('Qualificação') && has('Fila')) return 'receptivoDetalhe';
  return null;
}

function markFound(key) {
  state.found[key] = true;
  const li = document.querySelector(`#fileChecklist li[data-key="${key}"]`);
  if (li) li.classList.add('found');
  checkReady();
}

function checkReady() {
  const keys = ['campanhas', 'receptivo', 'agentes', 'discadoraDetalhe', 'receptivoDetalhe', 'equipes'];
  const ready = keys.every((k) => state.found[k]);
  document.getElementById('generateBtn').disabled = !ready;
}

function handleFiles(fileList) {
  const errEl = document.getElementById('uploadError');
  [...fileList].forEach((file) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets['Membros'] || wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
          rows.forEach((r) => {
            const nome = String(r['Nome'] || '').trim().toUpperCase();
            const equipe = String(r['Equipe'] || '').trim();
            if (nome && equipe) state.teamMap[nome] = equipe;
          });
          state.teams = [...new Set(Object.values(state.teamMap))].sort(
            (a, b) => TEAM_ORDER.indexOf(a) - TEAM_ORDER.indexOf(b)
          );
          markFound('equipes');
        } catch (err) {
          errEl.hidden = false;
          errEl.textContent = `Não consegui ler "${file.name}" como planilha de equipes.`;
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    if (name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = stripBOM(String(e.target.result));
        const parsed = Papa.parse(text, { header: true, delimiter: ';', skipEmptyLines: true });
        const headers = parsed.meta.fields || [];
        const type = detectCsvType(headers);
        if (!type) {
          errEl.hidden = false;
          errEl.textContent = `Não reconheci o conteúdo de "${file.name}". Confira se é um dos 6 exports do Callix/LopesCloud.`;
          return;
        }
        storeCsv(type, parsed.data);
        markFound(type);
      };
      reader.readAsText(file, 'UTF-8');
      return;
    }
    errEl.hidden = false;
    errEl.textContent = `Arquivo "${file.name}" não é .csv nem .xlsx — ignorado.`;
  });
}

function storeCsv(type, rows) {
  if (type === 'campanhas') {
    state.campanhaRows = rows.filter((r) => extractRowDate(r));
    const totals = rows.find((r) => (r['Data'] || '').trim().toLowerCase().startsWith('totais'));
    if (totals) {
      state.campanhaTotais = {
        tentativas: parseNum(totals['Tentativas']),
        completadas: parseNum(totals['Completadas']),
        pctAtendidas: parseNum(totals['% de atendidas']),
        tma: (totals['TMA'] || '00:00:00').trim(),
      };
    }
  } else if (type === 'receptivo') {
    state.receptivoRows = rows.filter((r) => extractRowDate(r));
    const totals = rows.find((r) => (r['Data'] || '').trim().toLowerCase().startsWith('totais'));
    if (totals) {
      state.receptivoTotais = {
        recebidas: parseNum(totals['Recebidas']),
        atendidas: parseNum(totals['Atendidas']),
        tma: (totals['Tempo Médio de Atendimento'] || '00:00:00').trim(),
        tmEspera: (totals['Tempo Médio de Espera'] || '00:00:00').trim(),
      };
    }
  } else if (type === 'agentes') {
    state.agentPerf = rows
      .filter((r) => (r['Nome do agente'] || '').trim())
      .map((r) => {
        const login = String(r['Nome do agente']).trim().toUpperCase();
        const totalSec = timeToSeconds(r['Total']);
        const pausaSec = timeToSeconds(r['Pausa']) + timeToSeconds(r['Descanso']) + timeToSeconds(r['Refeição']) + timeToSeconds(r['Banheiro']);
        return {
          login,
          dataDate: extractRowDate(r), // coluna "Data" (DD/MM/YYYY) — agora existe UMA linha por agente/dia
          comp: parseNum(r['Chamadas atendidas de campanha']),
          compReceptivo: parseNum(r['Chamadas atendidas do receptivo']),
          compManual: parseNum(r['Chamadas manuais efetuadas']),
          tma: (r['TMA'] || '00:00:00').trim(),
          tmaSec: timeToSeconds(r['TMA']),
          totalSec,
          pausaSec, // Pausa + Descanso + Refeição + Banheiro
          dispSec: timeToSeconds(r['Disponível']), // vem pronto do Callix, não precisa mais estimar
          ociosoSec: timeToSeconds(r['Ociosidade']), // logado mas parado — não é pausa formal
          equipeRaw: normalizeEquipeLabel(r['Equipe']),
          equipe: 'Sem equipe', // resolvido em finalizeData()
        };
      });
  } else if (type === 'discadoraDetalhe') {
    state.discadoraCalls = rows
      .filter((r) => (r['Data'] || '').trim())
      .map((r) => {
        const operadorRaw = String(r['Operador'] || '').trim().toUpperCase();
        return {
          data: r['Data'],
          operadorRaw,
          operador: operadorRaw,
          equipe: 'Sem equipe', // resolvido em finalizeData()
          qualificacao: (r['Qualificação'] || '').trim(),
          duracao: r['Duração Total'] || '',
          origem: 'Discadora',
        };
      });
  } else if (type === 'receptivoDetalhe') {
    state.receptivoCalls = rows
      .filter((r) => (r['Data'] || '').trim())
      .map((r) => {
        const operadorRaw = String(r['Atendido por'] || '').trim().toUpperCase();
        return {
          data: r['Data'],
          operadorRaw,
          operador: prettyOperador(operadorRaw),
          equipe: 'Sem equipe', // resolvido em finalizeData()
          qualificacao: (r['Qualificação'] || '').trim(),
          duracao: r['Duração Total'] || '',
          origem: 'Receptivo',
        };
      });
  }
}

/* ---------- junta equipes + recalcula conversão — só roda quando TODOS os arquivos já carregaram ---------- */
function finalizeData() {
  // fallback: se o agente não estiver no Equipes_Lopes.xlsx, usa a equipe que já vem no próprio arquivo de performance
  state.teamMapFallback = {};
  state.agentPerf.forEach((a) => { if (a.equipeRaw) state.teamMapFallback[a.login] = a.equipeRaw; });
  const resolveTeam = (login) => state.teamMap[login] || state.teamMapFallback[login] || 'Sem equipe';

  state.agentPerf.forEach((a) => { a.equipe = resolveTeam(a.login); });
  state.discadoraCalls.forEach((c) => { c.equipe = resolveTeam(c.operadorRaw); });
  state.receptivoCalls.forEach((c) => { c.equipe = resolveTeam(c.operadorRaw); });

  // inclui nas abas qualquer equipe que só apareceu via fallback (ex.: agente novo, ainda não cadastrado no Excel)
  const allTeams = new Set(state.teams);
  Object.values(state.teamMapFallback).forEach((t) => { if (t && t !== 'Administração') allTeams.add(t); });
  state.teams = [...allTeams].sort((a, b) => TEAM_ORDER.indexOf(a) - TEAM_ORDER.indexOf(b));
}

/* ---------- período + dados filtrados ---------- */
function computePeriod() {
  const dates = [...state.discadoraCalls, ...state.receptivoCalls]
    .map((c) => parseBRDateTime(c.data))
    .filter(Boolean);
  if (!dates.length) return '';
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const f = (d) => d.toLocaleDateString('pt-BR');
  return `${f(min)} – ${f(max)}`;
}

function getFilteredRows(rows) {
  return rows.filter(rowMatchesFilter);
}

function aggregateCampaignTotals() {
  const rows = getFilteredRows(state.campanhaRows);
  if (!rows.length || (!state.filterStart && !state.filterEnd)) return { ...state.campanhaTotais, source: 'total' };
  const tentativas = rows.reduce((s, r) => s + parseNum(r['Tentativas']), 0);
  const completadas = rows.reduce((s, r) => s + parseNum(r['Completadas']), 0);
  const weightedTma = rows.reduce((s, r) => s + timeToSeconds(r['TMA']) * parseNum(r['Completadas']), 0);
  return {
    tentativas,
    completadas,
    pctAtendidas: tentativas ? (completadas / tentativas) * 100 : 0,
    tma: secondsToTime(completadas ? weightedTma / completadas : 0),
    source: 'daily',
  };
}

function aggregateReceptivoTotals() {
  const rows = getFilteredRows(state.receptivoRows);
  if (!rows.length || (!state.filterStart && !state.filterEnd)) return { ...state.receptivoTotais, source: 'total' };
  const recebidas = rows.reduce((s, r) => s + parseNum(r['Recebidas']), 0);
  const atendidas = rows.reduce((s, r) => s + parseNum(r['Atendidas']), 0);
  const weightedTma = rows.reduce((s, r) => s + timeToSeconds(r['Tempo Médio de Atendimento']) * parseNum(r['Atendidas']), 0);
  const weightedEspera = rows.reduce((s, r) => s + timeToSeconds(r['Tempo Médio de Espera']) * parseNum(r['Recebidas']), 0);
  return {
    recebidas,
    atendidas,
    tma: secondsToTime(atendidas ? weightedTma / atendidas : 0),
    tmEspera: secondsToTime(recebidas ? weightedEspera / recebidas : 0),
    source: 'daily',
  };
}

function aggregateAgents(team) {
  const rows = getFilteredRows(state.agentPerf).filter((a) => team === 'Todas' || a.equipe === team);
  const map = {};
  rows.forEach((a) => {
    const key = a.login;
    if (!map[key]) {
      map[key] = {
        login: a.login,
        equipe: a.equipe,
        comp: 0,
        tmaWeighted: 0,
        tmaWeight: 0,
        totalSec: 0,
        pausaSec: 0,
        dispSec: 0,
        ociosoSec: 0,
        leads: 0,
      };
    }
    const x = map[key];
    x.comp += a.comp || 0;
    x.tmaWeighted += (a.tmaSec || 0) * (a.comp || 0);
    x.tmaWeight += a.comp || 0;
    x.totalSec += a.totalSec || 0;
    x.pausaSec += a.pausaSec || 0;
    x.dispSec += a.dispSec || 0;
    x.ociosoSec += a.ociosoSec || 0;
  });

  const leadsByAgent = {};
  getDataForTeamRawCalls(team).disc.forEach((c) => {
    if (isLead(c.qualificacao)) leadsByAgent[c.operadorRaw] = (leadsByAgent[c.operadorRaw] || 0) + 1;
  });

  return Object.values(map).map((a) => {
    a.leads = leadsByAgent[a.login] || 0;
    a.convPct = a.comp ? (a.leads / a.comp) * 100 : 0;
    a.tmaSec = a.tmaWeight ? a.tmaWeighted / a.tmaWeight : 0;
    a.tma = secondsToTime(a.tmaSec);
    a.ativoSec = Math.max(0, a.totalSec - a.pausaSec);
    a.ativo = secondsToTime(a.ativoSec);
    a.disponivelSec = a.dispSec;
    a.disponivel = secondsToTime(a.disponivelSec);
    a.ociosoPct = a.totalSec ? (a.ociosoSec / a.totalSec) * 100 : 0;
    a.pausaPct = a.totalSec ? (a.pausaSec / a.totalSec) * 100 : 0;
    return a;
  });
}

function getDataForTeamRawCalls(team) {
  const discAll = getFilteredRows(state.discadoraCalls);
  const recAll = getFilteredRows(state.receptivoCalls);
  const disc = team === 'Todas' ? discAll : discAll.filter((c) => c.equipe === team);
  const rec = team === 'Todas' ? recAll : recAll.filter((c) => c.equipe === team);
  return { disc, rec };
}

function getDataForTeam(team) {
  const { disc, rec } = getDataForTeamRawCalls(team);
  const agents = aggregateAgents(team);
  return { disc, rec, agents };
}

function computeActivity(team) {
  const agents = aggregateAgents(team);
  const totalLogged = agents.reduce((s, a) => s + a.totalSec, 0);
  const totalPause = agents.reduce((s, a) => s + a.pausaSec, 0);
  const totalActive = agents.reduce((s, a) => s + a.ativoSec, 0);
  const totalAvailable = agents.reduce((s, a) => s + a.disponivelSec, 0);
  return { agents, totalLogged, totalPause, totalActive, totalAvailable };
}

/* ---------- computed KPIs ---------- */
function computeKpis(team) {
  const { disc, rec, agents } = getDataForTeam(team);
  const campanha = aggregateCampaignTotals();
  const receptivo = aggregateReceptivoTotals();
  const completadas = disc.length;
  const totalCompAllAgents = aggregateAgents('Todas').reduce((s, a) => s + a.comp, 0) || 1;
  const compTeamAgents = agents.reduce((s, a) => s + a.comp, 0);

  let tentativas, pctAtendidas, tma, estimadoTag = '';
  if (team === 'Todas') {
    tentativas = campanha.tentativas;
    pctAtendidas = campanha.pctAtendidas;
    tma = campanha.tma;
  } else {
    tentativas = Math.round(campanha.tentativas * (compTeamAgents / totalCompAllAgents));
    pctAtendidas = tentativas ? (completadas / tentativas) * 100 : 0;
    const weighted = agents.reduce((s, a) => s + timeToSeconds(a.tma) * a.comp, 0);
    tma = secondsToTime(compTeamAgents ? weighted / compTeamAgents : 0);
    estimadoTag = ' (estimado)';
  }

  const semQual = disc.filter((c) => c.qualificacao === 'Chamada sem qualificação').length;
  const caiu = disc.filter((c) => c.qualificacao === 'Chamada caiu').length;
  const contatoEfetivo = completadas - semQual - caiu;

  const leadsDisc = disc.filter((c) => isLead(c.qualificacao)).length;
  const leadsRec = rec.filter((c) => isLead(c.qualificacao)).length;
  const leadsTotal = leadsDisc + leadsRec;
  const conv = completadas ? (leadsTotal / completadas) * 100 : 0;

  const recAtendidas = team === 'Todas' ? receptivo.atendidas : rec.length;
  const recRecebidas = team === 'Todas' ? receptivo.recebidas : null;

  return { tentativas, completadas, pctAtendidas, tma, estimadoTag, contatoEfetivo, leadsDisc, leadsRec, leadsTotal, conv, recAtendidas, recRecebidas };
}

/* ---------- rendering ---------- */
function renderChecklistReset() {
  document.querySelectorAll('#fileChecklist li').forEach((li) => li.classList.remove('found'));
}

function buildTeamTabs() {
  const wrap = document.getElementById('teamTabs');
  wrap.innerHTML = '';
  const names = ['Todas', ...state.teams];
  names.forEach((name) => {
    const btn = document.createElement('button');
    btn.className = 'team-tab' + (name === state.activeTeam ? ' active' : '');
    btn.textContent = name;
    btn.onclick = () => {
      state.activeTeam = name;
      renderReport();
    };
    wrap.appendChild(btn);
  });
}

function renderKpis() {
  const k = computeKpis(state.activeTeam);
  const activity = computeActivity(state.activeTeam);
  const cards = [
    { label: 'Tentativas' + k.estimadoTag, value: fmtInt(k.tentativas) },
    { label: 'Completadas', value: fmtInt(k.completadas), accent: true },
    { label: 'Taxa de atendimento', value: fmtPct(k.pctAtendidas) },
    { label: 'TMA médio', value: k.tma },
    { label: 'Leads totais', value: fmtInt(k.leadsTotal), sub: `${fmtInt(k.leadsDisc)} discadora · ${fmtInt(k.leadsRec)} receptivo`, accent: true },
    { label: 'Taxa de conversão', value: fmtPct(k.conv) },
    { label: 'Contato efetivo', value: fmtInt(k.contatoEfetivo), sub: 'completadas sem qualificação/caiu' },
    { label: 'Receptivo atendidas', value: fmtInt(k.recAtendidas), sub: k.recRecebidas != null ? `de ${fmtInt(k.recRecebidas)} recebidas` : '' },
    { label: 'Tempo ativo total', value: secondsToTime(activity.totalActive), sub: `soma de ${fmtInt(activity.agents.length)} agente(s) no período` },
  ];
  const grid = document.getElementById('kpiGrid');
  grid.innerHTML = cards
    .map(
      (c) => `
    <div class="kpi-card ${c.accent ? 'accent' : ''}">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value">${c.value}</div>
      ${c.sub ? `<div class="kpi-sub">${c.sub}</div>` : ''}
    </div>`
    )
    .join('');
}

function renderQualList() {
  const { disc } = getDataForTeam(state.activeTeam);
  const total = disc.length || 1;
  const counts = {};
  disc.forEach((c) => {
    counts[c.qualificacao] = (counts[c.qualificacao] || 0) + 1;
  });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const el = document.getElementById('qualList');
  el.innerHTML =
    rows
      .map(([qual, count]) => {
        const color = QUAL_COLORS[qual] || DEFAULT_QUAL_COLOR;
        const label = qual.replace(/^LEAD:\s*/, '');
        const pct = ((count / total) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const lead = isLead(qual);
        return `
      <div class="qual-row">
        <span class="qual-dot" style="background:${color}"></span>
        <span class="qual-label${lead ? ' qual-label-lead' : ''}" ${lead ? `style="color:${color}"` : ''}>${label}</span>
        <span class="qual-count">${fmtInt(count)}</span>
        <span class="qual-pctnum">${pct}%</span>
      </div>`;
      })
      .join('') || `<p style="color:#9CA3AF;font-size:13px;">Sem dados para exibir.</p>`;
}

function chartLibMissing(canvasId) {
  if (typeof Chart !== 'undefined') return false;
  const wrap = document.getElementById(canvasId).parentElement;
  wrap.innerHTML = '<p style="color:#9CA3AF;font-size:13px;padding:20px 0;">Não foi possível carregar a biblioteca de gráficos (verifique sua conexão com a internet e recarregue a página).</p>';
  return true;
}

function renderTeamChart() {
  if (chartLibMissing('teamChart')) return;
  const labels = state.teams;
  const data = labels.map((team) => {
    const disc = state.discadoraCalls.filter((c) => c.equipe === team && isLead(c.qualificacao)).length;
    const rec = state.receptivoCalls.filter((c) => c.equipe === team && isLead(c.qualificacao)).length;
    return disc + rec;
  });
  const colors = labels.map((t) => (t === state.activeTeam ? '#E01A43' : '#1F2937'));

  if (state.teamChart) state.teamChart.destroy();
  const ctx = document.getElementById('teamChart').getContext('2d');
  state.teamChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels.map((l) => l.replace('Equipe ', '')), datasets: [{ data, backgroundColor: colors, borderRadius: 6, maxBarThickness: 46 }] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderTeamRanking() {
  const rows = state.teams
    .map((team) => {
      const k = computeKpis(team);
      return { team, completadas: k.completadas, leads: k.leadsTotal, conv: k.conv, tma: k.tma };
    })
    .sort((a, b) => b.conv - a.conv);

  document.getElementById('teamRankingList').innerHTML =
    rows
      .map((r, i) => {
        const pos = i + 1;
        const active = r.team === state.activeTeam ? ' style="border-color:var(--crimson)"' : '';
        return `
      <div class="rank-row" data-medal="${pos <= 3 ? pos : ''}"${active}>
        <span class="rank-pos">${pos}</span>
        <span class="rank-name">${r.team}</span>
        <span class="rank-team">TMA ${r.tma}</span>
        <span class="rank-stats">
          <span><b>${fmtInt(r.completadas)}</b> completadas</span>
          <span><b>${fmtInt(r.leads)}</b> leads</span>
        </span>
        <span class="rank-conv">${fmtPct(r.conv)}</span>
      </div>`;
      })
      .join('') || `<p style="color:#9CA3AF;font-size:13px;">Sem dados de equipe para exibir.</p>`;
}

function renderTrendChart() {
  if (chartLibMissing('trendChart')) return;
  const { disc, rec } = getDataForTeam(state.activeTeam);
  const byDay = {};
  const ensureDay = (key) => (byDay[key] = byDay[key] || { comp: 0, leads: 0 });
  disc.forEach((c) => {
    const d = parseBRDateTime(c.data);
    if (!d) return;
    const day = ensureDay(dateKey(d));
    day.comp += 1;
    if (isLead(c.qualificacao)) day.leads += 1;
  });
  rec.forEach((c) => {
    const d = parseBRDateTime(c.data);
    if (!d || !isLead(c.qualificacao)) return;
    ensureDay(dateKey(d)).leads += 1;
  });

  const days = Object.keys(byDay).sort();
  const labels = days.map((k) => dateKeyToBR(k).slice(0, 5));
  const compData = days.map((k) => byDay[k].comp);
  const leadsData = days.map((k) => byDay[k].leads);

  if (state.trendChart) state.trendChart.destroy();
  const ctx = document.getElementById('trendChart').getContext('2d');
  state.trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Completadas', data: compData, borderColor: '#1F2937', backgroundColor: 'rgba(31,41,55,.08)', fill: true, tension: 0.25, pointRadius: 2 },
        { label: 'Leads', data: leadsData, borderColor: '#E01A43', backgroundColor: 'rgba(224,26,67,.10)', fill: true, tension: 0.25, pointRadius: 2 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 11, font: { size: 11, family: 'Manrope' } } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderAgentTable() {
  const { agents } = getDataForTeam(state.activeTeam);
  const search = document.getElementById('agentSearch').value.trim().toLowerCase();
  let rows = search ? agents.filter((a) => a.login.toLowerCase().includes(search)) : agents.slice();

  const { key, dir } = state.agentSort;
  rows.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'tma') { av = timeToSeconds(a.tma); bv = timeToSeconds(b.tma); }
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return ((av || 0) - (bv || 0)) * dir;
  });

  const tbody = document.querySelector('#agentTable tbody');
  tbody.innerHTML = rows
    .map(
      (a) => `
    <tr>
      <td>${a.login}</td>
      <td>${a.equipe}</td>
      <td>${fmtInt(a.comp)}</td>
      <td>${fmtInt(a.leads)}</td>
      <td>${fmtPct(a.convPct)}</td>
      <td>${a.tma}</td>
      <td>${a.ativo}</td>
      <td>${a.disponivel}</td>
      <td>${fmtPct(a.pausaPct)}</td>
      <td>${fmtPct(a.ociosoPct)}</td>
    </tr>`
    )
    .join('') || `<tr><td colspan="10" style="color:#9CA3AF;">Nenhum agente encontrado para este período.</td></tr>`;
}

function safe(fn, label) {
  try {
    fn();
  } catch (err) {
    console.error(`Falha ao renderizar "${label}":`, err);
  }
}

const MIN_COMP_RANKING = 5;

function renderRanking() {
  const { agents } = getDataForTeam(state.activeTeam);
  document.getElementById('rankingTitle').textContent = `Ranking de eficiência — ${state.activeTeam}`;

  const ranked = agents
    .filter((a) => a.comp >= MIN_COMP_RANKING)
    .sort((a, b) => b.convPct - a.convPct || b.leads - a.leads || b.comp - a.comp)
    .slice(0, 10);

  const el = document.getElementById('rankingList');
  el.innerHTML =
    ranked
      .map((a, i) => {
        const pos = i + 1;
        return `
      <div class="rank-row" data-medal="${pos <= 3 ? pos : ''}">
        <span class="rank-pos">${pos}</span>
        <span class="rank-name">${a.login}</span>
        <span class="rank-team">${a.equipe}</span>
        <span class="rank-stats">
          <span><b>${fmtInt(a.comp)}</b> completadas</span>
          <span><b>${fmtInt(a.leads)}</b> leads</span>
        </span>
        <span class="rank-conv">${fmtPct(a.convPct)}</span>
      </div>`;
      })
      .join('') ||
    `<p style="color:#9CA3AF;font-size:13px;">Nenhum agente com pelo menos ${MIN_COMP_RANKING} chamadas completadas nesta seleção.</p>`;
}

function renderReport() {
  const period = selectedPeriodLabel();
  state.periodLabel = period;
  const printTitle = document.getElementById('printTitle');
  if (printTitle) printTitle.textContent = `${state.activeTeam} — ${period}`;
  const periodTag = document.getElementById('periodTag');
  if (periodTag) periodTag.textContent = period;
  const startEl = document.getElementById('startDateFilter');
  const endEl = document.getElementById('endDateFilter');
  const statusEl = document.getElementById('dateFilterStatus');
  if (startEl && startEl.value !== state.filterStart) startEl.value = state.filterStart;
  if (endEl && endEl.value !== state.filterEnd) endEl.value = state.filterEnd;
  if (statusEl) statusEl.textContent = (state.filterStart || state.filterEnd) ? `Analisando: ${period}` : `Período completo: ${period}`;
  safe(buildTeamTabs, 'abas de equipe');
  safe(renderKpis, 'KPIs');
  safe(renderTrendChart, 'tendência diária');
  safe(renderQualList, 'lista de qualificação');
  safe(renderTeamChart, 'gráfico de leads por equipe');
  safe(renderTeamRanking, 'ranking de equipes');
  safe(renderRanking, 'ranking de eficiência');
  safe(renderAgentTable, 'tabela de agentes');
}

/* ---------- WhatsApp text ---------- */
function buildWhatsAppText() {
  const geral = computeKpis('Todas');
  let txt = `📊 *Relatório Discadora & Receptivo — Lopes Imobiliária*\n`;
  txt += `🗓️ Período: ${state.periodLabel}\n\n`;
  txt += `*Geral*\n`;
  txt += `▪️ Tentativas: ${fmtInt(geral.tentativas)}\n`;
  txt += `▪️ Completadas: ${fmtInt(geral.completadas)}\n`;
  txt += `▪️ TMA médio: ${geral.tma}\n`;
  txt += `▪️ Leads gerados: ${fmtInt(geral.leadsTotal)} (${fmtInt(geral.leadsDisc)} discadora + ${fmtInt(geral.leadsRec)} receptivo)\n`;
  txt += `▪️ Taxa de conversão: ${fmtPct(geral.conv)}\n`;
  txt += `▪️ Receptivo atendidas: ${fmtInt(geral.recAtendidas)} de ${fmtInt(geral.recRecebidas)} recebidas\n`;
  const geralAtv = computeActivity('Todas');
  txt += `▪️ Tempo ativo da equipe: ${secondsToTime(geralAtv.totalActive)} | Disponível p/ discadora: ${secondsToTime(geralAtv.totalAvailable)}\n\n`;
  txt += `*Por equipe*\n`;
  state.teams.forEach((team) => {
    const k = computeKpis(team);
    txt += `\n🔹 *${team}*\n`;
    txt += `   Completadas: ${fmtInt(k.completadas)} | Leads: ${fmtInt(k.leadsTotal)} | Conversão: ${fmtPct(k.conv)} | TMA: ${k.tma}\n`;
  });
  return txt;
}

/* ---------- exportar HTML estático ---------- */
function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchCss() {
  try {
    return await (await fetch('styles.css')).text();
  } catch {
    return '';
  }
}

function pageShell(cssText, periodTag, bodyInner, extraCss = '') {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Lopes — ${state.periodLabel}</title>
<style>${cssText}
.report-screen{padding:0;}
${extraCss}
</style></head>
<body>
<header class="topbar">
  <div class="brand">
    <span class="brand-mark">L</span>
    <div class="brand-text"><strong>Lopes Imobiliária</strong><span>Relatório da Discadora &amp; Receptivo</span></div>
  </div>
  <div class="period-tag">${periodTag}</div>
</header>
<main>${bodyInner}</main>
</body></html>`;
}

// Exportação de UMA equipe específica: não pode levar o gráfico "Leads por
// equipe" junto, porque ele compara todas as equipes — isso vazaria dados de
// equipes que o diretor daquela reunião não deveria ver.
function clearSearchFilters() {
  const agentSearchEl = document.getElementById('agentSearch');
  const saved = { agent: agentSearchEl.value };
  agentSearchEl.value = '';
  return () => {
    agentSearchEl.value = saved.agent;
  };
}

async function exportSingleTeamHtml() {
  const restoreSearch = clearSearchFilters();
  renderReport();

  const original = document.getElementById('reportScreen');
  const clone = original.cloneNode(true);

  clone.querySelector('#teamChartPanel')?.remove();
  clone.querySelector('#teamRankingPanel')?.remove(); // compara todas as equipes — não pode ir numa exportação de equipe única
  clone.querySelector('#dateFilterPanel')?.remove();
  const panelsRow = clone.querySelector('.panels-row');
  if (panelsRow) panelsRow.style.gridTemplateColumns = '1fr';

  // canvas não copia o desenho ao clonar — troca pela imagem já renderizada
  const trendCanvas = document.getElementById('trendChart');
  const trendClone = clone.querySelector('#trendChart');
  if (trendCanvas && trendClone) {
    const img = document.createElement('img');
    img.src = trendCanvas.toDataURL('image/png');
    img.style.maxWidth = '100%';
    trendClone.replaceWith(img);
  }

  clone.querySelectorAll('.toolbar, .team-tabs, input[type=search]').forEach((el) => el.remove());
  clone.hidden = false;

  const cssText = await fetchCss();
  const html = pageShell(cssText, `${state.periodLabel} · ${state.activeTeam}`, clone.innerHTML);
  downloadHtml(html, `relatorio-lopes-${state.activeTeam.replace(/\s+/g, '_')}.html`);

  restoreSearch();
  renderReport();
}

const HTML_PASSWORD_ITERATIONS = 210000;

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function derivePasswordKey(password, salt) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: HTML_PASSWORD_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
}

async function encryptProtectedPayload(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePasswordKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)), iterations: HTML_PASSWORD_ITERATIONS };
}

async function requestHtmlExportPassword() {
  const password = window.prompt('Crie uma senha para proteger o HTML geral do diretor. Mínimo de 6 caracteres:');
  if (password === null) return null;
  if (password.length < 6) {
    showToast('A senha precisa ter pelo menos 6 caracteres.');
    return null;
  }
  const confirmPassword = window.prompt('Digite a senha novamente para confirmar:');
  if (confirmPassword === null) return null;
  if (password !== confirmPassword) {
    showToast('As senhas não conferem. Exportação cancelada.');
    return null;
  }
  return password;
}

function dateKeyFromBR(str) {
  const d = parseBRDateTime(str);
  return d ? dateKey(d) : '';
}

// Monta um dataset compacto (sem nome/telefone de cliente) para embutir no
// HTML exportado — é isso que dá vida às abas de equipe E ao filtro de
// período dentro do arquivo estático, sem precisar de mim de novo.
function buildExportDataset() {
  return {
    disc: state.discadoraCalls.map((c) => ({ d: dateKeyFromBR(c.data), op: c.operadorRaw, eq: c.equipe, q: c.qualificacao })),
    rec: state.receptivoCalls.map((c) => ({ d: dateKeyFromBR(c.data), op: c.operadorRaw, eq: c.equipe, q: c.qualificacao })),
    agentDays: state.agentPerf.map((a) => ({ lg: a.login, d: a.dataDate, eq: a.equipe, comp: a.comp, tma: a.tmaSec, tot: a.totalSec, pau: a.pausaSec, disp: a.dispSec, oci: a.ociosoSec })),
    dailyCamp: state.campanhaRows.map((r) => ({ d: extractRowDate(r), tent: parseNum(r['Tentativas']), comp: parseNum(r['Completadas']), tma: timeToSeconds(r['TMA']) })),
    dailyRec: state.receptivoRows.map((r) => ({ d: extractRowDate(r), receb: parseNum(r['Recebidas']), atend: parseNum(r['Atendidas']) })),
    teams: state.teams,
    period: state.periodLabel,
  };
}

// O <script> que roda DENTRO do HTML exportado: reimplementação enxuta do
// motor de cálculo (equipe + período), sem precisar de nenhum arquivo externo
// além do Chart.js (só usado pro gráfico "Leads por equipe").
function buildExportEngineScript() {
  return `
function timeToSeconds(s){return s||0;}
function secondsToTime(sec){sec=Math.round(sec||0);var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;function p(n){return String(n).padStart(2,'0');}return p(h)+':'+p(m)+':'+p(s);}
function fmtInt(n){return Math.round(n||0).toLocaleString('pt-BR');}
function fmtPct(n){return (n||0).toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})+'%';}
function isLead(q){return /^LEAD/i.test((q||'').trim());}
var QUAL_COLORS=${JSON.stringify(QUAL_COLORS)};
var DEFAULT_QUAL_COLOR='${DEFAULT_QUAL_COLOR}';
var MIN_COMP_RANKING=5;
var activeTeam='Todas', fStart='', fEnd='';
var teamChartInst=null;
var agentSort={key:'comp',dir:-1};

function inRange(d){ if(!d) return false; if(fStart && d<fStart) return false; if(fEnd && d>fEnd) return false; return true; }
function filteredCalls(list, team){ return list.filter(function(c){return inRange(c.d) && (team==='Todas'||c.eq===team);}); }
function filteredAgentDays(team){ return DATA.agentDays.filter(function(a){return inRange(a.d) && (team==='Todas'||a.eq===team);}); }
function sumDaily(list, field){ return list.filter(function(r){return inRange(r.d);}).reduce(function(s,r){return s+(r[field]||0);},0); }

function aggregateAgents(team){
  var rows=filteredAgentDays(team), map={};
  rows.forEach(function(a){
    if(!map[a.lg]) map[a.lg]={login:a.lg,equipe:a.eq,comp:0,tmaWeighted:0,tmaWeight:0,totalSec:0,pausaSec:0,dispSec:0,ociosoSec:0};
    var x=map[a.lg];
    x.comp+=a.comp||0; x.tmaWeighted+=(a.tma||0)*(a.comp||0); x.tmaWeight+=a.comp||0;
    x.totalSec+=a.tot||0; x.pausaSec+=a.pau||0; x.dispSec+=a.disp||0; x.ociosoSec+=a.oci||0;
  });
  var leadsByAgent={};
  filteredCalls(DATA.disc, team).forEach(function(c){ if(isLead(c.q)) leadsByAgent[c.op]=(leadsByAgent[c.op]||0)+1; });
  return Object.values(map).map(function(a){
    a.leads=leadsByAgent[a.login]||0;
    a.convPct=a.comp?(a.leads/a.comp*100):0;
    a.tmaSec=a.tmaWeight?a.tmaWeighted/a.tmaWeight:0;
    a.tma=secondsToTime(a.tmaSec);
    a.ativoSec=Math.max(0,a.totalSec-a.pausaSec);
    a.ativo=secondsToTime(a.ativoSec);
    a.disponivel=secondsToTime(a.dispSec);
    a.pausaPct=a.totalSec?(a.pausaSec/a.totalSec*100):0;
    a.ociosoPct=a.totalSec?(a.ociosoSec/a.totalSec*100):0;
    return a;
  });
}

function computeKpis(team){
  var disc=filteredCalls(DATA.disc, team), rec=filteredCalls(DATA.rec, team), agents=aggregateAgents(team);
  var completadas=disc.length;
  var totalCompAllAgents=aggregateAgents('Todas').reduce(function(s,a){return s+a.comp;},0)||1;
  var compTeamAgents=agents.reduce(function(s,a){return s+a.comp;},0);
  var rangeTentativas=sumDaily(DATA.dailyCamp,'tent');
  var tentativas, tma, estimadoTag='';
  if(team==='Todas'){
    tentativas=rangeTentativas;
    var rows=DATA.dailyCamp.filter(function(r){return inRange(r.d);});
    var wt=rows.reduce(function(s,r){return s+(r.tma||0)*(r.comp||0);},0);
    var w=rows.reduce(function(s,r){return s+(r.comp||0);},0);
    tma=secondsToTime(w?wt/w:0);
  } else {
    tentativas=Math.round(rangeTentativas*(compTeamAgents/totalCompAllAgents));
    var wt2=agents.reduce(function(s,a){return s+a.tmaSec*a.comp;},0);
    tma=secondsToTime(compTeamAgents?wt2/compTeamAgents:0);
    estimadoTag=' (estimado)';
  }
  var pctAtendidas=tentativas?(completadas/tentativas*100):0;
  var semQual=disc.filter(function(c){return c.q==='Chamada sem qualificação';}).length;
  var caiu=disc.filter(function(c){return c.q==='Chamada caiu';}).length;
  var contatoEfetivo=completadas-semQual-caiu;
  var leadsDisc=disc.filter(function(c){return isLead(c.q);}).length;
  var leadsRec=rec.filter(function(c){return isLead(c.q);}).length;
  var leadsTotal=leadsDisc+leadsRec;
  var conv=completadas?(leadsTotal/completadas*100):0;
  var recAtendidas = team==='Todas'? sumDaily(DATA.dailyRec,'atend') : rec.length;
  var recRecebidas = team==='Todas'? sumDaily(DATA.dailyRec,'receb') : null;
  return {tentativas:tentativas,completadas:completadas,pctAtendidas:pctAtendidas,tma:tma,estimadoTag:estimadoTag,contatoEfetivo:contatoEfetivo,leadsDisc:leadsDisc,leadsRec:leadsRec,leadsTotal:leadsTotal,conv:conv,recAtendidas:recAtendidas,recRecebidas:recRecebidas};
}

function buildTeamTabs(){
  var wrap=document.getElementById('teamTabs'); wrap.innerHTML='';
  ['Todas'].concat(DATA.teams).forEach(function(name){
    var btn=document.createElement('button');
    btn.className='team-tab'+(name===activeTeam?' active':'');
    btn.textContent=name;
    btn.onclick=function(){ activeTeam=name; renderAll(); };
    wrap.appendChild(btn);
  });
}

function renderKpis(){
  var k=computeKpis(activeTeam);
  var agents=aggregateAgents(activeTeam);
  var totalActive=agents.reduce(function(s,a){return s+a.ativoSec;},0);
  var cards=[
    {label:'Tentativas'+k.estimadoTag, value:fmtInt(k.tentativas)},
    {label:'Completadas', value:fmtInt(k.completadas), accent:true},
    {label:'Taxa de atendimento', value:fmtPct(k.pctAtendidas)},
    {label:'TMA médio', value:k.tma},
    {label:'Leads totais', value:fmtInt(k.leadsTotal), sub:fmtInt(k.leadsDisc)+' discadora · '+fmtInt(k.leadsRec)+' receptivo', accent:true},
    {label:'Taxa de conversão', value:fmtPct(k.conv)},
    {label:'Contato efetivo', value:fmtInt(k.contatoEfetivo), sub:'completadas sem qualificação/caiu'},
    {label:'Receptivo atendidas', value:fmtInt(k.recAtendidas), sub:(k.recRecebidas!=null?('de '+fmtInt(k.recRecebidas)+' recebidas'):'')},
    {label:'Tempo ativo total', value:secondsToTime(totalActive), sub:'soma de '+fmtInt(agents.length)+' agente(s) no período'},
  ];
  document.getElementById('kpiGrid').innerHTML=cards.map(function(c){
    return '<div class="kpi-card '+(c.accent?'accent':'')+'"><div class="kpi-label">'+c.label+'</div><div class="kpi-value">'+c.value+'</div>'+(c.sub?'<div class="kpi-sub">'+c.sub+'</div>':'')+'</div>';
  }).join('');
}

function renderQualList(){
  var disc=filteredCalls(DATA.disc, activeTeam);
  var total=disc.length||1, counts={};
  disc.forEach(function(c){ counts[c.q]=(counts[c.q]||0)+1; });
  var rows=Object.entries(counts).sort(function(a,b){return b[1]-a[1];});
  document.getElementById('qualList').innerHTML = rows.map(function(row){
    var qual=row[0], count=row[1];
    var color=QUAL_COLORS[qual]||DEFAULT_QUAL_COLOR;
    var label=qual.replace(/^LEAD:\\s*/, '');
    var pct=((count/total)*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
    var lead=isLead(qual);
    return '<div class="qual-row"><span class="qual-dot" style="background:'+color+'"></span><span class="qual-label'+(lead?' qual-label-lead':'')+'"'+(lead?(' style="color:'+color+'"'):'')+'>'+label+'</span><span class="qual-count">'+fmtInt(count)+'</span><span class="qual-pctnum">'+pct+'%</span></div>';
  }).join('') || '<p style="color:#9CA3AF;font-size:13px;">Sem dados para exibir.</p>';
}

function renderTeamBars(){
  var wrap=document.getElementById('teamBars');
  if(!wrap) return;
  var values=DATA.teams.map(function(team){
    var d=filteredCalls(DATA.disc, team).filter(function(c){return isLead(c.q);}).length;
    var r=filteredCalls(DATA.rec, team).filter(function(c){return isLead(c.q);}).length;
    return {team:team, value:d+r};
  });
  var max=Math.max.apply(null, values.map(function(v){return v.value;}).concat([1]));
  wrap.innerHTML = values.map(function(v){
    var pct=Math.round((v.value/max)*100);
    var isActive=v.team===activeTeam;
    return '<div class="team-bar-row"><span class="team-bar-label">'+v.team.replace('Equipe ','')+'</span><div class="team-bar-track"><div class="team-bar-fill" style="width:'+pct+'%;background:'+(isActive?'#E01A43':'#1F2937')+'"></div></div><span class="team-bar-value">'+fmtInt(v.value)+'</span></div>';
  }).join('');
}

function renderTeamRanking(){
  var wrap=document.getElementById('teamRankingList');
  if(!wrap) return;
  var rows=DATA.teams.map(function(team){
    var k=computeKpis(team);
    return {team:team, completadas:k.completadas, leads:k.leadsTotal, conv:k.conv, tma:k.tma};
  }).sort(function(a,b){ return b.conv-a.conv; });
  wrap.innerHTML = rows.map(function(r,i){
    var pos=i+1;
    var active = r.team===activeTeam ? ' style="border-color:var(--crimson)"' : '';
    return '<div class="rank-row" data-medal="'+(pos<=3?pos:'')+'"'+active+'><span class="rank-pos">'+pos+'</span><span class="rank-name">'+r.team+'</span><span class="rank-team">TMA '+r.tma+'</span><span class="rank-stats"><span><b>'+fmtInt(r.completadas)+'</b> completadas</span><span><b>'+fmtInt(r.leads)+'</b> leads</span></span><span class="rank-conv">'+fmtPct(r.conv)+'</span></div>';
  }).join('') || '<p style="color:#9CA3AF;font-size:13px;">Sem dados de equipe para exibir.</p>';
}

var trendChartInst=null;
function renderTrendChart(){
  var canvas=document.getElementById('trendChart');
  if(!canvas) return;
  var disc=filteredCalls(DATA.disc, activeTeam), rec=filteredCalls(DATA.rec, activeTeam);
  var byDay={};
  function ensure(k){ if(!byDay[k]) byDay[k]={comp:0,leads:0}; return byDay[k]; }
  disc.forEach(function(c){ var d=ensure(c.d); d.comp+=1; if(isLead(c.q)) d.leads+=1; });
  rec.forEach(function(c){ if(isLead(c.q)) ensure(c.d).leads+=1; });
  var days=Object.keys(byDay).sort();
  var labels=days.map(function(k){ return k.slice(8,10)+'/'+k.slice(5,7); });
  var comp=days.map(function(k){return byDay[k].comp;});
  var leads=days.map(function(k){return byDay[k].leads;});
  if(trendChartInst) trendChartInst.destroy();
  var ctx=canvas.getContext('2d');
  trendChartInst=new Chart(ctx,{
    type:'line',
    data:{ labels:labels, datasets:[
      {label:'Completadas', data:comp, borderColor:'#1F2937', backgroundColor:'rgba(31,41,55,.08)', fill:true, tension:0.25, pointRadius:2},
      {label:'Leads', data:leads, borderColor:'#E01A43', backgroundColor:'rgba(224,26,67,.10)', fill:true, tension:0.25, pointRadius:2}
    ]},
    options:{ maintainAspectRatio:false, plugins:{legend:{position:'top', labels:{boxWidth:11, font:{size:11, family:'Manrope'}}}}, scales:{y:{beginAtZero:true, ticks:{precision:0}}} }
  });
}

function renderRanking(){
  var agents=aggregateAgents(activeTeam);
  document.getElementById('rankingTitle').textContent='Ranking de eficiência — '+activeTeam;
  var ranked=agents.filter(function(a){return a.comp>=MIN_COMP_RANKING;})
    .sort(function(a,b){return (b.convPct-a.convPct)||(b.leads-a.leads)||(b.comp-a.comp);})
    .slice(0,10);
  document.getElementById('rankingList').innerHTML = ranked.map(function(a,i){
    var pos=i+1;
    return '<div class="rank-row" data-medal="'+(pos<=3?pos:'')+'"><span class="rank-pos">'+pos+'</span><span class="rank-name">'+a.login+'</span><span class="rank-team">'+a.equipe+'</span><span class="rank-stats"><span><b>'+fmtInt(a.comp)+'</b> completadas</span><span><b>'+fmtInt(a.leads)+'</b> leads</span></span><span class="rank-conv">'+fmtPct(a.convPct)+'</span></div>';
  }).join('') || '<p style="color:#9CA3AF;font-size:13px;">Nenhum agente com pelo menos '+MIN_COMP_RANKING+' chamadas completadas nesta seleção.</p>';
}

function renderAgentTable(){
  var agents=aggregateAgents(activeTeam);
  var search=(document.getElementById('agentSearch').value||'').trim().toLowerCase();
  var rows=search? agents.filter(function(a){return a.login.toLowerCase().indexOf(search)>=0;}) : agents.slice();
  var key=agentSort.key, dir=agentSort.dir;
  rows.sort(function(a,b){
    var av=a[key], bv=b[key];
    if(key==='tma'){ av=a.tmaSec; bv=b.tmaSec; }
    if(typeof av==='string') return av.localeCompare(bv)*dir;
    return ((av||0)-(bv||0))*dir;
  });
  document.querySelector('#agentTable tbody').innerHTML = rows.map(function(a){
    return '<tr><td>'+a.login+'</td><td>'+a.equipe+'</td><td>'+fmtInt(a.comp)+'</td><td>'+fmtInt(a.leads)+'</td><td>'+fmtPct(a.convPct)+'</td><td>'+a.tma+'</td><td>'+a.ativo+'</td><td>'+a.disponivel+'</td><td>'+fmtPct(a.pausaPct)+'</td><td>'+fmtPct(a.ociosoPct)+'</td></tr>';
  }).join('') || '<tr><td colspan="10" style="color:#9CA3AF;">Nenhum agente encontrado para este período.</td></tr>';
}

function updateDateStatus(){
  var statusEl=document.getElementById('dateFilterStatus');
  var label = (fStart||fEnd) ? ('Analisando: '+(fStart?fStart.split('-').reverse().join('/'):'início')+' – '+(fEnd?fEnd.split('-').reverse().join('/'):'fim')) : ('Período completo: '+DATA.period);
  if(statusEl) statusEl.textContent=label;
  document.getElementById('periodTagExp').textContent = (fStart||fEnd) ? label.replace('Analisando: ','') : DATA.period;
}

function renderAll(){
  buildTeamTabs();
  renderKpis();
  renderTrendChart();
  renderQualList();
  renderTeamBars();
  renderTeamRanking();
  renderRanking();
  renderAgentTable();
  updateDateStatus();
}

document.getElementById('agentSearch').addEventListener('input', renderAgentTable);
document.querySelectorAll('#agentTable thead th').forEach(function(th){
  th.addEventListener('click', function(){
    var key=th.getAttribute('data-sort');
    if(agentSort.key===key) agentSort.dir*=-1; else agentSort={key:key,dir:-1};
    renderAgentTable();
  });
});
var startEl=document.getElementById('startDateFilter'), endEl=document.getElementById('endDateFilter');
function applyDateFilter(){
  var s=startEl.value||'', e=endEl.value||'';
  if(s && e && s>e){ alert('A data inicial não pode ser maior que a data final.'); return; }
  fStart=s; fEnd=e; renderAll();
}
startEl.addEventListener('change', applyDateFilter);
endEl.addEventListener('change', applyDateFilter);
document.getElementById('clearDateFilterBtn').addEventListener('click', function(){
  startEl.value=''; endEl.value=''; fStart=''; fEnd=''; renderAll();
});
document.getElementById('printBtn').addEventListener('click', function(){ window.print(); });
renderAll();
`;
}

async function buildProtectedInteractiveHtml({ cssText, dataset, password }) {
  const payload = await encryptProtectedPayload(dataset, password);
  const extraCss = `
.team-bar-row{display:flex;align-items:center;gap:10px;padding:7px 0;}
.team-bar-label{width:80px;font-size:13px;color:var(--graphite-soft);flex-shrink:0;}
.team-bar-track{flex:1;background:#F1EFEE;border-radius:6px;height:16px;overflow:hidden;}
.team-bar-fill{height:100%;border-radius:6px;}
.team-bar-value{width:40px;text-align:right;font-weight:700;font-size:13px;}
.protected-screen{min-height:72vh;display:flex;align-items:center;justify-content:center;padding:24px;}
.protected-card{width:min(460px,100%);background:#fff;border:1px solid var(--line);border-radius:14px;padding:30px;box-shadow:0 18px 50px rgba(31,41,55,.10);text-align:center;}
.protected-card .lock-icon{width:54px;height:54px;border-radius:14px;background:#FFF1F4;color:var(--crimson);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:26px;}
.protected-card h1{margin:0 0 8px;font-size:21px;}
.protected-card p{margin:0 0 20px;color:var(--graphite-soft);font-size:13.5px;line-height:1.5;}
.protected-form{display:flex;gap:8px;}
.protected-form input{flex:1;border:1px solid var(--line);border-radius:8px;padding:11px 12px;font:inherit;outline:none;}
.protected-form input:focus{border-color:var(--crimson);box-shadow:0 0 0 3px rgba(224,26,67,.10);}
.protected-form button{border:0;border-radius:8px;padding:11px 15px;background:var(--crimson);color:#fff;font:inherit;font-weight:700;cursor:pointer;}
.protected-error{min-height:18px;margin-top:10px;color:var(--crimson-dark);font-size:12.5px;font-weight:600;}
.report-screen{padding:0;}`;

  const bodyInner = `
<div class="toolbar">
  <div class="team-tabs" id="teamTabs"></div>
  <div class="toolbar-actions"><button id="printBtn" class="btn-ghost" type="button">Imprimir / Salvar PDF</button></div>
</div>
<div class="date-filter panel" id="dateFilterPanel">
  <div class="panel-head">
    <div><h3>Filtro de período</h3><span class="table-note" style="padding:0;">Selecione um intervalo para comparar dias ou analisar uma data específica.</span></div>
    <button id="clearDateFilterBtn" class="btn-ghost" type="button">Mostrar período completo</button>
  </div>
  <div class="date-filter-fields">
    <label>Data inicial<input type="date" id="startDateFilter"></label>
    <label>Data final<input type="date" id="endDateFilter"></label>
    <span id="dateFilterStatus" class="date-filter-status"></span>
  </div>
</div>
<div class="kpi-grid" id="kpiGrid"></div>
<div class="panel"><h3>Tendência diária</h3><div class="chart-wrap"><canvas id="trendChart"></canvas></div></div>
<div class="panels-row">
  <div class="panel"><h3>Qualificação das chamadas completadas</h3><div id="qualList" class="qual-list"></div></div>
  <div class="panel"><h3>Leads por equipe</h3><div id="teamBars"></div></div>
</div>
<div class="panel">
  <div class="panel-head"><h3>Ranking de equipes</h3><span class="table-note" style="padding:0;">ordenado por % de conversão</span></div>
  <div id="teamRankingList" class="ranking-list"></div>
</div>
<div class="panel">
  <div class="panel-head"><h3 id="rankingTitle">Ranking de eficiência</h3><span class="table-note" style="padding:0;">mínimo 5 chamadas completadas · ordenado por % de conversão</span></div>
  <div id="rankingList" class="ranking-list"></div>
</div>
<div class="panel">
  <div class="panel-head"><h3>Desempenho por agente</h3><input type="search" id="agentSearch" placeholder="Buscar agente..."></div>
  <div class="table-scroll"><table id="agentTable"><thead><tr><th data-sort="login">Agente</th><th data-sort="equipe">Equipe</th><th data-sort="comp">Completadas</th><th data-sort="leads">Leads</th><th data-sort="convPct">% Conversão</th><th data-sort="tma">TMA</th><th data-sort="ativoSec">Tempo ativo</th><th data-sort="dispSec">Disponível</th><th data-sort="pausaPct">% Pausa</th><th data-sort="ociosoPct">% Ocioso</th></tr></thead><tbody></tbody></table></div>
</div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório Lopes — Protegido</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>${cssText}
${extraCss}
</style></head><body>
<header class="topbar"><div class="brand"><span class="brand-mark">L</span><div class="brand-text"><strong>Lopes Imobiliária</strong><span>Relatório da Discadora &amp; Receptivo</span></div></div><div class="period-tag" id="periodTagExp"></div></header>
<section id="protectedScreen" class="protected-screen"><div class="protected-card"><div class="lock-icon">🔒</div><h1>Relatório protegido</h1><p>Este arquivo contém o consolidado geral e os dados de todas as equipes, com filtro de equipe e de período. Digite a senha definida na exportação para abrir.</p><form id="unlockForm" class="protected-form"><input id="unlockPassword" type="password" autocomplete="off" placeholder="Senha do relatório" autofocus><button type="submit">Abrir</button></form><div id="unlockError" class="protected-error"></div></div></section>
<main id="protectedContent" hidden>${bodyInner}</main>
<script>
const ENCRYPTED=${JSON.stringify(payload)};
let DATA=null;
const unlockedPayload = async (password) => {
  try {
    const salt = Uint8Array.from(atob(ENCRYPTED.salt), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ENCRYPTED.iv), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(ENCRYPTED.data), c => c.charCodeAt(0));
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ENCRYPTED.iterations,hash:'SHA-256'}, material, {name:'AES-GCM',length:256}, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv}, key, data);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch { return null; }
};
document.getElementById('unlockForm').addEventListener('submit', async function(e){
  e.preventDefault();
  const pwd=document.getElementById('unlockPassword').value;
  const err=document.getElementById('unlockError');
  err.textContent='';
  if(!pwd){err.textContent='Digite a senha.';return;}
  const payload=await unlockedPayload(pwd);
  if(!payload){err.textContent='Senha incorreta ou arquivo inválido.';return;}
  DATA=payload;
  document.getElementById('protectedScreen').hidden=true;
  const content=document.getElementById('protectedContent');
  content.hidden=false;
  ${buildExportEngineScript()}
});
</script></body></html>`;
}

// Exportação com "Todas" selecionado: o diretor recebe UM arquivo com abas de
// equipe E filtro de período funcionando de verdade, tudo já embutido no
// arquivo — sem precisar de internet nem de mim de novo (Chart.js é a única
// exceção, mas o resto roda 100% offline).
async function exportInteractiveHtml() {
  const password = await requestHtmlExportPassword();
  if (!password) return;

  const dataset = buildExportDataset();
  const cssText = await fetchCss();
  const html = await buildProtectedInteractiveHtml({ cssText, dataset, password });
  downloadHtml(html, `index.html`);
}

async function exportHtmlSnapshot() {
  if (state.activeTeam === 'Todas') {
    await exportInteractiveHtml();
  } else {
    await exportSingleTeamHtml();
  }
}

/* ---------- wiring ---------- */
window.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); })
  );
  dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));

  document.getElementById('generateBtn').addEventListener('click', () => {
    if (!state.campanhaTotais || !state.receptivoTotais) {
      showToast('Faltam dados obrigatórios nos arquivos enviados.');
      return;
    }
    finalizeData();
    state.periodLabel = computePeriod();
    const allDateKeys = [...state.discadoraCalls, ...state.receptivoCalls].map((c) => { const d = parseBRDateTime(c.data); return d ? dateKey(d) : ''; }).filter(Boolean).sort();
    state.filterStart = '';
    state.filterEnd = '';
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    if (allDateKeys.length) { startDateFilter.min = allDateKeys[0]; startDateFilter.max = allDateKeys[allDateKeys.length - 1]; endDateFilter.min = allDateKeys[0]; endDateFilter.max = allDateKeys[allDateKeys.length - 1]; }
    document.getElementById('periodTag').textContent = state.periodLabel;
    document.getElementById('periodTag').hidden = false;
    document.getElementById('uploadScreen').hidden = true;
    document.getElementById('reportScreen').hidden = false;
    renderReport();
  });

  document.getElementById('agentSearch').addEventListener('input', renderAgentTable);
  const startDateFilter = document.getElementById('startDateFilter');
  const endDateFilter = document.getElementById('endDateFilter');
  const applyDateFilter = () => {
    const start = startDateFilter.value || '';
    const end = endDateFilter.value || '';
    if (start && end && start > end) {
      showToast('A data inicial não pode ser maior que a data final.');
      return;
    }
    state.filterStart = start;
    state.filterEnd = end;
    state.agentSort = { key: 'comp', dir: -1 };
    renderReport();
  };
  startDateFilter.addEventListener('change', applyDateFilter);
  endDateFilter.addEventListener('change', applyDateFilter);
  document.getElementById('clearDateFilterBtn').addEventListener('click', () => {
    startDateFilter.value = '';
    endDateFilter.value = '';
    state.filterStart = '';
    state.filterEnd = '';
    renderReport();
  });


  document.querySelectorAll('#agentTable thead th').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.agentSort.key === key) state.agentSort.dir *= -1;
      else state.agentSort = { key, dir: -1 };
      renderAgentTable();
    });
  });

  document.getElementById('copyWhatsBtn').addEventListener('click', async () => {
    const txt = buildWhatsAppText();
    try {
      await navigator.clipboard.writeText(txt);
      showToast('Texto copiado! Cole no WhatsApp.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Texto copiado! Cole no WhatsApp.');
    }
  });

  document.getElementById('exportHtmlBtn').addEventListener('click', exportHtmlSnapshot);
  document.getElementById('exportPdfBtn').addEventListener('click', () => window.print());

  document.getElementById('newReportBtn').addEventListener('click', () => location.reload());
});
