// Uso: node tests/context-packer-browser.cjs <porta CDP> <file:///.../context-packer/index.html>
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const http = require('node:http');
const { deflateRawSync } = require('node:zlib');
const port = process.argv[2] || '9331';
const url = process.argv[3];

function buildZip(entries) {
  const locals=[],centrals=[];let offset=0;
  for(const [name,content,method=0] of entries){const nameBytes=Buffer.from(name),plain=Buffer.from(content),data=method===8?deflateRawSync(plain):plain;
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(plain.length,22);local.writeUInt16LE(nameBytes.length,26);locals.push(local,nameBytes,data);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(method,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(plain.length,24);central.writeUInt16LE(nameBytes.length,28);central.writeUInt32LE(offset,42);centrals.push(central,nameBytes);offset+=local.length+nameBytes.length+data.length;}
  const directory=Buffer.concat(centrals),eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(entries.length,8);eocd.writeUInt16LE(entries.length,10);eocd.writeUInt32LE(directory.length,12);eocd.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,eocd]);
}
const zipBase64=buildZip([['snapshot/docs/readme.md','# From ZIP\\n',8],['snapshot/src/app.js','export const zip = true;\\n'],['.cpacker/config.json','{}']]).toString('base64');

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
    assert.equal(await evaluate(`(async()=>{let pulls=0,cancelled=false;const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(1024));},cancel(){cancelled=true;}});try{await ContextPackerBrowser.readStreamLimited(stream,1500);}catch(error){return pulls<10&&cancelled&&/limite/i.test(error.message);}return false;})()`), true, 'descompactação deve parar assim que exceder o limite');
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
      const wait = async (test,timeout=3000) => { for(let elapsed=0;elapsed<timeout;elapsed+=25){ if(test()) return; await new Promise(r=>setTimeout(r,25)); } throw new Error('timeout: '+document.querySelector('#status').textContent); };
      if(document.querySelector('.eyebrow').textContent!=='WORKBENCH / TOOL') throw new Error('identificação pública incorreta');
      const description=document.querySelector('header .muted').textContent;
      if(!description.includes('empacotamento de arquivos')||/coordena[cç][aã]o/i.test(description)) throw new Error('descrição deve ser genérica');
      if(document.querySelector('.badge').textContent!=='OFFLINE TOOL · v1.0') throw new Error('selo da versão incorreto');
      if(!document.querySelector('#choose-zip')||!document.querySelector('#source-drop')) throw new Error('passo 1 deve permitir selecionar ou arrastar ZIP');
      if(!document.querySelector('#source-drop h2').textContent.includes('Escolha a origem e pasta base')) throw new Error('passo 1 deve identificar origem e pasta base');
      if(!document.querySelector('#base-folder')||!document.querySelector('#base-folder').disabled) throw new Error('pasta base deve iniciar indisponível');
      if(!document.querySelector('#toast')||!document.querySelector('#toast-close')||!document.querySelector('#toast').hidden) throw new Error('toast fechável deve iniciar oculto');
      const exportPrefixGrid=document.querySelector('.export-prefix-grid');if(!exportPrefixGrid||getComputedStyle(exportPrefixGrid).gridTemplateColumns.split(' ').length!==2) throw new Error('prefixo ativo e novo prefixo devem usar duas colunas');
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
      await write('bundle.zip','fake zip bytes');
      await write('logs/debug.log','debug\\n');
      await write('notes.txt','nota manual\\n');

      window.showDirectoryPicker=async()=>root;
      let saved='',suggestedName='';
      window.showSaveFilePicker=async options=>{suggestedName=options.suggestedName;return {createWritable:async()=>({write:async value=>{saved=String(value)},close:async()=>{}})};};
      document.querySelector('#choose').click(); await wait(()=>document.querySelectorAll('.tree-file').length===10);
      if([...document.querySelectorAll('#tree details')].some(item=>item.open)) throw new Error('árvore do passo 3 deve iniciar colapsada');
      const cpacker=await root.getDirectoryHandle('.cpacker');
      const configJson=JSON.parse(await (await (await cpacker.getFileHandle('config.json')).getFile()).text());
      const ignoreText=await (await (await cpacker.getFileHandle('.cpignore')).getFile()).text();
      if(!configJson.ignoredExtensions.includes('.png')) throw new Error('.cpacker/config.json não recebeu os padrões');
      if(configJson.exportPrefixes.join(',')!=='contexto'||configJson.exportPrefix!=='contexto') throw new Error('.cpacker/config.json não recebeu a configuração inicial de export');
      if(ignoreText.includes('presets/')) throw new Error('.cpacker/presets é protegida internamente e não deve estar no .cpignore');
      if(ignoreText.includes('.cpacker/')) throw new Error('.cpacker não deve depender de regra no .cpignore');
      if(document.querySelector('[data-path=".cpacker"]')) throw new Error('.cpacker não deve aparecer no passo 3');
      if(!document.querySelector('#ext-ignore').value.includes('.png')) throw new Error('configuração .cpacker não foi carregada');
      if(!document.querySelector('#export-prefix')||!document.querySelector('#new-export-prefix')||!document.querySelector('#export-name-preview')) throw new Error('passo 2 não oferece configuração do nome de export');
      document.querySelector('#new-export-prefix').value='Implementação';document.querySelector('#add-export-prefix').click();
      await wait(()=>document.querySelector('#export-prefix').value==='implementacao');
      await ContextPackerBrowser.loadDirectory(root);
      if(document.querySelector('#export-prefix').value!=='implementacao') throw new Error('último prefixo escolhido não foi restaurado');
      if(!/^implementacao-.+-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}[.]txt$/.test(document.querySelector('#export-name-preview').textContent)) throw new Error('prévia do nome de export inválida: '+document.querySelector('#export-name-preview').textContent);
      document.querySelector('#ext-ignore').value='.png, json, zip'; document.querySelector('#ignore-rules').value='*.tmp';
      document.querySelector('#save-filters').click(); await wait(()=>document.querySelector('#status').textContent.includes('salvas'));
      const savedConfig=JSON.parse(await (await (await cpacker.getFileHandle('config.json')).getFile()).text());
      const savedIgnore=await (await (await cpacker.getFileHandle('.cpignore')).getFile()).text();
      if(savedConfig.ignoredExtensions.join(',')!=='.png,.json,.zip'||savedConfig.exportPrefix!=='implementacao'||!savedConfig.exportPrefixes.includes('implementacao')||savedIgnore!=='*.tmp\\n') throw new Error('botão não salvou filtros e configuração do export');
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
      const initiallyIgnoredLabel=document.querySelector('.tree-file[data-path="bundle.zip"]');
      if(getComputedStyle(initiallyIgnoredLabel.querySelector('code')).color!=='rgb(119, 129, 142)'||getComputedStyle(initiallyIgnoredLabel).opacity!=='0.58') throw new Error('arquivo ignorado somente pelo filtro deve ficar cinza');
      const statusBeforePreset=document.querySelector('#status').textContent;
      structureToggle.click();structureToggle.click();await wait(()=>structureToggle.indeterminate);
      document.querySelector('#request').value='README.md\\nbundle.zip';document.querySelector('#request').dispatchEvent(new Event('input'));document.querySelector('#load').click();
      await wait(()=>!document.querySelector('#toast').hidden&&document.querySelector('#toast').dataset.kind==='warning');
      if(!document.querySelector('#toast-message').textContent.includes('1 item ignorado')||!document.querySelector('#toast-message').textContent.includes('bundle.zip')) throw new Error('toast amarelo não detalha o arquivo ignorado');
      const requestedIgnoredLabel=document.querySelector('.tree-file[data-path="bundle.zip"]');
      if(requestedIgnoredLabel.dataset.status!=='requested-ignored'||getComputedStyle(requestedIgnoredLabel.querySelector('code')).color!=='rgb(229, 185, 112)'||getComputedStyle(requestedIgnoredLabel).opacity!=='1') throw new Error('arquivo ignorado pedido pelo preset deve ficar amarelo');
      await wait(()=>document.querySelector('#preview').value.includes('[-] bundle.zip'));
      document.querySelector('#request').value='README.md\\nbundle.zip\\nausente.md';document.querySelector('#request').dispatchEvent(new Event('input'));document.querySelector('#load').click();
      await wait(()=>!document.querySelector('#toast').hidden&&document.querySelector('#toast').dataset.kind==='error'&&document.querySelector('#toast-message').textContent.includes('1 de 3 itens'));
      if(!document.querySelector('#toast-message').textContent.includes('1 item ignorado')||!document.querySelector('#toast-message').textContent.includes('1 item não encontrado')||!document.querySelector('#toast-message').textContent.includes('bundle.zip')||!document.querySelector('#toast-message').textContent.includes('ausente.md')) throw new Error('toast vermelho não diferencia ignorado e ausente');
      await wait(()=>document.querySelector('#preview').value.includes('[-] bundle.zip')&&document.querySelector('#preview').value.includes('[!] ausente.md'));
      const ignoredOccurrences=(document.querySelector('#preview').value.match(/path: "bundle[.]zip"/g)||[]).length;
      if(ignoredOccurrences!==1||!document.querySelector('#preview').value.includes('path: "bundle.zip"\\n  status: "ignored"')) throw new Error('arquivo pedido e ignorado não foi representado corretamente');
      if(document.querySelector('#status').textContent!==statusBeforePreset) throw new Error('aplicação de preset não deve gerar notificação na barra superior');
      document.querySelector('#toast-close').click();
      structureToggle.click();await wait(()=>structureToggle.checked&&!structureToggle.indeterminate);
      document.querySelector('#example').click(); document.querySelector('#load').click();
      await wait(()=>ContextPackerBrowser.selected().length===6 && document.querySelector('#preview').value.includes('included: 6'));
      await wait(()=>!document.querySelector('#toast').hidden&&document.querySelector('#toast-message').textContent==='Preset aplicado: todos os 6 itens foram marcados.');
      if(!['docs','src','tests'].every(path=>document.querySelector('#tree details[data-path="'+path+'"]')?.open)) throw new Error('pastas dos arquivos selecionados devem expandir ao aplicar preset');
      if(['assets','logs'].some(path=>document.querySelector('#tree details[data-path="'+path+'"]')?.open)) throw new Error('pastas sem arquivos selecionados devem permanecer colapsadas');
      const includedLabel=document.querySelector('.tree-file[data-path="README.md"]'),ignoredLabel=document.querySelector('.tree-file[data-path="bundle.zip"]'),errorLabel=document.querySelector('.tree-file[data-path="notes.txt"]');
      const includedColor=getComputedStyle(includedLabel.querySelector('code')).color,ignoredColor=getComputedStyle(ignoredLabel.querySelector('code')).color;errorLabel.dataset.status='error';const errorColor=getComputedStyle(errorLabel.querySelector('code')).color;errorLabel.dataset.status='excluded';
      if(includedColor!=='rgb(145, 212, 169)'||ignoredColor!=='rgb(119, 129, 142)'||errorColor!=='rgb(255, 161, 161)'||getComputedStyle(ignoredLabel).opacity!=='0.58') throw new Error('cores de incluído, ignorado comum e erro não estão distintas');
      document.querySelector('#toast-close').click();
      if(!document.querySelector('#toast').hidden) throw new Error('toast deve fechar pelo botão X');
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
      await wait(()=>document.querySelector('#toast-message').textContent==='Preset example-bundle.json aplicado: todos os 5 itens foram marcados.');
      await wait(()=>document.querySelector('#toast').hidden,6500);
      copied=''; document.querySelector('#copy').click(); await wait(()=>copied.includes('WBCTX:')&&copied.includes(':COMPLETE'));
      if(copied!==document.querySelector('#preview').value) throw new Error('Copiar não enviou a prévia completa');
      document.querySelector('#generate').click(); await wait(()=>saved.includes('WBCTX:') && saved.includes(':COMPLETE'));
      if(suggestedName!==document.querySelector('#export-name-preview').textContent||!suggestedName.startsWith('implementacao-')) throw new Error('Salvar TXT não usou o prefixo selecionado');
      const folderResult={discovered:document.querySelectorAll('.tree-file').length,selected:ContextPackerBrowser.selected().length,ignored:document.querySelectorAll('.tree-file[data-status="ignored"]').length,presetFiles:presetJson.files.length,savedBytes:new TextEncoder().encode(saved).byteLength,hasSpec:saved.includes('docs/requirements.md'),hasStructure:saved.includes('STRUCTURE')&&saved.includes('[-] logo.png')};
      document.querySelector('#remove-export-prefix').click();await wait(()=>document.querySelector('#export-prefix').value==='');
      await ContextPackerBrowser.loadDirectory(root);
      if(document.querySelector('#export-prefix').value!==''||[...document.querySelector('#export-prefix').options].some(option=>option.value==='implementacao')) throw new Error('prefixo removido não foi persistido');
      if(document.querySelector('#export-name-preview').textContent.startsWith('implementacao-')) throw new Error('opção sem prefixo não atualizou o nome do export');

      document.querySelector('#status').textContent='aguardando pasta arrastada';const directoryDrop=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(directoryDrop,'dataTransfer',{value:{items:[{kind:'file',getAsFileSystemHandle:async()=>root}]}});document.querySelector('#source-drop').dispatchEvent(directoryDrop);
      await wait(()=>document.querySelector('#status').textContent.includes('Configuração .cpacker carregada'));

      const zipBytes=Uint8Array.from(atob('${zipBase64}'),character=>character.charCodeAt(0)),zipFile=new File([zipBytes],'snapshot-origin.zip',{type:'application/zip'}),transfer=new DataTransfer();transfer.items.add(zipFile);
      document.querySelector('#source-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
      await wait(()=>document.querySelectorAll('.tree-file').length===2&&document.querySelector('#folder').textContent.includes('snapshot-origin.zip'));
      if(document.querySelector('[data-path^=".cpacker"]')) throw new Error('.cpacker do ZIP não deve aparecer');
      if(!document.querySelector('#save-filters').disabled||!document.querySelector('#save-preset').disabled) throw new Error('ZIP deve permanecer somente leitura');
      const baseFolder=document.querySelector('#base-folder');
      if(baseFolder.disabled||![...baseFolder.options].some(option=>option.value==='snapshot')) throw new Error('subdiretório do ZIP não foi oferecido como pasta base');
      baseFolder.value='snapshot';baseFolder.dispatchEvent(new Event('change'));
      await wait(()=>document.querySelector('.tree-file[data-path="docs/readme.md"]')&&!document.querySelector('.tree-file[data-path^="snapshot/"]'));
      document.querySelector('#request').value='docs/readme.md';document.querySelector('#request').dispatchEvent(new Event('input'));document.querySelector('#load').click();
      await wait(()=>ContextPackerBrowser.selected().length===1&&document.querySelector('#preview').value.includes('# From ZIP'));
      await wait(()=>document.querySelector('#preview').value.includes('# From ZIP'));
      const zipPreview=document.querySelector('#preview').value;
      if(!zipPreview.includes('sourceType: "zip"')||!zipPreview.includes('sourceName: "snapshot-origin.zip"')) throw new Error('TXT não identifica o ZIP de origem');
      if(!zipPreview.includes('basePath: "snapshot"')||!zipPreview.includes('rootName: "snapshot"')||!zipPreview.includes('path: "docs/readme.md"')) throw new Error('TXT não foi relativizado à pasta base');
      document.querySelector('.tree-file[data-path="docs/readme.md"] input').click();await wait(()=>ContextPackerBrowser.selected().length===0);
      if(ContextPackerBrowser.cachedContentBytes()!==0) throw new Error('conteúdo desmarcado permaneceu no cache');
      document.querySelector('.tree-file[data-path="docs/readme.md"] input').click();await wait(()=>document.querySelector('#preview').value.includes('# From ZIP'));
      let releaseOldZip,oldZipStarted=false;const oldZipGate=new Promise(resolve=>{releaseOldZip=resolve}),oldZipFile={name:'old.zip',size:zipBytes.byteLength,arrayBuffer:async()=>{oldZipStarted=true;await oldZipGate;return zipBytes.buffer.slice(zipBytes.byteOffset,zipBytes.byteOffset+zipBytes.byteLength);}};Object.defineProperty(document.querySelector('#zip-input'),'files',{configurable:true,value:[oldZipFile]});document.querySelector('#zip-input').dispatchEvent(new Event('change'));
      await wait(()=>oldZipStarted);await ContextPackerBrowser.loadZipFile(zipFile);releaseOldZip();await new Promise(resolve=>setTimeout(resolve,50));
      if(!document.querySelector('#status').textContent.includes('snapshot-origin.zip')||document.querySelector('#status').textContent.includes('substituída')) throw new Error('ZIP antigo sobrescreveu o status da origem nova');
      let releaseDirectory,enteredDirectory=false;const directoryGate=new Promise(resolve=>{releaseDirectory=resolve}),delayedRoot={name:'delayed-folder',getDirectoryHandle:root.getDirectoryHandle.bind(root),queryPermission:root.queryPermission?.bind(root),requestPermission:root.requestPermission?.bind(root),async *entries(){enteredDirectory=true;await directoryGate;for await(const entry of root.entries())yield entry;}};
      const staleLoad=ContextPackerBrowser.loadDirectory(delayedRoot);await wait(()=>enteredDirectory);await ContextPackerBrowser.loadZipFile(zipFile);releaseDirectory();await staleLoad.catch(()=>{});await new Promise(resolve=>setTimeout(resolve,50));
      if(document.querySelectorAll('.tree-file').length!==2||document.querySelector('.tree-file[data-path="notes.txt"]')||!document.querySelector('#status').textContent.includes('snapshot-origin.zip')) throw new Error('carregamento antigo misturou arquivos ou estado com o ZIP mais novo');
      let releaseRead,readStarted=false;const readGate=new Promise(resolve=>{releaseRead=resolve}),slowHandle={kind:'file',getFile:async()=>({size:4,arrayBuffer:async()=>{readStarted=true;await readGate;return new TextEncoder().encode('slow').buffer;}})},slowRoot={name:'slow-folder',getDirectoryHandle:root.getDirectoryHandle.bind(root),queryPermission:root.queryPermission?.bind(root),requestPermission:root.requestPermission?.bind(root),async *entries(){yield ['slow.txt',slowHandle];}};await ContextPackerBrowser.loadDirectory(slowRoot);document.querySelector('.tree-file[data-path="slow.txt"] input').click();await wait(()=>readStarted);document.querySelector('.tree-file[data-path="slow.txt"] input').click();releaseRead();await new Promise(resolve=>setTimeout(resolve,50));
      if(ContextPackerBrowser.cachedContentBytes()!==0||ContextPackerBrowser.selected().length!==0) throw new Error('leitura concluída após desmarcar repopulou o cache');
      await ContextPackerBrowser.loadZipFile(zipFile);
      return {...folderResult,zipSource:zipPreview.includes('sourceName: "snapshot-origin.zip"'),zipBase:zipPreview.includes('basePath: "snapshot"')&&zipPreview.includes('path: "docs/readme.md"'),zipContent:zipPreview.includes('# From ZIP'),status:document.querySelector('#status').textContent};
    })()`);
    assert.equal(result.discovered, 10);
    assert.equal(result.selected, 5);
    assert.equal(result.ignored, 3);
    assert.equal(result.presetFiles, 5);
    assert.equal(result.hasSpec, true);
    assert.equal(result.hasStructure, true);
    assert.equal(result.zipSource, true);
    assert.equal(result.zipBase, true);
    assert.equal(result.zipContent, true);
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
