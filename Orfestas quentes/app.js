document.addEventListener('DOMContentLoaded', () => {
    const btnGps = document.getElementById('btn-gps');
    const locationStatus = document.getElementById('location-status');
    const locationSection = document.getElementById('location-section');
    const aiLoading = document.getElementById('ai-loading');
    
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

    let map = null;
    let markers = [];
    let realMarketsGlobal = []; // Guarda os mercados carregados
    let html5QrcodeScanner = null;

    // Banco de Dados Colaborativo (Estado Inicial Vazio)
    let priceReportsDB = []; 
    const usersDB = [
        { id: "u1", name: "João", reputation: 90 },
        { id: "u2", name: "Maria", reputation: 80 },
        { id: "u3", name: "Troll", reputation: 10 },
        { id: "me", name: "Você", reputation: 50 } // Reputação inicial do usuário
    ];

    // Dados Mockados de Mercados (REMOVIDOS)
    // Dados Mockados de Ofertas (REMOVIDOS)

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
                console.log(`Localização: Lat ${lat}, Lon ${lon}`);
                
                // Ocultar card de localização e mostrar Loading
                locationSection.classList.add('hidden');
                aiLoading.classList.remove('hidden');

                // Buscar mercados reais na região
                fetchNearbyMarkets(lat, lon);
            },
            (error) => {
                // Erro
                console.error(error);
                locationStatus.textContent = "Não foi possível obter a localização. Usando localização padrão (São Paulo).";
                
                // FALLBACK: Usar centro de SP
                setTimeout(() => {
                    locationSection.classList.add('hidden');
                    aiLoading.classList.remove('hidden');
                    fetchNearbyMarkets(-23.550520, -46.633308); // São Paulo
                }, 1500);
            }
        );
    });

    async function fetchNearbyMarkets(lat, lon) {
        // Consultar Overpass API (OpenStreetMap)
        // Usando 'nwr' para pegar tanto pontos simples quanto mercados desenhados como prédios.
        const query = `
            [out:json];
            (
                nwr["shop"~"supermarket|wholesale"](around:15000,${lat},${lon});
                nwr["shop"~"convenience|minimart"](around:1000,${lat},${lon});
            );
            out center;
        `;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            
            // Extrair mercados e aplicar filtro rigoroso de NOME
            let realMarkets = data.elements.map(el => {
                const name = el.tags && el.tags.name ? el.tags.name : null;
                // 'out center' coloca lat/lon dentro de 'center' para prédios
                const marketLat = el.lat || (el.center && el.center.lat);
                const marketLon = el.lon || (el.center && el.center.lon);
                
                if (!marketLat || !marketLon) return { name: null }; // Ignorar se não tiver coordenada

                const dist = calculateDistance(lat, lon, marketLat, marketLon);
                const isSmall = (el.tags && (el.tags.shop === 'convenience' || el.tags.shop === 'minimart'));
                
                return {
                    id: el.id,
                    name: name,
                    lat: marketLat,
                    lon: marketLon,
                    distance: dist,
                    icon: isSmall ? "🏪" : "🛒"
                };
            }).filter(m => m.name !== null); // REMOVE qualquer local sem nome oficial
            
            // Ordenar do mais perto pro mais longe
            realMarkets.sort((a, b) => a.distance - b.distance);

            // Formatar distância
            realMarkets.forEach(m => {
                m.distanceStr = m.distance < 1 ? `${(m.distance * 1000).toFixed(0)} m` : `${m.distance.toFixed(1)} km`;
            });

            if (realMarkets.length === 0) {
                alert("Nenhum mercado com nome registrado foi encontrado nesta região no mapa (ou eles não estão cadastrados no OpenStreetMap).");
            }

            renderMapAndResults(lat, lon, realMarkets);

        } catch (error) {
            console.error("Erro ao buscar mercados no mapa real:", error);
            alert("Erro ao conectar com o mapa. Verifique sua internet.");
            renderMapAndResults(lat, lon, []);
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

    function renderMapAndResults(lat, lon, markets) {
        realMarketsGlobal = markets; // Salvar para usar na busca
        
        // Transição de tela
        landingView.classList.add('hidden');
        appView.classList.remove('hidden');

        // Inicializar ou atualizar o mapa
        if (!map) {
            map = L.map('map').setView([lat, lon], 14);
            // Usando tile mais escuro que combina mais com as novas cores
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(map);
        } else {
            map.setView([lat, lon], 14);
        }

        // Limpar marcadores antigos se houver
        markers.forEach(m => map.removeLayer(m));
        markers = [];

        // Adicionar marcador do usuário
        const userIcon = L.divIcon({
            html: '<div style="font-size: 24px;">📍</div>',
            className: 'custom-div-icon',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        const userMarker = L.marker([lat, lon], {icon: userIcon}).addTo(map)
            .bindPopup("<b>Você está aqui</b>").openPopup();
        markers.push(userMarker);

        // Adicionar marcadores dos mercados
        markets.forEach(market => {
            if(market.lat && market.lon) {
                const marker = L.marker([market.lat, market.lon]).addTo(map)
                    .bindPopup(`<h4>${market.name}</h4><p>Aprox. ${market.distanceStr || market.distance}</p>`);
                
                market.markerObj = marker; // Salvar referência para abrir o popup na busca
                markers.push(marker);
            }
        });

        if (markets.length === 0) {
            marketList.innerHTML = `<p class="text-muted">Nenhum mercado foi encontrado no raio de 3km.</p>`;
        } else {
            marketList.innerHTML = markets.map(market => `
                <div class="market-card">
                    <div class="market-icon">${market.icon || "🛒"}</div>
                    <div class="market-info">
                        <h3>${market.name}</h3>
                        <p>📍 A ${market.distanceStr || market.distance} de você</p>
                    </div>
                </div>
            `).join('');
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

    btnSubmitReport.addEventListener('click', () => {
        const prod = reportProduct.value.trim();
        const mark = reportMarket.value;
        const prc = parseFloat(reportPrice.value);

        if (!prod || !mark || isNaN(prc)) {
            alert("Por favor, preencha todos os campos corretamente.");
            return;
        }

        // 1. O USUÁRIO INFORMA O PREÇO
        priceReportsDB.push({
            userId: "me",
            productName: prod,
            marketName: mark,
            price: prc,
            reputation: usersDB.find(u => u.id === "me").reputation
        });

        // 2. SIMULAÇÃO DE CROWDSOURCING (Comunidade validando)
        // Adiciona votos de outros usuários para gerar o consenso.
        priceReportsDB.push({ userId: "u1", productName: prod, marketName: mark, price: prc * (0.98 + Math.random()*0.04), reputation: 90 });
        priceReportsDB.push({ userId: "u2", productName: prod, marketName: mark, price: prc * (0.95 + Math.random()*0.1), reputation: 80 });
        // Um troll tenta bagunçar o sistema botando um preço muito alto ou muito baixo
        priceReportsDB.push({ userId: "u3", productName: prod, marketName: mark, price: prc * (2.5 + Math.random()), reputation: 10 }); 

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
            // O sistema recompensa quem votou perto da mediana e pune quem votou muito longe (trolls)
            marketReports.forEach(r => {
                const diff = Math.abs(r.price - consensusPrice) / consensusPrice;
                const user = usersDB.find(u => u.id === r.userId);
                if (user) {
                    if (diff > 0.3) {
                        user.reputation = Math.max(0, user.reputation - 10); // Punição! Errou feio o preço.
                    } else if (diff < 0.05) {
                        user.reputation = Math.min(100, user.reputation + 5); // Ganha confiança!
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
});
