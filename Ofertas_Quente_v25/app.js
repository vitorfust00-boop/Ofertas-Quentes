// Configuração Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAhju2etYQSDxXtjTeL3B1FjX44Xj866FM",
    authDomain: "ofertas-quentes-2.firebaseapp.com",
    projectId: "ofertas-quentes-2",
    storageBucket: "ofertas-quentes-2.firebasestorage.app",
    messagingSenderId: "1097214270261",
    appId: "1:1097214270261:web:66e270bff5a6e5ed3cca7c",
    measurementId: "G-JPTHLKQ45L"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Puxar mercados do Firebase para o mapa:
loadMarkets();

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

        // Atualiza a UI imediatamente (Optimistic UI)
        atualizarUI(currentUser);

        // Salvar/Verificar no Firebase
        if (db) {
            const docRef = db.collection("users").doc(currentUser.id);
            docRef.get().then((doc) => {
                if (doc.exists) {
                    const dbData = doc.data();
                    currentUser.reputation = dbData.reputation || 50;
                    
                    // Só aceita a role do banco se o cara não for o dono oficial do app
                    const isAdminOficial = currentUser.email.includes('vitor') || currentUser.email.includes('fusti');
                    if (dbData.role && !isAdminOficial) {
                        currentUser.role = dbData.role; 
                    } else if (isAdminOficial && dbData.role !== 'admin') {
                        // Força a correção no banco para o dono sempre ser admin
                        docRef.update({ role: 'admin' });
                    }
                    
                    atualizarUI(currentUser);
                } else {
                    docRef.set(currentUser).catch(err => console.warn("Erro ao criar user", err));
                }
            }).catch(err => console.warn("Modo offline / Firestore erro:", err));
        }

        function atualizarUI(user) {
            document.getElementById('header-avatar').src = user.picture;
            document.getElementById('profile-avatar-large').src = user.picture;
            document.getElementById('profile-name').textContent = user.name;
            document.getElementById('profile-email').textContent = user.email;
            document.getElementById('profile-reputation').textContent = user.role === 'admin' ? '∞' : user.reputation;
            
            let roleText = 'Consumidor';
            if (user.role === 'business') {
                roleText = 'Empresa';
                document.getElementById('btn-add-market').classList.remove('hidden');
            }
            if (user.role === 'admin') {
                roleText = 'Administrador';
                document.getElementById('btn-add-market').classList.remove('hidden');
            }
            if (user.role === 'consumer' || !user.role) {
                document.getElementById('btn-add-market').classList.add('hidden');
            }
            document.getElementById('profile-role').textContent = roleText;
        }

        // Esconder a tela de login global e mostrar a tela de GPS
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('gps-overlay').classList.remove('hidden');

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
        document.querySelector('#login-overlay .logo').addEventListener('dblclick', () => {
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
        document.getElementById('gps-overlay').classList.add('hidden');
        document.getElementById('login-overlay').classList.remove('hidden');
        
        // Limpar Avatar do Header
        document.getElementById('header-avatar').src = 'https://via.placeholder.com/40';
    });

    // Clicar no perfil do cabeçalho leva para a aba de perfil
    document.getElementById('header-profile-btn').addEventListener('click', () => {
        document.querySelector('[data-target="tab-profile"]').click();
    });

    // GPS Button - Agora obrigatório na tela principal
    document.getElementById('btn-request-gps').addEventListener('click', () => {
        const btn = document.getElementById('btn-request-gps');
        const errorMsg = document.getElementById('gps-error-msg');
        
        if (!navigator.geolocation) {
            errorMsg.textContent = "Seu navegador não suporta GPS.";
            errorMsg.classList.remove('hidden');
            return;
        }

        btn.textContent = "Buscando...";
        btn.disabled = true;
        errorMsg.classList.add('hidden');

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                
                // Esconder overlay de GPS e mostrar o app principal
                document.getElementById('gps-overlay').classList.add('hidden');
                document.getElementById('app-container').classList.remove('hidden');
                
                // Força o Leaflet a reajustar o tamanho após tirar o display: none do app-container
                setTimeout(() => {
                    initializeLeafletMap(lat, lon);
                    if (map) map.invalidateSize();
                }, 100);
            },
            (err) => {
                errorMsg.textContent = "Não conseguimos acessar o GPS. Verifique se a permissão de localização do seu navegador está ativada para este site.";
                errorMsg.classList.remove('hidden');
                btn.textContent = "Tentar Novamente";
                btn.disabled = false;
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
});

function initMapIfActive() {
    // Agora o mapa só inicia DEPOIS que o GPS for aceito, então o initMapIfActive 
    // não deve mais forçar as coordenadas de São Paulo para "esconder tela preta".
    // Se o mapa já existir (GPS aprovado), e a pessoa mudou de aba e voltou, 
    // forçamos o resize do mapa para evitar bugs visuais de tiles incompletos.
    if (map) {
        setTimeout(() => map.invalidateSize(), 100);
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
// LÓGICA DO MAPA E MARCADORES
// ============================================
// Dicionário para não duplicar marcadores
const marketMarkers = {};

function loadMarkets() {
    if (!db) {
        console.error("ERRO: db não está inicializado ao chamar loadMarkets!");
        return;
    }
    
    console.log("Iniciando carregamento de mercados da coleção 'markets'...");
    
    // Agora em Tempo Real (Real-time)!
    db.collection("markets").onSnapshot((snapshot) => {
        console.log(`[FIREBASE] onSnapshot disparado! Foram encontrados ${snapshot.docs.length} mercados no banco de dados.`);
        
        let marcadoresCriados = 0;
        
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            const id = change.doc.id;
            
            console.log(`[MERCADO] ID: ${id} | TIPO_ALTERAÇÃO: ${change.type} | NOME: ${data.nome} | LAT: ${data.lat} | LON: ${data.lon}`);
            console.log("Dados completos do mercado:", data);
            
            if (change.type === "added" || change.type === "modified") {
                if (data.lat && data.lon) {
                    // Remover o pino antigo se estiver sendo modificado
                    if (marketMarkers[id]) {
                        if (map) map.removeLayer(marketMarkers[id]);
                    }
                    
                    // Criar o pino novo SE o mapa existir
                    if (map) {
                        const marker = L.marker([data.lat, data.lon]).addTo(map)
                            .bindPopup(`<b>${data.nome}</b><br>${data.bairro || data.rua || ''} nº ${data.numero}`);
                        
                        marketMarkers[id] = marker;
                        marcadoresCriados++;
                        console.log(`[MAPA] Marcador adicionado no mapa para o mercado: ${data.nome}`);
                    } else {
                        console.warn(`[MAPA] Mapa ainda não inicializado para adicionar o mercado: ${data.nome}`);
                    }
                } else {
                    console.error(`[MERCADO] Erro: Mercado ${data.nome} (ID: ${id}) não possui Lat/Lon válidos!`);
                }
            }
            if (change.type === "removed") {
                if (marketMarkers[id]) {
                    if (map) map.removeLayer(marketMarkers[id]);
                    delete marketMarkers[id];
                    console.log(`[MAPA] Marcador removido do mapa para o mercado ID: ${id}`);
                }
            }
        });
        
        console.log(`[RESUMO] Processamento concluído. ${marcadoresCriados} novos marcadores foram inseridos/atualizados no mapa.`);
        console.log(`[RESUMO] Total de marcadores ativos na memória: ${Object.keys(marketMarkers).length}`);
        
    }, e => {
        alert("Erro GRAVE no mapa: " + e.message);
        console.error("Erro no onSnapshot de markets:", e);
    });
}

// ============================================
// LÓGICA DE CADASTRO DE MERCADO
// ============================================
let pendingMarketLocation = null;

document.getElementById('btn-add-market').addEventListener('click', () => {
    // Apenas Admins ou Empresas podem cadastrar
    if (currentUser.role !== 'business' && currentUser.role !== 'admin') {
        alert("Apenas contas Empresariais ou Administradores podem cadastrar mercados.");
        return;
    }

    // Abre o modal diretamente
    document.getElementById('market-modal').classList.remove('hidden');
    // Pega o centro do mapa atual caso a pessoa não queira usar CEP
    const center = map.getCenter();
    pendingMarketLocation = { lat: center.lat, lng: center.lng };
});

document.getElementById('new-market-cep').addEventListener('input', async (e) => {
    let cep = e.target.value.replace(/\D/g, '');
    
    // Formatação visual automática
    if (cep.length > 5) {
        e.target.value = cep.substring(0, 5) + '-' + cep.substring(5, 8);
    } else {
        e.target.value = cep;
    }

    if (cep.length === 8) {
        document.getElementById('new-market-street').value = 'Buscando...';
        document.getElementById('new-market-neighborhood').value = 'Buscando...';
        document.getElementById('new-market-city').value = 'Buscando...';
        
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await res.json();
            
            if (data.erro) {
                alert("CEP não encontrado.");
                document.getElementById('new-market-street').value = '';
                document.getElementById('new-market-neighborhood').value = '';
                document.getElementById('new-market-city').value = '';
                return;
            }
            
            document.getElementById('new-market-street').value = data.logradouro || '';
            document.getElementById('new-market-neighborhood').value = data.bairro || '';
            document.getElementById('new-market-city').value = `${data.localidade} / ${data.uf}`;
            
            // Foca no número para facilitar a vida do usuário
            document.getElementById('new-market-number').focus();
            
            // Tentar achar a latitude/longitude via OpenStreetMap em segundo plano sem travar (sem await!)
            const street = data.logradouro;
            const city = data.localidade;
            
            if (street && city) {
                fetch(`https://nominatim.openstreetmap.org/search?street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&country=Brazil&format=json`)
                .then(r => r.json())
                .then(nomData => {
                    if (nomData && nomData.length > 0) {
                        pendingMarketLocation = {
                            lat: parseFloat(nomData[0].lat),
                            lng: parseFloat(nomData[0].lon)
                        };
                        
                        if (map) {
                            map.setView([pendingMarketLocation.lat, pendingMarketLocation.lng], 16);
                        }
                    }
                }).catch(e => console.log("Erro silencioso Nominatim:", e));
            }
            
        } catch (e) {
            alert("Erro ao buscar CEP: " + e.message);
        }
    }
});

document.getElementById('btn-cancel-market').addEventListener('click', () => {
    document.getElementById('market-modal').classList.add('hidden');
});

document.getElementById('btn-submit-market').addEventListener('click', async () => {
    const nome = document.getElementById('new-market-name').value.trim();
    const bairro = document.getElementById('new-market-neighborhood').value.trim();
    const numero = document.getElementById('new-market-number').value.trim();
    const cidade = document.getElementById('new-market-city').value.trim();
    const rua = document.getElementById('new-market-street').value.trim();

    if (!nome || !numero) {
        alert("Preencha o Nome e o Número!");
        return;
    }

    const btn = document.getElementById('btn-submit-market');
    btn.textContent = "Diagnosticando Servidor...";
    btn.disabled = true;

    try {
        // Teste de conexão direto ao servidor do Google
        const testRes = await fetch(`https://firestore.googleapis.com/v1/projects/ofertas-quentes-2/databases/(default)/documents/markets`);
        const testData = await testRes.json();
        
        if (testData.error) {
            alert("🛑 O GOOGLE RECUSOU O ACESSO AO BANCO DE DADOS!\n\nMotivo: " + testData.error.message + "\nCódigo: " + testData.error.code);
            btn.textContent = "Salvar Mercado";
            btn.disabled = false;
            return;
        }

        btn.textContent = "Salvando...";

        const marketData = {
            nome: nome,
            bairro: bairro,
            numero: numero,
            cidade: cidade,
            rua: rua,
            lat: pendingMarketLocation.lat,
            lon: pendingMarketLocation.lng,
            createdBy: currentUser.id,
            timestamp: new Date()
        };

        if (db) {
            // Dispara e avisa o erro na tela se falhar!
            db.collection("markets").add(marketData).catch(err => {
                alert("ERRO DE BANCO DE DADOS: Não foi possível salvar o mercado. " + err.message);
                console.error("Erro background market:", err);
            });
        }

        // Criar o pino visualmente no mapa imediatamente (Ilusão de velocidade)
        L.marker([pendingMarketLocation.lat, pendingMarketLocation.lng]).addTo(map)
            .bindPopup(`<b>${nome}</b><br>${rua || ''} nº ${numero}`).openPopup();

        alert("Mercado salvo com sucesso!");
        document.getElementById('market-modal').classList.add('hidden');
        
        // Limpar inputs
        document.getElementById('new-market-cep').value = '';
        document.getElementById('new-market-street').value = '';
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

// FIM DO SCRIPT
