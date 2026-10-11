const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

/**
 * Formata número de telefone para o padrão (XX) XXXX-XXXX ou (XX) 9XXXX-XXXX
 */
function formatPhone(phoneStr) {
  if (!phoneStr) return '';
  const digits = phoneStr.replace(/\D/g, '');
  // Remove 55 inicial se houver
  const num = digits.startsWith('55') && digits.length >= 12 ? digits.substring(2) : digits;
  if (num.length === 11) {
    return `(${num.substring(0, 2)}) ${num.substring(2, 7)}-${num.substring(7)}`;
  } else if (num.length === 10) {
    return `(${num.substring(0, 2)}) ${num.substring(2, 6)}-${num.substring(6)}`;
  }
  return phoneStr;
}

/**
 * Desenha um triângulo de alerta idêntico ao da imagem
 */
function drawWarningIcon(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);

  // Triângulo amarelo arredondado
  const h = size * 0.866;
  const r = size * 0.15; // raio dos cantos

  ctx.beginPath();
  ctx.moveTo(0, -h / 2 + r * 1.5);
  ctx.lineTo(size / 2 - r, h / 2 - r);
  ctx.arcTo(size / 2, h / 2, size / 2 - r * 1.5, h / 2, r);
  ctx.lineTo(-size / 2 + r * 1.5, h / 2);
  ctx.arcTo(-size / 2, h / 2, -size / 2 + r, h / 2 - r, r);
  ctx.lineTo(-r * 0.866, -h / 2 + r * 1.5);
  ctx.arcTo(0, -h / 2, r * 0.866, -h / 2 + r * 1.5, r);
  ctx.closePath();

  ctx.fillStyle = '#F5B025';
  ctx.fill();

  // Borda mais clara
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#FCE38A';
  ctx.stroke();

  // Ponto de exclamação no centro
  ctx.fillStyle = '#FFFFFF';
  // Barra
  const barW = size * 0.1;
  const barH = size * 0.32;
  const barY = -h / 2 + size * 0.32;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-barW / 2, barY, barW, barH, barW / 2);
  } else {
    ctx.rect(-barW / 2, barY, barW, barH);
  }
  ctx.fill();

  // Ponto
  const dotR = size * 0.055;
  const dotY = barY + barH + size * 0.1;
  ctx.beginPath();
  ctx.arc(0, dotY, dotR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Desenha o ícone do globo dourado
 */
function drawGlobeIcon(ctx, x, y, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#F5A623';
  ctx.fill();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.2;

  // Linhas do globo
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.9, 0, Math.PI * 2);
  ctx.stroke();

  // Linha horizontal central
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.9, y);
  ctx.lineTo(x + radius * 0.9, y);
  ctx.stroke();

  // Elipse vertical
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 0.5, radius * 0.9, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Desenha o ícone de telefone/WhatsApp circular dourado
 */
function drawPhoneIcon(ctx, x, y, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#F5A623';
  ctx.fill();

  // Monofone branco simplificado
  ctx.fillStyle = '#FFFFFF';
  ctx.translate(x, y);
  ctx.rotate(-0.35);

  ctx.beginPath();
  // Formato elegante de fone
  const s = radius * 0.55;
  ctx.arc(-s * 0.4, -s * 0.4, s * 0.35, 0, Math.PI * 2);
  ctx.arc(s * 0.4, s * 0.4, s * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.lineWidth = s * 0.45;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.arc(0, 0, s * 0.7, -Math.PI * 0.7, 0.2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Gera a imagem idêntica à de referência
 */
async function generateFraudAlertImage({ domain, phone1, phone2, outputPath }) {
  const width = 1000;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Fundo Superior Branco
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, 500);

  // 2. Fundo Inferior Azul Escuro Oficial
  ctx.fillStyle = '#0E2164';
  ctx.fillRect(0, 500, width, 500);

  // 3. Ícone de Alerta Centralizado no topo
  drawWarningIcon(ctx, width / 2, 115, 120);

  // 4. Título Amarelo "PREVENÇÃO DE FRAUDES"
  ctx.fillStyle = '#F5A623';
  ctx.font = 'bold 50px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PREVENÇÃO DE FRAUDES', width / 2, 235);

  // 5. Parágrafo Superior Explicativo
  ctx.fillStyle = '#333333';
  ctx.font = '500 24.5px Arial, sans-serif';
  ctx.textAlign = 'center';

  const line1 = 'Identificamos tentativas de fraudes, nas quais os criminosos';
  const line2_p1 = 'se utilizam do nome da ';
  const line2_bold = 'CORTESIA CONCRETO';
  const line2_p2 = ' para registrar';
  const line3 = 'domínios de site parecidos, telefones, anúncios no Google';
  const line4 = 'Ads e números de WhatsApp.';

  ctx.fillText(line1, width / 2, 305);

  // Linha 2 com palavra em negrito no meio
  const totalW2 = ctx.measureText(line2_p1).width + ctx.measureText(line2_bold).width + ctx.measureText(line2_p2).width;
  let curX = width / 2 - totalW2 / 2;

  ctx.textAlign = 'left';
  ctx.font = '500 24.5px Arial, sans-serif';
  ctx.fillText(line2_p1, curX, 345);
  curX += ctx.measureText(line2_p1).width;

  ctx.font = 'bold 25px Arial, sans-serif';
  ctx.fillText(line2_bold, curX, 345);
  curX += ctx.measureText(line2_bold).width;

  ctx.font = '500 24.5px Arial, sans-serif';
  ctx.fillText(line2_p2, curX, 345);

  ctx.textAlign = 'center';
  ctx.font = 'bold 24.5px Arial, sans-serif';
  ctx.fillText(line3, width / 2, 385);
  ctx.fillText(line4, width / 2, 425);

  // 6. Faixa Verde "CONFIRA NOSSOS CANAIS OFICIAIS!"
  const bannerY = 465;
  const bannerH = 72;
  const bannerW = 850;
  const bannerX = (width - bannerW) / 2;
  const bannerR = bannerH / 2;

  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(bannerX, bannerY, bannerW, bannerH, bannerR);
  } else {
    ctx.rect(bannerX, bannerY, bannerW, bannerH);
  }
  ctx.fillStyle = '#109E38';
  ctx.fill();
  ctx.restore();

  // Texto dentro da faixa verde
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 36px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CONFIRA NOSSOS CANAIS OFICIAIS!', width / 2, bannerY + 49);

  // 7. Área Azul Inferior - Canais Oficiais
  const siteDomain = (domain || 'www.cortesiaconcreto.com.br').toLowerCase().trim();
  const fPhone1 = formatPhone(phone1 || '1129163000');
  const fPhone2 = phone2 ? formatPhone(phone2) : null;

  let startItemY = fPhone2 ? 605 : 635;
  const itemGap = 72;

  // Função auxiliar para desenhar item (ícone + texto) centralizado
  function drawCenteredItem(iconType, text, yPos, fontSize) {
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const iconRadius = 26;
    const spacing = 18;
    const totalBlockWidth = (iconRadius * 2) + spacing + textWidth;
    const startX = (width - totalBlockWidth) / 2;
    const iconCenterX = startX + iconRadius;
    const textStartX = startX + (iconRadius * 2) + spacing;

    if (iconType === 'globe') {
      drawGlobeIcon(ctx, iconCenterX, yPos - 11, iconRadius);
    } else {
      drawPhoneIcon(ctx, iconCenterX, yPos - 11, iconRadius);
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(text, textStartX, yPos);
  }

  // Linha 1: Domínio
  drawCenteredItem('globe', siteDomain, startItemY, 36);

  // Linha 2: Telefone 1
  drawCenteredItem('phone', fPhone1, startItemY + itemGap, 37);

  // Linha 3: Telefone 2 (se fornecido)
  if (fPhone2) {
    drawCenteredItem('phone', fPhone2, startItemY + itemGap * 2, 37);
  }

  // 8. Aviso Legal Inferior
  const footerBaseY = fPhone2 ? 865 : 855;
  ctx.textAlign = 'center';
  ctx.font = '500 23px Arial, sans-serif';
  ctx.fillStyle = '#FFFFFF';

  ctx.fillText('Antes de efetuar qualquer pagamento, confirme se os dados', width / 2, footerBaseY);

  // Linha "correspondem à Cortesia Concreto. Proteja-se!"
  const p1 = 'correspondem à Cortesia Concreto. ';
  const p2 = 'Proteja-se!';
  const totW = ctx.measureText(p1).width + ctx.measureText(p2).width;
  let footX = width / 2 - totW / 2;

  ctx.textAlign = 'left';
  ctx.fillText(p1, footX, footerBaseY + 36);
  footX += ctx.measureText(p1).width;
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillText(p2, footX, footerBaseY + 36);

  ctx.textAlign = 'center';
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillText('Confie apenas em nossos canais oficiais de comunicação.', width / 2, footerBaseY + 74);

  // 9. Salvar Arquivo
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
  const finalPath = outputPath || path.join(__dirname, 'images', 'comunicado-de-fraude-2.jpg');
  fs.writeFileSync(finalPath, buffer);
  return finalPath;
}

module.exports = {
  generateFraudAlertImage,
  formatPhone
};
