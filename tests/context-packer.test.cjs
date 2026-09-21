const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const htmlPath = require('node:path').join(__dirname, '../index.html');
assert.ok(fs.existsSync(htmlPath), 'Context Packer ainda não foi implementado.');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="context-packer-core">([\s\S]*?)<\/script>/);
assert.ok(match, 'Núcleo testável não encontrado.');

const context = { globalThis: {}, TextEncoder, TextDecoder };
vm.runInNewContext(match[1], context);
const core = context.globalThis.ContextPackerCore;
assert.ok(core, 'API ContextPackerCore ausente.');

function buildStoredZip(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name), data = Buffer.from(content);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes); offset += local.length + nameBytes.length + data.length;
  }
  const centralDirectory = Buffer.concat(centrals), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(centralDirectory.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

const zipIndex = core.parseZipArchive(buildStoredZip([['docs/', ''], ['docs/readme.md', '# ZIP\n'], ['src/app.js', 'zip();\n']]));
assert.deepEqual(JSON.parse(JSON.stringify(zipIndex.map(({path,kind,size,method})=>({path,kind,size,method})))), [
  {path:'docs', kind:'directory', size:0, method:0},
  {path:'docs/readme.md', kind:'file', size:6, method:0},
  {path:'src/app.js', kind:'file', size:7, method:0}
]);
assert.throws(()=>core.parseZipArchive(buildStoredZip([['../outside.txt', 'no']])), /caminho.*ZIP/i);

const parsed = core.parseRequest(`Arquivos:\n\nREADME.md\nsrc/app.js 1.1\ndocs/requirements.md 1.0\n`);
assert.deepEqual(JSON.parse(JSON.stringify(parsed)), [
  { requested: 'README.md', candidates: ['README.md'], annotation: '' },
  { requested: 'src/app.js 1.1', candidates: ['src/app.js 1.1', 'src/app.js'], annotation: '1.1' },
  { requested: 'docs/requirements.md 1.0', candidates: ['docs/requirements.md 1.0', 'docs/requirements.md'], annotation: '1.0' }
]);

const bulleted = core.parseRequest('- docs/architecture.md 1.0');
assert.equal(bulleted[0].candidates[1], 'docs/architecture.md');

assert.throws(() => core.parseRequest('../segredo.txt'), /inválido/i);
assert.throws(() => core.parseRequest('/absoluto.txt'), /inválido/i);
assert.throws(() => core.parseRequest('.env'), /protegido/i);

const ignore = core.createIgnoreMatcher('.png, zip, .map', `
# comentários são ignorados
temp/
*.log
secrets/*.txt
`);
assert.equal(ignore('assets/logo.png'), 'extensão .png');
assert.equal(ignore('build/archive.zip'), 'extensão .zip');
assert.equal(ignore('temp/cache/data.md'), 'regra temp/');
assert.equal(ignore('logs/app.log'), 'regra *.log');
assert.equal(ignore('secrets/token.txt'), 'regra secrets/*.txt');
assert.equal(ignore('docs/readme.md'), '');

assert.deepEqual(JSON.parse(JSON.stringify(core.parseExtensionConfig('{"ignoredExtensions":["png",".JPG","png"]}'))), ['.png', '.jpg']);
assert.throws(() => core.parseExtensionConfig('{"ignoredExtensions":".png"}'), /ignoredExtensions/i);
assert.deepEqual(JSON.parse(JSON.stringify(core.normalizeExtensionList('.PNG, jpg; .png'))), ['.png', '.jpg']);

const ascii = core.buildAsciiTree('projeto', [
  { path: 'README.md', status: 'excluded' },
  { path: 'docs/a.md', status: 'included' },
  { path: 'docs/image.png', status: 'ignored' },
  { path: 'src/app.js', status: 'error' }
]);
assert.equal(ascii, `projeto/\n├── docs/\n│   ├── [x] a.md\n│   └── [-] image.png\n├── src/\n│   └── [!] app.js\n└── [ ] README.md`);

const selectionSummary = core.summarizeSelection([
  { content: '12345678' },
  { content: 'Olá' }
]);
assert.deepEqual(JSON.parse(JSON.stringify(selectionSummary)), { files: 2, bytes: 12, kilobytes: 0.01, estimatedTokens: 3 });

assert.equal(core.normalizePresetName(' Example bundle 0.7 '), 'example-bundle-0.7.json');
assert.throws(() => core.normalizePresetName('../segredo'), /nome/i);
const presetText = core.buildPresetDocument('Example bundle', [
  { path: 'docs/a.md', annotation: '0.1.0' },
  { path: 'src/b.js', annotation: '' }
]);
assert.deepEqual(JSON.parse(JSON.stringify(core.parsePresetDocument(presetText))), {
  name: 'Example bundle',
  files: [
    { path: 'docs/a.md', annotation: '0.1.0' },
    { path: 'src/b.js', annotation: '' }
  ]
});
assert.throws(() => core.parsePresetDocument('{"name":"x","files":["../segredo"]}'), /inválido/i);

const files = [
  { path: 'docs/a.md', annotation: '0.1.0', size: 5, content: 'Olá\n' },
  { path: 'src/b.js', annotation: '', size: 18, content: 'const x = "BEGIN";' }
];
const packageInput = {
  rootName: 'projeto',
  sourceType: 'zip',
  sourceName: 'projeto-snapshot.zip',
  files,
  skipped: [{ path: 'docs/opcional.md', reason: 'desmarcado pelo usuário' }],
  errors: [{ path: 'docs/ausente.md', reason: 'não encontrado' }],
  inventory: [
    { path: 'docs/', isDirectory: true, status: 'excluded' },
    { path: 'docs/a.md', status: 'included', annotation: '0.1.0', size: 5 },
    { path: 'src/b.js', status: 'included', size: 18 },
    { path: 'docs/opcional.md', status: 'excluded', reason: 'desmarcado pelo usuário' },
    { path: 'assets/logo.png', status: 'ignored', reason: 'extensão .png' },
    { path: 'docs/ausente.md', status: 'error', reason: 'não encontrado' }
  ],
  generatedAt: '2026-09-20T12:00:00.000Z'
};
const pack = core.buildPackage(packageInput);
assert.match(pack, /formatVersion: "0.2.0"/);
assert.match(pack, /exporter: "Workbench Context Packer 1.0"/);
assert.match(pack, /sourceType: "zip"/);
assert.match(pack, /sourceName: "projeto-snapshot\.zip"/);
assert.match(pack, /included: 2/);
assert.match(pack, /skipped: 2/);
assert.match(pack, /errors: 1/);
assert.match(pack, /path: "docs\/ausente.md"[\s\S]*status: "error"/);
assert.match(pack, /hasGaps=true/);
assert.match(pack, /STRUCTURE\nprojeto\/\n/);
assert.match(pack, /\[-\] logo\.png/);
assert.ok(pack.indexOf('STRUCTURE') < pack.indexOf('INVENTORY'));
assert.match(pack, /path: "docs\/a.md"/);
assert.match(pack, /annotation: "0.1.0"/);
assert.ok(pack.includes('Olá\n'));
assert.ok(pack.includes('const x = "BEGIN";'));
assert.match(pack, /WBCTX:[A-Z0-9]+:COMPLETE/);
assert.equal(new TextEncoder().encode(pack).byteLength > files.reduce((n, file) => n + file.size, 0), true);

const packWithoutStructure = core.buildPackage({...packageInput, structureMode:'none'});
assert.doesNotMatch(packWithoutStructure, /\nSTRUCTURE\n/);
assert.doesNotMatch(packWithoutStructure, /\nLEGEND\n/);
assert.match(packWithoutStructure, /\nINVENTORY\n/);

const packWithSelectedStructure = core.buildPackage({...packageInput, structureMode:'selected'});
const selectedStructure = packWithSelectedStructure.split('\nSTRUCTURE\n')[1].split('\n\nLEGEND\n')[0];
assert.match(selectedStructure, /\[x\] a\.md/);
assert.match(selectedStructure, /\[x\] b\.js/);
assert.doesNotMatch(selectedStructure, /logo\.png|opcional\.md|ausente\.md/);

console.log('context-packer core: ok');
