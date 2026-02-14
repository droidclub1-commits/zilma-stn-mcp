// =================================================================
// GESTOR VALENTE - LÓGICA DO SISTEMA (APP.JS)
// Versão Final Completa e Blindada
// =================================================================

// 1. CONFIGURAÇÃO SUPABASE
// -----------------------------------------------------------------
const SUPABASE_URL = 'https://aqxccienrpqhwdqzusnh.supabase.co'; 
// SUBSTITUA PELA SUA CHAVE ANON (PUBLIC)
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
    console.error("Erro Crítico: Falha ao inicializar cliente Supabase.", error);
}

// 2. ESTADO GLOBAL DA APLICAÇÃO
// -----------------------------------------------------------------
let allCidadaos = [];
let allDemandas = [];
let allLeaders = [];
const CITADAOS_PER_PAGE = 12;
let currentCidadaosOffset = 0;
let currentFilteredCidadaos = [];
let currentEditingId = null;
let viewingDemandaId = null;
let itemToDelete = { id: null, type: null };
let map = null;
let markers = [];
let charts = {};
let appInitialized = false;

// 3. INICIALIZAÇÃO E AUTENTICAÇÃO
// -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initAuthListener();
    setupBasicEvents();
});

function initAuthListener() {
    sb.auth.onAuthStateChange((event, session) => {
        if (session) {
            user = session.user;
            toggleLoginScreen(false);
            if (!appInitialized) {
                initMainSystem();
            }
        } else {
            user = null;
            toggleLoginScreen(true);
            appInitialized = false;
        }
    });
}

function toggleLoginScreen(showLogin) {
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    
    if (showLogin) {
        if(loginPage) loginPage.classList.remove('hidden');
        if(appContainer) appContainer.classList.add('hidden');
    } else {
        if(loginPage) loginPage.classList.add('hidden');
        if(appContainer) {
            appContainer.classList.remove('hidden');
            appContainer.classList.add('flex');
        }
    }
}

async function initMainSystem() {
    if (appInitialized) return;
    await new Promise(r => setTimeout(r, 100)); // Delay para garantir DOM
    setupSystemEvents();
    await loadDataFromSupabase();
    switchPage('dashboard-page');
    appInitialized = true;
}

// 4. CARREGAMENTO DE DADOS
// -----------------------------------------------------------------
async function loadDataFromSupabase() {
    if (!user) return;

    try {
        // --- CIDADÃOS ---
        const { data: cData, error: cErr } = await sb.from('cidadaos').select('*');
        if (cErr) throw cErr;
        
        // Mapeamento Seguro
        allCidadaos = (cData || []).map(c => ({
            ...c,
            // Campos obrigatórios para a UI não quebrar
            name: c.name || c.nome || 'Sem Nome', 
            type: c.type || c.tipo || 'Eleitor',
            bairro: c.bairro || 'Não Informado',
            // Campos específicos que você listou
            cidade: c.cidade || '',
            estado: c.estado || '',
            sons: c.sons || 0,
            daughters: c.daughters || 0,
            photourl: c.photourl || null
        }));

        // Ordenação
        allCidadaos.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        // --- DEMANDAS ---
        const { data: dData, error: dErr } = await sb
            .from('demandas')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (dErr && dErr.code !== 'PGRST301') console.warn("Aviso Demandas:", dErr.message);
        
        allDemandas = (dData || []).map(d => ({
            ...d,
            title: d.title || 'Sem Título',
            status: d.status || 'pending',
            cidadao_id: d.cidadao_id
        }));

        // Filtrar Lideranças
        allLeaders = allCidadaos.filter(c => c.type === 'Liderança');

        updateAllUIs();

    } catch (e) {
        console.error(e);
        showToast("Erro ao carregar dados. Verifique a conexão.", 'error');
    }
}

function updateAllUIs() {
    updateDashboard();
    renderCidadaos(); 
    renderDemandasList();
    fillLeaderSelects();
    fillBairroFilters();
}

// 5. GESTÃO DE EVENTOS (SETUP SEGURO)
// -----------------------------------------------------------------
function setupBasicEvents() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.onsubmit = handleLogin;
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email-address').value;
    const pass = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');
    
    const originalText = btn.innerText;
    btn.disabled = true; 
    btn.innerHTML = '<div class="spinner mx-auto"></div>';
    
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    
    if (error) { 
        alert("Falha no Login: " + error.message); 
        btn.disabled = false; 
        btn.innerText = originalText; 
    }
}

// Helper seguro (evita erro de null)
function getEl(id) {
    return document.getElementById(id);
}

// ATENÇÃO: Esta função usa verificações "if" para não quebrar se faltar um ID
function setupSystemEvents() {
    // Navegação
    const logoutBtn = getEl('logout-btn');
    if (logoutBtn) logoutBtn.onclick = async () => { await sb.auth.signOut(); window.location.reload(); };
    
    const sidebarNav = getEl('sidebar-nav');
    if (sidebarNav) sidebarNav.onclick = (e) => {
        const link = e.target.closest('a');
        if (link) { 
            e.preventDefault(); 
            const targetPage = link.getAttribute('href').substring(1) + '-page';
            switchPage(targetPage); 
        }
    };

    // Filtros Cidadão
    const searchInput = getEl('search-input');
    if (searchInput) searchInput.oninput = () => renderCidadaos();
    const fTipo = getEl('f-tipo'); if (fTipo) fTipo.onchange = renderCidadaos;
    const fBairro = getEl('f-bairro'); if (fBairro) fBairro.onchange = renderCidadaos;
    const fSexo = getEl('f-sexo'); if (fSexo) fSexo.onchange = renderCidadaos;
    const btnLimpar = getEl('btn-limpar-filtros'); if (btnLimpar) btnLimpar.onclick = clearCidadaoFilters;

    // Ações Cidadão
    const btnNovo = getEl('btn-novo-cidadao'); if (btnNovo) btnNovo.onclick = () => openCidadaoModal();
    const btnMapa = getEl('btn-mapa-geral'); if (btnMapa) btnMapa.onclick = () => openMap();
    const btnLoadMore = getEl('btn-load-more'); if (btnLoadMore) btnLoadMore.onclick = renderMoreCidadaos;
    const formCidadao = getEl('form-cidadao'); if (formCidadao) formCidadao.onsubmit = handleCidadaoSave;
    
    // Inputs Dinâmicos
    const cCep = getEl('c-cep'); if (cCep) cCep.onblur = fetchAddressFromCEP;
    const cSons = getEl('c-sons'); if (cSons) cSons.oninput = () => updateKidsFields('filho');
    const cDaughters = getEl('c-daughters'); if (cDaughters) cDaughters.oninput = () => updateKidsFields('filha');

    // Ações Demandas
    const btnNovaDemanda = getEl('btn-nova-demanda-geral'); if (btnNovaDemanda) btnNovaDemanda.onclick = () => openDemandaModal();
    const formDemanda = getEl('form-demanda'); if (formDemanda) formDemanda.onsubmit = handleDemandaSave;
    const dfStatus = getEl('df-status'); if (dfStatus) dfStatus.onchange = renderDemandasList;
    const dfLider = getEl('df-lider'); if (dfLider) dfLider.onchange = renderDemandasList;
    
    // Detalhes Demanda
    const btnAddNote = getEl('btn-add-note'); if (btnAddNote) btnAddNote.onclick = handleAddNote;
    const detDemStatus = getEl('det-dem-status'); if (detDemStatus) detDemStatus.onchange = handleStatusChange;
    const btnDelDemanda = getEl('btn-del-demanda'); if (btnDelDemanda) btnDelDemanda.onclick = () => requestDelete(viewingDemandaId, 'demanda');

    // Confirmação
    const btnConfDelete = getEl('btn-conf-delete'); if (btnConfDelete) btnConfDelete.onclick = processDeletion;
    const btnCancelDelete = getEl('cancel-delete-btn'); if (btnCancelDelete) btnCancelDelete.onclick = () => closeModal('modal-confirm');

    // Modais
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => {
            const modal = btn.closest('[id^="modal-"]');
            if (modal) modal.classList.add('hidden');
        };
    });
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const target = getEl(pageId);
    if(target) { 
        target.classList.remove('hidden'); 
        target.classList.add('flex', 'flex-col'); 
    }
    document.querySelectorAll('#sidebar-nav a').forEach(a => {
        a.classList.remove('nav-link-active', 'bg-slate-900');
        if(a.getAttribute('href') === '#' + pageId.replace('-page', '')) {
            a.classList.add('nav-link-active');
        }
    });
    if (pageId === 'dashboard-page') updateDashboard();
}

// 6. DASHBOARD
// -----------------------------------------------------------------
function updateDashboard() {
    const dashTotalCidadaos = getEl('dash-total-cidadaos'); if (dashTotalCidadaos) dashTotalCidadaos.innerText = allCidadaos.length;
    const dashTotalDemandas = getEl('dash-total-demandas'); if (dashTotalDemandas) dashTotalDemandas.innerText = allDemandas.length;
    const dashPendentes = getEl('dash-pendentes'); if (dashPendentes) dashPendentes.innerText = allDemandas.filter(d => d.status === 'pending').length;
    const dashConcluidas = getEl('dash-concluidas'); if (dashConcluidas) dashConcluidas.innerText = allDemandas.filter(d => d.status === 'completed').length;
    
    initDashboardCharts();
    renderBirthdayList();
    renderRecentDemandsList();
}

function initDashboardCharts() {
    Object.values(charts).forEach(c => { if(c) c.destroy(); });
    
    const tipoMap = allCidadaos.reduce((acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc; }, {});
    const ctxTipos = getEl('chart-tipos');
    if (ctxTipos) {
        charts.tipos = new Chart(ctxTipos, { 
            type: 'pie', 
            data: { labels: Object.keys(tipoMap), datasets: [{ data: Object.values(tipoMap), backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'] }] }, 
            options: { maintainAspectRatio: false }
        });
    }
    
    const statusMap = allDemandas.reduce((acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {});
    const ctxStatus = getEl('chart-status');
    if (ctxStatus) {
        charts.status = new Chart(ctxStatus, { 
            type: 'doughnut', 
            data: { labels: ['Pendente', 'Em Andamento', 'Concluída'], datasets: [{ data: [statusMap.pending||0, statusMap.inprogress||0, statusMap.completed||0], backgroundColor: ['#f59e0b', '#3b82f6', '#10b981'] }] }, 
            options: { maintainAspectRatio: false }
        });
    }

    const bairroMap = allCidadaos.reduce((acc, c) => { const b = c.bairro || 'N/A'; acc[b] = (acc[b] || 0) + 1; return acc; }, {});
    const sortedBairros = Object.entries(bairroMap).sort(([,a], [,b]) => b - a).slice(0, 10);
    const ctxBairros = getEl('chart-bairros');
    if (ctxBairros) {
        charts.bairros = new Chart(ctxBairros, { 
            type: 'bar', 
            data: { labels: sortedBairros.map(i => i[0]), datasets: [{ label: 'Cidadãos', data: sortedBairros.map(i => i[1]), backgroundColor: '#3b82f6', borderRadius: 4 }] }, 
            options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { ticks: { precision: 0 } } } }
        });
    }
}

// 7. CIDADÃOS
// -----------------------------------------------------------------
function renderCidadaos() {
    const searchInput = getEl('search-input');
    const term = searchInput ? searchInput.value.toLowerCase() : '';
    const fTipo = getEl('f-tipo') ? getEl('f-tipo').value : '';
    const fBairro = getEl('f-bairro') ? getEl('f-bairro').value : '';
    const fSexo = getEl('f-sexo') ? getEl('f-sexo').value : '';

    currentFilteredCidadaos = allCidadaos.filter(c => {
        const matchSearch = !term || c.name.toLowerCase().includes(term) || (c.cpf && c.cpf.includes(term));
        const matchType = !fTipo || c.type === fTipo;
        const matchBairro = !fBairro || c.bairro === fBairro;
        const matchSexo = !fSexo || c.sexo === fSexo;
        return matchSearch && matchType && matchBairro && matchSexo;
    });

    currentCidadaosOffset = 0;
    const gridCidadaos = getEl('grid-cidadaos');
    if (gridCidadaos) gridCidadaos.innerHTML = '';
    renderMoreCidadaos();
}

function renderMoreCidadaos() {
    const grid = getEl('grid-cidadaos');
    if (!grid) return;

    const start = currentCidadaosOffset;
    const end = start + CITADAOS_PER_PAGE;
    const batch = currentFilteredCidadaos.slice(start, end);
    
    if (currentFilteredCidadaos.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10">Nenhum cidadão encontrado.</div>';
        const loadMoreBtn = getEl('load-more-container');
        if(loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }

    batch.forEach(c => {
        const card = document.createElement('div');
        card.className = 'bg-white p-5 rounded-xl shadow-md flex flex-col transition-all hover:shadow-lg border border-slate-100 hover:border-blue-300';
        const initials = getInitials(c.name);
        
        card.innerHTML = `
            <div class="flex items-center gap-4 mb-4">
                <div class="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-inner shrink-0">${initials}</div>
                <div class="overflow-hidden flex-1"><h3 class="font-bold text-slate-800 truncate" title="${c.name}">${c.name}</h3><span class="text-[10px] uppercase font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-full">${c.type}</span></div>
            </div>
            <div class="flex-1 space-y-2 text-xs text-slate-500 mb-4">
                <p class="truncate"><span class="font-bold">📍</span> ${c.bairro || 'N/A'}</p>
                <p class="truncate"><span class="font-bold">📞</span> ${c.phone || '-'}</p>
            </div>
            <div class="pt-4 border-t border-slate-100 flex gap-2">
                <button class="btn-ver flex-1 py-2 bg-slate-50 hover:bg-slate-100 rounded text-[10px] font-bold uppercase text-slate-600 transition-colors">Ver Ficha</button>
                <button class="btn-editar flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded text-[10px] font-bold uppercase text-white transition-colors">Editar</button>
            </div>
        `;
        
        card.querySelector('.btn-ver').onclick = () => openDetails(c.id);
        card.querySelector('.btn-editar').onclick = () => openCidadaoModal(c.id);
        grid.appendChild(card);
    });

    currentCidadaosOffset += batch.length;
    const loadMoreBtn = getEl('load-more-container');
    if (loadMoreBtn) {
        if (currentCidadaosOffset < currentFilteredCidadaos.length) {
            loadMoreBtn.classList.remove('hidden');
        } else {
            loadMoreBtn.classList.add('hidden');
        }
    }
}

// 8. MODAIS DE CIDADÃO
// -----------------------------------------------------------------
function openCidadaoModal(id = null) {
    currentEditingId = id;
    const formCidadao = getEl('form-cidadao');
    if (formCidadao) formCidadao.reset();
    getEl('filhos-container').innerHTML = '';
    
    const modalTitle = getEl('modal-cidadao-title');
    if (modalTitle) modalTitle.innerText = id ? 'Editar Cidadão' : 'Novo Cadastro';

    if (id) {
        const c = allCidadaos.find(x => x.id === id);
        if (c) {
            const setVal = (eid, val) => { const el = getEl(eid); if(el) el.value = val || ''; };
            
            setVal('c-name', c.name);
            setVal('c-cpf', c.cpf);
            setVal('c-rg', c.rg);
            setVal('c-dob', c.dob);
            setVal('c-sexo', c.sexo);
            setVal('c-tipo', c.type);
            setVal('c-lider', c.leader);
            setVal('c-phone', c.phone);
            setVal('c-email', c.email);
            setVal('c-cep', c.cep);
            setVal('c-logra', c.logradouro);
            setVal('c-num', c.numero);
            setVal('c-bairro', c.bairro);
            setVal('c-sons', c.sons || 0);
            setVal('c-daughters', c.daughters || 0);
            
            const cWpp = getEl('c-wpp');
            if (cWpp) cWpp.checked = c.whatsapp || false;
            
            updateKidsFields('filho');
            updateKidsFields('filha');
        }
    }
    const modalCidadao = getEl('modal-cidadao');
    if (modalCidadao) modalCidadao.classList.remove('hidden');
}

async function handleCidadaoSave(e) {
    e.preventDefault();
    const btn = getEl('save-btn');
    const originalText = btn.innerText;
    btn.disabled = true; 
    btn.innerHTML = '<div class="spinner mx-auto"></div>';
    
    try {
        const logEl = getEl('c-logra');
        const baiEl = getEl('c-bairro');
        let lat = null, lon = null;
        
        // Geolocalização
        if (logEl && baiEl && logEl.value && baiEl.value) {
            try {
                const query = `${logEl.value}, ${baiEl.value}, Macapá`; 
                const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.length > 0) {
                    lat = parseFloat(data[0].lat);
                    lon = parseFloat(data[0].lon);
                }
            } catch (geoErr) { console.warn("Erro geo:", geoErr); }
        }

        const val = (id) => { const el = getEl(id); return el ? el.value : null; };
        const wppEl = getEl('c-wpp');

        // Payload usando as colunas que você especificou
        const payload = {
            name: val('c-name'),
            cpf: val('c-cpf'),
            rg: val('c-rg'),
            dob: val('c-dob') || null,
            sexo: val('c-sexo'),
            type: val('c-tipo'),
            phone: val('c-phone'),
            whatsapp: wppEl ? wppEl.checked : false,
            email: val('c-email'),
            cep: val('c-cep'),
            logradouro: val('c-logra'),
            bairro: val('c-bairro'),
            numero: val('c-num'),
            leader: val('c-lider') || null,
            // Colunas Específicas
            cidade: val('c-cidade') || 'Macapá', // Default
            estado: val('c-estado') || 'AP',     // Default
            sons: parseInt(val('c-sons')) || 0,
            daughters: parseInt(val('c-daughters')) || 0,
            photourl: null,
            latitude: lat,
            longitude: lon,
            user_id: user.id
        };

        let error;
        if (currentEditingId) {
            const res = await sb.from('cidadaos').update(payload).eq('id', currentEditingId);
            error = res.error;
        } else {
            const res = await sb.from('cidadaos').insert(payload);
            error = res.error;
        }

        if (error) throw error;
        
        showToast("Salvo com sucesso!", "success");
        closeModal('modal-cidadao');
        await loadDataFromSupabase();

    } catch (e) {
        showToast("Erro ao salvar: " + e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// 9. FUNÇÕES DE ENDEREÇO E FILHOS
// -----------------------------------------------------------------
function fetchAddressFromCEP() {
    const cepInput = getEl('c-cep');
    if (!cepInput) return;
    const cep = cepInput.value.replace(/\D/g, '');
    
    if (cep.length === 8) {
        fetch(`https://viacep.com.br/ws/${cep}/json/`)
            .then(res => res.json())
            .then(data => {
                if (!data.erro) {
                    if(getEl('c-logra')) getEl('c-logra').value = data.logradouro;
                    if(getEl('c-bairro')) getEl('c-bairro').value = data.bairro;
                    if(getEl('c-num')) getEl('c-num').focus();
                } else { showToast("CEP não encontrado", "error"); }
            })
            .catch(() => showToast("Erro ao buscar CEP", "error"));
    }
}

function updateKidsFields(type) {
    const inputId = type === 'filho' ? 'c-sons' : 'c-daughters';
    const inputEl = getEl(inputId);
    if (!inputEl) return;

    const count = parseInt(inputEl.value) || 0;
    const containerId = 'cont-' + type;
    const parent = getEl('filhos-container');
    
    if (!parent) return;

    let cont = document.getElementById(containerId);
    if (!cont) { 
        cont = document.createElement('div'); 
        cont.id = containerId; 
        cont.className = "mt-2 p-2 bg-slate-50 rounded border border-slate-100";
        parent.appendChild(cont); 
    }
    
    let html = count > 0 ? `<p class="text-[10px] font-bold text-slate-400 uppercase mb-1">${type}s (${count})</p>` : '';
    for (let i = 0; i < count; i++) {
        html += `<div class="grid grid-cols-2 gap-2 mb-2"><input type="text" placeholder="Nome ${type} ${i+1}" class="p-2 border rounded text-xs"><input type="date" class="p-2 border rounded text-xs"></div>`;
    }
    cont.innerHTML = html;
}

// 10. DEMANDAS
// -----------------------------------------------------------------
function openDemandaModal() {
    const sel = getEl('demanda-cidadao-select');
    if (sel) {
        sel.innerHTML = '<option value="">Selecione...</option>' + 
            allCidadaos.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    const form = getEl('form-demanda');
    if (form) form.reset();
    const modal = getEl('modal-demanda');
    if (modal) modal.classList.remove('hidden');
}

async function handleDemandaSave(e) {
    e.preventDefault();
    const btn = getEl('save-demanda-btn');
    btn.disabled = true;
    
    try {
        const payload = {
            cidadao_id: getEl('demanda-cidadao-select').value,
            title: getEl('demanda-title').value,
            description: getEl('demanda-description').value,
            status: 'pending',
            user_id: user.id
        };
        
        const { error } = await sb.from('demandas').insert(payload);
        if (error) throw error;
        
        showToast("Demanda criada!", "success");
        closeModal('modal-demanda');
        await loadDataFromSupabase();
    } catch (e) {
        showToast("Erro: " + e.message, "error");
    } finally {
        btn.disabled = false;
    }
}

function renderDemandasList() {
    const list = getEl('list-all-demandas');
    if (!list) return;

    const dfStatus = getEl('df-status');
    const dfLider = getEl('df-lider');
    const fSt = dfStatus ? dfStatus.value : '';
    const fLd = dfLider ? dfLider.value : '';
    
    list.innerHTML = '';
    
    const filtered = allDemandas.filter(d => {
        const c = allCidadaos.find(cit => cit.id === d.cidadao_id);
        const matchS = !fSt || d.status === fSt;
        const matchL = !fLd || (c && c.leader === fLd);
        return matchS && matchL;
    });
    
    if (filtered.length === 0) {
        list.innerHTML = '<p class="text-center text-slate-400 py-10">Nenhuma demanda encontrada.</p>';
        return;
    }
    
    filtered.forEach(d => {
        const c = allCidadaos.find(cit => cit.id === d.cidadao_id);
        const stInfo = getStatusInfo(d.status);
        
        const item = document.createElement('div');
        item.className = 'bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-purple-300 transition-all cursor-pointer flex justify-between items-center';
        item.innerHTML = `
            <div>
                <h4 class="font-bold text-slate-800">${d.title}</h4>
                <p class="text-xs text-slate-500">Solicitante: <span class="font-medium">${c ? c.name : 'Desconhecido'}</span></p>
            </div>
            <span class="${stInfo.classes} px-2 py-1">${stInfo.text}</span>
        `;
        item.onclick = () => openDemandaDetailsModal(d.id);
        list.appendChild(item);
    });
}

// 11. DETALHES DEMANDA E NOTAS
// -----------------------------------------------------------------
async function openDemandaDetailsModal(id) {
    viewingDemandaId = id;
    const d = allDemandas.find(x => x.id === id);
    const c = allCidadaos.find(x => x.id === d.cidadao_id);
    
    if(getEl('det-dem-title')) getEl('det-dem-title').innerText = d.title;
    if(getEl('det-dem-cidadao')) getEl('det-dem-cidadao').innerText = c ? c.name : 'Desconhecido';
    if(getEl('det-dem-desc')) getEl('det-dem-desc').innerText = d.description || 'Sem descrição.';
    if(getEl('det-dem-status')) getEl('det-dem-status').value = d.status;
    
    await loadDemandaNotes(id);
    const modal = getEl('modal-demanda-detalhes');
    if (modal) modal.classList.remove('hidden');
}

async function handleStatusChange(e) {
    const ns = e.target.value;
    try {
        await sb.from('demandas').update({ status: ns }).eq('id', viewingDemandaId);
        await sb.from('notes').insert({
            text: `Status alterado para: ${getStatusInfo(ns).text}`,
            demanda_id: viewingDemandaId,
            user_id: user.id,
            author: 'Sistema'
        });
        showToast("Status atualizado!");
        await loadDataFromSupabase();
        await loadDemandaNotes(viewingDemandaId);
    } catch (e) { showToast("Erro ao mudar status", "error"); }
}

async function loadDemandaNotes(demandaId) {
    const list = getEl('demanda-notes-list');
    if (!list) return;
    list.innerHTML = '<p class="text-xs text-slate-400">Carregando...</p>';
    
    const { data } = await sb
        .from('notes')
        .select('*')
        .eq('demanda_id', demandaId)
        .order('created_at', { ascending: true });
        
    list.innerHTML = '';
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">Nenhuma nota.</p>';
        return;
    }
    
    data.forEach(note => {
        const div = document.createElement('div');
        div.className = "bg-slate-50 p-2 rounded border border-slate-100 mb-2";
        div.innerHTML = `<p class="text-xs text-slate-700">${note.text}</p><p class="text-[10px] text-slate-400 text-right mt-1">${new Date(note.created_at).toLocaleString()}</p>`;
        list.appendChild(div);
    });
    list.scrollTop = list.scrollHeight;
}

async function handleAddNote() {
    const inp = getEl('new-note-text');
    if (!inp) return;
    const txt = inp.value.trim();
    if (!txt) return;
    
    const btn = getEl('btn-add-note');
    if(btn) btn.disabled = true;
    
    try {
        await sb.from('notes').insert({
            text: txt,
            demanda_id: viewingDemandaId,
            user_id: user.id,
            author: user.email
        });
        inp.value = '';
        await loadDemandaNotes(viewingDemandaId);
    } catch(e) { showToast("Erro ao adicionar nota", "error"); }
    finally { if(btn) btn.disabled = false; }
}

// 12. MAPA E DETALHES
// -----------------------------------------------------------------
function openMap(toPlot = null) {
    const modal = getEl('modal-mapa');
    if (modal) modal.classList.remove('hidden');
    
    setTimeout(() => {
        if (!map) {
            map = L.map('map').setView([-0.039, -51.181], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
        }
        markers.forEach(m => m.remove()); markers = [];
        
        const targets = toPlot ? [toPlot] : allCidadaos;
        const bounds = [];
        
        targets.forEach(c => {
            if (c.latitude && c.longitude) {
                const m = L.marker([c.latitude, c.longitude]).addTo(map).bindPopup(`<b>${c.name}</b><br>${c.bairro||''}`);
                markers.push(m);
                bounds.push([c.latitude, c.longitude]);
            }
        });
        
        map.invalidateSize();
        if (bounds.length) map.fitBounds(bounds, { padding: [50, 50] });
        else if (!toPlot) map.setView([-0.039, -51.181], 12);
    }, 300);
}

function openDetails(id) {
    const c = allCidadaos.find(x => x.id === id);
    if (!c) return;
    
    const content = getEl('detalhes-content');
    if (content) {
        content.innerHTML = `
            <div class="col-span-1 md:col-span-2 flex items-center gap-6 mb-6 pb-6 border-b border-slate-100">
                <div class="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-3xl font-bold shadow-lg">${getInitials(c.name)}</div>
                <div><h2 class="text-2xl font-black text-slate-800">${c.name}</h2><span class="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-widest mt-2 inline-block">${c.type}</span></div>
            </div>
            <div class="space-y-3"><h4 class="text-xs font-bold text-slate-400 uppercase border-b pb-1">Contatos</h4><p class="text-sm flex justify-between"><span>📞 Tel:</span><span class="font-medium">${c.phone||'-'}</span></p><p class="text-sm flex justify-between"><span>📧 Email:</span><span class="font-medium">${c.email||'-'}</span></p></div>
            <div class="space-y-3"><h4 class="text-xs font-bold text-slate-400 uppercase border-b pb-1">Localização</h4><p class="text-sm"><span class="block text-xs text-slate-400">Logradouro</span>${c.logradouro||'-'}, ${c.numero||'S/N'}</p><p class="text-sm"><span class="block text-xs text-slate-400">Bairro</span>${c.bairro||'-'}</p></div>
            <div class="space-y-3"><h4 class="text-xs font-bold text-slate-400 uppercase border-b pb-1">Família</h4><p class="text-sm">Filhos: ${c.sons || 0} / Filhas: ${c.daughters || 0}</p></div>
        `;
    }
    
    const btnWpp = getEl('btn-wpp-share');
    if (btnWpp) {
        btnWpp.onclick = () => {
            if (c.latitude && c.longitude) {
                const link = `https://maps.google.com/?q=${c.latitude},${c.longitude}`;
                window.open(`https://wa.me/?text=${encodeURIComponent('Localização: ' + link)}`, '_blank');
            } else { showToast("Sem localização.", "error"); }
        };
    }
    
    const btnMapa = getEl('btn-ver-mapa-unid');
    if (btnMapa) {
        btnMapa.onclick = () => { closeModal('modal-detalhes'); openMap(c); };
    }

    const modal = getEl('modal-detalhes');
    if (modal) modal.classList.remove('hidden');
}

// 13. DELETE
// -----------------------------------------------------------------
function requestDelete(id, type) {
    itemToDelete = { id, type };
    const modal = getEl('modal-confirm');
    const msg = getEl('conf-msg');
    if (msg) {
        if (type === 'cidadao') {
            const c = allCidadaos.find(x => x.id === id);
            msg.innerText = `Excluir ${c ? c.name : 'este registro'}?`;
        } else {
            msg.innerText = "Excluir esta demanda?";
        }
    }
    if (modal) modal.classList.remove('hidden');
}

async function processDeletion() {
    const { id, type } = itemToDelete;
    const btn = getEl('btn-conf-delete');
    if(btn) { btn.disabled = true; btn.innerText = "Excluindo..."; }
    
    try {
        const table = type === 'cidadao' ? 'cidadaos' : 'demandas';
        const { error } = await sb.from(table).delete().eq('id', id);
        if (error) throw error;
        
        showToast("Excluído com sucesso.", "success");
        closeModal('modal-confirm');
        if (type === 'demanda') closeModal('modal-demanda-detalhes');
        await loadDataFromSupabase();
    } catch (e) {
        showToast("Erro ao excluir.", "error");
    } finally {
        if(btn) { btn.disabled = false; btn.innerText = "Excluir"; }
    }
}

// 14. UTILITÁRIOS
// -----------------------------------------------------------------
function closeModal(id) {
    const el = getEl(id);
    if (el) el.classList.add('hidden');
}

function clearCidadaoFilters() {
    if(getEl('search-input')) getEl('search-input').value = '';
    if(getEl('f-tipo')) getEl('f-tipo').value = '';
    if(getEl('f-bairro')) getEl('f-bairro').value = '';
    if(getEl('f-sexo')) getEl('f-sexo').value = '';
    renderCidadaos();
}

function fillLeaderSelects() {
    const opts = '<option value="">Nenhuma / Não se aplica</option>' + allLeaders.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    if(getEl('c-lider')) getEl('c-lider').innerHTML = opts;
    if(getEl('df-lider')) getEl('df-lider').innerHTML = '<option value="">Todas</option>' + allLeaders.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
}

function fillBairroFilters() {
    const bairros = [...new Set(allCidadaos.map(c => c.bairro).filter(Boolean))].sort();
    const opts = '<option value="">Todos</option>' + bairros.map(b => `<option value="${b}">${b}</option>`).join('');
    if(getEl('f-bairro')) getEl('f-bairro').innerHTML = opts;
}

function renderBirthdayList() {
    const list = getEl('list-aniversariantes');
    if (!list) return;
    const today = new Date();
    const birthdays = allCidadaos.filter(c => c.dob && new Date(c.dob + 'T12:00:00').getMonth() === today.getMonth());
    list.innerHTML = birthdays.length ? '' : '<p class="text-xs text-slate-400">Sem aniversariantes.</p>';
    birthdays.forEach(c => {
        const day = new Date(c.dob + 'T12:00:00').getDate();
        const div = document.createElement('div');
        div.className = "flex justify-between p-2 bg-slate-50 rounded border-l-4 border-blue-500 cursor-pointer";
        div.innerHTML = `<span class="text-xs font-bold">${c.name}</span><span class="text-blue-600 text-xs font-black">Dia ${day}</span>`;
        div.onclick = () => openDetails(c.id);
        list.appendChild(div);
    });
}

function renderRecentDemandsList() {
    const list = getEl('list-demandas-recentes');
    if (!list) return;
    list.innerHTML = '';
    const recent = allDemandas.slice(0, 5);
    if (!recent.length) { list.innerHTML = '<p class="text-xs text-slate-400">Nada recente.</p>'; return; }
    recent.forEach(d => {
        const s = allCidadaos.find(c => c.id === d.cidadao_id);
        const div = document.createElement('div');
        div.className = 'p-3 bg-slate-50 rounded border cursor-pointer hover:bg-white';
        div.innerHTML = `<p class="text-xs font-bold truncate">${d.title}</p><p class="text-[10px] text-slate-400">${s ? s.name : '?'}</p>`;
        div.onclick = () => openDemandaDetailsModal(d.id);
        list.appendChild(div);
    });
}

function getInitials(name) {
    if (!name) return '?';
    const p = name.trim().split(' ');
    return (p.length > 1 ? p[0][0] + p[p.length-1][0] : p[0].substring(0,2)).toUpperCase();
}

function getStatusInfo(s) {
    const m = { 
        pending: { text: 'Pendente', classes: 'bg-yellow-100 text-yellow-800' },
        inprogress: { text: 'Em Andamento', classes: 'bg-blue-100 text-blue-800' },
        completed: { text: 'Concluída', classes: 'bg-green-100 text-green-800' }
    };
    return m[s] || { text: 'N/A', classes: 'bg-gray-100 text-gray-800' };
}

function formatarData(d) {
    if (!d) return '-';
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function showToast(msg, type = 'info') {
    const c = getEl('toast-container');
    if (!c) return;
    const d = document.createElement('div');
    const color = type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-green-500' : 'bg-blue-500');
    d.className = `${color} text-white px-6 py-3 rounded shadow-lg text-sm transform transition-all translate-x-full opacity-0 flex items-center gap-2`;
    d.innerText = msg;
    c.appendChild(d);
    requestAnimationFrame(() => d.classList.remove('translate-x-full', 'opacity-0'));
    setTimeout(() => { d.classList.add('translate-x-full', 'opacity-0'); setTimeout(() => d.remove(), 300); }, 3000);
}