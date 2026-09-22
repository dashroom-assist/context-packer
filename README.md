# Context Packer

Ferramenta HTML local para selecionar arquivos de uma pasta ou ZIP e gerar um único pacote TXT com estrutura, inventário, conteúdo e identificação da origem. Listas de caminhos podem ser reutilizadas como presets opcionais.

## Uso

1. Abra `index.html` por duplo clique no Edge ou Chrome.
2. No passo 1, selecione uma pasta, selecione um ZIP ou arraste uma dessas origens para o painel. Para uma pasta, o ícone de atualização ao lado do nome relê os arquivos após mudanças externas, preservando a pasta base e os itens selecionados que ainda existirem. Depois, escolha a **pasta base**: a árvore, os presets e os caminhos do TXT passam a começar nela. Isso permite, por exemplo, abrir um ZIP que contém `snapshot/projeto/` e aplicar um preset escrito como `README.md` ou `src/app.js` escolhendo `snapshot/projeto` como base.
3. As configurações são carregadas automaticamente do banco nativo do Edge/Chrome e valem para todas as pastas e ZIPs. A barra **Configuração global**, fora dos passos, oferece **Exportar** e **Carregar** para transportar filtros, presets e prefixos juntos. Nenhum arquivo de configuração é criado na origem.
4. No passo 2, edite as extensões ou regras e clique em **Aplicar alterações**. Enquanto houver diferenças ainda não aplicadas, a ferramenta mostra `Alterações não aplicadas`, destaca o botão e bloqueia a exportação da configuração antiga. **Restaurar filtros** redefine somente essa seção.
5. No passo 3, marque arquivos ou pastas diretamente na árvore. A renderização usa verde para incluídos, amarelo somente para arquivos ignorados pedidos pelo preset aplicado, cinza para os demais arquivos ignorados pelos filtros e vermelho para erros; essas cores não alteram o TXT exportado.
6. Opcionalmente, abra **Presets** no passo 3 para colar uma lista de caminhos ou carregar um preset salvo. Ao aplicar, a árvore expande somente as pastas necessárias para revelar os arquivos pedidos. Um arquivo existente, mas bloqueado pelos filtros, continua registrado uma única vez como ignorado — inclusive na estrutura parcial. O resultado aparece apenas em um toast fechável: verde quando todos foram marcados, amarelo quando há somente itens ignorados e vermelho quando algum caminho está ausente ou não pôde ser lido.
7. Para reutilizar a seleção atual, ainda em **Presets**, informe um nome e clique em **Salvar**. O preset fica no banco do navegador e também funciona para qualquer pasta ou ZIP, sem modificar a origem. **Remover todos os presets** limpa somente os presets salvos.
8. No passo 4, confira a **Prévia do arquivo** e o nome que será baixado. Abra **Nome e prefixo** para escolher, adicionar ou remover prefixos; **Restaurar prefixos** redefine somente a lista e o prefixo ativo. O nome segue o formato `<prefixo>-<pasta-base>-AAAA-MM-DD-HHmm.txt`; a opção **Sem prefixo** mantém apenas pasta, data e hora.
9. O checkbox de estrutura tem três estados: desmarcado não inclui árvore; `−` inclui somente os arquivos selecionados; `✓` inclui a estrutura completa descoberta. Use **Copiar** para enviar a prévia à área de transferência ou **Baixar** para escolher o destino usando exatamente o nome exibido.
10. Revise o arquivo antes de compartilhá-lo ou processá-lo em outra ferramenta.

O cabeçalho do TXT registra `sourceType`, `sourceName` e `basePath`. Para um ZIP, `sourceName` preserva o nome original do arquivo selecionado; `basePath` registra o subdiretório escolhido, ou `.` quando a origem inteira é a base. Os caminhos do inventário e do conteúdo são relativos à pasta base.

Linhas como `docs/requirements.md 1.0` são resolvidas primeiro literalmente e, se esse arquivo não existir, como `docs/requirements.md`, preservando `1.0` como anotação no inventário.

## Configurações no navegador e arquivo de exportação

O aplicativo mantém uma única configuração global no IndexedDB do navegador. Ela inclui extensões ignoradas, regras, prefixos, prefixo ativo e presets. Trocar de pasta ou ZIP não troca nem sobrescreve essas opções.

Na primeira configuração, se ainda não houver personalização global e a pasta aberta contiver uma configuração antiga em `.cpacker/`, os filtros, prefixos e presets são migrados uma única vez para o IndexedDB. A origem é lida sem ser modificada. Se o IndexedDB estiver indisponível, a ferramenta continua funcionando com configurações temporárias válidas somente durante a sessão.

Use **Exportar** para salvar uma cópia portátil e **Carregar** para substituir a configuração local pelo conteúdo do arquivo. As restaurações são independentes: filtros, presets e prefixos podem ser redefinidos em suas próprias seções, sempre após confirmação. O arquivo JSON reúne tudo que antes era distribuído entre `config.json`, `.cpignore` e os arquivos de presets:

```json
{
  "formatVersion": "1.0",
  "exporter": "Workbench Context Packer 1.3",
  "settings": {
    "ignoredExtensions": [".png", ".jpg", ".zip"],
    "ignoreRules": "*.log\nbuild/\n",
    "exportPrefixes": ["contexto", "implementacao", "revisao"],
    "exportPrefix": "implementacao"
  },
  "presets": {
    "revisao.json": {
      "name": "Revisão",
      "files": [
        { "path": "README.md", "annotation": "" }
      ]
    }
  }
}
```

`exportPrefixes` guarda até 30 opções normalizadas para o nome do arquivo. `exportPrefix` registra a última opção escolhida; use uma string vazia para salvar sem prefixo.

`ignoreRules` recebe uma regra por linha e aceita `*`, `**`, `?`, comentários com `#` e negação com `!`. A proteção de `.cpacker/` é interna e não precisa constar nas regras.

Pastas `.cpacker/` continuam protegidas e não aparecem no passo 3, na árvore ou no inventário da prévia TXT. Após uma eventual migração inicial somente leitura, elas não são mais consultadas nem alteradas.

## Limites

- execução offline e sem dependências;
- IndexedDB e File System Access API, normalmente disponíveis em Edge/Chrome;
- os arquivos de origem são somente leitura; a ferramenta grava configurações e presets apenas no banco do navegador, além dos arquivos JSON e TXT exportados explicitamente pelo usuário;
- até 2.000 itens descobertos, 2 MB por arquivo e 20 MB de conteúdo selecionado;
- ZIPs de até 100 MB, nos métodos Store ou Deflate; ZIP64, arquivos criptografados e arquivos divididos em volumes não são compatíveis;
- arquivos de configuração JSON de até 5 MB, com no máximo 100 presets, 50.000 referências de arquivos somadas e 256 KB de regras;
- arquivos textuais UTF-8;
- proteção interna de `.cpacker`, `.env`, `.git`, `node_modules` e `.patcher-backups`; as demais exclusões vêm das regras salvas no navegador;
- itens selecionados, desmarcados, ignorados e falhas ficam registrados no inventário e na árvore ASCII do TXT;
- o pacote de contexto não é backup.

## Manutenção

Na máquina de desenvolvimento:

```text
node tests/context-packer.test.cjs
node tests/context-packer-browser.cjs 9331 file:///caminho/para/context-packer/index.html
```

O segundo teste exige Chromium iniciado com CDP. Node e Chromium são apenas ferramentas de manutenção; não são necessários para usar o Context Packer.

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
