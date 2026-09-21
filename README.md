# Context Packer

Ferramenta HTML local para selecionar arquivos de uma pasta ou ZIP e gerar um único pacote TXT com estrutura, inventário, conteúdo e identificação da origem. Listas de caminhos podem ser reutilizadas como presets opcionais.

## Uso

1. Abra `index.html` por duplo clique no Edge ou Chrome.
2. No passo 1, selecione uma pasta, selecione um ZIP ou arraste uma dessas origens para o painel.
3. Na primeira abertura de uma pasta, a ferramenta cria `.cpacker/config.json` e `.cpacker/.cpignore` com os valores padrão. Para ZIPs, o passo 2 usa filtros temporários e mantém o arquivo de origem somente leitura.
4. No passo 3, marque arquivos ou pastas diretamente na árvore.
5. Opcionalmente, abra **Presets** no passo 3 para colar uma lista de caminhos ou carregar um JSON salvo.
6. Para reutilizar a seleção atual de uma pasta, ainda em **Presets**, informe um nome e clique em **Salvar**. O arquivo será criado em `.cpacker/presets/<nome>.json`. Em ZIPs, presets salvos ficam desabilitados porque a origem é somente leitura.
7. Confira a prévia TXT, atualizada conforme a seleção muda. O checkbox de estrutura tem três estados: desmarcado não inclui árvore; `−` inclui somente os arquivos selecionados; `✓` inclui a estrutura completa descoberta.
8. Use **Copiar** para enviar a prévia à área de transferência ou **Salvar TXT** para escolher o destino.
9. Revise o TXT antes de compartilhá-lo ou processá-lo em outra ferramenta.

O cabeçalho do TXT registra `sourceType` e `sourceName`. Para um ZIP, `sourceName` preserva o nome original do arquivo selecionado.

Linhas como `docs/requirements.md 1.0` são resolvidas primeiro literalmente e, se esse arquivo não existir, como `docs/requirements.md`, preservando `1.0` como anotação no inventário.

## Configuração dos filtros

Na raiz escolhida, a configuração fica em `.cpacker/`. O arquivo `.cpacker/config.json` usa este formato:

```json
{
  "ignoredExtensions": [".png", ".jpg", ".zip"]
}
```

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
