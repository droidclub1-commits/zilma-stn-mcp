// =================================================================
// GESTOR VALENTE - LÓGICA DO SISTEMA (APP.JS)
// Versão Corrigida (Event Listeners Seguros)
// =================================================================

// 1. CONFIGURAÇÃO SUPABASE
// -----------------------------------------------------------------
const SUPABASE_URL = 'https://aqxccienrpqhwdqzusnh.supabase.co'; 
// SUBSTITUA A LINHA ABAIXO PELA SUA CHAVE ANON (PUBLIC) DO SUPABASE
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
            appContainer.classList.add('flex'); // Garante flexbox
        }
    }
}

async function initMainSystem() {
    if (appInitialized) return;
    
    // Pequeno delay para garantir que o DOM esteja pronto
    await new Promise(r => setTimeout(r, 100));
    
    setupSystemEvents();
    await loadDataFromSupabase();
    
    // Inicia no Dashboard
    switchPage('dashboard-page');
    appInitialized = true;
}

// 4. CARREGAMENTO DE DADOS
// -----------------------------------------------------------------
async function loadDataFromSupabase() {
    if (!user) return;

    try {
        // Carregar Cidadãos
        const { data: cData, error: cErr } = await sb
            .from('cidadaos')
            .select('*')
            .order('name', { ascending: true });
        
        if (cErr) throw cErr;
        allCidadaos = cData || [];

        // Carregar Demandas
        const { data: dData, error: dErr } = await sb
            .from('demandas')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (dErr) throw dErr;
        allDemandas = dData || [];

        // Filtrar Lideranças para os Selects
        allLeaders = allCidadaos.filter(c => c.type === 'Liderança');

        // Atualizar toda a interface
        updateAllUIs();

    } catch (e) {
        console.error(e);
        showToast("Erro ao carregar dados do servidor: " + e.message, 'error');
    }
}

function updateAllUIs() {
    updateDashboard();
    renderCidadaos(); // Reinicia a lista e paginação
    renderDemandasList();
    fillLeaderSelects();
    fillBairroFilters();
}

// 5. GESTÃO DE EVENTOS (EVENT LISTENERS)
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
    
    // Estado de Loading
    const originalText = btn.innerText;
    btn.disabled = true; 
    btn.innerHTML = '<div class="spinner mx-auto"></div>';
    
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    
    if (error) { 
        alert("Falha no Login: " + error.message); 
        btn.disabled = false; 
        btn.innerText = originalText; 
    }
    // Sucesso é tratado pelo onAuthStateChange
}

// Helper seguro para pegar elementos
function getEl(id) {
    return document.getElementById(id);
}

function setupSystemEvents() {
    // --- Navegação ---
    const logoutBtn = getEl('logout-btn');
    if (logoutBtn) logoutBtn.onclick = async () => { 
        await sb.auth.signOut(); 
        window.location.reload(); 
    };
    
    const sidebarNav = getEl('sidebar-nav');
    if (sidebarNav) sidebarNav.onclick = (e) => {
        const link = e.target.closest('a');
        if (link) { 
            e.preventDefault(); 
            const targetPage = link.getAttribute('href').substring(1) + '-page';
            switchPage(targetPage); 
        }
    };

    // --- Filtros Cidadãos ---
    const searchInput = getEl('search-input');
    if (searchInput) searchInput.oninput = () => { renderCidadaos(); };
    
    const fTipo = getEl('f-tipo');
    if (fTipo) fTipo.onchange = renderCidadaos;
    
    const fBairro = getEl('f-bairro');
    if (fBairro) fBairro.onchange = renderCidadaos;
    
    const fSexo = getEl('f-sexo');
    if (fSexo) fSexo.onchange = renderCidadaos;
    
    const btnLimpar = getEl('btn-limpar-filtros');
    if (btnLimpar) btnLimpar.onclick = clearCidadaoFilters;

    // --- Ações Cidadãos ---
    const btnNovo = getEl('btn-novo-cidadao');
    if (btnNovo) btnNovo.onclick = () => openCidadaoModal();
    
    const btnMapa = getEl('btn-mapa-geral');
    if (btnMapa) btnMapa.onclick = () => openMap();
    
    const btnLoadMore = getEl('btn-load-more');
    if (btnLoadMore) btnLoadMore.onclick = renderMoreCidadaos;
    
    const formCidadao = getEl('form-cidadao');
    if (formCidadao) formCidadao.onsubmit = handleCidadaoSave;
    
    // Inputs Dinâmicos Cidadão
    const cCep = getEl('c-cep');
    if (cCep) cCep.onblur = fetchAddressFromCEP;
    
    const cSons = getEl('c-sons');
    if (cSons) cSons.oninput = () => updateKidsFields('filho');
    
    const cDaughters = getEl('c-daughters');
    if (cDaughters) cDaughters.oninput = () => updateKidsFields('filha');

    // --- Ações Demandas ---
    const btnNovaDemanda = getEl('btn-nova-demanda-geral');
    if (btnNovaDemanda) btnNovaDemanda.onclick = () => openDemandaModal();
    
    const formDemanda = getEl('form-demanda');
    if (formDemanda) formDemanda.onsubmit = handleDemandaSave;
    
    const dfStatus = getEl('df-status');
    if (dfStatus) dfStatus.onchange = renderDemandasList;
    
    const dfLider = getEl('df-lider');
    if (dfLider) dfLider.onchange = renderDemandasList;
    
    // Detalhes da Demanda (Notas e Status)
    const btnAddNote = getEl('btn-add-note');
    if (btnAddNote) btnAddNote.onclick = handleAddNote;
    
    const detDemStatus = getEl('det-dem-status');
    if (detDemStatus) detDemStatus.onchange = handleStatusChange;
    
    const btnDelDemanda = getEl('btn-del-demanda');
    if (btnDelDemanda) btnDelDemanda.onclick = () => requestDelete(viewingDemandaId, 'demanda');

    // --- Confirmação de Exclusão ---
    const btnConfDelete = getEl('btn-conf-delete');
    if (btnConfDelete) btnConfDelete.onclick = processDeletion;
    
    const btnCancelDelete = getEl('cancel-delete-btn');
    if (btnCancelDelete) btnCancelDelete.onclick = () => closeModal('modal-confirm');

    // --- Fechamento Genérico de Modais ---
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => {
            const modal = btn.closest('[id^="modal-"]');
            if (modal) modal.classList.add('hidden');
        };
    });
}

function switchPage(pageId) {
    // Esconde todas as páginas
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    
    // Mostra a selecionada
    const target = getEl(pageId);
    if(target) { 
        target.classList.remove('hidden'); 
        target.classList.add('flex', 'flex-col'); // Restaura layout flex
    }
    
    // Atualiza menu lateral
    document.querySelectorAll('#sidebar-nav a').forEach(a => {
        a.classList.remove('nav-link-active', 'bg-slate-900');
        if(a.getAttribute('href') === '#' + pageId.replace('-page', '')) {
            a.classList.add('nav-link-active');
        }
    });
    
    // Se for dashboard, atualiza os gráficos
    if (pageId === 'dashboard-page') updateDashboard();
}

// 6. DASHBOARD E GRÁFICOS
// -----------------------------------------------------------------
function updateDashboard() {
    // Cards Superiores
    const dashTotalCidadaos = getEl('dash-total-cidadaos');
    if (dashTotalCidadaos) dashTotalCidadaos.innerText = allCidadaos.length;
    
    const dashTotalDemandas = getEl('dash-total-demandas');
    if (dashTotalDemandas) dashTotalDemandas.innerText = allDemandas.length;
    
    const dashPendentes = getEl('dash-pendentes');
    if (dashPendentes) dashPendentes.innerText = allDemandas.filter(d => d.status === 'pending').length;
    
    const dashConcluidas = getEl('dash-concluidas');
    if (dashConcluidas) dashConcluidas.innerText = allDemandas.filter(d => d.status === 'completed').length;
    
    initDashboardCharts();
    renderBirthdayList();
    renderRecentDemandsList();
}

function initDashboardCharts() {
    // Destrói gráficos antigos para evitar sobreposição/erro
    Object.values(charts).forEach(c => { if(c) c.destroy(); });
    
    // 1. Gráfico de Tipos (Pizza)
    const tipoMap = allCidadaos.reduce((acc, c) => { 
        acc[c.type] = (acc[c.type] || 0) + 1; 
        return acc; 
    }, {});
    
    const ctxTipos = getEl('chart-tipos');
    if (ctxTipos) {
        charts.tipos = new Chart(ctxTipos, { 
            type: 'pie', 
            data: { 
                labels: Object.keys(tipoMap), 
                datasets: [{ 
                    data: Object.values(tipoMap), 
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#64748b'] 
                }] 
            }, 
            options: { maintainAspectRatio: false }
        });
    }
    
    // 2. Gráfico de Status (Rosca)
    const statusMap = allDemandas.reduce((acc, d) => { 
        acc[d.status] = (acc[d.status] || 0) + 1; 
        return acc; 
    }, {});
    
    const ctxStatus = getEl('chart-status');
    if (ctxStatus) {
        charts.status = new Chart(ctxStatus, { 
            type: 'doughnut', 
            data: { 
                labels: ['Pendente', 'Em Andamento', 'Concluída'], 
                datasets: [{ 
                    data: [statusMap.pending||0, statusMap.inprogress||0, statusMap.completed||0], 
                    backgroundColor: ['#f59e0b', '#3b82f6', '#10b981'] 
                }] 
            }, 
            options: { maintainAspectRatio: false }
        });
    }

    // 3. Gráfico de Bairros (Barras Horizontais)
    const bairroMap = allCidadaos.reduce((acc, c) => { 
        const b = c.bairro || 'Não Informado'; 
        acc[b] = (acc[b] || 0) + 1; 
        return acc; 
    }, {});
    
    // Ordenar e pegar top 10
    const sortedBairros = Object.entries(bairroMap)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
        
    const ctxBairros = getEl('chart-bairros');
    if (ctxBairros) {
        charts.bairros = new Chart(ctxBairros, { 
            type: 'bar', 
            data: { 
                labels: sortedBairros.map(i => i[0]), 
                datasets: [{ 
                    label: 'Cidadãos', 
                    data: sortedBairros.map(i => i[1]), 
                    backgroundColor: '#3b82f6',
                    borderRadius: 4
                }] 
            }, 
            options: { 
                indexAxis: 'y', 
                maintainAspectRatio: false,
                scales: { x: { ticks: { precision: 0 } } }
            }
        });
    }
}

// 7. MÓDULO DE CIDADÃOS
// -----------------------------------------------------------------
function renderCidadaos() {
    // Coleta filtros
    const searchInput = getEl('search-input');
    const term = searchInput ? searchInput.value.toLowerCase() : '';
    
    const fTipo = getEl('f-tipo');
    const type = fTipo ? fTipo.value : '';
    
    const fBairro = getEl('f-bairro');
    const bairro = fBairro ? fBairro.value : '';
    
    const fSexo = getEl('f-sexo');
    const sexo = fSexo ? fSexo.value : '';

    // Filtra array global
    currentFilteredCidadaos = allCidadaos.filter(c => {
        const matchSearch = !term || 
            c.name.toLowerCase().includes(term) || 
            (c.cpf && c.cpf.includes(term)) ||
            (c.email && c.email.toLowerCase().includes(term));
            
        const matchType = !type || c.type === type;
        const matchBairro = !bairro || c.bairro === bairro;
        const matchSexo = !sexo || c.sexo === sexo;
        
        return matchSearch && matchType && matchBairro && matchSexo;
    });

    // Reseta paginação
    currentCidadaosOffset = 0;
    const gridCidadaos = getEl('grid-cidadaos');
    if (gridCidadaos) gridCidadaos.innerHTML = '';
    
    // Renderiza primeiro lote
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
                <div class="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-inner shrink-0">
                    ${initials}
                </div>
                <div class="overflow-hidden flex-1">
                    <h3 class="font-bold text-slate-800 truncate" title="${c.name}">${c.name}</h3>
                    <span class="text-[10px] uppercase font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-full">${c.type}</span>
                </div>
            </div>
            <div class="flex-1 space-y-2 text-xs text-slate-500 mb-4">
                <p class="flex items-center gap-2 truncate">
                    <span class="font-bold">📍</span> ${c.bairro || 'Bairro N/A'}
                </p>
                <p class="flex items-center gap-2 truncate">
                    <span class="font-bold">📞</span> ${c.phone || 'Sem telefone'}
                </p>
            </div>
            <div class="pt-4 border-t border-slate-100 flex gap-2">
                <button class="btn-ver flex-1 py-2 bg-slate-50 hover:bg-slate-100 rounded text-[10px] font-bold uppercase text-slate-600 transition-colors">
                    Ver Ficha
                </button>
                <button class="btn-editar flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded text-[10px] font-bold uppercase text-white transition-colors">
                    Editar
                </button>
            </div>
        `;
        
        // Eventos manuais
        card.querySelector('.btn-ver').onclick = () => openDetails(c.id);
        card.querySelector('.btn-editar').onclick = () => openCidadaoModal(c.id);
        
        grid.appendChild(card);
    });

    currentCidadaosOffset += batch.length;
    
    // Controla botão "Carregar Mais"
    const loadMoreBtn = getEl('load-more-container');
    if (loadMoreBtn) {
        if (currentCidadaosOffset < currentFilteredCidadaos.length) {
            loadMoreBtn.classList.remove('hidden');
        } else {
            loadMoreBtn.classList.add('hidden');
        }
    }
}

// 8. MODAIS DE CIDADÃO (NOVO/EDITAR)
// -----------------------------------------------------------------
function openCidadaoModal(id = null) {
    currentEditingId = id;
    const formCidadao = getEl('form-cidadao');
    if (formCidadao) formCidadao.reset();
    
    const filhosContainer = getEl('filhos-container');
    if (filhosContainer) filhosContainer.innerHTML = '';
    
    const modalTitle = getEl('modal-cidadao-title');
    if (modalTitle) modalTitle.innerText = id ? 'Editar Cidadão' : 'Novo Cadastro';

    if (id) {
        const c = allCidadaos.find(x => x.id === id);
        if (c) {
            // Preenchimento dos campos
            const fields = {
                'c-name': c.name,
                'c-cpf': c.cpf || '',
                'c-rg': c.rg || '',
                'c-dob': c.dob || '',
                'c-sexo': c.sexo || 'Masculino',
                'c-tipo': c.type || 'Eleitor',
                'c-lider': c.leader || '',
                'c-phone': c.phone || '',
                'c-email': c.email || '',
                'c-cep': c.cep || '',
                'c-logra': c.logradouro || '',
                'c-num': c.numero || '',
                'c-bairro': c.bairro || '',
                'c-sons': c.sons || 0,
                'c-daughters': c.daughters || 0
            };

            for (const [key, value] of Object.entries(fields)) {
                const el = getEl(key);
                if (el) el.value = value;
            }

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
        // Geocodificação (Transformar endereço em Lat/Lon)
        const logEl = getEl('c-logra');
        const baiEl = getEl('c-bairro');
        let lat = null, lon = null;
        
        if (logEl && baiEl && logEl.value && baiEl.value) {
            try {
                // Usa Nominatim (OpenStreetMap)
                const query = `${logEl.value}, ${baiEl.value}, Macapá`; // Ajuste a cidade base aqui se necessário
                const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.length > 0) {
                    lat = parseFloat(data[0].lat);
                    lon = parseFloat(data[0].lon);
                }
            } catch (geoErr) {
                console.warn("Erro na geolocalização:", geoErr);
            }
        }

        // Helper para pegar valores com segurança
        const val = (id) => {
            const el = getEl(id);
            return el ? el.value : null;
        };

        const wppEl = getEl('c-wpp');

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
            sons: parseInt(val('c-sons')) || 0,
            daughters: parseInt(val('c-daughters')) || 0,
            latitude: lat,
            longitude: lon,
            user_id: user.id // Vincula ao usuário atual
        };

        let error;
        if (currentEditingId) {
            // Update
            const res = await sb.from('cidadaos').update(payload).eq('id', currentEditingId);
            error = res.error;
        } else {
            // Insert
            const res = await sb.from('cidadaos').insert(payload);
            error = res.error;
        }

        if (error) throw error;
        
        showToast("Registro salvo com sucesso!", "success");
        closeModal('modal-cidadao');
        await loadDataFromSupabase(); // Recarrega tudo para atualizar listas e gráficos

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
                    const lograEl = getEl('c-logra');
                    const bairroEl = getEl('c-bairro');
                    const numEl = getEl('c-num');
                    
                    if (lograEl) lograEl.value = data.logradouro;
                    if (bairroEl) bairroEl.value = data.bairro;
                    if (numEl) numEl.focus();
                } else {
                    showToast("CEP não encontrado", "error");
                }
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

    // Procura ou cria o container específico
    let cont = document.getElementById(containerId);
    if (!cont) { 
        cont = document.createElement('div'); 
        cont.id = containerId; 
        cont.className = "mt-2 p-2 bg-slate-50 rounded border border-slate-100";
        parent.appendChild(cont); 
    }
    
    // Gera HTML dos campos
    let html = count > 0 ? `<p class="text-[10px] font-bold text-slate-400 uppercase mb-1">${type}s (${count})</p>` : '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="grid grid-cols-2 gap-2 mb-2">
                <input type="text" placeholder="Nome ${type} ${i+1}" class="p-2 border rounded text-xs">
                <input type="date" class="p-2 border rounded text-xs">
            </div>
        `;
    }
    cont.innerHTML = html;
}

// 10. MÓDULO DE DEMANDAS
// -----------------------------------------------------------------
function openDemandaModal() {
    // Preenche select de cidadãos
    const sel = getEl('demanda-cidadao-select');
    if (sel) {
        sel.innerHTML = '<option value="">Selecione...</option>' + 
            allCidadaos.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    
    const formDemanda = getEl('form-demanda');
    if (formDemanda) formDemanda.reset();
    
    const modalDemanda = getEl('modal-demanda');
    if (modalDemanda) modalDemanda.classList.remove('hidden');
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
    
    const filterStatus = dfStatus ? dfStatus.value : '';
    const filterLeader = dfLider ? dfLider.value : '';
    
    list.innerHTML = '';
    
    const filtered = allDemandas.filter(d => {
        const citizen = allCidadaos.find(c => c.id === d.cidadao_id);
        const matchStatus = !filterStatus || d.status === filterStatus;
        const matchLeader = !filterLeader || (citizen && citizen.leader === filterLeader);
        return matchStatus && matchLeader;
    });
    
    if (filtered.length === 0) {
        list.innerHTML = '<p class="text-center text-slate-400 py-10">Nenhuma demanda encontrada.</p>';
        return;
    }
    
    filtered.forEach(d => {
        const citizen = allCidadaos.find(c => c.id === d.cidadao_id);
        const statusInfo = getStatusInfo(d.status);
        
        const item = document.createElement('div');
        item.className = 'bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-purple-300 transition-all cursor-pointer flex justify-between items-center';
        item.innerHTML = `
            <div>
                <h4 class="font-bold text-slate-800">${d.title}</h4>
                <p class="text-xs text-slate-500">
                    Solicitante: <span class="font-medium">${citizen ? citizen.name : 'Desconhecido'}</span>
                </p>
            </div>
            <span class="${statusInfo.classes} px-2 py-1">${statusInfo.text}</span>
        `;
        item.onclick = () => openDemandaDetailsModal(d.id);
        list.appendChild(item);
    });
}

// 11. DETALHES DA DEMANDA E NOTAS
// -----------------------------------------------------------------
async function openDemandaDetailsModal(id) {
    viewingDemandaId = id;
    const d = allDemandas.find(x => x.id === id);
    const citizen = allCidadaos.find(c => c.id === d.cidadao_id);
    
    const titleEl = getEl('det-dem-title');
    const cidEl = getEl('det-dem-cidadao');
    const descEl = getEl('det-dem-desc');
    const statusEl = getEl('det-dem-status');

    if (titleEl) titleEl.innerText = d.title;
    if (cidEl) cidEl.innerText = citizen ? citizen.name : 'Desconhecido';
    if (descEl) descEl.innerText = d.description || 'Sem descrição.';
    if (statusEl) statusEl.value = d.status;
    
    // Carrega notas
    await loadDemandaNotes(id);
    
    const modal = getEl('modal-demanda-detalhes');
    if (modal) modal.classList.remove('hidden');
}

async function handleStatusChange(e) {
    const newStatus = e.target.value;
    try {
        await sb.from('demandas').update({ status: newStatus }).eq('id', viewingDemandaId);
        
        // Log automático de mudança de status
        await sb.from('notes').insert({
            text: `Status alterado para: ${getStatusInfo(newStatus).text}`,
            demanda_id: viewingDemandaId,
            user_id: user.id,
            author: 'Sistema'
        });
        
        showToast("Status atualizado!");
        await loadDataFromSupabase(); // Atualiza a lista atrás do modal
        await loadDemandaNotes(viewingDemandaId); // Atualiza o chat de notas
    } catch (e) {
        showToast("Erro ao mudar status", "error");
    }
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
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">Nenhuma nota ou histórico.</p>';
        return;
    }
    
    data.forEach(note => {
        const div = document.createElement('div');
        div.className = "bg-slate-50 p-2 rounded border border-slate-100 mb-2";
        div.innerHTML = `
            <p class="text-xs text-slate-700">${note.text}</p>
            <p class="text-[10px] text-slate-400 text-right mt-1">
                ${new Date(note.created_at).toLocaleString()}
            </p>
        `;
        list.appendChild(div);
    });
    
    // Scroll para baixo
    list.scrollTop = list.scrollHeight;
}

async function handleAddNote() {
    const input = getEl('new-note-text');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;
    
    const btn = getEl('btn-add-note');
    if (btn) btn.disabled = true;
    
    try {
        await sb.from('notes').insert({
            text: text,
            demanda_id: viewingDemandaId,
            user_id: user.id,
            author: user.email // Ou nome se tiver perfil
        });
        input.value = '';
        await loadDemandaNotes(viewingDemandaId);
    } catch (e) {
        showToast("Erro ao adicionar nota", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

// 12. MAPAS E GEOLOCALIZAÇÃO
// -----------------------------------------------------------------
function openMap(toPlot = null) {
    const modal = getEl('modal-mapa');
    if (modal) modal.classList.remove('hidden');
    
    // Pequeno delay para garantir que o modal está visível antes de renderizar o mapa
    setTimeout(() => {
        if (!map) {
            // Inicia mapa no centro de Macapá (padrão)
            map = L.map('map').setView([-0.039, -51.181], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(map);
        }
        
        // Limpa marcadores antigos
        markers.forEach(m => m.remove());
        markers = [];
        
        // Define quem vamos plotar (um ou todos)
        const targets = toPlot ? [toPlot] : allCidadaos;
        const bounds = [];
        
        targets.forEach(c => {
            if (c.latitude && c.longitude) {
                const m = L.marker([c.latitude, c.longitude])
                    .addTo(map)
                    .bindPopup(`<b>${c.name}</b><br>${c.bairro || ''}`);
                markers.push(m);
                bounds.push([c.latitude, c.longitude]);
            }
        });
        
        map.invalidateSize(); // Corrige renderização do Leaflet em modal
        
        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        } else if (!toPlot) {
            map.setView([-0.039, -51.181], 12); // Reset zoom
        }
    }, 300);
}

function openDetails(id) {
    const c = allCidadaos.find(x => x.id === id);
    if (!c) return;
    
    // Popula modal de detalhes
    const content = getEl('detalhes-content');
    if (content) {
        content.innerHTML = `
            <div class="col-span-1 md:col-span-2 flex items-center gap-6 mb-6 pb-6 border-b border-slate-100">
                <div class="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-3xl font-bold shadow-lg">
                    ${getInitials(c.name)}
                </div>
                <div>
                    <h2 class="text-2xl font-black text-slate-800">${c.name}</h2>
                    <span class="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-widest mt-2 inline-block">
                        ${c.type}
                    </span>
                </div>
            </div>
            
            <div class="space-y-3">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Contatos</h4>
                <p class="text-sm text-slate-700 flex justify-between">
                    <span>📞 Telefone:</span> <span class="font-medium">${c.phone || '-'}</span>
                </p>
                <p class="text-sm text-slate-700 flex justify-between">
                    <span>📧 E-mail:</span> <span class="font-medium">${c.email || '-'}</span>
                </p>
            </div>

            <div class="space-y-3">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Localização</h4>
                <p class="text-sm text-slate-700">
                    <span class="block text-xs text-slate-400">Logradouro</span>
                    <span class="font-medium">${c.logradouro || '-'}, ${c.numero || 'S/N'}</span>
                </p>
                <p class="text-sm text-slate-700">
                    <span class="block text-xs text-slate-400">Bairro</span>
                    <span class="font-medium">${c.bairro || '-'}</span>
                </p>
            </div>
            
            <div class="space-y-3">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Dados Pessoais</h4>
                <p class="text-sm text-slate-700">CPF: ${c.cpf || '-'}</p>
                <p class="text-sm text-slate-700">RG: ${c.rg || '-'}</p>
                <p class="text-sm text-slate-700">Nasc: ${formatarData(c.dob)}</p>
            </div>

            <div class="space-y-3">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Família</h4>
                <p class="text-sm text-slate-700">Filhos: ${c.sons || 0}</p>
                <p class="text-sm text-slate-700">Filhas: ${c.daughters || 0}</p>
            </div>
        `;
    }
    
    // Configura botões de ação do modal
    const btnMapa = getEl('btn-ver-mapa-unid');
    if (btnMapa) {
        btnMapa.onclick = () => {
            closeModal('modal-detalhes');
            openMap(c);
        };
    }
    
    const btnWpp = getEl('btn-wpp-share');
    if (btnWpp) {
        btnWpp.onclick = () => {
            if (c.latitude && c.longitude) {
                const link = `https://maps.google.com/?q=${c.latitude},${c.longitude}`;
                const msg = `Localização de ${c.name}: ${link}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
            } else {
                showToast("Localização não disponível para este cadastro.", "error");
            }
        };
    }

    const modal = getEl('modal-detalhes');
    if (modal) modal.classList.remove('hidden');
}

// 13. FUNÇÕES DE EXCLUSÃO (DELETE)
// -----------------------------------------------------------------
function requestDelete(id, type) {
    itemToDelete = { id, type };
    const modal = getEl('modal-confirm');
    const msg = getEl('conf-msg');
    
    if (msg) {
        if (type === 'cidadao') {
            const c = allCidadaos.find(x => x.id === id);
            msg.innerText = `Tem certeza que deseja excluir ${c ? c.name : 'este cidadão'}?`;
        } else {
            msg.innerText = "Tem certeza que deseja excluir esta demanda e todo seu histórico?";
        }
    }
    
    if (modal) modal.classList.remove('hidden');
}

async function processDeletion() {
    const { id, type } = itemToDelete;
    const btn = getEl('btn-conf-delete');
    
    if(btn) {
        btn.disabled = true;
        btn.innerText = "Excluindo...";
    }
    
    try {
        const table = type === 'cidadao' ? 'cidadaos' : 'demandas';
        const { error } = await sb.from(table).delete().eq('id', id);
        
        if (error) throw error;
        
        showToast("Item excluído com sucesso.", "success");
        closeModal('modal-confirm');
        
        if (type === 'demanda') closeModal('modal-demanda-detalhes');
        
        await loadDataFromSupabase();
    } catch (e) {
        showToast("Erro ao excluir: " + e.message, "error");
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.innerText = "Excluir";
        }
    }
}

// 14. UTILITÁRIOS GERAIS
// -----------------------------------------------------------------
function closeModal(id) {
    const el = getEl(id);
    if (el) el.classList.add('hidden');
}

function clearCidadaoFilters() {
    const searchInput = getEl('search-input');
    if(searchInput) searchInput.value = '';
    
    const fTipo = getEl('f-tipo');
    if(fTipo) fTipo.value = '';
    
    const fBairro = getEl('f-bairro');
    if(fBairro) fBairro.value = '';
    
    const fSexo = getEl('f-sexo');
    if(fSexo) fSexo.value = '';
    
    renderCidadaos();
}

function fillLeaderSelects() {
    const options = '<option value="">Nenhuma / Não se aplica</option>' + 
        allLeaders.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
        
    const cLider = getEl('c-lider');
    if (cLider) cLider.innerHTML = options;
    
    const dfLider = getEl('df-lider');
    if (dfLider) dfLider.innerHTML = '<option value="">Todas as Lideranças</option>' + 
        allLeaders.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
}

function fillBairroFilters() {
    const bairros = [...new Set(allCidadaos.map(c => c.bairro).filter(Boolean))].sort();
    const options = '<option value="">Todos os Bairros</option>' + 
        bairros.map(b => `<option value="${b}">${b}</option>`).join('');
    
    const fBairro = getEl('f-bairro');
    if (fBairro) fBairro.innerHTML = options;
}

function renderBirthdayList() {
    const list = getEl('list-aniversariantes');
    if (!list) return;

    const today = new Date();
    const currentMonth = today.getMonth();
    
    const birthdays = allCidadaos.filter(c => {
        if (!c.dob) return false;
        // Ajuste de fuso horário para garantir mês correto
        const date = new Date(c.dob + 'T12:00:00'); 
        return date.getMonth() === currentMonth;
    });
    
    list.innerHTML = '';
    if (birthdays.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 italic">Nenhum aniversariante este mês.</p>';
        return;
    }
    
    birthdays.sort((a,b) => {
        const da = new Date(a.dob + 'T12:00:00').getDate();
        const db = new Date(b.dob + 'T12:00:00').getDate();
        return da - db;
    });
    
    birthdays.forEach(c => {
        const day = new Date(c.dob + 'T12:00:00').getDate();
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-slate-50 rounded border-l-4 border-blue-500 cursor-pointer hover:bg-slate-100";
        div.innerHTML = `
            <span class="text-[11px] font-bold text-slate-700 truncate w-32">${c.name}</span>
            <span class="text-blue-600 font-black text-xs">Dia ${day}</span>
        `;
        div.onclick = () => openDetails(c.id);
        list.appendChild(div);
    });
}

function renderRecentDemandsList() {
    const list = getEl('list-demandas-recentes');
    if (!list) return;

    list.innerHTML = '';
    
    // Pega as 5 últimas
    const recent = allDemandas.slice(0, 5);
    
    if (recent.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 italic">Nenhuma demanda recente.</p>';
        return;
    }
    
    recent.forEach(d => {
        const s = allCidadaos.find(c => c.id === d.cidadao_id);
        const div = document.createElement('div');
        div.className = 'p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer hover:border-purple-200 transition-colors';
        div.innerHTML = `
            <div class="flex justify-between">
                <p class="text-[11px] font-bold text-slate-800 truncate w-2/3">${d.title}</p>
                <span class="text-[9px] uppercase font-bold text-slate-400">${new Date(d.created_at).toLocaleDateString()}</span>
            </div>
            <p class="text-[10px] text-slate-500 truncate">
                Solicitante: ${s ? s.name : '?'}
            </p>
        `;
        div.onclick = () => openDemandaDetailsModal(d.id);
        list.appendChild(div);
    });
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getStatusInfo(status) {
    switch (status) {
        case 'pending': return { text: 'Pendente', classes: 'bg-yellow-100 text-yellow-800', color: '#F59E0B' };
        case 'inprogress': return { text: 'Em Andamento', classes: 'bg-blue-100 text-blue-800', color: '#3B82F6' };
        case 'completed': return { text: 'Concluída', classes: 'bg-green-100 text-green-800', color: '#10B981' };
        default: return { text: 'N/A', classes: 'bg-gray-100 text-gray-800', color: '#6B7280' };
    }
}

function formatarData(dateString) {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateString;
}

function showToast(message, type = 'info') {
    const container = getEl('toast-container');
    if (!container) return;

    const div = document.createElement('div');
    
    let colors = type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-green-500' : 'bg-blue-500');
    
    div.className = `${colors} text-white px-6 py-3 rounded-lg shadow-xl font-bold text-sm transform transition-all duration-300 translate-x-full opacity-0 flex items-center gap-2`;
    div.innerHTML = `<span>${message}</span>`;
    
    container.appendChild(div);
    
    // Animação de entrada
    requestAnimationFrame(() => {
        div.classList.remove('translate-x-full', 'opacity-0');
    });
    
    // Remove após 3s
    setTimeout(() => {
        div.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => div.remove(), 300);
    }, 3000);
}