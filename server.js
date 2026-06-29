// server.js
// Para correrlo: Abre la consola de tu carpeta y escribe: node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) return;

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) {
            process.env[key] = value;
        }
    });
}

loadEnvFile(path.join(__dirname, '.env'));

const PORT = process.env.PORT || 3005;
const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.html': return 'text/html; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.js': return 'application/javascript; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        default: return 'application/octet-stream';
    }
}

const DB = {
    salones: {
        "General": { name: "General", key: "1234", horarios: {}, mensajes: [] }
    },
    users: {
        // Credenciales Maestras de Máximo (Creador)
        "Lean Aguirre": { role: "superadmin", color: "#a855f7", salon: "General", email: "Marximo.fotos@gmail.com", suspendedUntil: null }
    },
    pendingAdmins: {}, 
    adminLinks: {},    
    tickets: [],       
    challenge: {
        riddle: "Tengo llaves pero no abro puertas, tengo espacio pero no tengo habitación, podés entrar pero no salir. ¿Qué soy?",
        clues: [
            "Se encuentra justo frente a tus ojos en este momento.",
            "Posee la barra más larga y codiciada del mundo.",
            "Tiene una llave con forma de flecha para 'Volver' y otra para 'Escapar'.",
            "Tiene una llave dedicada únicamente a dar 'Espacio'.",
            "Para ingresar debés golpear su tecla de mayor tamaño.",
            "Las computadoras no pueden comunicarse con el usuario sin su presencia.",
            "Empieza con la letra T y termina con la letra O."
        ],
        answer: "teclado",
        winnerSalon: null,
        advantage: "Barra de emojis personalizados habilitada para chatear en Comunidad"
    }
};

function buildLocalFallbackReply(userText = '') {
    const normalized = (userText || '').trim().toLowerCase();
    if (!normalized) return 'Hola, estoy respondiendo desde el modo local porque Gemini no está disponible en este momento.';
    if (normalized.includes('hola')) return 'Hola, te ayudo con lo que necesites en Subdit.';
    return `Entiendo que tu mensaje es: "${userText}". Sigo funcionando en modo de respaldo local.`;
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-goog-api-key');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Servir archivos estáticos
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html' || pathname === '/styles.css' || pathname === '/app.js' || pathname === '/Coffee_and_Heavy_Clouds.mp3')) {
        const filePath = pathname === '/' ? path.join(__dirname, 'index.html') : path.join(__dirname, pathname.replace(/^\//, ''));
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Archivo no encontrado.');
            } else {
                res.writeHead(200, { 'Content-Type': getContentType(filePath) });
                res.end(content);
            }
        });
        return;
    }
    
    // API de Chat
    else if (pathname === '/api/chat' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const { contents, systemInstruction } = body;
            const userPrompt = contents[contents.length - 1].parts[0].text.toLowerCase();
            const blockedKeywords = ["teclado", "acertijo", "riddle", "enigma", "desafio"];
            
            let isCheating = false;
            for (const key of blockedKeywords) {
                if (userPrompt.includes(key)) { isCheating = true; break; }
            }

            if (isCheating) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: "¡EPA! Ni lo sueñes, che. Conmigo no vas a hacer trampa para ganar el Desafío Semanal. ¡A laburar el bocho!" }] } }] }));
                return;
            }

            const userText = contents?.[contents.length - 1]?.parts?.[0]?.text || '';
            if (!API_KEY) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: buildLocalFallbackReply(userText) }] } }], fallback: true }));
                return;
            }

            let data = {};
            let responseText = '';
            let providerUsed = 'local';

            if (AI_PROVIDER === 'ollama') {
                const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: OLLAMA_MODEL, prompt: `${systemInstruction?.parts?.[0]?.text || ''}\n\nUsuario: ${userText}`, stream: false })
                });
                responseText = await ollamaResponse.text();
                if (ollamaResponse.ok) {
                    const ollamaData = JSON.parse(responseText);
                    data = { candidates: [{ content: { parts: [{ text: ollamaData.response }] } }] };
                    providerUsed = 'ollama';
                }
            } else {
                const googleResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(API_KEY)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
                    body: JSON.stringify({ contents, systemInstruction })
                });
                responseText = await googleResponse.text();
                data = responseText ? JSON.parse(responseText) : {};
                providerUsed = 'gemini';
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ...data, provider: providerUsed }));
        } catch (error) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: buildLocalFallbackReply('') }] } }], fallback: true }));
        }
    }
    
    // Registrar o ingresar a salones (Mapeo completo de alumnos)
    else if (pathname === '/api/salones' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const { name, key, username } = body;
            if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Faltan datos de ingreso' }));
                return;
            }

            if (!DB.salones[name]) {
                DB.salones[name] = {
                    name: name,
                    key: key || "1234",
                    horarios: {},
                    mensajes: [{ sender: "Subdit", text: `¡Bienvenidos al chat de ${name}!`, time: getFormattedTime() }]
                };
            } else if (key && DB.salones[name].key !== key) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Contraseña de curso incorrecta.' }));
                return;
            }

            // CORRECCIÓN: Guardamos de forma explícita al estudiante y su salón en la base de datos central
            if (username && username !== "Lean Aguirre") {
                DB.users[username] = {
                    role: 'user',
                    color: '#94a3b8',
                    salon: name,
                    suspendedUntil: null
                };
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    }
    
    else if (pathname === '/api/user-status' && req.method === 'GET') {
        const username = query.username;
        const user = DB.users[username];
        if (user && user.suspendedUntil && user.suspendedUntil > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ suspended: true, until: user.suspendedUntil }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ suspended: false }));
        }
    }
    
    else if (pathname === '/api/comunidad' && req.method === 'GET') {
        const salon = query.salon;
        if (!salon || !DB.salones[salon]) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Salon no encontrado' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ mensajes: DB.salones[salon].mensajes }));
    }
    
    else if (pathname === '/api/comunidad' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const { salon, sender, text } = body;
            const user = DB.users[sender];
            if (user && user.suspendedUntil && user.suspendedUntil > Date.now()) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Tu cuenta está suspendida.' }));
                return;
            }
            if (!DB.salones[salon]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Salon no registrado' }));
                return;
            }
            const msgObj = { sender, text, time: getFormattedTime() };
            DB.salones[salon].mensajes.push(msgObj);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, mensaje: msgObj }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    }
    
    else if (pathname === '/api/horarios' && req.method === 'GET') {
        const salon = query.salon;
        if (!salon || !DB.salones[salon]) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Salon no encontrado' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ horarios: DB.salones[salon].horarios }));
    }
    
    else if (pathname === '/api/horarios' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const { salon, horarios } = body;
            if (!DB.salones[salon]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Salon no encontrado' }));
                return;
            }
            DB.salones[salon].horarios = horarios;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    }
    
    else if (pathname === '/api/challenge' && req.method === 'GET') {
        const dayOfWeek = new Date().getDay();
        let revealedCount = dayOfWeek === 0 ? 7 : dayOfWeek;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ riddle: DB.challenge.riddle, revealedClues: DB.challenge.clues.slice(0, revealedCount), winner: DB.challenge.winnerSalon, advantage: DB.challenge.advantage }));
    }
    
    else if (pathname === '/api/challenge/submit' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const { salon, answer } = body;
            if (answer.toLowerCase().trim() === DB.challenge.answer.toLowerCase()) {
                DB.challenge.winnerSalon = salon;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Respuesta incorrecta." }));
            }
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    }
    
    else if (pathname === '/api/soporte' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const { sender, salon, text } = body;
            DB.tickets.push({ id: DB.tickets.length + 1, sender, salon, text, reply: null, time: getFormattedTime() });
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message }));
        }
    }
    
    else if (pathname === '/api/soporte' && req.method === 'GET') {
        if (query.all === 'true') {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ tickets: DB.tickets }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ tickets: DB.tickets.filter(t => t.sender === query.username) }));
        }
    }

    else if (pathname === '/api/creator/generate-link' && req.method === 'POST') {
        const token = Math.random().toString(36).substring(2, 15);
        DB.adminLinks[token] = { used: false, createdAt: Date.now() };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tokenToken: token }));
    }
    
    else if (pathname === '/api/admin/solicitar' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const { email, nickname } = body;
            if (!DB.pendingAdmins[email]) DB.pendingAdmins[email] = { nickname, email, approved: false, color: '#f59e0b' };
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ approved: DB.pendingAdmins[email].approved }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message }));
        }
    }

    else if (pathname === '/api/admin/suspend' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const { nickname, days } = body;
            if (!DB.users[nickname]) DB.users[nickname] = { role: 'user', color: '#ffffff', salon: 'General' };
            DB.users[nickname].suspendedUntil = Date.now() + (days * 24 * 60 * 60 * 1000);
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message }));
        }
    }

    else if (pathname === '/api/creator/dashboard' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ salones: Object.keys(DB.salones), users: DB.users, pendingAdmins: DB.pendingAdmins }));
    }

    else if (pathname === '/api/creator/approve-admin' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const { email } = body;
            if (DB.pendingAdmins[email]) {
                DB.pendingAdmins[email].approved = true;
                DB.users[DB.pendingAdmins[email].nickname] = { role: 'admin', color: '#f59e0b', email: email, salon: 'General', suspendedUntil: null };
            }
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message }));
        }
    }
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Ruta no encontrada');
    }
});

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (err) { reject(err); } });
    });
}

function getFormattedTime() {
    return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

server.listen(PORT, () => {
    console.log(`\n=== ¡SERVIDOR DE SUBDIT ACTIVO! ===`);
    console.log(`Entra en tu navegador a: http://localhost:${PORT}\n`);
});