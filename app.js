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
                document.getElementById('admin-panel-btn-container').classList.add('hidden');
            }
            if (user.role === 'admin') {
                roleText = 'Administrador';
                document.getElementById('admin-panel-btn-container').classList.remove('hidden');
                document.getElementById('btn-add-market').classList.remove('hidden');
                checkUnreadFeedbacks(); // Verifica se há mensagens novas
            }
            if (user.role === 'consumer' || !user.role) {
                document.getElementById('btn-add-market').classList.add('hidden');
                document.getElementById('admin-panel-btn-container').classList.add('hidden');
            }
            document.getElementById('profile-role').textContent = roleText;
        }

        // Função para checar msgs não lidas
        function checkUnreadFeedbacks() {
            if (!db) return;
            db.collection("feedbacks").where("read", "==", false).get().then(snap => {
                const badge = document.getElementById('admin-notification-badge');
                if (!snap.empty) {
                    badge.textContent = snap.size;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }).catch(() => {});
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

document.getElementById('btn-search-cep').addEventListener('click', async () => {
    let cep = document.getElementById('new-market-cep').value.replace(/\D/g, '');
    if (cep.length !== 8) {
        alert("CEP inválido. Digite 8 números.");
        return;
    }
    
    const btn = document.getElementById('btn-search-cep');
    btn.textContent = "...";
    
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        
        if (data.erro) {
            alert("CEP não encontrado.");
            return;
        }
        
        document.getElementById('new-market-street').value = data.logradouro || '';
        document.getElementById('new-market-neighborhood').value = data.bairro || '';
        document.getElementById('new-market-city').value = `${data.localidade} / ${data.uf}`;
        
        // Tentar achar a latitude/longitude via OpenStreetMap (Nominatim)
        const street = data.logradouro;
        const city = data.localidade;
        
        if (street && city) {
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&country=Brazil&format=json`);
            const nomData = await nomRes.json();
            
            if (nomData && nomData.length > 0) {
                pendingMarketLocation = {
                    lat: parseFloat(nomData[0].lat),
                    lng: parseFloat(nomData[0].lon)
                };
                
                // Mover o mapa no fundo para mostrar que achou
                if (map) {
                    map.setView([pendingMarketLocation.lat, pendingMarketLocation.lng], 16);
                }
            }
        }
        
    } catch (e) {
        alert("Erro ao buscar CEP: " + e.message);
    } finally {
        btn.textContent = "Buscar";
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

// ============================================
// LÓGICA DO PAINEL ADMIN
// ============================================

document.getElementById('btn-open-admin').addEventListener('click', () => {
    try {
        const modal = document.getElementById('admin-modal');
        if (!modal) {
            alert("Erro: O HTML do admin-modal não foi encontrado na página! Verifique o cache.");
            return;
        }
        modal.classList.remove('hidden');
        
        // Sempre abre na aba de mensagens primeiro
        document.getElementById('admin-tab-feedbacks').click();
    } catch (e) {
        alert("Erro ao abrir painel admin: " + e.message);
    }
});

document.getElementById('btn-close-admin').addEventListener('click', () => {
    document.getElementById('admin-modal').classList.add('hidden');
    // Re-checar as notificações ao fechar (caso tenha lido algo)
    if (currentUser && currentUser.role === 'admin') {
        db.collection("feedbacks").where("read", "==", false).get().then(snap => {
            const badge = document.getElementById('admin-notification-badge');
            if (!snap.empty) {
                badge.textContent = snap.size;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }).catch(() => {});
    }
});

// Navegação interna do Admin
document.getElementById('admin-tab-feedbacks').addEventListener('click', () => {
    document.getElementById('admin-tab-feedbacks').classList.replace('btn-secondary', 'btn-action');
    document.getElementById('admin-tab-users').classList.replace('btn-action', 'btn-secondary');
    
    document.getElementById('admin-content-feedbacks').classList.remove('hidden');
    document.getElementById('admin-content-users').classList.add('hidden');
    loadAdminFeedbacks();
});

document.getElementById('admin-tab-users').addEventListener('click', () => {
    document.getElementById('admin-tab-users').classList.replace('btn-secondary', 'btn-action');
    document.getElementById('admin-tab-feedbacks').classList.replace('btn-action', 'btn-secondary');
    
    document.getElementById('admin-content-users').classList.remove('hidden');
    document.getElementById('admin-content-feedbacks').classList.add('hidden');
    loadAdminUsers();
});

// Carregar Feedbacks
function loadAdminFeedbacks() {
    const list = document.getElementById('admin-content-feedbacks');
    list.innerHTML = '<div style="text-align: center; padding: 20px;">Carregando mensagens...</div>';
    
    db.collection("feedbacks").orderBy("timestamp", "desc").limit(50).get().then((snapshot) => {
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<div class="empty-state">Nenhuma mensagem recebida.</div>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const card = document.createElement('div');
            
            // Estilo diferente se não foi lido
            const bgClass = data.read ? 'rgba(255,255,255,0.05)' : 'rgba(243, 156, 18, 0.2)';
            const borderClass = data.read ? 'none' : '1px solid var(--primary)';
            
            card.style.cssText = `background: ${bgClass}; border: ${borderClass}; padding: 15px; border-radius: 10px; display: flex; flex-direction: column; gap: 8px;`;
            
            const dateStr = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Recente';
            
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: var(--primary);">${data.name || 'Anônimo'}</strong>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${dateStr}</span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${data.email || ''}</div>
                <div style="font-size: 0.95rem; margin-top: 5px; white-space: pre-wrap; line-height: 1.4;">${data.message || ''}</div>
                ${!data.read ? `<button class="btn-secondary" style="margin-top: 10px; padding: 5px; font-size: 0.8rem;" onclick="markFeedbackRead('${doc.id}', this)">Marcar como lido</button>` : ''}
            `;
            list.appendChild(card);
        });
    }).catch(err => {
        list.innerHTML = '<div style="color: red; text-align: center;">Erro ao carregar mensagens.</div>';
        console.error("Erro Feedbacks:", err);
    });
}

// Tornar global para o onclick
window.markFeedbackRead = function(docId, btnElement) {
    btnElement.textContent = "Marcando...";
    btnElement.disabled = true;
    db.collection("feedbacks").doc(docId).update({ read: true }).then(() => {
        btnElement.parentElement.style.background = 'rgba(255,255,255,0.05)';
        btnElement.parentElement.style.border = 'none';
        btnElement.remove();
    }).catch(err => {
        btnElement.textContent = "Erro!";
    });
};

function loadAdminUsers(searchQuery = '') {
    const list = document.getElementById('admin-users-list');
    list.innerHTML = '<div style="text-align: center; padding: 20px;">Carregando usuários...</div>';
    
    db.collection("users").limit(50).get().then((snapshot) => {
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<div class="empty-state">Nenhum usuário encontrado no banco.</div>';
            return;
        }

        const queryLower = searchQuery.toLowerCase();

        snapshot.forEach(doc => {
            const data = doc.data();
            const name = data.name || 'Sem nome';
            const email = data.email || 'Sem e-mail';
            
            if (searchQuery && !name.toLowerCase().includes(queryLower) && !email.toLowerCase().includes(queryLower)) {
                return;
            }

            const card = document.createElement('div');
            card.style.cssText = "background: rgba(255,255,255,0.05); padding: 10px; border-radius: 10px; display: flex; align-items: center; justify-content: space-between;";
            
            card.innerHTML = `
                <div>
                    <strong style="color: var(--primary);">${name}</strong><br>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">${email}</span>
                </div>
                <div style="font-size: 0.8rem; background: var(--bg-dark); padding: 4px 8px; border-radius: 10px; text-transform: uppercase;">
                    ${data.role || 'consumer'}
                </div>
            `;
            list.appendChild(card);
        });

        if (list.innerHTML === '') {
            list.innerHTML = '<div class="empty-state" style="padding: 10px;">Nenhum usuário corresponde à pesquisa.</div>';
        }
    }).catch(err => {
        list.innerHTML = '<div style="color: red; text-align: center;">Erro ao carregar usuários.</div>';
        console.error("Erro Admin:", err);
    });
}

document.getElementById('admin-search-users').addEventListener('input', (e) => {
    loadAdminUsers(e.target.value);
});

// ============================================
// LÓGICA DE CRÍTICAS E SUGESTÕES
// ============================================
document.getElementById('btn-open-feedback').addEventListener('click', () => {
    document.getElementById('feedback-modal').classList.remove('hidden');
});

document.getElementById('btn-cancel-feedback').addEventListener('click', () => {
    document.getElementById('feedback-modal').classList.add('hidden');
});

document.getElementById('btn-submit-feedback').addEventListener('click', async () => {
    const msgInput = document.getElementById('feedback-message');
    const message = msgInput.value.trim();
    
    if (!message) {
        alert("Por favor, digite uma mensagem.");
        return;
    }

    const btn = document.getElementById('btn-submit-feedback');
    btn.textContent = "Enviando...";
    btn.disabled = true;

    try {
        // Dispara e esquece! Não usamos await para não travar a UI (evita demorar "1000 anos")
        db.collection("feedbacks").add({
            userId: currentUser ? currentUser.id : 'anon',
            name: currentUser ? currentUser.name : 'Visitante',
            email: currentUser ? currentUser.email : '',
            message: message,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            read: false
        }).catch(err => {
            console.error("Erro background feedback:", err);
        });

        alert("Sua crítica foi enviada ao administrador!");
        document.getElementById('feedback-modal').classList.add('hidden');
        msgInput.value = '';
    } catch (e) {
        console.error(e);
    } finally {
        btn.textContent = "Enviar Mensagem";
        btn.disabled = false;
    }
});
