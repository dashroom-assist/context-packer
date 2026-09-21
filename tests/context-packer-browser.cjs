// Uso: node tests/context-packer-browser.cjs <porta CDP> <file:///.../context-packer/index.html>
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const http = require('node:http');
const port = process.argv[2] || '9331';
const url = process.argv[3];

(async () => {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let counter = 0;
  const pending = new Map();
  ws.onmessage = event => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { const wait = pending.get(message.id); pending.delete(message.id); message.error ? wait.reject(new Error(JSON.stringify(message.error))) : wait.resolve(message.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++counter; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text);
    return out.result.value;
  };
  let server;
  try {
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await evaluate(`new Promise(resolve => document.readyState === 'complete' ? resolve() : addEventListener('load', resolve, {once:true}))`);
    assert.equal(await evaluate(`typeof ContextPackerCore`), 'object');
    assert.equal(await evaluate(`typeof ContextPackerBrowser`), 'object');
    assert.equal(await evaluate(`document.querySelector('#choose').disabled`), false);
    assert.equal(await evaluate(`document.querySelector('#preset-menu').open`), false);
    assert.equal(await evaluate(`!!(document.querySelector('#status').compareDocumentPosition(document.querySelector('.setup')) & Node.DOCUMENT_POSITION_FOLLOWING)`), true);
    assert.equal(await evaluate(`document.querySelector('#save-preset').closest('.panel').querySelector('.step').textContent`), '03');
    assert.equal(await evaluate(`document.querySelector('#ext-ignore').closest('.panel').querySelector('.step').textContent`), '02');
    assert.equal(await evaluate(`document.querySelector('#request').closest('.panel').querySelector('.step').textContent`), '03');
    assert.equal(await evaluate(`document.querySelector('#request').closest('details').id`), 'preset-menu');
    assert.equal(await evaluate(`document.querySelector('#saved-presets').closest('details').id`), 'preset-menu');
    assert.equal(await evaluate(`document.querySelector('#load-saved-preset').closest('.preset-grid')===document.querySelector('#save-preset').closest('.preset-grid')`), true);
    assert.equal(await evaluate(`document.querySelector('#load-saved-preset').textContent`), 'Carregar');
    assert.equal(await evaluate(`document.querySelector('#save-preset').textContent`), 'Salvar');
    assert.equal(await evaluate(`document.querySelector('#save-preset').closest('.preset-block').querySelector('p')===null`), true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.tree-tools')).borderBottomWidth`), '0px');
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('#preset-menu')).borderBottomWidth`), '0px');

    const html = await fs.readFile(path.join(__dirname, '../index.html'));
    server = http.createServer((request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/index.html` });
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.readyState==='complete' && typeof ContextPackerBrowser==='object'`)) break; await new Promise(resolve => setTimeout(resolve, 25)); }
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });

    const result = await evaluate(`(async () => {
      const wait = async test => { for(let i=0;i<120;i++){ if(test()) return; await new Promise(r=>setTimeout(r,25)); } throw new Error('timeout: '+document.querySelector('#status').textContent); };
      if(document.querySelector('.eyebrow').textContent!=='WORKBENCH / TOOL') throw new Error('identificação pública incorreta');
      const description=document.querySelector('header .muted').textContent;
      if(!description.includes('empacotamento de arquivos')||/coordena[cç][aã]o/i.test(description)) throw new Error('descrição deve ser genérica');
      if(document.querySelector('.badge').textContent!=='OFFLINE TOOL · v1.0') throw new Error('selo da versão incorreto');
      const copyButton=document.querySelector('#copy');
      if(!copyButton||copyButton.nextElementSibling?.id!=='generate') throw new Error('Copiar deve ficar à esquerda de Salvar TXT');
      const structureToggle=document.querySelector('#show-structure');
      if(!structureToggle||!structureToggle.checked) throw new Error('controle de estrutura deve iniciar marcado');
      if(document.querySelector('#structure-mode').textContent!=='completa') throw new Error('estado completo não foi mostrado');
      let copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=String(text);}}});
      const root = await navigator.storage.getDirectory();
      for await (const [name] of root.entries()) await root.removeEntry(name,{recursive:true});
      async function write(filePath, content) {
        const parts=filePath.split('/'), name=parts.pop(); let dir=root;
        for(const part of parts) dir=await dir.getDirectoryHandle(part,{create:true});
        const handle=await dir.getFileHandle(name,{create:true}); const stream=await handle.createWritable(); await stream.write(content); await stream.close();
      }
      await write('README.md','# Example project\\n');
      await write('src/app.js','export const app = true;\\n');
      await write('src/utils.js','export const sum = (a,b) => a+b;\\n');
      await write('docs/requirements.md','# Requirements\\n');
      await write('docs/architecture.md','# Architecture\\n');
      await write('tests/app.test.js','// example test\\n');
      await write('assets/logo.png','fake image bytes');
      await write('logs/debug.log','debug\\n');
      await write('notes.txt','nota manual\\n');

      window.showDirectoryPicker=async()=>root;
      let saved='';
      window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async value=>{saved=String(value)},close:async()=>{}})});
      document.querySelector('#choose').click(); await wait(()=>document.querySelectorAll('.tree-file').length===9);
      const cpacker=await root.getDirectoryHandle('.cpacker');
      const configJson=JSON.parse(await (await (await cpacker.getFileHandle('config.json')).getFile()).text());
      const ignoreText=await (await (await cpacker.getFileHandle('.cpignore')).getFile()).text();
      if(!configJson.ignoredExtensions.includes('.png')) throw new Error('.cpacker/config.json não recebeu os padrões');
      if(ignoreText.includes('presets/')) throw new Error('.cpacker/presets é protegida internamente e não deve estar no .cpignore');
      if(ignoreText.includes('.cpacker/')) throw new Error('.cpacker não deve depender de regra no .cpignore');
      if(document.querySelector('[data-path=".cpacker"]')) throw new Error('.cpacker não deve aparecer no passo 3');
      if(!document.querySelector('#ext-ignore').value.includes('.png')) throw new Error('configuração .cpacker não foi carregada');
      document.querySelector('#ext-ignore').value='.png, json'; document.querySelector('#ignore-rules').value='*.tmp';
      document.querySelector('#save-filters').click(); await wait(()=>document.querySelector('#status').textContent.includes('salvas'));
      const savedConfig=JSON.parse(await (await (await cpacker.getFileHandle('config.json')).getFile()).text());
      const savedIgnore=await (await (await cpacker.getFileHandle('.cpignore')).getFile()).text();
      if(savedConfig.ignoredExtensions.join(',')!=='.png,.json'||savedIgnore!=='*.tmp\\n') throw new Error('botão não salvou os dois arquivos');
      if(ContextPackerBrowser.selected().length!==0) throw new Error('a seleção inicial deve ser vazia');
      structureToggle.click();
      await wait(()=>document.querySelector('#preview').value==='Selecione pelo menos um arquivo elegível.');
      if(structureToggle.checked||structureToggle.indeterminate||document.querySelector('#structure-mode').textContent!=='nenhuma') throw new Error('estado sem estrutura incorreto');
      structureToggle.click();
      await wait(()=>structureToggle.indeterminate&&document.querySelector('#structure-mode').textContent==='somente selecionados');
      structureToggle.click();
      await wait(()=>document.querySelector('#preview').value.startsWith((root.name||'pasta-base')+'/'));
      if(!structureToggle.checked||structureToggle.indeterminate||document.querySelector('#structure-mode').textContent!=='completa') throw new Error('ciclo não retornou à estrutura completa');
      document.querySelector('.tree-file[data-path="notes.txt"] input').click();
      await wait(()=>document.querySelector('#preview').value.includes('nota manual'));
      if(document.querySelector('#preview').value.includes('.cpacker')) throw new Error('.cpacker não deve aparecer na árvore da prévia');
      document.querySelector('#none').click(); await wait(()=>ContextPackerBrowser.selected().length===0);
      document.querySelector('#ignore-rules').value+='\\n*.log'; document.querySelector('#apply-filters').click();
      await wait(()=>document.querySelector('.tree-file[data-path="logs/debug.log"]').dataset.status==='ignored');
      if(!document.querySelector('.tree-file[data-path="assets/logo.png"] input').disabled) throw new Error('extensão ignorada deve ficar indisponível');
      document.querySelector('#example').click(); document.querySelector('#load').click();
      await wait(()=>ContextPackerBrowser.selected().length===6 && document.querySelector('#preview').value.includes('included: 6'));
      if(!document.querySelector('#preview-summary').textContent.includes('6 arquivos')) throw new Error('resumo não mostra quantidade selecionada');
      if(!document.querySelector('#preview-summary').textContent.includes('tokens estimados')) throw new Error('resumo não mostra estimativa de tokens');
      if(!document.querySelector('#preview').value.includes('[-] logo.png')) throw new Error('árvore ASCII não sinalizou ignorado');
      structureToggle.click();
      document.querySelector('#copy').click();
      await wait(()=>copied.includes(':COMPLETE'));
      if(copied.includes('\\nSTRUCTURE\\n')) throw new Error('Copiar deve respeitar imediatamente o modo sem estrutura');
      await wait(()=>!document.querySelector('#preview').value.includes('\\nSTRUCTURE\\n')&&document.querySelector('#preview').value.includes('\\nINVENTORY\\n'));
      structureToggle.click();
      await wait(()=>structureToggle.indeterminate&&document.querySelector('#preview').value.includes('\\nSTRUCTURE\\n'));
      const selectedTree=document.querySelector('#preview').value.split('\\nSTRUCTURE\\n')[1].split('\\n\\nLEGEND\\n')[0];
      if(!selectedTree.includes('requirements.md')||selectedTree.includes('logo.png')||selectedTree.includes('notes.txt')) throw new Error('estrutura parcial deve listar somente selecionados');
      structureToggle.click();
      await wait(()=>document.querySelector('#preview').value.includes('\\nSTRUCTURE\\n'));
      if(!document.querySelector('#preview').value.includes('[-] logo.png')) throw new Error('estrutura completa não voltou após o terceiro estado');
      document.querySelector('.tree-file[data-path="tests/app.test.js"] input').click();
      await wait(()=>ContextPackerBrowser.selected().length===5 && document.querySelector('#preview').value.includes('included: 5'));
      if(!document.querySelector('#preview').value.includes('[ ] app.test.js')) throw new Error('prévia não atualizou arquivo desmarcado');
      document.querySelector('#preset-name').value='Example bundle'; document.querySelector('#preset-name').dispatchEvent(new Event('input'));
      document.querySelector('#save-preset').click();
      await wait(()=>document.querySelector('#saved-presets').value==='example-bundle.json');
      const presetFile=await (await (await cpacker.getDirectoryHandle('presets')).getFileHandle('example-bundle.json')).getFile();
      const presetJson=JSON.parse(await presetFile.text());
      if(presetJson.files.length!==5||presetJson.files.some(item=>typeof item.path!=='string')) throw new Error('preset JSON inválido');
      document.querySelector('#none').click(); await wait(()=>ContextPackerBrowser.selected().length===0);
      document.querySelector('#load-saved-preset').click(); await wait(()=>ContextPackerBrowser.selected().length===5);
      copied=''; document.querySelector('#copy').click(); await wait(()=>copied.includes('WBCTX:')&&copied.includes(':COMPLETE'));
      if(copied!==document.querySelector('#preview').value) throw new Error('Copiar não enviou a prévia completa');
      document.querySelector('#generate').click(); await wait(()=>saved.includes('WBCTX:') && saved.includes(':COMPLETE'));
      return {discovered:document.querySelectorAll('.tree-file').length,selected:ContextPackerBrowser.selected().length,ignored:document.querySelectorAll('.tree-file[data-status="ignored"]').length,presetFiles:presetJson.files.length,savedBytes:new TextEncoder().encode(saved).byteLength,hasSpec:saved.includes('docs/requirements.md'),hasStructure:saved.includes('STRUCTURE')&&saved.includes('[-] logo.png'),status:document.querySelector('#status').textContent};
    })()`);
    assert.equal(result.discovered, 9);
    assert.equal(result.selected, 5);
    assert.equal(result.ignored, 2);
    assert.equal(result.presetFiles, 5);
    assert.equal(result.hasSpec, true);
    assert.equal(result.hasStructure, true);
    assert.ok(result.savedBytes > 500);
    console.log(JSON.stringify(result, null, 2));

    await evaluate(`document.querySelector('#preset-menu').open=true`);
    for (const [label, width, height] of [['desktop', 1280, 950], ['mobile', 390, 844]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, label + ' não deve transbordar');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.preset-grid')).gridTemplateColumns.split(' ').length`), label==='desktop'?2:1, label+' deve organizar carregar/salvar nas colunas esperadas');
      if(label==='desktop') {
        assert.equal(await evaluate(`Math.abs(document.querySelector('#saved-presets').offsetTop-document.querySelector('#load-saved-preset').offsetTop)<=2`), true, 'dropdown e Carregar devem ficar na mesma linha');
        assert.equal(await evaluate(`Math.abs(document.querySelector('#preset-name').offsetTop-document.querySelector('#save-preset').offsetTop)<=2`), true, 'nome e Salvar devem ficar na mesma linha');
      }
      const shot = await send('Page.captureScreenshot', { format:'png', captureBeyondViewport:true });
      await fs.writeFile(`/tmp/context-packer-${label}.png`, Buffer.from(shot.data, 'base64'));
    }
  } finally {
    await send('Page.close').catch(() => {}); ws.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
