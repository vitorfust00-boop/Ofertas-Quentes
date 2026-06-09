// Configuração Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC-pAVKhvkHAc2NthHBjVqoFbM6xXo9gE8",
    authDomain: "ofertas-quente.firebaseapp.com",
    projectId: "ofertas-quente",
    storageBucket: "ofertas-quente.firebasestorage.app",
    messagingSenderId: "1029283679781",
    appId: "1:1029283679781:web:e521b1a9822205770a79cc",
    measurementId: "G-FHGJG2HFJV"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentUser = null;
let map = null;

// Parse JWT do Google
function parseJwt(token) {
    try {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// Callback Principal do Google Login
window.handleGoogleLogin = async function(response) {
    const loadingBox = document.getElementById('login-loading');
    loadingBox.classList.remove('hidden');

    try {
        const data = parseJwt(response.credential);
        if (!data) throw new Error("Erro ao ler o token do Google.");

        const email = data.email.toLowerCase().trim();
        let role = 'consumer';
        
        if (email.includes('vitor') || email.includes('fusti') || email.includes('fust')) {
            role = 'admin'; 
        }

        currentUser = {
            id: data.sub || data.id,
            name: data.name,
            email: email,
            picture: data.picture,
            role: role,
            reputation: role === 'admin' ? 999999 : 50 
        };

        // Atualiza a UI imediatamente com os dados básicos para não travar a tela
        atualizarUI(currentUser);

        // Salvar/Verificar no Firebase em segundo plano (Assíncrono, sem travar o usuário)
        if (db) {
            const docRef = db.collection("users").doc(currentUser.id);
            docRef.get().then((doc) => {
                if (doc.exists) {
                    const dbData = doc.data();
                    currentUser.reputation = dbData.reputation || 50;
                    if (dbData.role) currentUser.role = dbData.role; 
                    // Atualiza a UI novamente caso o banco tenha dados diferentes (ex: cargo de admin)
                    atualizarUI(currentUser);
                } else {
                    docRef.set(currentUser).catch(err => console.warn("Erro ao criar user no DB", err));
                }
            }).catch(err => {
                console.warn("Erro ao comunicar com o Firestore (offline mode ativo):", err);
            });
        }

        function atualizarUI(user) {
            document.getElementById('header-avatar').src = user.picture;
            document.getElementById('profile-avatar-large').src = user.picture;
            document.getElementById('profile-name').textContent = user.name;
            document.getElementById('profile-email').textContent = user.email;
            document.getElementById('profile-reputation').textContent = user.role === 'admin' ? '∞' : user.reputation;
            
            let roleText = 'Consumidor';
            if (user.role === 'business') roleText = 'Empresa';
            if (user.role === 'admin') {
                roleText = 'Administrador';
                document.getElementById('admin-panel-btn-container').classList.remove('hidden');
            }
            document.getElementById('profile-role').textContent = roleText;
        }

        // Esconder a tela de login e liberar o aplicativo
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        
        // Inicializar a primeira aba (Mapa)
        initMapIfActive();

    } catch (e) {
        alert("Falha no login: " + e.message);
        loadingBox.classList.add('hidden');
    }
};

// Detecção de Segurança file://
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.protocol === 'file:') {
        document.getElementById('login-warning').classList.remove('hidden');
        // Backdoor para poder testar localmente sem servidor
        document.querySelector('.logo').addEventListener('dblclick', () => {
            window.handleGoogleLogin({
                credential: btoa(JSON.stringify({
                    email: "admin@teste.local",
                    name: "Admin Local",
                    sub: "dev_local",
                    picture: "https://via.placeholder.com/40"
                }))
            });
        });
    }

    // Sistema de Navegação das Abas
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            
            // Atualizar botões
            navItems.forEach(btn => btn.classList.remove('active'));
            item.classList.add('active');

            // Atualizar telas
            tabPanes.forEach(pane => pane.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            // Eventos específicos por aba
            if (targetId === 'tab-map') {
                initMapIfActive();
            }
        });
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
        currentUser = null;
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('login-overlay').classList.remove('hidden');
    });

    // GPS Button
    document.getElementById('btn-request-gps').addEventListener('click', () => {
        const btn = document.getElementById('btn-request-gps');
        if (!navigator.geolocation) {
            alert("Geolocalização não suportada.");
            return;
        }

        btn.textContent = "Buscando...";
        btn.disabled = true;

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                btn.classList.add('hidden'); // Esconde o botão após sucesso
                initializeLeafletMap(lat, lon);
            },
            (err) => {
                alert("Erro ao obter GPS. Permita no seu navegador.");
                btn.textContent = "📍 Tentar GPS Novamente";
                btn.disabled = false;
            }
        );
    });
});

function initMapIfActive() {
    // Se a pessoa já permitiu GPS antes, inicializa direto, senão espera o clique
    // Aqui usamos um mapa fixo padrão caso não tenhamos o GPS ainda para não ficar tela preta
    if (!map) {
        initializeLeafletMap(-23.5505, -46.6333); // Centro de SP como padrão
    }
}

function initializeLeafletMap(lat, lon) {
    if (!map) {
        map = L.map('map', {
            worldCopyJump: false,
            maxBounds: [
                [-90, -180],
                [90, 180]
            ],
            maxBoundsViscosity: 1.0
        }).setView([lat, lon], 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: 'Ofertas Quente',
            maxZoom: 19,
            noWrap: true
        }).addTo(map);
    } else {
        map.setView([lat, lon], 14);
    }

    // Limpa marcadores anteriores (se houver a intenção de apenas ter 1 usuário)
    // L.circleMarker...
    L.circleMarker([lat, lon], {
        radius: 8,
        fillColor: "#f39c12",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map).bindPopup("Você está aqui!").openPopup();
}

// ============================================
// LÓGICA DE CADASTRO DE MERCADO
// ============================================
let pendingMarketLocation = null;

document.getElementById('btn-add-market').addEventListener('click', () => {
    if (!currentUser) { alert("Faça login primeiro!"); return; }
    
    // Esconde botões normais, mostra botão de confirmação e mira
    document.getElementById('btn-add-market').classList.add('hidden');
    document.getElementById('btn-request-gps').classList.add('hidden');
    document.getElementById('map-crosshair').classList.remove('hidden');
    document.getElementById('map-confirm-location').classList.remove('hidden');
});

document.getElementById('btn-cancel-crosshair').addEventListener('click', () => {
    resetMarketUI();
});

document.getElementById('btn-confirm-crosshair').addEventListener('click', () => {
    // Pega o centro atual do mapa
    const center = map.getCenter();
    pendingMarketLocation = { lat: center.lat, lng: center.lng };
    
    // Abre o modal
    document.getElementById('market-modal').classList.remove('hidden');
});

document.getElementById('btn-cancel-market').addEventListener('click', () => {
    document.getElementById('market-modal').classList.add('hidden');
    resetMarketUI();
});

document.getElementById('btn-submit-market').addEventListener('click', async () => {
    const nome = document.getElementById('new-market-name').value.trim();
    const bairro = document.getElementById('new-market-neighborhood').value.trim();
    const numero = document.getElementById('new-market-number').value.trim();
    const cidade = document.getElementById('new-market-city').value.trim();

    if (!nome || !numero) {
        alert("Preencha o Nome e o Número!");
        return;
    }

    const btn = document.getElementById('btn-submit-market');
    btn.textContent = "Salvando...";
    btn.disabled = true;

    try {
        const marketData = {
            nome: nome,
            bairro: bairro,
            numero: numero,
            cidade: cidade,
            lat: pendingMarketLocation.lat,
            lon: pendingMarketLocation.lng,
            createdBy: currentUser.id,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (db) {
            await db.collection("markets").add(marketData);
        }

        // Criar o pino visualmente no mapa
        L.marker([pendingMarketLocation.lat, pendingMarketLocation.lng]).addTo(map)
            .bindPopup(`<b>${nome}</b><br>${bairro || ''} nº ${numero}`).openPopup();

        alert("Mercado salvo com sucesso!");
        document.getElementById('market-modal').classList.add('hidden');
        resetMarketUI();
        
        // Limpar inputs
        document.getElementById('new-market-name').value = '';
        document.getElementById('new-market-neighborhood').value = '';
        document.getElementById('new-market-number').value = '';
        document.getElementById('new-market-city').value = '';

    } catch (e) {
        alert("Erro ao salvar: " + e.message);
    } finally {
        btn.textContent = "Salvar Mercado";
        btn.disabled = false;
    }
});

function resetMarketUI() {
    document.getElementById('map-crosshair').classList.add('hidden');
    document.getElementById('map-confirm-location').classList.add('hidden');
    document.getElementById('btn-add-market').classList.remove('hidden');
    document.getElementById('btn-request-gps').classList.remove('hidden');
    pendingMarketLocation = null;
}

// ============================================
// LÓGICA DE CRÍTICAS E SUGESTÕES
// ============================================
document.getElementById('btn-open-feedback').addEventListener('click', () => {
    if (currentUser) {
        document.getElementById('feedback-user-name').value = currentUser.name;
        document.getElementById('feedback-user-email').value = currentUser.email;
    }
    document.getElementById('feedback-modal').classList.remove('hidden');
});

document.getElementById('btn-cancel-feedback').addEventListener('click', () => {
    document.getElementById('feedback-modal').classList.add('hidden');
});
