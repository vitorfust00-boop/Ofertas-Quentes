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

        // Salvar/Verificar no Firebase
        if (db) {
            try {
                const docRef = db.collection("users").doc(currentUser.id);
                const doc = await docRef.get();
                if (doc.exists) {
                    const dbData = doc.data();
                    currentUser.reputation = dbData.reputation || 50;
                    if (dbData.role) currentUser.role = dbData.role; 
                } else {
                    await docRef.set(currentUser);
                }
            } catch (err) {
                console.warn("Erro ao comunicar com o Firestore, continuando offline mode...", err);
            }
        }

        // Atualizar UI do Perfil
        document.getElementById('header-avatar').src = currentUser.picture;
        document.getElementById('profile-avatar-large').src = currentUser.picture;
        document.getElementById('profile-name').textContent = currentUser.name;
        document.getElementById('profile-email').textContent = currentUser.email;
        document.getElementById('profile-reputation').textContent = currentUser.role === 'admin' ? '∞' : currentUser.reputation;
        
        let roleText = 'Consumidor';
        if (currentUser.role === 'business') roleText = 'Empresa';
        if (currentUser.role === 'admin') {
            roleText = 'Administrador';
            document.getElementById('admin-panel-btn-container').classList.remove('hidden');
        }
        document.getElementById('profile-role').textContent = roleText;

        // Liberar o aplicativo
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        
        // Inicializar a primeira aba (Mapa) se precisar
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
        map = L.map('map').setView([lat, lon], 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: 'Ofertas Quente',
            maxZoom: 19
        }).addTo(map);
    } else {
        map.setView([lat, lon], 14);
    }

    // Adiciona o pino do usuário
    L.circleMarker([lat, lon], {
        radius: 8,
        fillColor: "#f39c12",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map).bindPopup("Você está aqui!").openPopup();
}
