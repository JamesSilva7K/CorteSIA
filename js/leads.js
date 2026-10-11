// leads.js - Varredura Inteligente, Sincronização Dinâmica com WhatsApp e Rastreamento Estruturado de Leads

(function() {
    'use strict';

    // 1. BLINDAGEM DE ACESSO: Detecção de Bot e Validação Humana / Geográfica
    let isHuman = false;
    let isValidatedBR = false;

    // Detectar Interação Humana Real (Mouse, Toque, Scroll ou Teclado)
    const registerHuman = () => {
        isHuman = true;
        document.removeEventListener('mousemove', registerHuman);
        document.removeEventListener('touchstart', registerHuman);
        document.removeEventListener('keydown', registerHuman);
        document.removeEventListener('scroll', registerHuman);
    };
    document.addEventListener('mousemove', registerHuman, { passive: true });
    document.addEventListener('touchstart', registerHuman, { passive: true });
    document.addEventListener('keydown', registerHuman, { passive: true });
    document.addEventListener('scroll', registerHuman, { passive: true });

    // Verificação de assinaturas de WebDrivers / Robôs
    function deepBotCheck() {
        const isBot = navigator.webdriver || 
                      window.navigator.userAgent.match(/bot|spider|crawl|slurp|headless|phantom|puppeteer|selenium/i) || 
                      window.document.documentElement.getAttribute("webdriver") === "true";
        
        if (isBot) {
            banirAcesso('Bot detectado pelo User-Agent ou WebDriver');
            return false;
        }
        return true;
    }

    // Geolocalização de IP
    function validateBrazilianIP() {
        fetch('https://ipapi.co/json/')
            .then(res => res.json())
            .then(data => {
                if (data && data.country && data.country !== 'BR') {
                    banirAcesso(`IP Estrangeiro Bloqueado: ${data.country} (${data.ip || ''})`);
                } else {
                    isValidatedBR = true;
                    sendLeadEvent('enter', 'Acesso legítimo (Brasil)');
                }
            })
            .catch(() => {
                // Fallback gracioso se a API pública falhar
                isValidatedBR = true;
                sendLeadEvent('enter', 'Acesso registrado (Origem validada)');
            });
    }

    function banirAcesso(motivo) {
        fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'invalid_lead', details: motivo })
        }).catch(() => {});

        document.body.innerHTML = '<h1 style="color:#d9534f;text-align:center;margin-top:20%;font-family:sans-serif;">Acesso Restrito: Tráfego Não Autorizado ou Anômalo.</h1>';
        isHuman = false;
        isValidatedBR = false;
        throw new Error("Acesso Bloqueado");
    }

    if (deepBotCheck()) {
        validateBrazilianIP();
    }

    // 2. ENVIO DE EVENTOS DE LEAD PARA O SERVIDOR / TELEGRAM BOT
    function sendLeadEvent(action, details = '', metadata = {}) {
        if (!isValidatedBR && action !== 'invalid_lead') return;

        const payload = {
            action,
            details,
            metadata: {
                timestamp: new Date().toISOString(),
                pageUrl: window.location.href,
                ...metadata
            }
        };

        const jsonStr = JSON.stringify(payload);

        if (action === 'leave' && navigator.sendBeacon) {
            navigator.sendBeacon('/api/leads', jsonStr);
            return;
        }

        fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: jsonStr
        }).catch(() => {});
    }

    // 3. GERADOR DE MENSAGENS INTELIGENTES E FORMAIS DE ACORDO COM O CONTEXTO
    function generateFormalMessage(element, text, sectionTitle, cardTitle, href) {
        const cleanText = (text || '').trim();
        const upper = cleanText.toUpperCase();
        const ctxCard = (cardTitle || '').toUpperCase();
        const ctxSec = (sectionTitle || '').toUpperCase();
        const urlStr = (href || '').toLowerCase();

        // Análise Semântica Específica
        if (ctxCard.includes('CONVENCIONAL') || upper.includes('CONVENCIONAL') || urlStr.includes('convencional')) {
            return `Olá! Estive analisando o site da Cortesia Concreto e gostaria de solicitar um orçamento formal e detalhes técnicos para Concreto Convencional para minha obra. Poderia me atender?`;
        }
        if (ctxCard.includes('BOMBEÁVEL') || ctxCard.includes('BOMBEAVEL') || upper.includes('BOMBEÁVEL') || upper.includes('BOMBEAVEL') || urlStr.includes('bombeavel')) {
            return `Olá! Tenho interesse no fornecimento de Concreto Bombeável. Gostaria de verificar a viabilidade técnica e solicitar uma cotação para o meu projeto.`;
        }
        if (ctxCard.includes('ESPECIAIS') || ctxCard.includes('ESPECIAL') || upper.includes('ESPECIAIS') || upper.includes('ESPECIAL') || urlStr.includes('especial')) {
            return `Olá! Gostaria de consultar os especialistas da Cortesia Concreto sobre traços e especificações de Concretos Especiais para obra. Como podemos proceder?`;
        }
        if (ctxCard.includes('ADENSÁVEL') || ctxCard.includes('ADENSAVEL') || upper.includes('ADENSÁVEL') || upper.includes('ADENSAVEL')) {
            return `Olá! Gostaria de obter mais informações e uma proposta comercial para Concreto Auto Adensável.`;
        }
        if (ctxCard.includes('PISOS') || ctxCard.includes('PISO') || upper.includes('PISOS') || upper.includes('PISO')) {
            return `Olá! Tenho um projeto de Pisos Industriais e gostaria de solicitar um orçamento personalizado com a equipe técnica da Cortesia Concreto.`;
        }
        if (ctxCard.includes('PEDRA 1') || upper.includes('PEDRA 1')) {
            return `Olá! Gostaria de solicitar informações técnicas e orçamento para locação e serviço de Bomba Estacionária (Pedra 1 e 0+1).`;
        }
        if (ctxCard.includes('ALTA PRESSÃO') || ctxCard.includes('ALTA PRESSAO') || upper.includes('ALTA PRESSÃO') || upper.includes('ALTA PRESSAO')) {
            return `Olá! Preciso de atendimento para o serviço de Bomba Estacionária de Alta Pressão em nossa obra. Poderia nos orientar?`;
        }
        if (ctxCard.includes('LANÇA') || ctxCard.includes('LANCA') || upper.includes('LANÇA') || upper.includes('LANCA')) {
            return `Olá! Gostaria de consultar a disponibilidade e valores para operação com Bomba Lança na nossa região.`;
        }
        if (ctxCard.includes('BETONEIRA') || ctxCard.includes('FROTA') || upper.includes('BETONEIRA') || upper.includes('FROTA') || urlStr.includes('betoneira')) {
            return `Olá! Gostaria de saber mais sobre a frota de caminhões betoneira e a logística de entrega de concreto da Cortesia Concreto.`;
        }
        if (upper.includes('CALCULAR') || ctxSec.includes('CÁLCULO') || ctxSec.includes('CALCULO') || urlStr.includes('tabeladecalculo')) {
            return `Olá! Gostaria de auxílio técnico para cálculo exato de volume de concreto (m³) e dimensionamento para a minha obra.`;
        }
        if (ctxCard.includes('VILA PRUDENTE') || upper.includes('VILA PRUDENTE')) {
            return `Olá! Gostaria de atendimento com a equipe comercial da Usina Matriz Vila Prudente da Cortesia Concreto.`;
        }
        if (ctxCard.includes('BARUERI') || upper.includes('BARUERI')) {
            return `Olá! Gostaria de atendimento com a Central de Barueri para fornecimento de concreto.`;
        }
        if (ctxCard.includes('JAGUARÉ') || ctxCard.includes('JAGUARE') || upper.includes('JAGUARÉ') || upper.includes('JAGUARE')) {
            return `Olá! Gostaria de atendimento comercial junto à Central Jaguaré para minha obra.`;
        }
        if (ctxCard.includes('CAÇAPAVA') || ctxCard.includes('CACAPAVA') || upper.includes('CAÇAPAVA') || upper.includes('CACAPAVA')) {
            return `Olá! Gostaria de cotação e atendimento com a Central de Caçapava (Vale do Paraíba).`;
        }
        if (ctxCard.includes('SANTOS') || upper.includes('SANTOS')) {
            return `Olá! Gostaria de atendimento comercial para fornecimento de concreto na Baixada Santista / Central Santos.`;
        }
        if (ctxCard.includes('ATIBAIA') || upper.includes('ATIBAIA')) {
            return `Olá! Gostaria de atendimento e cotação com a Central de Atibaia e região.`;
        }
        if (ctxCard.includes('MOGI') || upper.includes('MOGI')) {
            return `Olá! Gostaria de orçamento e atendimento através da Central de Mogi das Cruzes.`;
        }
        if (upper.includes('RELATÓRIO') || upper.includes('SALARIAL') || urlStr.includes('relatorio') || urlStr.includes('pdf')) {
            return `Olá! Gostaria de solicitar informações diretamente com o departamento institucional e administrativo da Cortesia Concreto a respeito do Relatório de Transparência.`;
        }
        if (upper.includes('VAGA') || upper.includes('CURRÍCULO') || upper.includes('CURRICULO') || upper.includes('TRABALHE') || urlStr.includes('vaga') || urlStr.includes('cv')) {
            return `Olá! Gostaria de me candidatar e enviar minhas informações profissionais para o departamento de Recursos Humanos da Cortesia Concreto.`;
        }
        if (upper.includes('ORÇAMENTO') || upper.includes('ORCAMENTO') || upper.includes('SOLICITE')) {
            return `Olá! Gostaria de solicitar um orçamento formal para fornecimento de concreto usinado. Poderia me atender?`;
        }
        if (upper.includes('FALE CONOSCO') || upper.includes('CONTATO') || urlStr.includes('contato')) {
            return `Olá! Gostaria de estabelecer contato comercial com a equipe de vendas da Cortesia Concreto.`;
        }
        if (upper.includes('SOBRE') || upper.includes('USINAS') || upper.includes('GRUPO') || urlStr.includes('grupo-cortesia')) {
            return `Olá! Gostaria de saber mais informações institucionais sobre o Grupo Cortesia e a capacidade de atendimento das usinas.`;
        }
        if (upper.includes('SAIBA MAIS')) {
            if (ctxCard) {
                return `Olá! Vi a seção de "${cardTitle}" no site da Cortesia Concreto e gostaria de mais informações detalhadas com um especialista.`;
            }
            return `Olá! Gostaria de obter mais informações técnicas e comerciais sobre os serviços da Cortesia Concreto.`;
        }

        // Fallback inteligente contextualizado
        const itemContext = cardTitle ? ` a respeito de "${cardTitle}"` : (cleanText ? ` sobre "${cleanText}"` : '');
        return `Olá! Estive navegando no site oficial da Cortesia Concreto e gostaria de atendimento comercial${itemContext}. Como podemos prosseguir?`;
    }

    // 4. DESCOBERTA E VARREDURA COMPLEXA DE TODOS OS BOTÕES E LINKS DE AÇÃO
    function initButtonsSweep(whatsappNumber) {
        if (!whatsappNumber) return;

        const cleanWa = whatsappNumber.replace(/\D/g, '');
        const baseWaUrl = `https://api.whatsapp.com/send?phone=${cleanWa}`;

        // Atualizar links diretos de WhatsApp e botões flutuantes
        const waElements = document.querySelectorAll('a[href*="whatsapp.com"], [data-dynamic-contact="whatsapp-link"]');
        waElements.forEach(el => {
            const contextText = el.innerText ? el.innerText.trim() : 'Atendimento Geral';
            const msg = generateFormalMessage(el, contextText, '', '', el.getAttribute('href'));
            el.href = `${baseWaUrl}&text=${encodeURIComponent(msg)}`;
            el.target = '_blank';
            el.setAttribute('rel', 'noopener noreferrer');

            el.onclick = (e) => {
                sendLeadEvent('whatsapp', `Clique no Canal WhatsApp (${contextText})`, {
                    buttonText: contextText,
                    destination: cleanWa
                });
            };
        });

        // Varredura de TODOS os botões, links de cards, links institucionais e ações do site
        const interactiveElements = document.querySelectorAll(
            'a, button, .btn, .btn-text, .post-more-link a'
        );

        interactiveElements.forEach(el => {
            // Permitir navegação padrão apenas para navegação do menu topo se for home
            if (el.classList.contains('menu')) return; // Botão de abrir menu mobile
            if (el.type === 'submit') return; // Formulário tratado separadamente

            const rawHref = (el.getAttribute('href') || '').trim();

            // Ignorar links vazios simples ou âncoras locais que não sejam de conversão
            if (rawHref === '#' || rawHref.startsWith('javascript:')) {
                // Se for botão visual sem href válido, vamos capturar
                if (!el.innerText && !el.title) return;
            }

            // Exceções controladas de redes sociais externas
            if (rawHref.includes('facebook.com') || rawHref.includes('instagram.com') || rawHref.includes('youtube.com') || rawHref.includes('linkedin.com')) {
                return;
            }

            // Se for link do menu principal (Home, Sobre dropdown), permitir ou transformar páginas secundárias inexistentes
            const isInNav = !!el.closest('.navigation');
            if (isInNav && rawHref === 'index.html') return;

            // Extrair o contexto pai mais rico possível (Card, Bloco, Seção)
            const parentCard = el.closest('.blog-post') || el.closest('.project-item') || el.closest('.block-content') || el.closest('.col-sm-6') || el.closest('.col-sm-4') || el.closest('.col-sm-12');
            let cardTitle = '';
            if (parentCard) {
                const headerEl = parentCard.querySelector('h2, h3, h4, .post-header');
                if (headerEl) cardTitle = headerEl.innerText.replace(/[\r\n]+/g, ' ').trim();
            }

            const parentSection = el.closest('section') || el.closest('#blog-section') || el.closest('#about-section') || el.closest('#cv-section') || el.closest('#services-section');
            let sectionTitle = '';
            if (parentSection) {
                const secHeader = parentSection.querySelector('.block-title, h2');
                if (secHeader) sectionTitle = secHeader.innerText.replace(/[\r\n]+/g, ' ').trim();
            }

            const btnText = (el.innerText || el.getAttribute('title') || el.value || 'Atendimento').trim();
            const formalMsg = generateFormalMessage(el, btnText, sectionTitle, cardTitle, rawHref);
            const waTargetUrl = `${baseWaUrl}&text=${encodeURIComponent(formalMsg)}`;

            // Transformar href para o WhatsApp oficial com a mensagem pronta
            if (el.tagName === 'A') {
                el.href = waTargetUrl;
                el.target = '_blank';
                el.setAttribute('rel', 'noopener noreferrer');
                
                el.onclick = (e) => {
                    sendLeadEvent('whatsapp', `Ação: ${btnText || 'Clique'} | Contexto: ${cardTitle || sectionTitle || 'Geral'}`, {
                        buttonText: btnText,
                        context: cardTitle || sectionTitle,
                        originalLink: rawHref,
                        generatedMessage: formalMsg
                    });
                };
            } else {
                el.onclick = (e) => {
                    e.preventDefault();
                    sendLeadEvent('whatsapp', `Ação: ${btnText || 'Clique'} | Contexto: ${cardTitle || sectionTitle || 'Geral'}`, {
                        buttonText: btnText,
                        context: cardTitle || sectionTitle,
                        originalLink: rawHref,
                        generatedMessage: formalMsg
                    });
                    window.open(waTargetUrl, '_blank');
                };
            }
        });
    }

    // 5. PROCESSAMENTO INTELIGENTE DE FORMULÁRIOS & HONEYPOT
    function initFormProtection(whatsappNumber) {
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            // Injeção de honeypot invisível
            if (!form.querySelector('input[name="email_verificador_oculto"]')) {
                const honeypot = document.createElement('input');
                honeypot.type = 'text';
                honeypot.name = 'email_verificador_oculto';
                honeypot.style.display = 'none';
                honeypot.tabIndex = -1;
                honeypot.autocomplete = 'off';
                form.appendChild(honeypot);
            }

            // Máscaras e filtros de campo
            const inputs = form.querySelectorAll('input');
            inputs.forEach(input => {
                const name = (input.name || '').toLowerCase();
                const placeholder = (input.placeholder || '').toLowerCase();

                if (name.includes('telefone') || name.includes('tel') || name.includes('cel') || placeholder.includes('telefone')) {
                    input.addEventListener('input', (e) => {
                        e.target.value = e.target.value.replace(/\D/g, "");
                    });
                }
                if (name.includes('area') || name.includes('volume') || placeholder.includes('m2') || placeholder.includes('m3')) {
                    input.addEventListener('input', (e) => {
                        e.target.value = e.target.value.replace(/[^0-9.,]/g, "");
                    });
                }
                if (name === 'nome' || placeholder.includes('nome')) {
                    input.addEventListener('input', (e) => {
                        e.target.value = e.target.value.replace(/[0-9]/g, "");
                    });
                }
            });

            form.addEventListener('submit', (e) => {
                e.preventDefault();

                // Detecção de Robô
                const hp = form.elements['email_verificador_oculto'];
                if (hp && hp.value !== '') {
                    banirAcesso('Bot detectado no Honeypot (Preenchimento Automático)');
                    return;
                }

                // Coletar dados preenchidos
                const formData = new FormData(form);
                const leadData = {};
                for (let [key, val] of formData.entries()) {
                    if (key !== 'email_verificador_oculto' && key !== 'envio') {
                        leadData[key] = val;
                    }
                }

                // Montar detalhes estruturados
                const nome = leadData.nome || 'Não informado';
                const telefone = leadData.tel || leadData.telefone || 'Não informado';
                const email = leadData.email || 'Não informado';
                const estado = leadData.estado || '-';
                const cidade = leadData.cidade || '-';
                const area = leadData.area ? `${leadData.area} m²` : '-';
                const volume = leadData.volume ? `${leadData.volume} m³` : '-';
                const msgUser = leadData.mensagem || 'Sem observações';

                const summaryText = 
                    `👤 *Nome:* ${nome}\n` +
                    `📞 *Telefone:* ${telefone}\n` +
                    `✉️ *E-mail:* ${email}\n` +
                    `📍 *Localização:* ${cidade} / ${estado}\n` +
                    `📐 *Área da Obra:* ${area}\n` +
                    `🧱 *Volume Desejado:* ${volume}\n` +
                    `💬 *Mensagem:* ${msgUser}`;

                // Envia para o bot do Telegram de forma organizada
                sendLeadEvent('form', summaryText, leadData);

                // Se houver WhatsApp configurado, direcionar também para o WhatsApp com mensagem formatada
                if (whatsappNumber) {
                    const cleanWa = whatsappNumber.replace(/\D/g, '');
                    const waText = encodeURIComponent(
                        `Olá! Acabei de preencher o formulário de orçamento no site oficial da Cortesia Concreto:\n\n` +
                        `*Nome:* ${nome}\n` +
                        `*Telefone:* ${telefone}\n` +
                        `*Cidade/UF:* ${cidade}/${estado}\n` +
                        `*Volume estimado:* ${volume}\n` +
                        `*Detalhes:* ${msgUser}\n\nGostaria de dar continuidade ao atendimento comercial.`
                    );
                    const waUrl = `https://api.whatsapp.com/send?phone=${cleanWa}&text=${waText}`;
                    
                    alert('Solicitação de orçamento recebida com sucesso! Redirecionando para atendimento imediato no WhatsApp...');
                    window.open(waUrl, '_blank');
                } else {
                    alert('Solicitação de orçamento enviada com sucesso! Nossa equipe entrará em contato.');
                }

                form.reset();
            });
        });
    }

    // 6. INICIALIZAÇÃO IMEDIATA E NO CARREGAMENTO
    function startSystem() {
        fetch('/api/config')
            .then(res => res.json())
            .then(cfg => {
                const waNum = cfg.whatsapp || '551129163000';
                initButtonsSweep(waNum);
                initFormProtection(waNum);
            })
            .catch(() => {
                initButtonsSweep('551129163000');
                initFormProtection('551129163000');
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startSystem);
    } else {
        startSystem();
    }

    // Track de saída do site
    window.addEventListener('beforeunload', () => {
        if (isValidatedBR && isHuman) {
            sendLeadEvent('leave', 'Usuário encerrou ou trocou de aba');
        }
    });

})();
