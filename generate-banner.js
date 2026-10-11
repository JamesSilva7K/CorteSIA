const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

/**
 * Formata número de telefone para o padrão (XX) XXXX-XXXX ou (XX) 9XXXX-XXXX
 */
function formatPhone(phoneStr) {
  if (!phoneStr) return '';
  const digits = phoneStr.replace(/\D/g, '');
  const num = digits.startsWith('55') && digits.length >= 12 ? digits.substring(2) : digits;
  if (num.length === 11) {
    return `(${num.substring(0, 2)}) ${num.substring(2, 7)}-${num.substring(7)}`;
  } else if (num.length === 10) {
    return `(${num.substring(0, 2)}) ${num.substring(2, 6)}-${num.substring(6)}`;
  }
  return phoneStr;
}

let cachedTemplate = null;
let cachedIconGlobe = null;
let cachedIconWa = null;

async function getAssets() {
  const imagesDir = path.join(__dirname, 'images');
  const templatePath = path.join(imagesDir, 'template-fraude.jpg');
  const globePath = path.join(imagesDir, 'icon-globe.png');
  const waPath = path.join(imagesDir, 'icon-wa.png');

  if (!cachedTemplate) {
    cachedTemplate = await loadImage(templatePath);
  }

  if (!cachedIconGlobe) {
    if (fs.existsSync(globePath)) {
      cachedIconGlobe = await loadImage(globePath);
    } else {
      const gC = createCanvas(36, 36);
      gC.getContext('2d').drawImage(cachedTemplate, 167, 427, 36, 36, 0, 0, 36, 36);
      cachedIconGlobe = gC;
    }
  }

  if (!cachedIconWa) {
    if (fs.existsSync(waPath)) {
      cachedIconWa = await loadImage(waPath);
    } else {
      const wC = createCanvas(36, 36);
      wC.getContext('2d').drawImage(cachedTemplate, 251, 486, 36, 36, 0, 0, 36, 36);
      cachedIconWa = wC;
    }
  }

  return { template: cachedTemplate, iconGlobe: cachedIconGlobe, iconWa: cachedIconWa };
}

/**
 * Gera a imagem 100% idêntica ao modelo de referência original
 */
async function generateFraudAlertImage({ domain, phone1, phone2, outputPath }) {
  const { template, iconGlobe, iconWa } = await getAssets();

  const width = template.width;
  const height = template.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Renderiza o design base oficial idêntico
  ctx.drawImage(template, 0, 0);

  // 2. Limpa com precisão cirúrgica na cor oficial exata (#0f1d68) apenas os contatos
  ctx.fillStyle = '#0f1d68';
  ctx.fillRect(0, 415, width, 185);

  const siteDomain = (domain || 'www.cortesiaconcreto.com.br').toLowerCase().trim();
  const fPhone1 = formatPhone(phone1 || '1129163000');
  const fPhone2 = phone2 ? formatPhone(phone2) : null;

  function drawLine(iconImg, text, yCenter, fontSize) {
    ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const iconW = 36;
    const iconH = 36;
    const gap = 13;

    const totalWidth = iconW + gap + textWidth;
    const startX = Math.round((width - totalWidth) / 2);

    ctx.drawImage(iconImg, startX, Math.round(yCenter - iconH / 2));

    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, startX + iconW + gap, yCenter);
  }

  if (fPhone2) {
    drawLine(iconGlobe, siteDomain, 445, 23.5);
    drawLine(iconWa, fPhone1, 504, 25);
    drawLine(iconWa, fPhone2, 563, 25);
  } else {
    drawLine(iconGlobe, siteDomain, 465, 25);
    drawLine(iconWa, fPhone1, 535, 26);
  }

  const finalPath = outputPath || path.join(__dirname, 'images', 'comunicado-de-fraude-2.jpg');
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.98 });
  fs.writeFileSync(finalPath, buffer);
  return finalPath;
}

const plantList = [
  { file: '1.jpg', name: 'MATRIZ VILA PRUDENTE' },
  { file: '2_1.jpg', name: 'CENTRAL BARUERI' },
  { file: '3.jpg', name: 'CENTRAL JAGUARÉ' },
  { file: '4_1.jpg', name: 'CENTRAL CAÇAPAVA' },
  { file: '5_1.jpg', name: 'CENTRAL SANTOS' },
  { file: '6.jpg', name: 'CENTRAL ATIBAIA' },
  { file: '7.jpg', name: 'MOGI DAS CRUZES' }
];

/**
 * Atualiza todas as 7 fotos das usinas com o novo número oficial do admin
 */
async function updateAllPlantBanners(phoneStr) {
  const imagesDir = path.join(__dirname, 'images');
  const originalsDir = path.join(imagesDir, 'originals');
  const formatted = formatPhone(phoneStr || '1129163000');

  for (const p of plantList) {
    const origPath = path.join(originalsDir, p.file);
    const destPath = path.join(imagesDir, p.file);

    if (!fs.existsSync(origPath)) continue;

    const img = await loadImage(origPath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    // Desenha foto original
    ctx.drawImage(img, 0, 0);

    // Faixa azul marinho oficial no topo
    ctx.fillStyle = '#000c3b';
    ctx.fillRect(0, 0, img.width, 66);

    // Título da Usina (Amarelo)
    ctx.fillStyle = '#FFDE00';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, img.width / 2, 27);

    // Telefone Sincronizado do Admin (Branco)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillText(`TEL: ${formatted}`, img.width / 2, 53);

    const buf = canvas.toBuffer('image/jpeg', { quality: 0.95 });
    fs.writeFileSync(destPath, buf);
  }
}

module.exports = {
  generateFraudAlertImage,
  updateAllPlantBanners,
  formatPhone
};
