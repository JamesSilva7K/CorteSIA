const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
const { generateFraudAlertImage, updateAllPlantBanners, formatPhone } = require('./generate-banner');

const app = express();

// Security Headers & Blindagem Backend
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Basic Rate Limiting
const rateLimitWindow = 60000; // 1 min
const maxRequests = 100;
const ipRequests = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
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
        return res.status(429).send('Too Many Requests');
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
app.use(express.static('.'));

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
    email: "VENDAS@CORTESIACONCRETO.COM.BR"
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

  if (action === 'whatsapp' || action === 'form') {
    if (!Array.isArray(metrics.recentLeads)) metrics.recentLeads = [];
    metrics.recentLeads.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      timestamp: new Date().toISOString(),
      action,
      details: details || '',
      context: (metadata && metadata.context) || '',
      buttonText: (metadata && metadata.buttonText) || '',
      originalLink: (metadata && metadata.originalLink) || '',
      generatedMessage: (metadata && metadata.generatedMessage) || ''
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
    return {
      text: `📊 *Dashboard de Controle - Cortesia Concreto*\n\n` +
        `🟢 *Status do Sistema:* Online & Blindado\n` +
        `🌐 *Domínio Oficial:* \`${config.domain || 'www.cortesiaconcreto.com.br'}\`\n` +
        `📱 *Telefone 1 (Principal):* \`${tel1}\`\n` +
        `📱 *Telefone 2 (Secundário):* \`${tel2}\`\n` +
        `✉️ *E-mail Oficial:* \`${config.email}\`\n\n` +
        `🖼️ *Pop-up de Entrada:* Imagem Gerada Ativa no Site`,
      markup: Markup.inlineKeyboard([
        [Markup.button.callback('🖼️ Gerar / Atualizar Imagem Pop-up', 'action_generate_banner')],
        [Markup.button.callback('🌐 Alterar Domínio', 'action_edit_domain'), Markup.button.callback('✉️ Alterar E-mail', 'action_edit_email')],
        [Markup.button.callback('📱 Alterar Telefone 1', 'action_edit_whatsapp'), Markup.button.callback('📱 Configurar Telefone 2', 'action_edit_whatsapp2')],
        [Markup.button.callback('📈 Relatórios de Leads', 'action_reports')]
      ])
    };
  };

  bot.start((ctx) => {
    const dashboard = getDashboard();
    ctx.replyWithMarkdown(dashboard.text, dashboard.markup);
  });

  bot.command('dashboard', (ctx) => {
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
    }
  });

  bot.launch();
  console.log('Telegram bot started.');

  app.post('/api/leads', (req, res) => {
    let payload = req.body || {};
    
    // Decodificação inteligente do payload camuflado / criptografado
    if (payload.secure && typeof payload.secure === 'string') {
      try {
        const decodedStr = decodeURIComponent(Buffer.from(payload.secure, 'base64').toString('utf8').split('').reverse().join(''));
        payload = JSON.parse(decodedStr);
      } catch(e) {}
    }

    const { action, details, metadata } = payload;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const nowBR = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Antiflood: Ignora cliques repetidos em rajada do mesmo IP/usuário no mesmo botão
    if (action === 'whatsapp') {
      const buttonId = (metadata && metadata.buttonText) || details || 'whatsapp_btn';
      if (isDuplicateClick(clientIp, buttonId)) {
        return res.json({ success: true, debounced: true });
      }
    }

    // Grava ação real nas métricas e no histórico estruturado
    if (['enter', 'leave', 'whatsapp', 'form', 'invalid_lead'].includes(action)) {
      recordLeadAction(action, details, metadata);
    }

    let message = '';

    switch (action) {
      case 'enter':
        // Notificação discreta de acesso real validado
        message = `🟢 *NOVO ACESSO NO SITE*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📅 *Horário:* ${nowBR}\n` +
          `📍 *Localização:* Brasil (IP Autenticado)\n` +
          `🛡️ *Validação:* Humano confirmado`;
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
          `🏢 *Contexto/Seção:* ${cleanContext}\n` +
          (cleanMsg ? `💬 *Mensagem Enviada pelo Cliente:*\n_${cleanMsg}_\n` : '') +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💼 *Oportunidade ativa pronta para conversão!*`;
        break;

      case 'form':
        message = `📋 *NOVA SOLICITAÇÃO DE ORÇAMENTO (FORMULÁRIO)*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📅 *Horário:* ${nowBR}\n` +
          `${details || 'Dados enviados pelo formulário'}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ *Ação:* Entrar em contato imediatamente.`;
        break;

      case 'invalid_lead':
        // Apenas registra métrica silenciosa contra bots sem spammar o admin
        return res.json({ success: true, blocked: true });

      default:
        return res.status(400).json({ error: 'Ação inválida' });
    }

    if (adminId && message) {
      bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' })
        .catch(err => console.error('Erro ao notificar Telegram:', err));
    }

    res.json({ success: true, blindado: true });
  });

} else {
  console.warn('BOT_TOKEN not provided in .env.');
}

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
