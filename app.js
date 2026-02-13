// CONFIGURAÇÃO SUPABASE
// ATENÇÃO: Substitua 'SUA_KEY_ANON_AQUI' pela sua chave ANON real do projeto de teste.
const SUPABASE_URL = 'https://aqxccienrpqhwdqzusnh.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxeGNjaWVucnBxaHdkcXp1c25oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDQ1MzgsImV4cCI6MjA4NjUyMDUzOH0.lV1TniRFOO3vSYc8Qze9ksNBSl7B7IXXyQNyvMWDWuE'; 

const { createClient } = supabase;
let sb, user = null;

try {
    sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            persistSession: true, 
            autoRefreshToken: true
        }
    });
} catch (error) {
    console.error("Erro ao inicializar Supabase:", error);
}

// ESTADO GLOBAL
let allCidadaos = [], allDemandas = [], allLeaders = [];
const CITADAOS_PER_PAGE = 12;
let currentCidadaosOffset = 0;
let currentFilteredCidadaos = [];
let currentEditingId = null;
let viewingDemandaId = null;
let itemToDelete = { id: null, type: null };
let map = null, markers = [];
let charts = {};
let appInitialized = false;

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    initAuthListener();
    setupBasicEvents();
});

function initAuthListener() {
    sb.auth.onAuthStateChange((event, session) => {
        if (session) {
            user = session.user;
            document.getElementById('login-page').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            if (!appInitialized) {
                initMainSystem();
            }
        } else {
            user = null;
            document.getElementById('login-page').classList.remove('hidden');
            document.getElementById('app-container').classList.add('hidden');
            appInitialized = false;
        }
    });
}

async function initMainSystem() {
    if (appInitialized) return;
    setupSystemEvents();
    await loadDataFromSupabase();
    switchPage('dashboard-page');
    appInitialized = true;
}

async function loadDataFromSupabase() {
    try {
        const { data: cData, error: cErr } = await sb.from('cidadaos').select('*').order('name');
        if (cErr) throw cErr;
        const { data: dData, error: dErr } = await sb.from('demandas').select('*').order('created_at', { ascending: false });
        if (dErr) throw dErr;
        
        allCidadaos = cData || [];
        allDemandas = dData || [];
        allLeaders = allCidadaos.filter(c => c.type === 'Liderança');
        updateAllUIs();
    } catch (e) { 
        showToast("Erro ao carregar dados: " + e.message, 'error'); 
    }
}

function updateAllUIs() {
    updateDashboard();
    renderCidadaos();
    renderDemandasList();
    fillLeaderSelects();
    fillBairroFilters();
}

// GESTÃO DE INTERFACE E EVENTOS
function setupBasicEvents() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.onsubmit = handleLogin;
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email-address').value;
    const pass = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { 
        alert("Erro de Login: " + error.message); 
        btn.disabled = false; 
        btn.innerHTML = 'Entrar'; 
    }
}

function setupSystemEvents() {
    // Navegação e Logout
    document.getElementById('logout-btn').onclick = async () => {
        await sb.auth.signOut();
        window.location.reload();
    };
    document.getElementById('sidebar-nav').onclick = (e) => {
        const a = e.target.closest('a');
        if (a) { 
            e.preventDefault(); 
            switchPage(a.getAttribute('href').substring(1) + '-page'); 
        }
    };

    // Filtros e Pesquisa
    document.getElementById('search-input').oninput = renderCidadaos;
    document.querySelectorAll('#cidadaos-page select').forEach(s => s.onchange = renderCidadaos);
    document.getElementById('btn-limpar-filtros').onclick = clearCidadaoFilters;
    
    // Botões de Ação Principais
    document.getElementById('btn-novo-cidadao').onclick = () => openCidadaoModal();
    document.getElementById('btn-mapa-geral').onclick = () => openMap();
    document.getElementById('btn-load-more').onclick = renderMoreCidadaos;
    document.getElementById('btn-nova-demanda-geral').onclick = () => openDemandaModal();
    document.getElementById('generate-report-btn').onclick = () => window.print();
    document.getElementById('view-map-btn').onclick = () => openMap();

    // Formulários
    document.getElementById('form-cidadao').onsubmit = handleCidadaoSave;
    document.getElementById('c-cep').onblur = fetchAddressFromCEP;
    document.getElementById('c-sons').oninput = () => updateKidsFields('filho');
    document.getElementById('c-daughters').oninput = () => updateKidsFields('filha');
    
    // Filtros de Demanda
    document.getElementById('df-status').onchange = renderDemandasList;
    document.getElementById('df-lider').onchange = renderDemandasList;
    
    // Detalhes da Demanda
    document.getElementById('btn-add-note').onclick = handleAddNote;
    document.getElementById('btn-del-demanda').onclick = () => requestDelete(viewingDemandaId, 'demanda');
    
    // Confirmação
    document.getElementById('btn-conf-delete').onclick = processDeletion;
    document.getElementById('cancel-delete-btn').onclick = () => closeModal('modal-confirm');

    // Fechar Modais
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => {
            const modal = btn.closest('[id^="modal-"]');
            if (modal) modal.classList.add('hidden');
        };
    });
}

function switchPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const p = document.getElementById(id);
    if(p) { p.classList.remove('hidden'); p.classList.add('flex', 'flex-col'); }
    
    document.querySelectorAll('#sidebar-nav a').forEach(a => {
        a.classList.remove('nav-link-active', 'bg-slate-900');
        if(a.getAttribute('href') === '#' + id.replace('-page', '')) {
            a.classList.add('nav-link-active');
        }
    });
    
    if (id === 'dashboard-page') updateDashboard();
}

// DASHBOARD
function updateDashboard() {
    document.getElementById('dash-total-cidadaos').innerText = allCidadaos.length;
    document.getElementById('dash-total-demandas').innerText = allDemandas.length;
    document.getElementById('dash-pendentes').innerText = allDemandas.filter(d => d.status === 'pending').length;
    document.getElementById('dash-concluidas').innerText = allDemandas.filter(d => d.status === 'completed').length;
    
    initDashboardCharts();
    renderBirthdayList();
    renderRecentDemandsList();
}

function initDashboardCharts() {
    // Destruir gráficos anteriores se existirem
    Object.values(charts).forEach(c => { if(c) c.destroy(); });
    
    // Tipos
    const tMap = allCidadaos.reduce((a,c) => { a[c.type] = (a[c.type]||0)+1; return a; }, {});
    const ctxTipo = document.getElementById('chart-tipos');
    if(ctxTipo) {
        charts.tipos = new Chart(ctxTipo, { type: 'pie', data: { labels: Object.keys(tMap), datasets: [{ data: Object.values(tMap), backgroundColor: ['#3b82f6','#8b5cf6','#10b981','#f59e0b'] }] }, options: { maintainAspectRatio: false }});
    }
    
    // Status
    const sMap = allDemandas.reduce((a,d) => { a[d.status] = (a[d.status]||0)+1; return a; }, {});
    const ctxStatus = document.getElementById('chart-status');
    if(ctxStatus) {
        charts.status = new Chart(ctxStatus, { type: 'doughnut', data: { labels: ['Pendente', 'Em Andamento', 'Concluída'], datasets: [{ data: [sMap.pending||0, sMap.inprogress||0, sMap.completed||0], backgroundColor: ['#f59e0b','#3b82f6','#10b981'] }] }, options: { maintainAspectRatio: false }});
    }

    // Bairros
    const bMap = allCidadaos.reduce((a,c) => { const b = c.bairro||'N/A'; a[b] = (a[b]||0)+1; return a; }, {});
    const sortedB = Object.entries(bMap).sort((a,b) => b[1]-a[1]).slice(0, 10);
    const ctxBairros = document.getElementById('chart-bairros');
    if(ctxBairros) {
        charts.bairros = new Chart(ctxBairros, { type: 'bar', data: { labels: sortedB.map(i => i[0]), datasets: [{ label: 'Cidadãos', data: sortedB.map(i => i[1]), backgroundColor: '#3b82f6' }] }, options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { ticks: { precision: 0 }}}}});
    }
    
    // Sexo e Idade (implementar similarmente se os elementos existirem)
    const sCtx = document.getElementById('chart-sexo');
    if (sCtx) {
        const sCounts = allCidadaos.reduce((a,c) => { const s = c.sexo || 'N/A'; a[s] = (a[s] || 0) + 1; return a; }, {});
        charts.sexo = new Chart(sCtx, { type: 'pie', data: { labels: Object.keys(sCounts), datasets: [{ data: Object.values(sCounts), backgroundColor: ['#3B82F6', '#EC4899', '#F59E0B', '#6B7280'] }] }, options: { maintainAspectRatio: false } });
    }
    
    const iCtx = document.getElementById('chart-idade');
    if (iCtx) {
        const faixas = { '0-17': 0, '18-25': 0, '26-35': 0, '36-50': 0, '51-65': 0, '66+': 0 };
        allCidadaos.forEach(c => { const f = getFaixaEtaria(c.dob); if(faixas[f] !== undefined) faixas[f]++; });
        charts.idade = new Chart(iCtx, { type: 'bar', data: { labels: Object.keys(faixas), datasets: [{ label: 'Idade', data: Object.values(faixas), backgroundColor: '#8B5CF6' }] }, options: { maintainAspectRatio: false } });
    }
}

// CIDADÃOS
function renderCidadaos() {
    const term = document.getElementById('search-input').value.toLowerCase();
    const type = document.getElementById('f-tipo').value;
    const bairro = document.getElementById('f-bairro').value;
    const sexo = document.getElementById('f-sexo').value;

    currentFilteredCidadaos = allCidadaos.filter(c => {
        const matchSearch = !term || c.name.toLowerCase().includes(term) || (c.cpf && c.cpf.includes(term));
        const matchType = !type || c.type === type;
        const matchBairro = !bairro || c.bairro === bairro;
        const matchSexo = !sexo || c.sexo === sexo;
        return matchSearch && matchType && matchBairro && matchSexo;
    });

    currentCidadaosOffset = 0;
    const grid = document.getElementById('grid-cidadaos');
    if(grid) grid.innerHTML = '';
    renderMoreCidadaos();
}

function renderMoreCidadaos() {
    const grid = document.getElementById('grid-cidadaos');
    if(!grid) return;
    
    const batch = currentFilteredCidadaos.slice(currentCidadaosOffset, currentCidadaosOffset + CITADAOS_PER_PAGE);
    
    batch.forEach(c => {
        const card = document.createElement('div');
        card.className = 'bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-all';
        const init = getInitials(c.name);
        card.innerHTML = `
            <div class="flex items-center gap-4 mb-4">
                <div class="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-inner">${init}</div>
                <div class="overflow-hidden flex-1"><h3 class="font-bold text-slate-800 truncate">${c.name}</h3><span class="text-[10px] uppercase font-black text-slate-400">${c.type}</span></div>
            </div>
            <div class="flex-1 space-y-2 text-xs text-slate-500">
                <p class="truncate">📍 ${c.bairro || 'N/A'}</p><p>📞 ${c.phone || 'N/A'}</p>
            </div>
            <div class="mt-4 pt-4 border-t flex gap-2">
                <button class="btn-detalhes flex-1 py-2 bg-slate-50 hover:bg-slate-100 rounded text-[10px] font-bold uppercase text-slate-600 transition-all">Ver</button>
                <button class="btn-editar flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded text-[10px] font-bold uppercase text-white transition-all">Editar</button>
                <button class="btn-excluir bg-red-50 hover:bg-red-500 hover:text-white text-red-500 p-2 rounded transition-all"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
            </div>`;
        
        // Adicionando eventos manualmente para evitar problemas de escopo
        card.querySelector('.btn-detalhes').onclick = () => openDetails(c.id);
        card.querySelector('.btn-editar').onclick = () => openCidadaoModal(c.id);
        card.querySelector('.btn-excluir').onclick = () => requestDelete(c.id, 'cidadao');
        
        grid.appendChild(card);
    });

    currentCidadaosOffset += batch.length;
    const more = document.getElementById('load-more-container');
    if(more) more.classList.toggle('hidden', currentCidadaosOffset >= currentFilteredCidadaos.length);
}

async function handleCidadaoSave(e) {
    e.preventDefault();
    const btn = document.getElementById('save-btn');
    btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
    
    try {
        const log = document.getElementById('c-logra').value;
        const bai = document.getElementById('c-bairro').value;
        let lat = null, lon = null;
        if (log && bai) {
            try {
                const gRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(log + ', ' + bai + ', Macapá')}&format=json&limit=1`);
                const gData = await gRes.json();
                if (gData.length) { lat = parseFloat(gData[0].lat); lon = parseFloat(gData[0].lon); }
            } catch(geoErr) { console.log("Erro geo", geoErr); }
        }

        const payload = {
            name: document.getElementById('c-name').value, cpf: document.getElementById('c-cpf').value,
            rg: document.getElementById('c-rg').value, dob: document.getElementById('c-dob').value || null,
            sexo: document.getElementById('c-sexo').value, type: document.getElementById('c-tipo').value,
            phone: document.getElementById('c-phone').value, whatsapp: document.getElementById('c-wpp').checked,
            email: document.getElementById('c-email').value, cep: document.getElementById('c-cep').value,
            bairro: document.getElementById('c-bairro').value, logradouro: document.getElementById('c-logra').value,
            numero: document.getElementById('c-num').value, leader: document.getElementById('c-lider').value || null,
            sons: parseInt(document.getElementById('c-sons').value)||0,
            daughters: parseInt(document.getElementById('c-daughters').value)||0,
            latitude: lat, longitude: lon, user_id: user.id
        };

        const { error } = currentEditingId ? await sb.from('cidadaos').update(payload).eq('id', currentEditingId) : await sb.from('cidadaos').insert(payload);
        if (error) throw error;
        
        showToast("Registo guardado!", "success");
        closeModal('modal-cidadao');
        await loadDataFromSupabase();
    } catch (e) { showToast(e.message, "error"); }
    finally { btn.disabled = false; btn.innerHTML = 'Salvar Registo'; }
}

// AUXILIARES
async function fetchAddressFromCEP() {
    const cep = document.getElementById('c-cep').value.replace(/\D/g, '');
    if (cep.length === 8) {
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await res.json();
            if (!data.erro) {
                document.getElementById('c-logra').value = data.logradouro;
                document.getElementById('c-bairro').value = data.bairro;
                document.getElementById('c-num').focus();
            }
        } catch(e) { console.log("Erro CEP", e); }
    }
}

function updateKidsFields(type) {
    const val = parseInt(document.getElementById('c-' + (type === 'filho' ? 'sons' : 'daughters')).value) || 0;
    const containerId = 'cont-' + type;
    let cont = document.getElementById(containerId);
    if (!cont) { cont = document.createElement('div'); cont.id = containerId; document.getElementById('filhos-container').appendChild(cont); }
    cont.innerHTML = val > 0 ? `<p class="text-[10px] font-bold text-slate-400 mt-2 uppercase">${type}s</p>` : '';
    for (let i = 0; i < val; i++) cont.innerHTML += `<div class="grid grid-cols-2 gap-2 mt-1"><input type="text" placeholder="Nome" class="p-2 border rounded text-xs"><input type="date" class="p-2 border rounded text-xs"></div>`;
}

function clearCidadaoFilters() {
    document.getElementById('search-input').value = '';
    document.querySelectorAll('#cidadaos-page select').forEach(s => s.value = '');
    renderCidadaos();
}

function openMap(toPlot = null) {
    document.getElementById('modal-mapa').classList.remove('hidden');
    if (!map) {
        map = L.map('map').setView([-0.039, -51.181], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    }
    markers.forEach(m => m.remove()); markers = [];
    const list = toPlot ? [toPlot] : allCidadaos;
    const bounds = [];
    list.forEach(c => {
        if (c.latitude && c.longitude) {
            const m = L.marker([c.latitude, c.longitude]).addTo(map).bindPopup(`<b>${c.name}</b><br>${c.bairro}`);
            markers.push(m); bounds.push([c.latitude, c.longitude]);
        }
    });
    setTimeout(() => map.invalidateSize(), 200);
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
}

// DEMANDAS
function renderDemandasList() {
    const list = document.getElementById('list-all-demandas');
    const st = document.getElementById('df-status').value;
    const ld = document.getElementById('df-lider').value;

    const filtered = allDemandas.filter(d => {
        const s = allCidadaos.find(c => c.id === d.cidadao_id);
        const matchSt = !st || d.status === st;
        const matchLd = !ld || (s && s.leader === ld);
        return matchSt && matchLd;
    });

    list.innerHTML = filtered.length ? '' : '<p class="text-center text-slate-400 py-10">Nenhuma demanda encontrada com estes filtros.</p>';
    filtered.forEach(d => {
        const info = getStatusInfo(d.status);
        const s = allCidadaos.find(c => c.id === d.cidadao_id);
        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center hover:border-blue-300 transition-all cursor-pointer';
        div.innerHTML = `<div><p class="font-bold text-slate-800">${d.title}</p><p class="text-xs text-slate-500">Solicitante: ${s?s.name:'Desconhecido'}</p></div><span class="${info.classes}">${info.text}</span>`;
        div.onclick = () => openDemandaDetailsModal(d.id);
        list.appendChild(div);
    });
}

function openDemandaModal() {
    const sel = document.getElementById('demanda-cidadao-select');
    if(sel) {
        sel.innerHTML = allCidadaos.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    document.getElementById('demanda-form').reset();
    document.getElementById('modal-demanda').classList.remove('hidden');
}

// ... FUNÇÕES DE DETALHES DEMANDA, STATUS, NOTAS e EXCLUSÃO ...
// (Para economizar espaço aqui, a lógica é idêntica à do ficheiro anterior, mas garantindo que as chamadas de função estão corretas)

async function openDemandaDetailsModal(id) {
    viewingDemandaId = id;
    const d = allDemandas.find(x => x.id === id);
    const s = allCidadaos.find(c => c.id === d.cidadao_id);
    document.getElementById('det-dem-title').innerText = d.title;
    document.getElementById('det-dem-cidadao').innerText = s ? s.name : 'Desconhecido';
    document.getElementById('det-dem-desc').innerText = d.description || 'Sem descrição.';
    document.getElementById('det-dem-status').value = d.status;
    document.getElementById('det-dem-status').onchange = handleStatusChange;
    
    await loadDemandaNotes(id);
    document.getElementById('modal-demanda-detalhes').classList.remove('hidden');
}

async function handleStatusChange(e) {
    const st = e.target.value;
    const { error } = await sb.from('demandas').update({ status: st }).eq('id', viewingDemandaId);
    if (!error) {
        await sb.from('notes').insert({ text: `Alterou status para: ${getStatusInfo(st).text}`, demanda_id: viewingDemandaId, author: 'Sistema', user_id: user.id });
        await loadDataFromSupabase();
        showToast("Status atualizado!");
    }
}

async function loadDemandaNotes(id) {
    const list = document.getElementById('demanda-notes-list');
    list.innerHTML = '<p class="text-[10px] text-slate-400">Carregando...</p>';
    const { data } = await sb.from('notes').select('*').eq('demanda_id', id).order('created_at');
    list.innerHTML = (data && data.length) ? '' : '<p class="text-[10px] text-slate-400">Sem notas.</p>';
    if(data) data.forEach(n => {
        const el = document.createElement('div');
        el.className = 'p-2 bg-slate-100 rounded text-[10px] border-l-2 border-slate-300 mb-1';
        el.innerHTML = `<p>${n.text}</p><p class="text-[8px] text-gray-400 text-right mt-1">${new Date(n.created_at).toLocaleString()}</p>`;
        list.appendChild(el);
    });
}

async function handleAddNote() {
    const input = document.getElementById('new-note-text');
    const txt = input.value.trim();
    if (!txt) return;
    const { error } = await sb.from('notes').insert({ text: txt, demanda_id: viewingDemandaId, author: user.email, user_id: user.id });
    if (!error) { input.value = ''; await loadDemandaNotes(viewingDemandaId); }
}

function requestDelete(id, type) {
    itemToDelete = { id, type };
    document.getElementById('conf-msg').innerText = `Tem a certeza que deseja excluir?`;
    document.getElementById('modal-confirm').classList.remove('hidden');
}

async function processDeletion() {
    const btn = document.getElementById('btn-conf-delete');
    btn.disabled = true; btn.innerText = 'Excluindo...';
    const { id, type } = itemToDelete;
    const table = type === 'cidadao' ? 'cidadaos' : 'demandas';
    
    const { error } = await sb.from(table).delete().eq('id', id);
    if (!error) {
        showToast("Excluído com sucesso!", "success");
        closeModal('modal-confirm');
        if(type === 'demanda') closeModal('modal-demanda-detalhes');
        await loadDataFromSupabase();
    } else { showToast(error.message, 'error'); }
    btn.disabled = false; btn.innerText = 'Excluir';
}

function openCidadaoModal(id = null) {
    currentEditingId = id;
    document.getElementById('form-cidadao').reset();
    document.getElementById('filhos-container').innerHTML = '';
    document.getElementById('modal-cidadao-title').innerText = id ? 'Editar Cidadão' : 'Novo Cadastro';
    if (id) {
        const c = allCidadaos.find(x => x.id === id);
        if(c) {
            document.getElementById('c-name').value = c.name;
            document.getElementById('c-cpf').value = c.cpf || '';
            document.getElementById('c-rg').value = c.rg || '';
            document.getElementById('c-dob').value = c.dob || '';
            document.getElementById('c-sexo').value = c.sexo || 'Masculino';
            document.getElementById('c-tipo').value = c.type || 'Eleitor';
            document.getElementById('c-lider').value = c.leader || '';
            document.getElementById('c-phone').value = c.phone || '';
            document.getElementById('c-wpp').checked = c.whatsapp || false;
            document.getElementById('c-email').value = c.email || '';
            document.getElementById('c-cep').value = c.cep || '';
            document.getElementById('c-logra').value = c.logradouro || '';
            document.getElementById('c-num').value = c.numero || '';
            document.getElementById('c-bairro').value = c.bairro || '';
            document.getElementById('c-sons').value = c.sons || 0;
            document.getElementById('c-daughters').value = c.daughters || 0;
            updateKidsFields('filho'); updateKidsFields('filha');
        }
    }
    document.getElementById('modal-cidadao').classList.remove('hidden');
}

function openDetails(id) {
    const c = allCidadaos.find(x => x.id === id);
    document.getElementById('detalhes-content').innerHTML = `
        <div class="col-span-1 md:col-span-2 flex items-center gap-6 mb-4">
            <div class="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-3xl font-bold shadow-lg">${c.name[0]}</div>
            <div><h2 class="text-xl font-black text-slate-800">${c.name}</h2><p class="text-blue-600 font-bold uppercase text-[10px] tracking-widest">${c.type}</p></div>
        </div>
        <div><p class="text-[10px] font-bold text-slate-400 uppercase">Contacto</p><p class="text-sm font-medium text-slate-700">${c.phone || 'N/A'}</p><p class="text-slate-500 text-xs">${c.email || ''}</p></div>
        <div><p class="text-[10px] font-bold text-slate-400 uppercase">Morada</p><p class="text-sm font-medium text-slate-700">${c.logradouro || ''}, ${c.numero || ''}</p><p class="text-slate-500 text-xs">${c.bairro || ''}</p></div>`;
    
    document.getElementById('btn-ver-mapa-unid').onclick = () => { closeModal('modal-detalhes'); openMap(c); };
    document.getElementById('modal-detalhes').classList.remove('hidden');
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `p-4 rounded-lg shadow-xl text-white font-bold text-xs transition-all duration-300 transform translate-x-10 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
    t.innerText = msg; c.appendChild(t);
    setTimeout(() => { t.classList.remove('translate-x-10'); t.style.opacity = '1'; }, 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

function getInitials(n) { return n ? n.split(' ').map(x => x[0]).join('').substring(0,2).toUpperCase() : '?'; }

function getStatusInfo(s) {
    const m = { pending: { text: 'Pendente', classes: 'status-badge status-pending', color: '#f59e0b' }, inprogress: { text: 'Em Andamento', classes: 'status-badge status-inprogress', color: '#3b82f6' }, completed: { text: 'Concluída', classes: 'status-badge status-completed', color: '#10b981' } };
    return m[s] || { text: 'N/A', classes: 'status-badge', color: '#64748b' };
}

function fillLeaderSelects() {
    const selects = [document.getElementById('c-lider'), document.getElementById('df-lider')];
    selects.forEach(s => {
        if(!s) return;
        const cur = s.value;
        s.innerHTML = `<option value="">${s.id === 'c-lider' ? 'Nenhuma' : 'Filtrar por Liderança'}</option>`;
        allLeaders.forEach(l => s.innerHTML += `<option value="${l.id}">${l.name}</option>`);
        s.value = cur;
    });
}

function fillBairroFilters() {
    const s = document.getElementById('f-bairro');
    if(!s) return;
    const cur = s.value;
    const bs = [...new Set(allCidadaos.map(c => c.bairro).filter(Boolean))].sort();
    s.innerHTML = '<option value="">Todos os Bairros</option>';
    bs.forEach(b => s.innerHTML += `<option value="${b}">${b}</option>`);
    s.value = cur;
}

function renderBirthdayList() {
    const list = document.getElementById('list-aniversariantes');
    const m = new Date().getMonth();
    const filtered = allCidadaos.filter(c => c.dob && new Date(c.dob + 'T12:00:00').getMonth() === m);
    list.innerHTML = filtered.length ? '' : '<p class="text-[10px] text-slate-400">Sem aniversariantes este mês.</p>';
    filtered.sort((a,b) => a.dob.split('-')[2] - b.dob.split('-')[2]).forEach(c => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-2 bg-slate-50 rounded border-l-4 border-blue-500 cursor-pointer hover:bg-slate-100';
        div.innerHTML = `<span class="text-[10px] font-bold text-slate-700">${c.name}</span><span class="text-blue-600 font-black text-xs">${c.dob.split('-')[2]}</span>`;
        div.onclick = () => openDetails(c.id);
        list.appendChild(div);
    });
}

function renderRecentDemandsList() {
    const list = document.getElementById('list-demandas-recentes');
    list.innerHTML = '';
    allDemandas.slice(0, 5).forEach(d => {
        const s = allCidadaos.find(c => c.id === d.cidadao_id);
        const div = document.createElement('div');
        div.className = 'p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer hover:border-blue-200';
        div.innerHTML = `<p class="text-[10px] font-bold text-slate-800 truncate">${d.title}</p><p class="text-[9px] text-slate-400">${s?s.name:'?'} • ${new Date(d.created_at).toLocaleDateString()}</p>`;
        div.onclick = () => openDemandaDetailsModal(d.id);
        list.appendChild(div);
    });
}

function getFaixaEtaria(dob) {
    if (!dob) return 'N/A';
    const age = new Date().getFullYear() - new Date(dob).getFullYear();
    if (age <= 17) return '0-17';
    if (age <= 25) return '18-25';
    if (age <= 35) return '26-35';
    if (age <= 50) return '36-50';
    if (age <= 65) return '51-65';
    return '66+';
}

function formatarData(dateString) {
    if (!dateString) return 'N/A';
    const p = dateString.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dateString;
}