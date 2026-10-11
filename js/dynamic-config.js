document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Busca a configuração do nosso backend Node
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Falha ao carregar configurações');
    
    const config = await response.json();
    
    // Atualiza links do WhatsApp no site
    const whatsappLinks = document.querySelectorAll('[data-dynamic-contact="whatsapp-link"]');
    whatsappLinks.forEach(link => {
      link.href = `https://api.whatsapp.com/send?phone=${config.whatsapp}`;
    });

    // Atualiza o texto visível do WhatsApp
    const whatsappTexts = document.querySelectorAll('[data-dynamic-contact="whatsapp-text"]');
    whatsappTexts.forEach(el => {
      // Formata: 551129163000 -> 11 2916-3000 (exemplo básico)
      let displayNum = config.whatsapp;
      if (displayNum.length >= 10) {
        displayNum = displayNum.replace(/^55/, ''); // Remove o 55
        displayNum = `${displayNum.substring(0, 2)} ${displayNum.substring(2, 6)}-${displayNum.substring(6)}`;
      }
      el.textContent = displayNum;
    });

    // Atualiza o texto de E-mail
    const emailTexts = document.querySelectorAll('[data-dynamic-contact="email-text"]');
    emailTexts.forEach(el => {
      el.textContent = config.email;
    });

  } catch (error) {
    console.error('Erro ao injetar configuração dinâmica:', error);
  }
});
