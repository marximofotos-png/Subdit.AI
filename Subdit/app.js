// app.js
const customEmojis = ["😀", "😎", "🔥", "🚀", "👑", "👻", "⚡", "🎨", "🎉"];
const timeSlots = [
    "1° Hora (7:30 - 8:30)", "2° Hora (8:30 - 9:30)", "3° Hora (9:45 - 10:45)", "4° Hora (10:45 - 11:45)",
    "5° Hora (12:00 - 13:00)", "6° Hora (13:00 - 14:00)", "7° Hora (14:15 - 15:15)", "8° Hora (15:20 - 16:20)", "9° Hora (16:20 - 17:20)"
];
const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const SYSTEM_INSTRUCTION = `Sos "Subdit", un bot asistente para estudiantes argentinos que están cansados, procrastinando o con pocas ganas de estudiar. Tu estilo de comunicación debe ser bien rioplatense, usando el voseo natural ("vení", "hacé", "tenés"), expresiones cotidianas como "che", "tranca", "ni ahí", "dar una mano" o "ponete las pilas", pero sin exagerar al extremo de sonar forzado. Sé extremadamente empático con su vagancia, directo y señalá suavemente los errores del usuario usando negritas en los conceptos clave para que les quede claro. Recordá: bajo ningún concepto podés dar la respuesta directa del acertijo semanal.`;

if (localStorage.getItem('subdit_version') !== '2026.v6') {
    localStorage.clear();
    localStorage.setItem('subdit_version', '2026.v6');
}

const urlParams = new URLSearchParams(window.location.search);
const adminToken = urlParams.get('adminToken');

const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const resetBtn = document.getElementById('reset-btn');
const communityChatContainer = document.getElementById('community-chat-container');
const communityUserInput = document.getElementById('community-user-input');
const communitySendBtn = document.getElementById('community-send-btn');
const regModal = document.getElementById('registration-modal');
const spanDisplayName = document.getElementById('span-display-name');
const displayRole = document.getElementById('display-role');
const displaySalon = document.getElementById('display-salon');
const displaySalonContainer = document.getElementById('display-salon-container');
const creatorSalonPicker = document.getElementById('creator-salon-picker');
const creatorSalonSelect = document.getElementById('creator-salon-select');

const chatHistory = [];
let communityInterval = null, userIsSuspended = false;

window.addEventListener('DOMContentLoaded', () => {
    setupTextareas();
    setupBackgroundMusic();
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            chatContainer.innerHTML = '<div class="message bot-message">Chat limpio. ¿Qué onda che, en qué te ayudo ahora?</div>';
            chatHistory.length = 0;
        });
    }
    checkRegistration();

    // Evento seguro global para activar el audio en cuanto el usuario haga clic en cualquier lado libre de alertas
    document.body.addEventListener('click', () => {
        const music = document.getElementById('bg-music');
        const toggleBtn = document.getElementById('music-toggle-btn');
        if (music && music.paused && toggleBtn && toggleBtn.textContent === '🔇') {
            music.play().then(() => { toggleBtn.textContent = '🔊'; }).catch(e => console.log("Permiso de audio latente..."));
        }
    }, { once: true });
});

function switchTab(tab) {
    document.querySelectorAll('.sidebar-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.section-content').forEach(section => section.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${tab}`);
    const activeSection = document.getElementById(`section-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    if (activeSection) activeSection.classList.add('active');
    
    if (tab === 'comunidad') {
        fetchCommunityMessages();
        startCommunityPolling();
    } else {
        stopCommunityPolling();
    }
    if (tab === 'horarios') {
        const activeSalon = localStorage.getItem('user_salon') || 'General';
        loadHorariosFromServer(activeSalon);
    }
    if (tab === 'soporte') {
        loadSupportView();
    }
}

function switchLoginTab(role) {
    document.querySelectorAll('.login-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.login-form-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById(`tab-btn-${role}`).classList.add('active');
    document.getElementById(`form-${role}`).classList.add('active');
}

async function checkRegistration() {
    const userName = localStorage.getItem('user_name');
    if (!userName) {
        regModal.style.display = 'flex';
    } else {
        regModal.style.display = 'none';
        await proceedWithLogin();
    }
}

function formatMarkdown(text) {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

function resetRegistration() {
    localStorage.clear();
    window.location.reload();
}

async function proceedWithLogin() {
    const userName = localStorage.getItem('user_name'), userRole = localStorage.getItem('user_role') || 'user';
    const userColor = localStorage.getItem('user_color') || '#ffffff', userSalon = localStorage.getItem('user_salon');
    
    spanDisplayName.textContent = userName; 
    spanDisplayName.style.color = userColor;

    const music = document.getElementById('bg-music');
    const toggleBtn = document.getElementById('music-toggle-btn');
    if (music && toggleBtn) {
        music.play().then(() => { toggleBtn.textContent = '🔊'; }).catch(e => console.log("Audio esperando gesto válido..."));
    }

    const logoutBtn = document.getElementById('sidebar-logout-btn');
    if (logoutBtn) logoutBtn.style.display = (userRole === 'superadmin') ? 'block' : 'none';

    if (userRole === 'superadmin' || userRole === 'admin') {
        displayRole.textContent = userRole === 'superadmin' ? "Creador 👑" : "Moderador ⚡";
        displayRole.style.color = userRole === 'superadmin' ? "#a855f7" : userColor;
        displaySalonContainer.style.display = 'none'; creatorSalonPicker.style.display = 'flex';
        document.getElementById('btn-admin').style.display = 'flex';
        document.getElementById('superadmin-tools').style.display = userRole === 'superadmin' ? 'block' : 'none';
        await loadCreatorDashboard();
    } else {
        displayRole.textContent = "Estudiante 🎒"; displayRole.style.color = "#94a3b8";
        displaySalonContainer.style.display = 'block'; displaySalon.textContent = userSalon;
        creatorSalonPicker.style.display = 'none'; document.getElementById('btn-admin').style.display = 'none';
        // Volvemos a registrar al estudiante al cargar por si se limpia la memoria del backend
        const courseKey = localStorage.getItem('user_salon_key');
        if (userSalon && courseKey) {
            await fetch('/api/salones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: userSalon, key: courseKey, username: userName }) });
        }
    }

    try { await checkSuspensionStatus(); } catch (e) { console.error(e); }
    renderHorariosStructure();

    try {
        const activeS = localStorage.getItem('user_salon') || 'General';
        if (!userIsSuspended) await loadHorariosFromServer(activeS);
        await loadDesafioDetails();
    } catch (e) { console.error(e); }
}

async function checkSuspensionStatus() {
    const name = localStorage.getItem('user_name'); if (!name) return;
    try {
        const res = await fetch(`/api/user-status?username=${encodeURIComponent(name)}`);
        const data = await res.json();
        userIsSuspended = !!data.suspended;
    } catch (e) { console.error(e); }
}

async function loginEstudiante() {
    const nickname = document.getElementById('reg-nickname').value.trim(), year = document.getElementById('reg-year').value, division = document.getElementById('reg-division').value, courseKey = document.getElementById('reg-course-key').value.trim();
    if (!nickname || !courseKey) { alert("Completá todos los casilleros."); return; }
    
    // CORRECCIÓN: Se normalizaron los mapeos para evitar registros corruptos ("2° segunda")
    const constLabels = { "1": "1°", "2": "2°", "3": "3°", "4": "4°", "5": "5°", "6": "6°" };
    const sFormatted = `${constLabels[year]} ${division}`;
    
    try {
        const res = await fetch('/api/salones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: sFormatted, key: courseKey, username: nickname }) });
        if (res.ok) {
            localStorage.setItem('user_name', nickname); localStorage.setItem('user_role', 'user');
            localStorage.setItem('user_salon', sFormatted); localStorage.setItem('user_salon_key', courseKey);
            regModal.style.display = 'none'; proceedWithLogin();
        } else { alert("Error de acceso."); }
    } catch (e) { console.error(e); }
}

function loginCreador() {
    const email = document.getElementById('creador-email').value.trim(), password = document.getElementById('creador-password').value.trim();
    if (email !== "Marximo.fotos@gmail.com" || password !== "Morty1403") { alert("Credenciales incorrectas."); return; }
    localStorage.setItem('user_name', "Lean Aguirre"); localStorage.setItem('user_role', 'superadmin');
    localStorage.setItem('user_color', '#a855f7'); localStorage.setItem('user_salon', 'General');
    localStorage.setItem('user_salon_key', '1234'); regModal.style.display = 'none'; proceedWithLogin();
}

async function requestAdminAccess() {
    const email = document.getElementById('admin-email').value.trim(), nickname = document.getElementById('admin-nickname').value.trim();
    if (!email || !nickname) { alert("Completá los campos."); return; }
    try {
        const res = await fetch('/api/admin/solicitar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, nickname }) });
        const data = await res.json();
        if (data.approved) {
            localStorage.setItem('user_name', nickname); localStorage.setItem('user_role', 'admin');
            localStorage.setItem('user_color', '#f59e0b'); localStorage.setItem('user_salon', 'General');
            regModal.style.display = 'none'; proceedWithLogin();
        } else {
            const msg = document.getElementById('admin-status-msg'); msg.style.display = 'block';
            msg.textContent = "Solicitud enviada. Esperá la aprobación.";
        }
    } catch (e) { console.error(e); }
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || sendBtn.disabled) return;
    appendMessage(text, 'user-message', false);
    chatHistory.push({ role: 'user', parts: [{ text }] });
    userInput.value = ''; setLoading(true);
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: chatHistory, systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] } })
        });
        const data = await res.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (reply) {
            chatHistory.push({ role: 'model', parts: [{ text: reply }] });
            appendMessage(formatMarkdown(reply), 'bot-message', true);
        }
    } catch (e) { console.error(e); } finally { setLoading(false); }
}

function appendMessage(text, className, isHTML = false) {
    const div = document.createElement('div'); div.classList.add('message', className);
    if (isHTML) div.innerHTML = text; else div.textContent = text;
    chatContainer.appendChild(div); chatContainer.scrollTop = chatContainer.scrollHeight;
}

function setLoading(isLoading) { sendBtn.disabled = isLoading; userInput.disabled = isLoading; }

function startCommunityPolling() { if (!communityInterval) communityInterval = setInterval(fetchCommunityMessages, 3000); }
function stopCommunityPolling() { clearInterval(communityInterval); communityInterval = null; }

async function fetchCommunityMessages() {
    const act = localStorage.getItem('user_salon') || 'General';
    try {
        const res = await fetch(`/api/comunidad?salon=${encodeURIComponent(act)}`);
        const data = await res.json();
        communityChatContainer.innerHTML = '';
        data.mensajes.forEach(msg => {
            const div = document.createElement('div'); div.classList.add('message', 'bot-message');
            div.innerHTML = `<div class="msg-sender" style="color:var(--accent-color); font-weight:bold; font-size:0.8rem; margin-bottom:4px;">${msg.sender}</div><div>${msg.text}</div>`;
            communityChatContainer.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

async function sendCommunityMessage() {
    const text = communityUserInput.value.trim(), act = localStorage.getItem('user_salon') || 'General', name = localStorage.getItem('user_name');
    if (!text) return; communityUserInput.value = '';
    try { await fetch('/api/comunidad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ salon: act, sender: name, text }) }); fetchCommunityMessages(); }
    catch (e) { console.error(e); }
}

function renderHorariosStructure() {
    const body = document.getElementById('horarios-table-body'); body.innerHTML = '';
    timeSlots.forEach((slot, idx) => {
        const tr = document.createElement('tr'), td = document.createElement('td'); td.textContent = slot; tr.appendChild(td);
        days.forEach(d => {
            const tdCell = document.createElement('td'), input = document.createElement('input');
            input.type = 'text'; input.classList.add('horario-cell-input'); input.dataset.day = d; input.dataset.slot = idx;
            tdCell.appendChild(input); tr.appendChild(tdCell);
        });
        body.appendChild(tr);
    });
}

async function loadHorariosFromServer(salon) {
    try {
        const res = await fetch(`/api/horarios?salon=${encodeURIComponent(salon)}`);
        const data = await res.json();
        if (data.horarios) {
            document.querySelectorAll('.horario-cell-input').forEach(input => {
                const d = input.dataset.day, s = input.dataset.slot;
                input.value = data.horarios[d]?.[s] || '';
            });
        }
    } catch (e) { console.error(e); }
}

async function saveHorarios() {
    const act = localStorage.getItem('user_salon') || 'General', horarios = {};
    days.forEach(d => { horarios[d] = {}; });
    document.querySelectorAll('.horario-cell-input').forEach(input => { horarios[input.dataset.day][input.dataset.slot] = input.value.trim(); });
    try { await fetch('/api/horarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ salon: act, horarios }) }); alert("Horario escolar guardado."); }
    catch (e) { console.error(e); }
}

async function loadDesafioDetails() {
    try {
        const res = await fetch('/api/challenge'); const data = await res.json();
        document.getElementById('riddle-text').textContent = data.riddle;
    } catch (e) { console.error(e); }
}

async function submitChallengeAnswer() {
    const ans = document.getElementById('challenge-answer-input').value.trim(), act = localStorage.getItem('user_salon');
    try { const res = await fetch('/api/challenge/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ salon: act, answer: ans }) }); const d = await res.json(); alert(d.error || "¡Adivinaste!"); }
    catch (e) { console.error(e); }
}

async function checkAdvantageEmojis() { document.getElementById('emoji-advantage-area').innerHTML = ''; }

async function loadSupportView() {
    const role = localStorage.getItem('user_role') || 'user', myName = localStorage.getItem('user_name');
    const list = document.getElementById('soporte-tickets-list'); list.innerHTML = '';
    try {
        const url = role === 'superadmin' || role === 'admin' ? '/api/soporte?all=true' : `/api/soporte?username=${encodeURIComponent(myName)}`;
        const res = await fetch(url), data = await res.json();
        data.tickets.forEach(t => {
            const d = document.createElement('div'); d.classList.add('ticket-item');
            d.innerHTML = `<div class="ticket-header"><span>Ticket #${t.id} — De: ${t.sender} (${t.salon})</span></div><p style="margin-top:5px; color:#cbd5e1;">${t.text}</p>`;
            list.appendChild(d);
        });
    } catch (e) { console.error(e); }
}

async function sendSupportTicket() {
    const msg = document.getElementById('soporte-message'), text = msg.value.trim(), name = localStorage.getItem('user_name'), salon = localStorage.getItem('user_salon') || 'Gral';
    if (!text) return;
    try { await fetch('/api/soporte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: name, salon, text }) }); msg.value = ''; alert("Reporte de bug enviado."); loadSupportView(); }
    catch (e) { console.error(e); }
}

async function generateAdminLink() {
    try {
        const res = await fetch('/api/creator/generate-link', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            document.getElementById('generated-link-input').value = `${window.location.origin}/index.html?adminToken=${data.tokenToken}`;
        }
    } catch (e) { console.error(e); }
}

function copyAdminLink() {
    const input = document.getElementById('generated-link-input');
    if (!input.value) return;
    input.select(); document.execCommand('copy'); alert("Link copiado.");
}

async function loadCreatorDashboard() {
    try {
        const res = await fetch('/api/creator/dashboard'), data = await res.json();
        
        // Cargar selector de espiar cursos expandido
        const selectElement = document.getElementById('creator-salon-select');
        selectElement.innerHTML = '';
        data.salones.forEach(s => {
            const opt = document.createElement('option'); opt.value = s; opt.textContent = `Espiar: ${s}`;
            if(s === localStorage.getItem('user_salon')) opt.selected = true;
            selectElement.appendChild(opt);
        });

        const pList = document.getElementById('pending-admins-list'); pList.innerHTML = '';
        const pendingKeys = Object.keys(data.pendingAdmins);
        if (pendingKeys.length === 0) pList.innerHTML = '<p style="font-style:italic; color:#64748b; font-size:0.9rem;">No hay solicitudes.</p>';
        pendingKeys.forEach(e => {
            const item = data.pendingAdmins[e];
            const div = document.createElement('div'); 
            div.style = "padding:10px; background:rgba(0,0,0,0.2); border-radius:8px; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;";
            div.innerHTML = `<span>${item.nickname} (${item.email})</span> <button class="send-button" style="height:32px; padding:0 12px; font-size:0.8rem; background:var(--success-color);" onclick="approveAdmin('${item.email}')">Aprobar</button>`;
            pList.appendChild(div);
        });

        // ARBOL COMPLETO CORREGIDO: Despliega todos los usuarios mapeados en el servidor
        const collapseContainer = document.getElementById('academy-salones-collapse-container');
        collapseContainer.innerHTML = '';
        
        data.salones.forEach(salonName => {
            const card = document.createElement('div');
            card.classList.add('salon-collapse-card');
            
            const enrolledUsers = Object.keys(data.users).filter(username => data.users[username].salon === salonName);
            
            card.innerHTML = `
                <div class="salon-collapse-header" onclick="toggleSalonCollapse(this)">
                    <span>📍 Curso: ${salonName} (${enrolledUsers.length} Alumnos)</span>
                    <span class="salon-collapse-arrow">▼</span>
                </div>
                <div class="salon-collapse-content">
                    ${enrolledUsers.length === 0 
                        ? '<p style="color:#64748b; font-style:italic; padding: 5px;">Ningún alumno registrado en este salón todavía.</p>' 
                        : enrolledUsers.map(u => `<div class="user-nested-item">👤 <strong>${u}</strong> — Rango: ${data.users[u].role === 'superadmin' ? 'Creador 👑' : 'Estudiante 🎒'}</div>`).join('')}
                </div>
            `;
            collapseContainer.appendChild(card);
        });

    } catch (e) { console.error(e); }
}

async function creatorSwitchSalon(newS) {
    localStorage.setItem('user_salon', newS);
    await proceedWithLogin();
    alert(`Espiando el salón: ${newS}`);
    if (document.getElementById('section-comunidad').classList.contains('active')) fetchCommunityMessages();
}

function toggleSalonCollapse(headerElement) {
    const arrow = headerElement.querySelector('.salon-collapse-arrow');
    const content = headerElement.nextElementSibling;
    if (content.style.display === 'block') {
        content.style.display = 'none';
        arrow.classList.remove('open');
    } else {
        content.style.display = 'block';
        arrow.classList.add('open');
    }
}

async function approveAdmin(email) {
    try { await fetch('/api/creator/approve-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); loadCreatorDashboard(); }
    catch (e) { console.error(e); }
}

async function suspendUser() {
    const name = document.getElementById('suspend-nickname').value.trim(), d = document.getElementById('suspend-days').value;
    try { await fetch('/api/admin/suspend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: name, days: parseInt(d) }) }); alert("Usuario suspendido."); }
    catch (e) { console.error(e); }
}

function setupTextareas() {
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    communitySendBtn.addEventListener('click', sendCommunityMessage);
}

// LÓGICA DE AUDIO SILENCIOSA DE DESVÍO AUTOMÁTICO LIBRE DE ALERTAS POP-UP
function setupBackgroundMusic() {
    const music = document.getElementById('bg-music');
    const toggleBtn = document.getElementById('music-toggle-btn');
    if (!music || !toggleBtn) return;

    music.volume = 0.20;

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (music.paused) {
            music.play()
                .then(() => { toggleBtn.textContent = '🔊'; })
                .catch(() => {
                    // Bypass seguro de permisos cruzados de navegadores
                    music.muted = true;
                    music.play().then(() => {
                        music.muted = false;
                        toggleBtn.textContent = '🔊';
                    });
                });
        } else {
            music.pause();
            toggleBtn.textContent = '🔇';
        }
    });
}