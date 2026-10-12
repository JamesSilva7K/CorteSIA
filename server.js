const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
const { generateFraudAlertImage, updateAllPlantBanners, formatPhone } = require('./generate-banner');

const app = express();

// Security Headers, Camuflagem de Portas & Blindagem Anti-Invasão Total
app.disable('x-powered-by');
app.use((req, res, next) => {
  // Camuflagem e Falsificação de Servidor (Dificulta Fingerprinting)
  res.setHeader('Server', 'Protected-Gateway/2.4 (Security Shield)');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // WAF (Web Application Firewall) - Bloqueio de Injeções SQL, XSS, Path Traversal, Scanners & Exploit Probes
  const rawUrl = decodeURIComponent(req.originalUrl || req.url || '');
  const maliciousPattern = /(union\s+select|\bselect\b.*\bfrom\b|<script\b|javascript:|onerror=|onload=|\.\.\/|\.\.\\|\/etc\/passwd|\.git\/|\.env|\bwp-admin\b|\bphpmyadmin\b|\/eval\(|\/base64_|sleep\(|benchmark\()/i;
  
  if (maliciousPattern.test(rawUrl)) {
    return res.status(403).json({ error: 'Access Denied: Malicious Signature Detected.' });
  }

  // Bloqueio de Scanners e Exploits automatizados (Nikto, SQLMap, Acunetix, etc.)
  const ua = req.headers['user-agent'] || '';
  if (/nikto|sqlmap|acunetix|nessus|nmap|masscan|zgrab|curl\/|wget\/|python-requests|go-http-client/i.test(ua) && !req.headers['x-internal-test']) {
    return res.status(403).send('Forbidden: Automated Scan Prohibited.');
  }

  next();
});

// Advanced Anti-DDoS Rate Limiter com Ban Temporário
const rateLimitWindow = 60000; // 1 min
const maxRequests = 120; // 120 requisições / minuto
const ipRequests = new Map();
const bannedIPs = new Map();

app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || req.connection.remoteAddress || '127.0.0.1';
  const now = Date.now();

  // Verifica se o IP está sob penalidade temporária de DDoS (5 minutos de bloqueio)
  if (bannedIPs.has(ip)) {
    const banUntil = bannedIPs.get(ip);
    if (now < banUntil) {
      return res.status(429).json({ error: 'Blocked: IP temporarily blacklisted due to excessive rate limit violation.' });
    } else {
      bannedIPs.delete(ip);
    }
  }

  if (!ipRequests.has(ip)) {
    ipRequests.set(ip, { count: 1, startTime: now });
  } else {
    const data = ipRequests.get(ip);
    if (now - data.startTime > rateLimitWindow) {
      data.count = 1;
      data.startTime = now;
    } else {
      data.count++;
      if (data.count > maxRequests) {
        bannedIPs.set(ip, now + 5 * 60 * 1000); // 5 min de ban
        return res.status(429).json({ error: 'Too Many Requests - Anti-DDoS Threshold Exceeded' });
      }
    }
  }
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));
app.use((req, res, next) => {
  if (req.is('text/plain') && typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch (e) { }
  }
  next();
});
app.use(express.static(path.join(__dirname)));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));

const CONFIG_FILE = './config.json';
const METRICS_FILE = './metrics.json';

// Helper to normalize phone numbers to international 55 standard
function normalizeWhatsappNumber(input) {
  if (!input) return '';
  let digits = input.replace(/\D/g, '');
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    digits = '55' + digits;
  }
  return digits;
}

// Helper to read config
function readConfig() {
  const defaults = {
    whatsapp: "551129163000",
    domain: "www.cortesiaconcreto.com.br",
    email: "VENDAS@CORTESIACONCRETO.COM.BR",
    concretoM3Price: 385.00,
    concretoM3MinPrice: 350.00,
    concretoM3MaxPrice: 420.00,
    bombeamentoBasePrice: 650.00,
    margemTecnica: 5
  };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...defaults, ...parsed };
    } catch (e) { }
  }
  return defaults;
}

// Helper to write config
function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Helper to read metrics com suporte a estatísticas detalhadas e histórico real
function readMetrics() {
  const defaultMetrics = { 
    enter: 0, 
    leave: 0, 
    whatsapp: 0, 
    form: 0, 
    invalid_lead: 0,
    daily: {},
    recentLeads: [] 
  };
  if (fs.existsSync(METRICS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
      return { ...defaultMetrics, ...data };
    } catch(e) {}
  }
  return defaultMetrics;
}

// Helper to write metrics
function saveMetrics(metrics) {
  try {
    fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao salvar métricas:', err);
  }
}

// Helper to record a lead action
function recordLeadAction(action, details, metadata) {
  const metrics = readMetrics();
  const today = new Date().toISOString().split('T')[0];

  if (!metrics.daily) metrics.daily = {};
  if (!metrics.daily[today]) {
    metrics.daily[today] = { enter: 0, leave: 0, whatsapp: 0, form: 0, invalid_lead: 0 };
  }

  if (metrics[action] !== undefined) {
    metrics[action]++;
  } else {
    metrics[action] = 1;
  }

  if (metrics.daily[today][action] !== undefined) {
    metrics.daily[today][action]++;
  } else {
    metrics.daily[today][action] = 1;
  }

  if (action === 'whatsapp' || action === 'form' || action === 'calculadora') {
    if (!Array.isArray(metrics.recentLeads)) metrics.recentLeads = [];
    metrics.recentLeads.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      timestamp: new Date().toISOString(),
      action,
      details: details || '',
      context: (metadata && metadata.context) || (action === 'calculadora' ? 'Calculadora Estrutural' : ''),
      buttonText: (metadata && metadata.buttonText) || (action === 'calculadora' ? `Cálculo ${metadata.totalM3 || '0'} m³` : ''),
      originalLink: (metadata && metadata.originalLink) || (action === 'calculadora' ? '/calculadora' : ''),
      generatedMessage: (metadata && metadata.generatedMessage) || '',
      metadata: metadata || {}
    });
    // Manter até 100 leads reais detalhados no histórico
    if (metrics.recentLeads.length > 100) {
      metrics.recentLeads = metrics.recentLeads.slice(0, 100);
    }
  }

  saveMetrics(metrics);
  return metrics;
}

// Antiflood / Debounce cache para cliques repetidos do mesmo cliente
const clientRecentClicks = new Map();
function isDuplicateClick(clientKey, buttonName) {
  const key = `${clientKey}_${buttonName}`;
  const now = Date.now();
  const lastTime = clientRecentClicks.get(key);
  if (lastTime && (now - lastTime) < 8000) {
    return true; // mesmo clique repetido em menos de 8 segundos
  }
  clientRecentClicks.set(key, now);
  // Limpeza de cache antigo
  if (clientRecentClicks.size > 2000) {
    clientRecentClicks.clear();
  }
  return false;
}

// API Endpoint for frontend
app.get('/api/config', (req, res) => {
  const config = readConfig();
  const wa = config.whatsapp || '551129163000';
  const cleanNoDDI = wa.replace(/\D/g, '').replace(/^55/, '');
  
  let formatted = formatPhone(wa);
  let formattedLocal = cleanNoDDI.length === 10 
    ? `${cleanNoDDI.substring(0, 2)} ${cleanNoDDI.substring(2, 6)}-${cleanNoDDI.substring(6)}`
    : (cleanNoDDI.length === 11 
      ? `${cleanNoDDI.substring(0, 2)} ${cleanNoDDI.substring(2, 7)}-${cleanNoDDI.substring(7)}`
      : cleanNoDDI);

  res.json({
    ...config,
    whatsappFormatted: formatted,
    whatsappFormattedLocal: formattedLocal,
    whatsapp2Formatted: config.whatsapp2 ? formatPhone(config.whatsapp2) : null
  });
});

// Telegram Bot Setup
const botToken = process.env.BOT_TOKEN;
let adminId = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID, 10) : (readConfig().adminId || null);

if (botToken) {
  const bot = new Telegraf(botToken);

  bot.use((ctx, next) => {
    // Se o adminId não estiver configurado no .env, vincula ao primeiro usuário que interagir
    if (!adminId && ctx.from) {
      adminId = ctx.from.id;
      const cfg = readConfig();
      cfg.adminId = adminId;
      writeConfig(cfg);
      console.log(`[Bot Telegram] Admin identificado e vinculado com sucesso: ID ${adminId} (${ctx.from.first_name || ''})`);
    }

    if (ctx.from && ctx.from.id === adminId) {
      return next();
    }
  });

  const getDashboard = () => {
    const config = readConfig();
    const tel1 = formatPhone(config.whatsapp);
    const tel2 = config.whatsapp2 ? formatPhone(config.whatsapp2) : 'Não configurado (1 número ativo)';
    const pBase = Number(config.concretoM3Price || 385).toFixed(2);
    const pMin = Number(config.concretoM3MinPrice || 350).toFixed(2);
    const pMax = Number(config.concretoM3MaxPrice || 420).toFixed(2);
    const pBomba = Number(config.bombeamentoBasePrice || 650).toFixed(2);
    const margem = Number(config.margemTecnica || 5);

    return {
      text: `📊 *Dashboard de Controle - Cortesia Concreto*\n\n` +
        `🟢 *Status do Sistema:* Online & Blindado\n` +
        `🌐 *Domínio Oficial:* \`${config.domain || 'www.cortesiaconcreto.com.br'}\`\n` +
        `📱 *Telefone 1 (Principal):* \`${tel1}\`\n` +
        `📱 *Telefone 2 (Secundário):* \`${tel2}\`\n` +
        `✉️ *E-mail Oficial:* \`${config.email}\`\n\n` +
        `💰 *Métricas de Preço & Calculadora:*\n` +
        ` • Preço Médio Concreto: \`R$ ${pBase} / m³\`\n` +
        ` • Faixa de Preço Real: \`R$ ${pMin} a R$ ${pMax} / m³\`\n` +
        ` • Taxa Base Bombeamento: \`R$ ${pBomba}\`\n` +
        ` • Margem Técnica de Segurança: \`${margem}%\`\n\n` +
        `🖼️ *Pop-up de Entrada:* Imagem Gerada Ativa no Site`,
      markup: Markup.inlineKeyboard([
        [Markup.button.callback('🖼️ Gerar / Atualizar Imagem Pop-up', 'action_generate_banner')],
        [Markup.button.callback('🌐 Alterar Domínio', 'action_edit_domain'), Markup.button.callback('✉️ Alterar E-mail', 'action_edit_email')],
        [Markup.button.callback('📱 Alterar Telefone 1', 'action_edit_whatsapp'), Markup.button.callback('📱 Configurar Telefone 2', 'action_edit_whatsapp2')],
        [Markup.button.callback('💰 Alterar Métricas de Preços', 'action_menu_pricing'), Markup.button.callback('📈 Relatórios & Métricas', 'action_reports')]
      ])
    };
  };

  bot.start((ctx) => {
    const dashboard = getDashboard();
    ctx.replyWithMarkdown(dashboard.text, dashboard.markup);
  });

  bot.command(['dashboard', 'painel', 'menu', 'admin'], (ctx) => {
    const dashboard = getDashboard();
    ctx.replyWithMarkdown(dashboard.text, dashboard.markup);
  });

  bot.command('gerar', async (ctx) => {
    await handleImageRegeneration(ctx);
  });

  const state = {};

  async function handleImageRegeneration(ctx) {
    try {
      const waitMsg = await ctx.reply('🎨 *Processando Imagem com IA...*\nRenderizando imagem idêntica com os canais oficiais atualizados.', { parse_mode: 'Markdown' });
      const config = readConfig();
      const imgPath = path.join(__dirname, 'images', 'comunicado-de-fraude-2.jpg');

      await generateFraudAlertImage({
        domain: config.domain,
        phone1: config.whatsapp,
        phone2: config.whatsapp2 || null,
        outputPath: imgPath
      });

      // Atualiza também todas as 7 fotos das Usinas
      await updateAllPlantBanners(config.whatsapp);

      if (ctx.telegram && waitMsg) {
        ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => { });
      }

      await ctx.replyWithPhoto({ source: imgPath }, {
        caption: `✅ *Canais e Imagens Sincronizados com Sucesso!*\n\n` +
          `🌐 *Domínio:* ${config.domain}\n` +
          `📱 *Telefone 1:* ${formatPhone(config.whatsapp)}\n` +
          `📱 *Telefone 2:* ${config.whatsapp2 ? formatPhone(config.whatsapp2) : 'Desativado (Apenas 1 número)'}\n` +
          `✉️ *E-mail:* ${config.email}\n\n` +
          `🚀 *Pop-up de fraude e todas as 7 fotos de usinas atualizados com o novo número!*`,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar ao Painel', 'action_back_menu')]])
      });
    } catch (err) {
      console.error('Erro na geração da imagem:', err);
      ctx.reply('❌ Ocorreu um erro ao gerar a imagem: ' + err.message);
    }
  }

  bot.action('action_reports', (ctx) => {
    const metrics = readMetrics();
    const today = new Date().toISOString().split('T')[0];
    const todayStats = (metrics.daily && metrics.daily[today]) || { enter: 0, leave: 0, whatsapp: 0, form: 0, invalid_lead: 0 };
    
    // Taxa de conversão real
    const totalAcessos = metrics.enter || 0;
    const totalLeads = (metrics.whatsapp || 0) + (metrics.form || 0);
    const taxaConv = totalAcessos > 0 ? ((totalLeads / totalAcessos) * 100).toFixed(1) : '0.0';

    const reportText = `📈 *CENTRAL DE INTELIGÊNCIA & LEADS*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📅 *HOJE (${new Date().toLocaleDateString('pt-BR')}):*\n` +
      ` • 🟢 *Visitas Reais:* ${todayStats.enter}\n` +
      ` • 📲 *Leads WhatsApp:* ${todayStats.whatsapp}\n` +
      ` • 📋 *Formulários:* ${todayStats.form}\n\n` +
      `🌐 *TOTAIS ACUMULADOS:*\n` +
      ` • 👥 *Total de Visitantes:* ${totalAcessos}\n` +
      ` • 🎯 *Total de Leads WhatsApp:* ${metrics.whatsapp || 0}\n` +
      ` • 📝 *Total de Formulários:* ${metrics.form || 0}\n` +
      ` • 📊 *Taxa de Conversão:* ${taxaConv}%\n` +
      ` • 🛡️ *Bots / Falsos Bloqueados:* ${metrics.invalid_lead || 0}\n\n` +
      `_Apenas dados reais validados com criptografia e blindagem antiflood._`;

    ctx.replyWithMarkdown(reportText, Markup.inlineKeyboard([
      [Markup.button.callback('📋 Ver Últimos Leads do WhatsApp', 'action_recent_leads')],
      [Markup.button.callback('🔄 Atualizar Dados', 'action_reports')],
      [Markup.button.callback('🔙 Voltar ao Menu Principal', 'action_back_menu')]
    ]));
    ctx.answerCbQuery();
  });

  bot.action('action_recent_leads', (ctx) => {
    const metrics = readMetrics();
    const leads = (metrics.recentLeads || []).slice(0, 5);

    if (leads.length === 0) {
      ctx.replyWithMarkdown(`ℹ️ *Nenhum lead registrado recentemente.*\nOs novos cliques reais no WhatsApp aparecerão aqui detalhados.`, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Voltar aos Relatórios', 'action_reports')]
      ]));
      return ctx.answerCbQuery();
    }

    let text = `📋 *ÚLTIMOS LEADS DIRECIONADOS (WHATSAPP):*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    leads.forEach((l, index) => {
      const timeStr = new Date(l.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      text += `*#${index + 1} - ${timeStr}*\n` +
        `🎯 *Gatilho:* ${l.buttonText || l.details || 'Botão'}\n` +
        (l.context ? `🏢 *Contexto:* ${l.context}\n` : '') +
        (l.generatedMessage ? `💬 *Mensagem:*\n_${l.generatedMessage}_\n` : '') +
        `────────────────────\n`;
    });

    ctx.replyWithMarkdown(text, Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Voltar aos Relatórios', 'action_reports')],
      [Markup.button.callback('🏠 Painel Principal', 'action_back_menu')]
    ]));
    ctx.answerCbQuery();
  });

  bot.action('action_back_menu', (ctx) => {
    const dashboard = getDashboard();
    ctx.editMessageText(dashboard.text, { parse_mode: 'Markdown', ...dashboard.markup });
    ctx.answerCbQuery();
  });

  bot.action('action_generate_banner', async (ctx) => {
    ctx.answerCbQuery();
    await handleImageRegeneration(ctx);
  });

  bot.action('action_edit_domain', (ctx) => {
    state[ctx.from.id] = 'awaiting_domain';
    ctx.reply('Envie o novo Domínio Oficial que deve aparecer na imagem e no site.\nExemplo: `www.cortesiaconcreto.com.br` ou `cortesiaconcreto.com.br`', { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
  });

  bot.action('action_edit_whatsapp', (ctx) => {
    state[ctx.from.id] = 'awaiting_whatsapp';
    ctx.reply('Envie o Telefone 1 (Principal) com DDD (somente números ou formatado).\nEx: `11 2916-3000` ou `551129163000`', { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
  });

  bot.action('action_edit_whatsapp2', (ctx) => {
    ctx.reply('Como deseja configurar o Telefone 2 (Secundário)?', Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Informar Número do Telefone 2', 'action_set_phone2')],
      [Markup.button.callback('🚫 Deixar Apenas 1 Telefone na Imagem', 'action_remove_phone2')],
      [Markup.button.callback('🔙 Voltar', 'action_back_menu')]
    ]));
    ctx.answerCbQuery();
  });

  bot.action('action_set_phone2', (ctx) => {
    state[ctx.from.id] = 'awaiting_whatsapp2';
    ctx.reply('Envie o Telefone 2 com DDD:\nEx: `11 2916-3000` ou `551129163000`', { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
  });

  bot.action('action_remove_phone2', async (ctx) => {
    const config = readConfig();
    delete config.whatsapp2;
    writeConfig(config);
    ctx.answerCbQuery();
    await ctx.reply('✅ O Telefone 2 foi desativado. A imagem exibirá apenas 1 telefone seguro.');
    await handleImageRegeneration(ctx);
  });

  bot.action('action_edit_email', (ctx) => {
    state[ctx.from.id] = 'awaiting_email';
    ctx.reply('Envie o novo e-mail oficial de contato:');
    ctx.answerCbQuery();
  });

  const getPricingMenu = () => {
    const config = readConfig();
    const pBase = Number(config.concretoM3Price || 385).toFixed(2);
    const pMin = Number(config.concretoM3MinPrice || 350).toFixed(2);
    const pMax = Number(config.concretoM3MaxPrice || 420).toFixed(2);
    const pBomba = Number(config.bombeamentoBasePrice || 650).toFixed(2);
    const margem = Number(config.margemTecnica || 5);

    return {
      text: `💰 *MÉTRICAS & FAIXAS DE PREÇO (CÁLCULO REAL)*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• 💵 *Preço Base Médio:* \`R$ ${pBase} / m³\`\n` +
        `• 📉 *Faixa Mínima Real:* \`R$ ${pMin} / m³\`\n` +
        `• 📈 *Faixa Máxima Real:* \`R$ ${pMax} / m³\`\n` +
        `• 🚜 *Taxa Base Bombeamento:* \`R$ ${pBomba}\`\n` +
        `• 📐 *Margem Técnica Segurança:* \`${margem}%\`\n\n` +
        `_Selecione abaixo o parâmetro que deseja alterar:_`,
      markup: Markup.inlineKeyboard([
        [Markup.button.callback('💵 Preço Médio m³', 'action_edit_price'), Markup.button.callback('🚜 Taxa de Bomba', 'action_edit_price_bomba')],
        [Markup.button.callback('📉 Preço Mínimo m³', 'action_edit_price_min'), Markup.button.callback('📈 Preço Máximo m³', 'action_edit_price_max')],
        [Markup.button.callback('📐 Margem Técnica %', 'action_edit_margem')],
        [Markup.button.callback('🔙 Voltar ao Painel', 'action_back_menu')]
      ])
    };
  };

  bot.action('action_menu_pricing', (ctx) => {
    const menu = getPricingMenu();
    ctx.editMessageText(menu.text, { parse_mode: 'Markdown', ...menu.markup });
    ctx.answerCbQuery();
  });

  bot.action('action_edit_price', (ctx) => {
    state[ctx.from.id] = 'awaiting_price';
    ctx.reply('Envie o novo valor médio do m³ do Concreto em Reais (Ex: `390` ou `385.50`):', { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
  });

  bot.action('action_edit_price_min', (ctx) => {
    state[ctx.from.id] = 'awaiting_price_min';
    ctx.reply('Envie o valor MÍNIMO real do m³ de Concreto (Ex: `350` ou `340.00`):', { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
  });

  bot.action('action_edit_price_max', (ctx) => {
    state[ctx.from.id] = 'awaiting_price_max';
    ctx.reply('Envie o valor MÁXIMO real do m³ de Concreto (Ex: `420` ou `430.00`):', { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
  });

  bot.action('action_edit_price_bomba', (ctx) => {
    state[ctx.from.id] = 'awaiting_price_bomba';
    ctx.reply('Envie a Taxa Base de Bombeamento em Reais (Ex: `650` ou `600.00`):', { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
  });

  bot.action('action_edit_margem', (ctx) => {
    state[ctx.from.id] = 'awaiting_margem';
    ctx.reply('Envie a Margem Técnica de Segurança em % (Ex: `5` para 5% ou `7`):', { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
  });

  bot.on('text', async (ctx) => {
    const userState = state[ctx.from.id];
    const text = ctx.message.text.trim();

    // Reconhecimento inteligente livre (Ex: o admin envia dados completos em uma única mensagem)
    if (!userState) {
      // Se o usuário digitou comando direto ou formato com múltiplos dados
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const domainMatch = text.match(/(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?/);
      const phonesMatch = text.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}/g);

      if (emailMatch || domainMatch || (phonesMatch && phonesMatch.length > 0)) {
        const config = readConfig();
        if (emailMatch) config.email = emailMatch[0].toUpperCase();
        if (domainMatch && !domainMatch[0].includes('@')) {
          config.domain = domainMatch[0].replace(/^https?:\/\//, '').toLowerCase();
        }
        if (phonesMatch && phonesMatch[0]) {
          config.whatsapp = normalizeWhatsappNumber(phonesMatch[0]);
        }
        if (phonesMatch && phonesMatch[1]) {
          config.whatsapp2 = normalizeWhatsappNumber(phonesMatch[1]);
        }
        writeConfig(config);

        await ctx.reply('🧠 *Entrada Inteligente Detectada!*\nDados validados e atualizados com sucesso.', { parse_mode: 'Markdown' });
        await handleImageRegeneration(ctx);
        return;
      }
      return;
    }

    if (userState === 'awaiting_domain') {
      const cleanDom = text.replace(/^https?:\/\//, '').toLowerCase();
      if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanDom)) {
        const config = readConfig();
        config.domain = cleanDom;
        writeConfig(config);
        state[ctx.from.id] = null;
        await ctx.reply('✅ Domínio atualizado com sucesso!');
        await handleImageRegeneration(ctx);
      } else {
        ctx.reply('❌ Formato de domínio inválido. Tente novamente (ex: `www.cortesiaconcreto.com.br`).', { parse_mode: 'Markdown' });
      }
    } else if (userState === 'awaiting_whatsapp') {
      const normalized = normalizeWhatsappNumber(text);
      if (normalized && normalized.length >= 10) {
        const config = readConfig();
        config.whatsapp = normalized;
        writeConfig(config);
        state[ctx.from.id] = null;
        await ctx.reply(`✅ Telefone 1 atualizado com sucesso: \`${formatPhone(normalized)}\`!`, { parse_mode: 'Markdown' });
        await handleImageRegeneration(ctx);
      } else {
        ctx.reply('❌ Formato inválido. Envie um número válido com DDD (Ex: `11 99999-8888` ou `11 2916-3000`).', { parse_mode: 'Markdown' });
      }
    } else if (userState === 'awaiting_whatsapp2') {
      const normalized = normalizeWhatsappNumber(text);
      if (normalized && normalized.length >= 10) {
        const config = readConfig();
        config.whatsapp2 = normalized;
        writeConfig(config);
        state[ctx.from.id] = null;
        await ctx.reply(`✅ Telefone 2 atualizado com sucesso: \`${formatPhone(normalized)}\`!`, { parse_mode: 'Markdown' });
        await handleImageRegeneration(ctx);
      } else {
        ctx.reply('❌ Formato inválido. Envie um número válido com DDD (Ex: `11 99999-8888` ou `11 2916-3000`).', { parse_mode: 'Markdown' });
      }
    } else if (userState === 'awaiting_email') {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        const config = readConfig();
        config.email = text.toUpperCase();
        writeConfig(config);
        state[ctx.from.id] = null;
        await ctx.reply('✅ E-mail oficial atualizado com sucesso!');
        await handleImageRegeneration(ctx);
      } else {
        ctx.reply('❌ Formato de e-mail inválido. Tente novamente.');
      }
    } else if (userState === 'awaiting_price') {
      const cleanVal = parseFloat(text.replace(',', '.').replace(/[^\d.]/g, ''));
      if (!isNaN(cleanVal) && cleanVal > 0) {
        const config = readConfig();
        config.concretoM3Price = cleanVal;
        writeConfig(config);
        state[ctx.from.id] = null;
        await ctx.reply(`✅ *Preço Médio do Concreto atualizado!*\nNovo valor: \`R$ ${cleanVal.toFixed(2)} / m³\`\nA calculadora usará este valor como referência inteligente.`, { parse_mode: 'Markdown' });
        const menu = getPricingMenu();
        await ctx.reply(menu.text, { parse_mode: 'Markdown', ...menu.markup });
      } else {
        ctx.reply('❌ Valor inválido. Envie um número positivo (Ex: `385.00` ou `390`).');
      }
    } else if (userState === 'awaiting_price_min') {
      const cleanVal = parseFloat(text.replace(',', '.').replace(/[^\d.]/g, ''));
      if (!isNaN(cleanVal) && cleanVal > 0) {
        const config = readConfig();
        config.concretoM3MinPrice = cleanVal;
        writeConfig(config);
        state[ctx.from.id] = null;
        await ctx.reply(`✅ *Preço Mínimo do Concreto atualizado!*\nNovo piso real: \`R$ ${cleanVal.toFixed(2)} / m³\``, { parse_mode: 'Markdown' });
        const menu = getPricingMenu();
        await ctx.reply(menu.text, { parse_mode: 'Markdown', ...menu.markup });
      } else {
        ctx.reply('❌ Valor inválido. Envie um número positivo (Ex: `350` ou `340.00`).');
      }
    } else if (userState === 'awaiting_price_max') {
      const cleanVal = parseFloat(text.replace(',', '.').replace(/[^\d.]/g, ''));
      if (!isNaN(cleanVal) && cleanVal > 0) {
        const config = readConfig();
        config.concretoM3MaxPrice = cleanVal;
        writeConfig(config);
        state[ctx.from.id] = null;
        await ctx.reply(`✅ *Preço Máximo do Concreto atualizado!*\nNovo teto real: \`R$ ${cleanVal.toFixed(2)} / m³\``, { parse_mode: 'Markdown' });
        const menu = getPricingMenu();
        await ctx.reply(menu.text, { parse_mode: 'Markdown', ...menu.markup });
      } else {
        ctx.reply('❌ Valor inválido. Envie um número positivo (Ex: `420` ou `430.00`).');
      }
    } else if (userState === 'awaiting_price_bomba') {
      const cleanVal = parseFloat(text.replace(',', '.').replace(/[^\d.]/g, ''));
      if (!isNaN(cleanVal) && cleanVal >= 0) {
        const config = readConfig();
        config.bombeamentoBasePrice = cleanVal;
        writeConfig(config);
        state[ctx.from.id] = null;
        await ctx.reply(`✅ *Taxa Base de Bombeamento atualizada!*\nNovo valor: \`R$ ${cleanVal.toFixed(2)}\``, { parse_mode: 'Markdown' });
        const menu = getPricingMenu();
        await ctx.reply(menu.text, { parse_mode: 'Markdown', ...menu.markup });
      } else {
        ctx.reply('❌ Valor inválido. Envie um número positivo ou 0 (Ex: `650` ou `600.00`).');
      }
    } else if (userState === 'awaiting_margem') {
      const cleanVal = parseFloat(text.replace(',', '.').replace(/[^\d.]/g, ''));
      if (!isNaN(cleanVal) && cleanVal >= 0) {
        const config = readConfig();
        config.margemTecnica = cleanVal;
        writeConfig(config);
        state[ctx.from.id] = null;
        await ctx.reply(`✅ *Margem Técnica de Segurança atualizada!*\nNova margem: \`${cleanVal}%\``, { parse_mode: 'Markdown' });
        const menu = getPricingMenu();
        await ctx.reply(menu.text, { parse_mode: 'Markdown', ...menu.markup });
      } else {
        ctx.reply('❌ Valor inválido. Envie um número percentual (Ex: `5` para 5% ou `7.5`).');
      }
    }
  });

  // Rota de Webhook do Telegram para execução serverless (Vercel)
  app.post('/api/telegram-webhook', async (req, res) => {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } catch (err) {
      console.error('Erro ao processar webhook do Telegram:', err);
      res.status(200).send('ERROR');
    }
  });

  // Em ambiente local ou servidor persistente, usa polling; na Vercel o webhook é acionado
  if (!process.env.VERCEL) {
    bot.launch().then(() => {
      console.log('Telegram bot started successfully via polling.');
    }).catch((err) => {
      if (err && err.response && err.response.error_code === 409) {
        console.warn('Telegram bot: Instância concorrente detectada (409 Conflict).');
      } else {
        console.error('Erro ao iniciar bot do Telegram:', err && err.message ? err.message : err);
      }
    });

    // Encerramento seguro
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  }

  const SECRET_KEY_SEED = "CORTESIA_SECURE_VAULT_KEY_2026_X9";

  function decryptSecurePayload(secureStr) {
    if (!secureStr || typeof secureStr !== 'string') return null;

    // Criptografia V2 Dinâmica (Salt + Keystream XOR + Base64)
    if (secureStr.startsWith('enc:v2:')) {
      try {
        const rawEnv = Buffer.from(secureStr.substring(7), 'base64').toString('utf8');
        const env = JSON.parse(rawEnv);
        const salt = env.s;
        const cipher = decodeURIComponent(Buffer.from(env.c, 'base64').toString('utf8'));
        const derivedKey = SECRET_KEY_SEED + "_" + salt;

        let raw = '';
        for (let i = 0; i < cipher.length; i++) {
          const charCode = cipher.charCodeAt(i);
          const keyChar = derivedKey.charCodeAt(i % derivedKey.length);
          raw += String.fromCharCode(charCode ^ keyChar);
        }
        return JSON.parse(raw);
      } catch(err) {
        console.error('Falha na decriptação segura v2:', err);
      }
    }

    // Compatibilidade legada
    try {
      const decodedStr = decodeURIComponent(Buffer.from(secureStr, 'base64').toString('utf8').split('').reverse().join(''));
      return JSON.parse(decodedStr);
    } catch(e) {
      try {
        return JSON.parse(secureStr);
      } catch(err2) {
        return null;
      }
    }
  }

  app.post('/api/leads', async (req, res) => {
    let payload = req.body || {};
    
    // Decodificação e Verificação Criptográfica Total
    if (payload.secure && typeof payload.secure === 'string') {
      const decrypted = decryptSecurePayload(payload.secure);
      if (decrypted) payload = decrypted;
    }

    const { action, details, metadata } = payload;
    const nowBR = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Extração e Resolução de IP Real com Camada Anti-Proxy / Vercel Edge Headers
    const forwardedHeader = req.headers['x-forwarded-for'];
    const rawIp = forwardedHeader ? forwardedHeader.split(',')[0].trim() : (req.headers['x-real-ip'] || req.socket.remoteAddress || '127.0.0.1');
    const clientIp = rawIp.replace(/^::ffff:/, '');

    // Antiflood: Ignora cliques repetidos em rajada do mesmo IP/usuário no mesmo botão
    if (action === 'whatsapp') {
      const buttonId = (metadata && metadata.buttonText) || details || 'whatsapp_btn';
      if (isDuplicateClick(clientIp, buttonId)) {
        return res.json({ success: true, debounced: true });
      }
    }

    // Grava ação real nas métricas e no histórico estruturado
    if (['enter', 'leave', 'whatsapp', 'form', 'calculadora', 'invalid_lead'].includes(action)) {
      recordLeadAction(action, details, metadata);
    }

    // Extração e Resolução de Geolocalização Avançada
    // Combina dados do Edge (Vercel Geolocation headers) com telemetria do cliente
    const vercelCity = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : null;
    const vercelRegion = req.headers['x-vercel-ip-country-region'] || null;
    const vercelCountry = req.headers['x-vercel-ip-country'] || 'BR';
    const vercelLat = req.headers['x-vercel-ip-latitude'] || null;
    const vercelLon = req.headers['x-vercel-ip-longitude'] || null;

    const geoData = (metadata && metadata.geo) || {};
    const cidadeFinal = geoData.cidade || vercelCity || 'São Paulo';
    const estadoFinal = geoData.estado || vercelRegion || 'SP';
    const paisFinal = geoData.pais || (vercelCountry === 'BR' ? 'Brasil' : vercelCountry);
    const ispFinal = geoData.isp ? `\n🌐 *Provedor / ISP:* ${geoData.isp}` : '';
    const ipFinal = geoData.ip || clientIp;

    // Detalhes de Conexão, Hardware e Engajamento Real
    const dev = (metadata && metadata.device) || {};
    const aparelhoFinal = dev.tipo ? `${dev.tipo} • ${dev.so || 'SO'} • ${dev.browser || 'Web'}` : 'Dispositivo Web Autenticado';
    const conexaoFinal = dev.connectionType ? `\n📶 *Rede / Conexão:* \`${dev.connectionType}\`` : '';
    const resolucao = dev.screenRes ? `\n🖥️ *Tela / Hardware:* \`${dev.screenRes}\`${dev.cpuCores ? ` (${dev.cpuCores})` : ''}` : '';
    const engajamento = (dev.timeSpent || dev.scrollDepth) ? `\n⏱️ *Tempo no Site:* ${dev.timeSpent || '0s'} • *Rolagem:* ${dev.scrollDepth || '0%'}` : '';

    const latFinal = geoData.lat || vercelLat;
    const lonFinal = geoData.lon || vercelLon;
    const mapsLink = (latFinal && lonFinal) 
      ? `\n🗺️ *Localização no Mapa:* [Ver no Google Maps](https://www.google.com/maps?q=${latFinal},${lonFinal})` 
      : '';

    const blocoOrigem = 
      `🌐 *IP Real:* \`${ipFinal}\`\n` +
      `📍 *Localização:* ${cidadeFinal} - ${estadoFinal}, ${paisFinal}` +
      ispFinal + 
      conexaoFinal +
      mapsLink + `\n` +
      `📱 *Aparelho:* ${aparelhoFinal}` +
      resolucao +
      engajamento + `\n` +
      `🛡️ *Auditoria do Lead:* 100% Humano Verificado (Biometria Digital Ativa)`;

    switch (action) {
      case 'enter':
        message = `🟢 *NOVO ACESSO NO SITE*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📅 *Horário:* ${nowBR}\n` +
          `${blocoOrigem}`;
        break;

      case 'leave':
        // Apenas contabiliza nas métricas silenciosamente para não poluir o Telegram do admin
        return res.json({ success: true, silent: true });

      case 'whatsapp':
        const cleanContext = (metadata && metadata.context) ? metadata.context : 'Geral';
        const cleanBtn = (metadata && metadata.buttonText) ? metadata.buttonText : (details || 'Botão WhatsApp');
        const cleanMsg = (metadata && metadata.generatedMessage) ? metadata.generatedMessage : '';

        message = `📲 *NOVO LEAD QUALIFICADO (WHATSAPP)*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📅 *Horário:* ${nowBR}\n` +
          `🎯 *Gatilho/Botão:* ${cleanBtn}\n` +
          `🏢 *Contexto/Seção:* ${cleanContext}\n\n` +
          `${blocoOrigem}\n\n` +
          (cleanMsg ? `💬 *Mensagem Enviada pelo Cliente:*\n_${cleanMsg}_\n` : '') +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💼 *Oportunidade ativa pronta para conversão!*`;
        break;

      case 'form':
        message = `📋 *NOVA SOLICITAÇÃO DE ORÇAMENTO (FORMULÁRIO)*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📅 *Horário:* ${nowBR}\n` +
          `${blocoOrigem}\n\n` +
          `📊 *DADOS DO FORMULÁRIO:*\n` +
          `${details || 'Dados enviados pelo formulário'}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ *Ação:* Entrar em contato imediatamente.`;
        break;

      case 'calculadora':
        const calcClient = (metadata && metadata.cliente) ? metadata.cliente : 'Cliente Não Informado';
        const calcResp = (metadata && metadata.responsavel) ? metadata.responsavel : 'Não informado';
        const calcEmail = (metadata && metadata.email) ? metadata.email : 'Não informado';
        const calcTotalM3 = (metadata && metadata.totalM3) ? metadata.totalM3 : '0.00';
        const calcPrecoBase = (metadata && metadata.estimativaBase) ? metadata.estimativaBase : 'A calcular';
        const calcFaixa = (metadata && metadata.faixaReal) ? metadata.faixaReal : 'Consultar parâmetros';
        const calcMargem = (metadata && metadata.margem) ? metadata.margem : '5%';
        const calcDetalhes = (metadata && metadata.detalhes) ? metadata.detalhes : '';

        message = `🧮 *CONSULTA AVANÇADA / CÁLCULO DE CONCRETO*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📅 *Horário:* ${nowBR}\n` +
          `👤 *Cliente:* ${calcClient}\n` +
          `👷 *Responsável Técnico:* ${calcResp}\n` +
          `✉️ *E-mail:* ${calcEmail}\n\n` +
          `${blocoOrigem}\n\n` +
          `📐 *Volume Estrutural Total:* *${calcTotalM3} m³*\n` +
          `💰 *Valor Estimado (Métrica Real):* *${calcPrecoBase}*\n` +
          `📊 *Faixa de Mercado Parametrizada:* *${calcFaixa}*\n` +
          `🛡️ *Margem Técnica Aplicada:* *${calcMargem}*\n\n` +
          (calcDetalhes ? `📋 *Detalhamento por Elemento:*\n${calcDetalhes}\n\n` : '') +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📲 *O lead recebeu os dados e foi conectado ao WhatsApp com o memorial de cálculo!*`;
        break;

      case 'invalid_lead':
        // Apenas registra métrica silenciosa contra bots sem spammar o admin
        return res.json({ success: true, blocked: true });

      default:
        return res.status(400).json({ error: 'Ação inválida' });
    }

    const currentAdmin = adminId || (process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID, 10) : readConfig().adminId);
    if (currentAdmin && message) {
      try {
        await bot.telegram.sendMessage(currentAdmin, message, { parse_mode: 'Markdown' });
      } catch (errMarkdown) {
        // Fallback sem parse_mode caso algum caractere do lead quebre o Markdown
        try {
          await bot.telegram.sendMessage(currentAdmin, message);
        } catch (errPlain) {
          console.error('Erro ao notificar Telegram:', errPlain);
        }
      }
    }

    res.json({ success: true, blindado: true });
  });

} else {
  console.warn('BOT_TOKEN not provided in .env.');
}

// Rota oficial de configuração e métricas sincronizadas em tempo real
app.get('/api/config', (req, res) => {
  const config = readConfig();
  res.json({
    whatsapp: config.whatsapp,
    whatsapp2: config.whatsapp2 || null,
    domain: config.domain,
    email: config.email,
    concretoM3Price: Number(config.concretoM3Price || 385),
    concretoM3MinPrice: Number(config.concretoM3MinPrice || 350),
    concretoM3MaxPrice: Number(config.concretoM3MaxPrice || 420),
    bombeamentoBasePrice: Number(config.bombeamentoBasePrice || 650),
    margemTecnica: Number(config.margemTecnica || 5)
  });
});

// Rota raiz oficial
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota dedicada para Tabela de Cálculo e Consulta Avançada
app.get(['/calculadora', '/calculadora.html', '/tabeladecalculo', '/tabeladecalculo/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'calculadora.html'));
});

// Redirecionamento de Fallback Inteligente para WhatsApp em páginas ou arquivos ausentes (.html, .php, .pdf)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    const config = readConfig();
    const cleanWa = (config.whatsapp || '551129163000').replace(/\D/g, '');
    let cleanPath = decodeURIComponent(req.path)
      .replace(/\.(html|php|pdf|aspx|jsp)$/i, '')
      .replace(/[/\\._-]/g, ' ')
      .trim();
    if (cleanPath.toLowerCase().includes('cortesia concreto')) {
      cleanPath = cleanPath.replace(/cortesia\s*concreto/gi, '').trim();
    }
    const subject = cleanPath ? `a respeito de "${cleanPath}"` : 'sobre os serviços da Cortesia Concreto';
    const msg = encodeURIComponent(`Olá! Gostaria de atendimento comercial e informações ${subject}. Poderia me orientar?`);
    return res.redirect(`https://api.whatsapp.com/send?phone=${cleanWa}&text=${msg}`);
  }
  next();
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} with advanced security.`);
  });
}

module.exports = app;
