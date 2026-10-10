(() => {
  "use strict";
  const config = window.PONTE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const maxFileBytes = Number(config.limiteArquivoBytes) || 10 * 1024 * 1024;
  const files = Array.isArray(config.arquivos) ? config.arquivos : [];
  const tabs = [$('download-tab'), $('upload-tab')];
  let chosenFile = null;
  let activeController = null;
  let checking = false;

  function readableSize(bytes) {
    if (bytes < 1024) return `${bytes} bytes`;
    const unit = bytes < 1024 * 1024 ? 'KiB' : 'MiB';
    const divider = unit === 'KiB' ? 1024 : 1024 * 1024;
    return `${(bytes / divider).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unit}`;
  }
  function selectTab(index, focus = false) {
    tabs.forEach((tab, current) => {
      const selected = current === index;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(index));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = 1;
      if (next !== undefined) { event.preventDefault(); selectTab(next, true); }
    });
  });
  if (config.nome) {
    $('brand-name').textContent = config.nome;
    document.title = `${config.nome} — entrega de arquivos`;
  }
  if (config.descricao) $('page-description').textContent = config.descricao;
  $('size-limit').textContent = `Até ${readableSize(maxFileBytes)}`;
  $('api-url').value = config.apiUrl || '';

  function listFiles() {
    const query = $('file-search').value.trim().toLocaleLowerCase('pt-BR');
    const list = $('file-list');
    list.replaceChildren();
    let count = 0;
    for (const file of files) {
      if (typeof file.nome !== 'string' || !file.nome || /[\\/]/.test(file.nome) || file.nome === '..') continue;
      const title = file.titulo || file.nome;
      if (!`${title} ${file.nome}`.toLocaleLowerCase('pt-BR').includes(query)) continue;
      let downloadUrl = `arquivos/${encodeURIComponent(file.nome)}`;
      if (file.url) {
        try {
          const parsed = new URL(file.url);
          const embedded = /^data:application\/octet-stream;base64,[A-Za-z0-9+/=]+$/.test(file.url);
          if (!(parsed.protocol === 'https:' && !parsed.username && !parsed.password) && !embedded) continue;
          downloadUrl = file.url;
        } catch { continue; }
      }
      const row = document.createElement('article'); row.className = 'file-row';
      const icon = document.createElement('span'); icon.className = 'file-icon';
      icon.textContent = (file.nome.split('.').pop() || 'ARQ').slice(0, 5).toUpperCase();
      icon.setAttribute('aria-hidden', 'true');
      const info = document.createElement('div'); info.className = 'file-info';
      const heading = document.createElement('h3'); heading.textContent = title;
      const detail = document.createElement('p'); detail.textContent = `${readableSize(file.bytes || 0)} · ${file.nome}`;
      info.append(heading, detail);
      const link = document.createElement('a'); link.className = 'download-link';
      link.href = downloadUrl; link.download = file.nome;
      if (downloadUrl.startsWith('https:')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      link.textContent = 'Baixar ↓'; link.setAttribute('aria-label', `Baixar ${title}`);
      row.append(icon, info, link); list.append(row); count += 1;
    }
    $('empty-files').hidden = count !== 0;
    $('empty-files').textContent = query ? 'Nenhum arquivo encontrado para essa busca.' : 'Os arquivos aparecerão aqui assim que forem publicados.';
    $('file-count').textContent = `${count} ${count === 1 ? 'arquivo disponível' : 'arquivos disponíveis'}`;
  }
  $('file-search').addEventListener('input', listFiles);
  listFiles();

  function apiBase() {
    let url;
    try { url = new URL($('api-url').value.trim()); } catch { throw new Error('Informe um endereço de API válido.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
      throw new Error('Use um endereço HTTPS, sem chave, usuário ou parâmetros na URL.');
    }
    if (location.protocol === 'https:' && url.protocol === 'http:') {
      throw new Error('A página publicada precisa de uma API HTTPS. Use a prévia local para testar a API deste computador.');
    }
    return url.href.replace(/\/+$/, '');
  }
  function status(message, kind = '') {
    $('upload-status').textContent = message;
    $('upload-status').className = `upload-status ${kind}`;
  }
  function chooseFile(file) {
    if (activeController) return;
    chosenFile = file || null;
    $('receipt').hidden = true;
    status('');
    $('selected-file').textContent = chosenFile ? `${chosenFile.name} · ${readableSize(chosenFile.size)}` : 'PDF, planilha, imagem, ZIP… você escolhe.';
    $('file-input').setCustomValidity(chosenFile && chosenFile.size > maxFileBytes ? `O limite é ${readableSize(maxFileBytes)} por arquivo.` : '');
  }
  $('file-input').addEventListener('change', (event) => chooseFile(event.target.files[0]));
  for (const eventName of ['dragenter', 'dragover']) {
    $('drop-zone').addEventListener(eventName, (event) => { event.preventDefault(); if (!activeController) $('drop-zone').classList.add('drag-over'); });
  }
  for (const eventName of ['dragleave', 'drop']) {
    $('drop-zone').addEventListener(eventName, (event) => {
      event.preventDefault(); $('drop-zone').classList.remove('drag-over');
      if (eventName === 'drop' && !activeController) {
        const transferred = new DataTransfer();
        if (event.dataTransfer.files[0]) transferred.items.add(event.dataTransfer.files[0]);
        $('file-input').files = transferred.files; chooseFile(transferred.files[0]);
      }
    });
  }
  function busy(value) {
    for (const id of ['api-url', 'api-token', 'file-input', 'forward-file', 'send-file', 'check-api']) $(id).disabled = value;
    $('cancel-upload').hidden = !value;
    $('upload-progress').hidden = !value;
    if (value) $('upload-progress').removeAttribute('value');
  }
  function showReceipt(receipt) {
    const details = $('receipt-details'); details.replaceChildren();
    for (const [title, value] of [['Arquivo', receipt.nome_original], ['Tamanho', readableSize(receipt.bytes)], ['Recebido por', receipt.recebido_por], ['Identificador', receipt.id], ['SHA-256', receipt.sha256]]) {
      const dt = document.createElement('dt'); dt.textContent = title;
      const dd = document.createElement('dd'); dd.textContent = value || '—'; details.append(dt, dd);
    }
    $('receipt').hidden = false;
  }
  async function responseData(response) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('Esse endereço não respondeu como uma API da ponte. Confira o destino.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.erro || `O servidor respondeu com erro ${response.status}.`);
    return data;
  }
  $('check-api').addEventListener('click', async () => {
    if (checking || activeController) return;
    checking = true; $('check-api').disabled = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    $('connection-status').textContent = 'Verificando…';
    try {
      const data = await responseData(await fetch(`${apiBase()}/healthz`, { signal: controller.signal, credentials: 'omit', redirect: 'error' }));
      if (data.ok !== true) throw new Error('O destino não confirmou que está disponível.');
      $('connection-status').textContent = `Conectado a ${data.servico || 'seu serviço'}.`;
    } catch (error) {
      $('connection-status').textContent = error.name === 'TypeError' || error.name === 'AbortError' ? 'Não foi possível conectar. Confira o endereço e se o servidor permite esta página.' : error.message;
    } finally { clearTimeout(timeout); checking = false; $('check-api').disabled = Boolean(activeController); }
  });
  $('cancel-upload').addEventListener('click', () => activeController?.abort());
  $('upload-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (activeController) return;
    let timeout;
    let controller;
    try {
      const base = apiBase();
      const token = $('api-token').value.trim();
      if (!token || /[\r\n]/.test(token)) throw new Error('Digite uma chave de acesso válida.');
      if (!chosenFile) throw new Error('Escolha o arquivo que quer enviar.');
      if (chosenFile.size > maxFileBytes) throw new Error(`O limite é ${readableSize(maxFileBytes)} por arquivo.`);
      if (!window.crypto?.subtle) throw new Error('Abra a página por HTTPS ou na prévia local para conferir a integridade.');
      controller = new AbortController(); activeController = controller; busy(true); $('receipt').hidden = true;
      timeout = setTimeout(() => controller.abort(), 120000);
      status('Conferindo o arquivo…');
      const digest = await crypto.subtle.digest('SHA-256', await chosenFile.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      controller.signal.throwIfAborted();
      status('Enviando… aguardando a confirmação de recebimento.');
      const route = $('forward-file').checked ? '/enviar-arquivo' : '/arquivos';
      const response = await fetch(`${base}${route}`, { method: 'POST', body: chosenFile, credentials: 'omit', redirect: 'error', signal: controller.signal, headers: {
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(chosenFile.name), 'X-File-SHA256': sha256,
      }});
      const data = await responseData(response);
      const receipt = data.resposta || data;
      if (receipt.sha256 !== sha256 || receipt.bytes !== chosenFile.size) throw new Error('O servidor respondeu, mas não confirmou a integridade do arquivo.');
      showReceipt(receipt); status('Entrega confirmada. Seu arquivo chegou.', 'success');
    } catch (error) {
      let message = error.message;
      if (error.name === 'AbortError') message = 'Envio interrompido. Se o envio já começou, confirme no destino antes de reenviar.';
      if (error.name === 'TypeError') message = 'Não foi possível confirmar a entrega. Confira a conexão, o endereço e se o servidor permite esta página.';
      status(message, 'error');
    } finally {
      clearTimeout(timeout);
      if (controller) { activeController = null; busy(false); }
    }
  });
})();
