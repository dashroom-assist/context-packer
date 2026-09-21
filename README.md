# Context Packer

Ferramenta HTML local para selecionar arquivos de uma pasta ou ZIP e gerar um único pacote TXT com estrutura, inventário, conteúdo e identificação da origem. Listas de caminhos podem ser reutilizadas como presets opcionais.

## Uso

1. Abra `index.html` por duplo clique no Edge ou Chrome.
2. No passo 1, selecione uma pasta, selecione um ZIP ou arraste uma dessas origens para o painel. Depois, escolha a **pasta base**: a árvore, os presets e os caminhos do TXT passam a começar nela. Isso permite, por exemplo, abrir um ZIP que contém `snapshot/projeto/` e aplicar um preset escrito como `README.md` ou `src/app.js` escolhendo `snapshot/projeto` como base.
3. Na primeira abertura de uma pasta, a ferramenta cria `.cpacker/config.json` e `.cpacker/.cpignore` com os valores padrão na origem selecionada. Para ZIPs, o passo 2 usa filtros temporários e mantém o arquivo de origem somente leitura.
4. Ainda no passo 2, escolha um prefixo para o TXT ou adicione um novo. A prévia mostra o nome no formato `<prefixo>-<pasta-base>-AAAA-MM-DD-HHmm.txt`. A opção **Sem prefixo** mantém apenas pasta, data e hora. Em pastas, a lista e a última escolha são salvas automaticamente; em ZIPs, valem somente durante a sessão.
5. No passo 3, marque arquivos ou pastas diretamente na árvore. A renderização usa verde para incluídos, amarelo somente para arquivos ignorados pedidos pelo preset aplicado, cinza para os demais arquivos ignorados pelos filtros e vermelho para erros; essas cores não alteram o TXT exportado.
6. Opcionalmente, abra **Presets** no passo 3 para colar uma lista de caminhos ou carregar um JSON salvo. Ao aplicar, a árvore expande somente as pastas necessárias para revelar os arquivos pedidos. Um arquivo existente, mas bloqueado pelos filtros, continua registrado uma única vez como ignorado — inclusive na estrutura parcial. O resultado aparece apenas em um toast fechável: verde quando todos foram marcados, amarelo quando há somente itens ignorados e vermelho quando algum caminho não foi encontrado ou apresentou erro. O toast desaparece automaticamente após 5 segundos em caso de sucesso ou 8 segundos nos demais casos.
7. Para reutilizar a seleção atual de uma pasta, ainda em **Presets**, informe um nome e clique em **Salvar**. O arquivo será criado em `.cpacker/presets/<nome>.json`. Em ZIPs, presets salvos ficam desabilitados porque a origem é somente leitura.
8. Confira a prévia TXT, atualizada conforme a seleção muda. O checkbox de estrutura tem três estados: desmarcado não inclui árvore; `−` inclui somente os arquivos selecionados; `✓` inclui a estrutura completa descoberta.
9. Use **Copiar** para enviar a prévia à área de transferência ou **Salvar TXT** para escolher o destino. A janela de salvamento já abre com o nome sugerido pelo prefixo selecionado.
10. Revise o TXT antes de compartilhá-lo ou processá-lo em outra ferramenta.

O cabeçalho do TXT registra `sourceType`, `sourceName` e `basePath`. Para um ZIP, `sourceName` preserva o nome original do arquivo selecionado; `basePath` registra o subdiretório escolhido, ou `.` quando a origem inteira é a base. Os caminhos do inventário e do conteúdo são relativos à pasta base.

Linhas como `docs/requirements.md 1.0` são resolvidas primeiro literalmente e, se esse arquivo não existir, como `docs/requirements.md`, preservando `1.0` como anotação no inventário.

## Configuração dos filtros

Na raiz escolhida, a configuração fica em `.cpacker/`. O arquivo `.cpacker/config.json` usa este formato:

```json
{
  "ignoredExtensions": [".png", ".jpg", ".zip"],
  "exportPrefixes": ["contexto", "implementacao", "revisao"],
  "exportPrefix": "implementacao"
}
```

`exportPrefixes` guarda até 30 opções normalizadas para o nome do arquivo. `exportPrefix` registra a última opção escolhida; use uma string vazia para salvar sem prefixo.

O arquivo `.cpacker/.cpignore` recebe uma regra por linha e aceita `*`, `**`, `?`, comentários com `#` e negação com `!`. A proteção de `.cpacker/` é interna e não precisa constar nesse arquivo.

Se a pasta ou um dos arquivos não existir, a ferramenta cria o item ausente com os valores padrão. A pasta `.cpacker/` é sempre protegida e não aparece no passo 3, na árvore ou no inventário da prévia TXT.

## Limites

- execução offline e sem dependências;
- File System Access API, normalmente disponível em Edge/Chrome;
- os arquivos de origem são somente leitura; a ferramenta só grava configuração e presets JSON em `.cpacker/`, além do TXT escolhido pelo usuário;
- até 2.000 itens descobertos, 2 MB por arquivo e 20 MB de conteúdo selecionado;
- ZIPs de até 100 MB, nos métodos Store ou Deflate; ZIP64, arquivos criptografados e arquivos divididos em volumes não são compatíveis;
- arquivos textuais UTF-8;
- proteção interna de `.cpacker`, `.env`, `.git`, `node_modules` e `.patcher-backups`; as demais exclusões vêm de `.cpacker/.cpignore`;
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
