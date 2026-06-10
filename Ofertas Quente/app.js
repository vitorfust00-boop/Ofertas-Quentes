window.onerror = function(message, source, lineno, colno, error) {
    alert("ERRO GLOBAL CRÍTICO: " + message + " na linha " + lineno);
};
console.log("APP.JS CARREGADO COM SUCESSO - Versão 20");

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

// Inicializa Firebase Compat
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Parse JWT token from Google
// Parse JWT token from Google (Mantido por compatibilidade histórica se necessário)
function parseJwt (token) {
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

let currentUser = null;

window.handleGoogleLogin = function(response) {
    try {
        const data = parseJwt(response.credential);
        if (!data) {
            alert("Erro: Não foi possível ler os dados do Google.");
            return;
        }

        const email = data.email.toLowerCase().trim();
        let role = 'consumer';
        
        const genericDomains = ['@gmail.com', '@hotmail.com', '@yahoo.com', '@outlook.com', '@bol.com.br'];
        const isGeneric = genericDomains.some(d => email.endsWith(d));

        if (email.includes('vitor') || email.includes('fusti') || email.includes('fust')) {
            role = 'admin'; 
        } else if (!isGeneric) {
            role = 'business'; 
        } else {
            role = 'consumer'; 
        }

        currentUser = {
            id: data.sub || data.id,
            name: data.name,
            email: email,
            picture: data.picture,
            role: role,
            reputation: role === 'admin' ? 999999 : 50 
        };

        if (db) {
            db.collection("users").doc(currentUser.id).get().then((doc) => {
                if (doc.exists) {
                    currentUser.reputation = doc.data().reputation;
                } else {
                    db.collection("users").doc(currentUser.id).set(currentUser);
                }
            }).catch(e => console.warn(e));
        }

        document.getElementById('user-avatar').src = currentUser.picture || 'https://via.placeholder.com/40';
        document.getElementById('user-name').textContent = currentUser.name;
        
        let roleText = 'Consumidor';
        let roleColor = 'rgba(255,255,255,0.1)';
        if (role === 'business') {
            roleText = 'Empresa';
            roleColor = 'var(--primary)';
        } else if (role === 'admin') {
            roleText = 'Administrador';
            roleColor = '#e74c3c'; 
        }
        
        document.getElementById('user-role-badge').textContent = roleText;
        document.getElementById('user-role-badge').style.background = roleColor;
        document.getElementById('user-reputation-score').textContent = role === 'admin' ? '∞' : currentUser.reputation;

        document.getElementById('login-section').style.display = 'none';
        document.getElementById('main-content-area').style.display = 'block';
    } catch (error) {
        console.error("Crash no login:", error);
        alert("Erro no Login: " + error.message);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // BACKDOOR SECRETO PARA TESTES (Bypass de bloqueio do Google)
    const logoEl = document.querySelector('.logo');
    if (logoEl) {
        logoEl.addEventListener('dblclick', () => {
            const fallbackEmail = prompt("🔐 MODO DEV: Digite seu e-mail de administrador para forçar o login:");
            if (fallbackEmail && fallbackEmail.trim() !== "") {
                window.handleGoogleLogin({
                    credential: btoa(JSON.stringify({
                        email: fallbackEmail,
                        name: fallbackEmail.split('@')[0],
                        sub: "dev_" + Date.now(),
                        picture: "https://via.placeholder.com/40"
                    }))
                });
            }
    // Auto-Login DEV (Bypass para testar o App sem o Google no Netlify Drop ou Localhost)
    if (window.location.hostname.includes('netlify.app') || window.location.hostname === 'localhost' || window.location.hostname === '') {
        console.log("Ambiente de teste detectado. Fazendo Auto-Login DEV.");
        setTimeout(() => {
            window.handleGoogleLogin({
                credential: btoa(JSON.stringify({
                    email: "dev_vitor@teste.com",
                    name: "Admin (Teste)",
                    sub: "dev_" + Date.now(),
                    picture: "https://via.placeholder.com/40"
                }))
            });
        }, 500);
    }
    
    const btnGps = document.getElementById('btn-gps');
    const locationStatus = document.getElementById('location-status');
    const locationSection = document.getElementById('location-section');
    const aiLoading = document.getElementById('ai-loading');
    const btnAddress = document.getElementById('btn-address');
    const inputAddress = document.getElementById('input-address');
    
    // Novas Views
    const landingView = document.getElementById('landing-view');
    const appView = document.getElementById('app-view');

    const resultsSection = document.getElementById('results-section');
    const marketList = document.getElementById('market-list');
    const offersGrid = document.getElementById('offers-grid');

    // Elementos de Busca e Relato
    const searchInput = document.getElementById('search-input');
    const btnSearch = document.getElementById('btn-search');
    const btnCamera = document.getElementById('btn-camera');
    const readerContainer = document.getElementById('reader-container');
    const btnOpenReport = document.getElementById('btn-open-report');
    const btnCancelReport = document.getElementById('btn-cancel-report');
    const btnSubmitReport = document.getElementById('btn-submit-report');
    const reportModal = document.getElementById('report-modal');
    const reportProduct = document.getElementById('report-product');
    const reportMarket = document.getElementById('report-market');
    const reportPrice = document.getElementById('report-price');

    const btnOpenMarket = document.getElementById('btn-open-market');
    const btnCancelMarket = document.getElementById('btn-cancel-market');
    const btnSubmitMarket = document.getElementById('btn-submit-market');
    const marketModal = document.getElementById('market-modal');
    const newMarketName = document.getElementById('new-market-name');

    let map = null;
    let userMarker = null;
    let markers = [];
    let realMarketsGlobal = []; // Guarda os mercados carregados
    let html5QrcodeScanner = null;

    // Banco de Dados Colaborativo (Sincronizado com Firebase)
    let priceReportsDB = []; 
    let customMarketsDB = []; 
    window.usersDB = [];

    // --- FIREBASE LISTENERS ---
    db.collection("markets").onSnapshot((snapshot) => {
        customMarketsDB = [];
        snapshot.forEach((doc) => {
            customMarketsDB.push({ id: doc.id, ...doc.data() });
        });
        // Atualiza o mapa se ele já estiver aberto
        if (map) {
            const center = map.getCenter();
            fetchNearbyMarkets(center.lat, center.lng, true);
        }
    });

    db.collection("reports").onSnapshot((snapshot) => {
        priceReportsDB = [];
        snapshot.forEach((doc) => {
            priceReportsDB.push({ id: doc.id, ...doc.data() });
        });
        // Se houver uma pesquisa ativa, atualiza os resultados na tela automaticamente
        if (searchInput.value) {
            handleSearch(searchInput.value);
        }
    });

    db.collection("users").onSnapshot((snapshot) => {
        window.usersDB = [];
        snapshot.forEach((doc) => {
            window.usersDB.push({ id: doc.id, ...doc.data() });
        });
        // Atualiza a reputação do usuário logado na tela
        if (currentUser) {
            const userInDb = window.usersDB.find(u => u.id === currentUser.id);
            if (userInDb) {
                currentUser.reputation = userInDb.reputation;
                document.getElementById('user-reputation-score').textContent = currentUser.role === 'admin' ? '∞' : currentUser.reputation;
            }
        }
    });
    // -------------------------

    btnGps.addEventListener('click', () => {
        if (!navigator.geolocation) {
            locationStatus.textContent = "Seu navegador não suporta geolocalização.";
            return;
        }

        locationStatus.textContent = "Solicitando permissão de GPS...";
        btnGps.disabled = true;
        btnGps.style.opacity = '0.7';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                // Sucesso
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const accuracy = position.coords.accuracy;
                
                window.userLat = lat;
                window.userLon = lon;
                console.log(`Localização: Lat ${lat}, Lon ${lon}, Precisão: ${accuracy}m`);

                if (accuracy > 500) {
                    alert(`⚠️ Aviso: Seu GPS retornou uma precisão muito baixa (${Math.round(accuracy)} metros de margem de erro). Isso geralmente ocorre em computadores usando Wi-Fi/Rede ao invés de satélite. Se a distância dos mercados ficar errada, digite seu endereço manualmente no campo de busca.`);
                }
                
                // Ocultar card de localização e mostrar Loading
                locationSection.classList.add('hidden');
                aiLoading.classList.remove('hidden');

                // Buscar mercados reais na região
                fetchNearbyMarkets(lat, lon);
            },
            (error) => {
                // Erro (Navegador bloqueou o GPS ou falha no sensor)
                console.error(error);
                locationStatus.textContent = "Erro ao ler o GPS. Seu navegador demorou ou bloqueou o acesso. Por favor, digite seu endereço na caixa abaixo.";
                btnGps.disabled = false;
                btnGps.style.opacity = '1';
            },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: Infinity }
        );
    });

    // Lógica para buscar localização por Endereço Digitado (Nominatim OpenStreetMap)
    btnAddress.addEventListener('click', async () => {
        const address = inputAddress.value.trim();
        if (!address) {
            locationStatus.textContent = "Por favor, digite o nome da sua rua e cidade.";
            return;
        }

        locationStatus.textContent = "Buscando coordenadas do seu endereço...";
        try {
            // Trocando de Nominatim (lento) para Photon Komoot (rápido) + Timeout de 5s
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1`, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            const data = await response.json();

            if (data && data.features && data.features.length > 0) {
                const lon = parseFloat(data.features[0].geometry.coordinates[0]);
                const lat = parseFloat(data.features[0].geometry.coordinates[1]);
                window.userLat = lat;
                window.userLon = lon;
                
                locationSection.classList.add('hidden');
                aiLoading.classList.remove('hidden');
                
                // Buscar mercados reais na região digitada
                fetchNearbyMarkets(lat, lon);
            } else {
                locationStatus.textContent = "Endereço não encontrado. Tente ser mais específico (ex: Rua X, Bairro Y, Sua Cidade).";
            }
        } catch (error) {
            console.error(error);
            locationStatus.textContent = "Erro de conexão ao buscar o endereço.";
        }
    });

    async function fetchNearbyMarkets(lat, lon, isDynamic = false) {
        if (isDynamic) {
            document.getElementById('map-loading-overlay').classList.remove('hidden');
        } else {
            locationSection.classList.add('hidden');
            aiLoading.classList.remove('hidden');
        }

        try {
            // REMOVIDO: Integração com Overpass API (Mercados mundiais)
            // Agora o aplicativo SÓ carrega os mercados que foram cadastrados manualmente por empresas (customMarketsDB).
            
            let realMarkets = [];

            // Injetar mercados colaborativos do banco customMarketsDB
            customMarketsDB.forEach(cm => {
                const dist = calculateDistance(lat, lon, cm.lat, cm.lon);
                // Injetamos apenas se estiver a até 30km (pra não mostrar mercado de outro estado)
                if (dist <= 30) {
                    realMarkets.push({ ...cm, distance: dist });
                }
            });

            // Ordenar do mais perto pro mais longe
            realMarkets.sort((a, b) => a.distance - b.distance);

            // Formatar distância
            realMarkets.forEach(m => {
                m.distanceStr = m.distance < 1 ? `${(m.distance * 1000).toFixed(0)} m` : `${m.distance.toFixed(1)} km`;
            });

            if (realMarkets.length === 0 && !isDynamic) {
                alert("Nenhum mercado foi cadastrado por empresas na sua região ainda.");
            }

            if (isDynamic) {
                document.getElementById('map-loading-overlay').classList.add('hidden');
            } else {
                aiLoading.classList.add('hidden');
            }
            renderMapAndResults(lat, lon, realMarkets, isDynamic);

        } catch (error) {
            console.error("Erro ao processar mercados:", error);
            if (isDynamic) {
                document.getElementById('map-loading-overlay').classList.add('hidden');
            } else {
                aiLoading.classList.add('hidden');
            }
            renderMapAndResults(lat, lon, [], isDynamic);
        }
    }

    // Fórmula de Haversine para calcular distância entre duas coordenadas em km
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    let mapFetchTimeout = null;

    function renderMapAndResults(lat, lon, markets, isDynamic = false) {
        // Se for uma busca dinâmica, apenas mesclamos os novos mercados sem apagar os antigos
        if (isDynamic) {
            markets.forEach(m => {
                if (!realMarketsGlobal.find(rm => rm.id === m.id)) {
                    realMarketsGlobal.push(m);
                }
            });
        } else {
            realMarketsGlobal = markets; 
        }
        
        // Transição de tela apenas se não for dinâmico
        if (!isDynamic) {
            landingView.classList.add('hidden');
            appView.classList.remove('hidden');
        }

        // Inicializar ou atualizar o mapa
        if (!map) {
            const bounds = [
                [-90, -180],
                [90, 180]
            ];
            map = L.map('map', {
                maxBounds: bounds,
                maxBoundsViscosity: 1.0
            }).setView([lat, lon], 12);

            // Usando tile mais escuro que combina mais com as novas cores
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 20,
                noWrap: true
            }).addTo(map);

            // EVENTO DE MAPA DINÂMICO
            map.on('moveend', () => {
                if (mapFetchTimeout) clearTimeout(mapFetchTimeout);
                mapFetchTimeout = setTimeout(() => {
                    const center = map.getCenter();
                    fetchNearbyMarkets(center.lat, center.lng, true);
                }, 1000); // 1 segundo de debounce
            });

            // Adicionar marcador inicial do usuário
            const userIcon = L.divIcon({
                html: '<div style="font-size: 24px;">📍</div>',
                className: 'custom-div-icon',
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            });
            userMarker = L.marker([lat, lon], {icon: userIcon}).addTo(map)
                .bindPopup("<b>Sua Localização Inicial</b>").openPopup();
        } else if (!isDynamic) {
            map.setView([lat, lon], 12);
            if (userMarker) {
                userMarker.setLatLng([lat, lon]);
            }
        }

        // Limpar marcadores de mercado antigos
        markers.forEach(m => {
            map.removeLayer(m);
        });
        markers = [];

        // Adicionar marcadores dos mercados (agora desenha do array global que acumula)
        realMarketsGlobal.forEach(market => {
            if(market.lat && market.lon) {
                const marker = L.marker([market.lat, market.lon]).addTo(map)
                    .bindPopup(`<h4>${market.name}</h4><p>Aprox. ${market.distanceStr || market.distance}</p>`);
                
                market.markerObj = marker; // Salvar referência para abrir o popup na busca
                markers.push(marker);
            }
        });

        if (realMarketsGlobal.length === 0) {
            marketList.innerHTML = `<p class="text-muted">Nenhum mercado foi encontrado na região.</p>`;
        } else {
            // Sort by distance from the CURRENT GPS LOCATION (not the map center)
            const currentCenter = map ? map.getCenter() : {lat, lng: lon};
            const referenceLat = window.userLat !== undefined ? window.userLat : currentCenter.lat;
            const referenceLon = window.userLon !== undefined ? window.userLon : currentCenter.lng;

            const sortedForList = [...realMarketsGlobal].sort((a,b) => {
                const distA = calculateDistance(referenceLat, referenceLon, a.lat, a.lon);
                const distB = calculateDistance(referenceLat, referenceLon, b.lat, b.lon);
                return distA - distB;
            });

            marketList.innerHTML = sortedForList.map(market => {
                const trueDist = calculateDistance(referenceLat, referenceLon, market.lat, market.lon);
                const trueDistStr = trueDist < 1 ? `${(trueDist * 1000).toFixed(0)} m` : `${trueDist.toFixed(1)} km`;
                
                return `
                <div class="market-card">
                    <div class="market-icon">${market.icon || "🛒"}</div>
                    <div class="market-info">
                        <h3>${market.name}</h3>
                        <p>📍 A ${trueDistStr} de você</p>
                    </div>
                </div>
            `}).join('');
        }

        // Mostrar texto de ajuda ao invés das antigas ofertas mockadas
        offersGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: var(--bg-card); border-radius: 15px; border: 1px solid var(--glass-border);">
                <p style="font-size: 1.2rem; color: var(--text-muted);">Use a barra de pesquisa ou a câmera para encontrar o preço dos produtos nos mercados reais próximos a você!</p>
            </div>
        `;
        
        // Forçar um resize no mapa
        setTimeout(() => { map.invalidateSize(); }, 100);
    }

    function renderOffers(offers) {
        // Mudar o título da seção para indicar que é uma consulta de menor preço
        const sectionTitle = document.querySelector('#results-section h2.section-title.mt-4');
        if(sectionTitle) sectionTitle.innerHTML = "Resultado da Consulta de Preços";

        offersGrid.innerHTML = offers.map((offer, index) => {
            const isCheapest = index === 0;
            
            // Destaques visuais pesados para o menor preço
            const extraStyle = isCheapest ? 'border: 2px solid var(--primary); transform: scale(1.02); box-shadow: 0 0 20px rgba(230,0,0,0.4);' : 'opacity: 0.8;';
            const badgeLabel = isCheapest ? "⭐ MENOR PREÇO NA REGIÃO" : "Outra Opção";
            const badgeColor = isCheapest ? "var(--primary)" : "var(--bg-card)";
            const badgeTextColor = isCheapest ? "#fff" : "var(--text-muted)";
            const priceColor = isCheapest ? "var(--secondary)" : "#4cd137";

            return `
            <div class="offer-card" style="${extraStyle}">
                <div class="offer-badge" style="background: ${badgeColor}; color: ${badgeTextColor}; font-size: ${isCheapest ? '0.9rem' : '0.7rem'};">${badgeLabel}</div>
                <img src="${offer.image}" alt="${offer.title}" class="offer-image" style="height: ${isCheapest ? '220px' : '150px'};">
                <div class="offer-details">
                    <div class="offer-market" style="${isCheapest ? 'font-size: 1rem; color: var(--text-main);' : ''}">📍 ${offer.market}</div>
                    <h3 class="offer-title" style="${isCheapest ? 'font-size: 1.4rem;' : 'font-size: 1.1rem;'}">${offer.title}</h3>
                    <div class="price-container" style="flex-direction: column; align-items: flex-start;">
                        <span class="old-price" style="font-size: 0.85rem;">Média na região: ${offer.oldPrice}</span>
                        <span class="new-price" style="color: ${priceColor}; ${isCheapest ? 'font-size: 2.2rem;' : 'font-size: 1.4rem;'}">${offer.newPrice}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 5px;">✅ Preço validado por ${offer.reportCount} pessoas</span>
                    </div>
                </div>
            </div>
        `}).join('');
    }

    // --- MODAL DE RELATAR PREÇO ---

    btnOpenReport.addEventListener('click', () => {
        if (realMarketsGlobal.length > 0) {
            reportMarket.innerHTML = '<option value="">Selecione um mercado...</option>' + 
                realMarketsGlobal.map(m => `<option value="${m.name}">${m.name} (${m.distanceStr})</option>`).join('');
            
            if(searchInput.value) reportProduct.value = searchInput.value;
            
            reportModal.classList.remove('hidden');
        } else {
            alert("Aguarde a localização do GPS encontrar mercados próximos antes de relatar um preço.");
        }
    });

    btnCancelReport.addEventListener('click', () => {
        reportModal.classList.add('hidden');
    });

    // --- MODAL DE CADASTRAR MERCADO (Dono/Usuário) ---
    btnOpenMarket.addEventListener('click', () => {
        if (!currentUser) {
            alert("Você precisa fazer login primeiro.");
            return;
        }
        if (currentUser.role !== 'business' && currentUser.role !== 'admin') {
            alert("Acesso Negado: Apenas contas de Empresa (donos de mercado) ou Administradores podem cadastrar novos estabelecimentos no mapa. Sua conta atual é classificada como Conta Pessoal (Consumidor).");
            return;
        }
        marketModal.classList.remove('hidden');
    });

    btnCancelMarket.addEventListener('click', () => {
        marketModal.classList.add('hidden');
    });

    const cepInput = document.getElementById('new-market-cep');
    const cepStatus = document.getElementById('cep-status');
    const streetInput = document.getElementById('new-market-street');
    const neighborhoodInput = document.getElementById('new-market-neighborhood');
    const cityInput = document.getElementById('new-market-city');
    const numberInput = document.getElementById('new-market-number');

    if (cepInput) {
        cepInput.addEventListener('blur', async () => {
            const cep = cepInput.value.replace(/\D/g, '');
            if (cep.length !== 8) return;

            cepStatus.style.display = 'block';
            cepStatus.textContent = 'Buscando endereço...';
            cepStatus.style.color = 'var(--secondary)';

            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                const data = await response.json();
                
                if (data.erro) {
                    cepStatus.textContent = 'CEP não encontrado.';
                    cepStatus.style.color = '#e74c3c';
                    streetInput.value = '';
                    neighborhoodInput.value = '';
                    cityInput.value = '';
                } else {
                    cepStatus.style.display = 'none';
                    streetInput.value = data.logradouro;
                    neighborhoodInput.value = data.bairro;
                    cityInput.value = `${data.localidade} / ${data.uf}`;
                    numberInput.focus(); // Pular direto para o número
                }
            } catch (error) {
                cepStatus.textContent = 'Erro ao buscar CEP.';
                cepStatus.style.color = '#e74c3c';
            }
        });
    }

    btnSubmitMarket.addEventListener('click', async () => {
        const mName = newMarketName.value.trim();
        const cep = cepInput ? cepInput.value.trim() : '';
        const num = numberInput ? numberInput.value.trim() : '';
        const street = streetInput ? streetInput.value.trim() : '';
        const city = cityInput ? cityInput.value.trim() : '';

        if (!mName || !cep || !num || !street) {
            alert("Por favor, preencha o Nome, CEP e o Número do estabelecimento.");
            return;
        }

        btnSubmitMarket.textContent = "Validando Endereço...";
        btnSubmitMarket.disabled = true;
            // Limpa a cidade tirando o " / PR" que vem do ViaCEP
            const cleanCity = city.split('/')[0].trim();
            
            // Geocoding: Buscar a coordenada exata do endereço usando Nominatim
            const addressQuery = `${street}, ${num}, ${cleanCity}, Brasil`;
            const fetchWithTimeout = async (url) => {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), 4000);
                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(id);
                return await response.json();
            };

            let lat = null;
            let lon = null;
            let accuracyStr = 'auto';
            
            try {
                let data = await fetchWithTimeout(`https://photon.komoot.io/api/?q=${encodeURIComponent(addressQuery)}&limit=1`);
                
                if (!data || !data.features || data.features.length === 0) {
                    console.warn("Tentando bairro...");
                    let bairro = neighborhoodInput ? neighborhoodInput.value.trim() : '';
                    const cityQuery = `${bairro ? bairro + ', ' : ''}${cleanCity}, Brasil`;
                    data = await fetchWithTimeout(`https://photon.komoot.io/api/?q=${encodeURIComponent(cityQuery)}&limit=1`);
                    accuracyStr = 'medium_auto';
                }

                if (!data || !data.features || data.features.length === 0) {
                    console.warn("Tentando apenas a cidade...");
                    const justCityQuery = `${cleanCity}, Brasil`;
                    data = await fetchWithTimeout(`https://photon.komoot.io/api/?q=${encodeURIComponent(justCityQuery)}&limit=1`);
                    accuracyStr = 'low_auto';
                }

                if (data && data.features && data.features.length > 0) {
                    lon = parseFloat(data.features[0].geometry.coordinates[0]);
                    lat = parseFloat(data.features[0].geometry.coordinates[1]);
                }
            } catch (e) {
                console.warn("Photon falhou ou deu timeout", e);
            }

            // PLANO D REMOVIDO! Agora usamos a Mira Manual
            if (lat === null || lon === null) {
                alert("Não foi possível encontrar a localização exata automaticamente. Por favor, arraste o mapa para posicionar a mira 📍 no local do mercado.");
                
                window.pendingMarket = {
                    id: "custom_" + Date.now(),
                    name: mName,
                    icon: "🏢",
                    accuracy: 'manual'
                };
                
                marketModal.classList.add('hidden');
                
                if (map) {
                    document.getElementById('map-crosshair').classList.remove('hidden');
                    document.getElementById('map-confirm-location').classList.remove('hidden');
                    const refLat = window.userLat !== undefined ? window.userLat : -23.60;
                    const refLon = window.userLon !== undefined ? window.userLon : -51.64;
                    map.setView([refLat, refLon], 14);
                } else {
                    alert("O mapa ainda não foi carregado. Ative seu GPS na tela inicial.");
                }
                
                btnSubmitMarket.textContent = "Salvar Mercado";
                btnSubmitMarket.disabled = false;
                return;
            }

            const newMarket = {
                id: "custom_" + Date.now(),
                name: mName,
                lat: lat,
                lon: lon,
                icon: "🏢",
                accuracy: accuracyStr
            };
            
            if (db) {
                db.collection("markets").doc(newMarket.id).set(newMarket).catch(e => console.error("Erro ao salvar no Firebase:", e));
            } else {
                customMarketsDB.push(newMarket);
            }
            
            marketModal.classList.add('hidden');
            newMarketName.value = '';
            if(cepInput) cepInput.value = '';
            if(numberInput) numberInput.value = '';
            if(streetInput) streetInput.value = '';
            if(neighborhoodInput) neighborhoodInput.value = '';
            if(cityInput) cityInput.value = '';
            
            btnSubmitMarket.textContent = "Salvar Mercado";
            btnSubmitMarket.disabled = false;
            
            if (lat !== null && lon !== null) {
                alert("Mercado cadastrado com sucesso!");
                // Recarrega o mapa pra mostrar o mercado novo
                if (map) {
                    map.setView([lat, lon], 12);
                    fetchNearbyMarkets(lat, lon, true);
                } else {
                    fetchNearbyMarkets(lat, lon, false);
                }
            }
        } catch (error) {
            console.error(error);
            alert("Erro fatal ao salvar mercado.");
            btnSubmitMarket.textContent = "Salvar Mercado";
            btnSubmitMarket.disabled = false;
        }
    });

    btnSubmitReport.addEventListener('click', async () => {
        const prod = reportProduct.value.trim();
        const mark = reportMarket.value;
        const prc = parseFloat(reportPrice.value);

        if (!prod || !mark || isNaN(prc)) {
            alert("Por favor, preencha todos os campos corretamente.");
            return;
        }

        // 1. O USUÁRIO INFORMA O PREÇO
        const userReport = {
            userId: currentUser ? currentUser.id : "me",
            productName: prod,
            marketName: mark,
            price: prc,
            reputation: currentUser ? currentUser.reputation : 50
        };

        if (db) {
            db.collection("reports").add(userReport).catch(e => console.error(e));
            // 2. SIMULAÇÃO DE CROWDSOURCING (Comunidade validando)
            db.collection("reports").add({ userId: "u1", productName: prod, marketName: mark, price: prc * (0.98 + Math.random()*0.04), reputation: 90 });
            db.collection("reports").add({ userId: "u2", productName: prod, marketName: mark, price: prc * (0.95 + Math.random()*0.1), reputation: 80 });
            db.collection("reports").add({ userId: "u3", productName: prod, marketName: mark, price: prc * (2.5 + Math.random()), reputation: 10 });
        } else {
            priceReportsDB.push(userReport);
            priceReportsDB.push({ userId: "u1", productName: prod, marketName: mark, price: prc * (0.98 + Math.random()*0.04), reputation: 90 });
            priceReportsDB.push({ userId: "u2", productName: prod, marketName: mark, price: prc * (0.95 + Math.random()*0.1), reputation: 80 });
            priceReportsDB.push({ userId: "u3", productName: prod, marketName: mark, price: prc * (2.5 + Math.random()), reputation: 10 });
        } 

        reportModal.classList.add('hidden');
        reportProduct.value = '';
        reportPrice.value = '';

        // Pesquisa automaticamente o produto que acabou de nascer
        searchInput.value = prod;
        handleSearch(prod);
    });

    // --- LÓGICA DE PESQUISA, CÂMERA E MATEMÁTICA ---

    btnSearch.addEventListener('click', () => {
        handleSearch(searchInput.value);
    });

    searchInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') handleSearch(searchInput.value);
    });

    btnCamera.addEventListener('click', () => {
        if (readerContainer.classList.contains('hidden')) {
            readerContainer.classList.remove('hidden');
            btnCamera.classList.add('active');
            startScanner();
        } else {
            stopScanner();
        }
    });

    function startScanner() {
        try {
            if (!html5QrcodeScanner) {
                // Adicionar uma verificação se está em HTTPS/Localhost
                if (window.location.protocol === 'file:') {
                    alert("A câmera não funciona abrindo o arquivo direto (file://). Você precisa abrir através de um servidor local (como o Live Server do VS Code).");
                }
                html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 150} }, false);
            }
            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
        } catch(e) {
            console.error("Erro ao iniciar câmera", e);
            alert("Não foi possível iniciar a câmera. Verifique as permissões do navegador ou se você está em um ambiente seguro (HTTPS/Localhost).");
            readerContainer.classList.add('hidden');
            btnCamera.classList.remove('active');
        }
    }

    function stopScanner() {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear().then(() => {
                readerContainer.classList.add('hidden');
                btnCamera.classList.remove('active');
            });
        }
    }

    function onScanSuccess(decodedText, decodedResult) {
        stopScanner();
        searchInput.value = decodedText;
        handleSearch(decodedText);
    }

    function onScanFailure(error) {
        // Ignorar erros contínuos de não encontrar código
    }

    // MATEMÁTICA: Mediana Ponderada e Reputação
    function calculateConsensusPrice(query) {
        const reports = priceReportsDB.filter(r => r.productName.toLowerCase().includes(query.toLowerCase()));
        if (reports.length === 0) return null;

        const marketGroups = {};
        reports.forEach(r => {
            if (!marketGroups[r.marketName]) marketGroups[r.marketName] = [];
            marketGroups[r.marketName].push(r);
        });

        const finalOffers = [];

        for (const [marketName, marketReports] of Object.entries(marketGroups)) {
            // Ordenar por preço
            marketReports.sort((a, b) => a.price - b.price);

            // A Mediana Ponderada ignora valores irreais sem precisar excluí-los de fato,
            // pois ela encontra o "centro de massa" baseado na reputação dos usuários.
            const totalReputation = marketReports.reduce((sum, r) => sum + r.reputation, 0);
            let cumulativeReputation = 0;
            let consensusPrice = marketReports[0].price;

            for (let r of marketReports) {
                cumulativeReputation += r.reputation;
                if (cumulativeReputation >= totalReputation / 2) {
                    consensusPrice = r.price;
                    break;
                }
            }

            // ATUALIZAÇÃO DE REPUTAÇÃO PÓS-CONSENSO
            marketReports.forEach(r => {
                const diff = Math.abs(r.price - consensusPrice) / consensusPrice;
                const user = window.usersDB.find(u => u.id === r.userId);
                if (user) {
                    if (diff > 0.3) {
                        user.reputation = Math.max(0, user.reputation - 10); // Punição!
                    } else if (diff < 0.05) {
                        user.reputation = Math.min(100, user.reputation + 5); // Ganha confiança!
                    }
                    // Atualiza a UI se for o usuário atual
                    if (currentUser && currentUser.id === user.id) {
                        currentUser.reputation = user.reputation;
                        document.getElementById('user-reputation-score').textContent = currentUser.role === 'admin' ? '∞' : currentUser.reputation;
                    }
                    
                    // Salvar alteração no banco se conectado
                    if (db) {
                        db.collection("users").doc(user.id).update({ reputation: user.reputation }).catch(e => console.warn(e));
                    }
                }
            });

            const marketObj = realMarketsGlobal.find(m => m.name === marketName);

            finalOffers.push({
                marketObj: marketObj,
                market: marketName,
                title: marketReports[0].productName, // Usa o nome com a capitalização salva
                newPrice: `R$ ${consensusPrice.toFixed(2).replace('.', ',')}`,
                oldPrice: `R$ ${(consensusPrice * 1.15).toFixed(2).replace('.', ',')}`, // Média na região simulada
                rawPrice: consensusPrice,
                reportCount: marketReports.length,
                image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500" // Imagem genérica para produtos criados pelos usuários
            });
        }

        finalOffers.sort((a, b) => a.rawPrice - b.rawPrice);
        return finalOffers;
    }

    function handleSearch(query) {
        query = query.trim();
        if (!query) return;

        const productOffers = calculateConsensusPrice(query);

        if (productOffers && productOffers.length > 0) {
            renderOffers(productOffers);

            // Destacar o mercado mais barato no mapa
            const cheapestMarket = productOffers[0].marketObj;
            if (cheapestMarket && cheapestMarket.markerObj) {
                map.setView([cheapestMarket.lat, cheapestMarket.lon], 16);
                cheapestMarket.markerObj.bindPopup(`
                    <div style="text-align:center;">
                        <h4 style="color:#e60000;">⭐ MENOR PREÇO ⭐</h4>
                        <p><b>${cheapestMarket.name}</b></p>
                        <p>${productOffers[0].title} por ${productOffers[0].newPrice}</p>
                    </div>
                `).openPopup();
                
                // Rolar suavemente para o mapa
                document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
            }

        } else {
            alert("Ainda não há relatos para este produto. Seja o primeiro a avisar o preço clicando no botão '➕ Avisar Preço'!");
        }
    }

    // --- LÓGICA DE CONFIRMAÇÃO DE MIRA MANUAL ---
    document.getElementById('btn-confirm-crosshair').addEventListener('click', () => {
        if (!window.pendingMarket || !map) return;
        
        const center = map.getCenter();
        const finalMarket = {
            ...window.pendingMarket,
            lat: center.lat,
            lon: center.lng
        };
        
        // Esconder a mira
        document.getElementById('map-crosshair').classList.add('hidden');
        document.getElementById('map-confirm-location').classList.add('hidden');
        
        // Salvar no Firebase
        if (db) {
            db.collection("markets").doc(finalMarket.id).set(finalMarket).catch(e => console.error("Erro ao salvar no Firebase:", e));
        } else {
            customMarketsDB.push(finalMarket);
        }
        
        alert("Mercado salvo com sucesso usando sua localização manual!");
        
        window.pendingMarket = null;
        map.setView([center.lat, center.lng], 12);
        fetchNearbyMarkets(center.lat, center.lng, true);
        
        // Limpar inputs de mercado
        if(newMarketName) newMarketName.value = '';
        if(cepInput) cepInput.value = '';
        if(numberInput) numberInput.value = '';
        if(streetInput) streetInput.value = '';
        if(neighborhoodInput) neighborhoodInput.value = '';
        if(cityInput) cityInput.value = '';
    });

    document.getElementById('btn-cancel-crosshair').addEventListener('click', () => {
        document.getElementById('map-crosshair').classList.add('hidden');
        document.getElementById('map-confirm-location').classList.add('hidden');
        window.pendingMarket = null;
        alert("Cadastro de mercado cancelado.");
    });
});
