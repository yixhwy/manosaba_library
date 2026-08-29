import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const gameRoot = process.env.GAME_ROOT ? path.resolve(process.env.GAME_ROOT) : null;
const textRoot = process.env.TEXT_ROOT
  ? path.resolve(process.env.TEXT_ROOT)
  : gameRoot
    ? path.join(gameRoot, '游戏文本')
    : null;
const voiceRoot = process.env.VOICE_ROOT
  ? path.resolve(process.env.VOICE_ROOT)
  : gameRoot
    ? ['人物语音', '人物语音（已按人物分类过了']
      .map((name) => path.join(gameRoot, name))
      .find((candidate) => fs.existsSync(candidate)) || path.join(gameRoot, '人物语音')
    : null;
if (!textRoot || !voiceRoot) {
  throw new Error(
    '请设置 GAME_ROOT 环境变量，指向游戏解包目录；也可用 TEXT_ROOT、VOICE_ROOT 分别指定文本与语音目录。',
  );
}

function requireDirectory(directory, label) {
  let stat;
  try {
    stat = fs.statSync(directory);
  } catch {
    throw new Error(`${label}目录不存在：${directory}`);
  }
  if (!stat.isDirectory()) throw new Error(`${label}路径不是目录：${directory}`);
}

requireDirectory(textRoot, '文本');
requireDirectory(voiceRoot, '语音');

const dataOutFile = path.join(projectRoot, 'data', 'game.json');
const manifestOutFile = path.join(projectRoot, 'data', 'audio-manifest.txt');

function naturalCompare(a, b) {
  return new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'base',
  }).compare(a, b);
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function readUtf8(filePath) {
  const value = fs.readFileSync(filePath, 'utf8');
  return value.replace(/^\uFEFF/, '');
}

function normalizeText(raw) {
  const withBreaks = raw.replace(/<br\s*\/?>/gi, '\n').replace(/\u00a0/g, ' ');
  const links = [];
  const marked = withBreaks.replace(/<link="([^"]+)">([^<]+)<\/link>/g, (_, id, label) => {
    links.push({ id, text: label });
    return `[[link:${id}]]${label}[[/link]]`;
  });
  const withoutTags = marked.replace(/<[^>]+>/g, '');
  const cleanLines = withoutTags
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const markedText = cleanLines.join('\n');
  const text = markedText
    .replace(/\[\[link:[^\]]+\]\]/g, '')
    .replace(/\[\[\/link\]\]/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { text, markedText, links };
}

function parseScenario(filePath) {
  const source = readUtf8(filePath);
  const lines = source.split(/\r?\n/);
  const parsedLines = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    if (current.id === 'Common_Return') {
      current = null;
      return;
    }
    const { text, markedText, links } = normalizeText(current.rawText);
    if (text || links.length) {
      parsedLines.push({
        id: current.id,
        speaker: current.speaker,
        kind: current.kind,
        text,
        markedText,
        links,
        audio: null,
      });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const idMatch = trimmed.match(/^#\s*(.+)$/);

    if (idMatch) {
      flush();
      current = {
        id: idMatch[1].trim(),
        speaker: null,
        kind: 'dialogue',
        rawText: '',
      };
      continue;
    }

    if (!current) continue;

    if (!trimmed) {
      flush();
      continue;
    }

    const commandMatch = rawLine.match(/^;\s*>\s*(@\w+)/);
    if (commandMatch) {
      current.kind = commandMatch[1];
      continue;
    }

    const speakerMatch = rawLine.match(/^;\s*>\s*([^:|]+?)\s*:\s*\|#/);
    if (speakerMatch) {
      current.speaker = speakerMatch[1].trim();
      continue;
    }

    if (trimmed.startsWith(';')) continue;

    current.rawText += `${rawLine}\n`;
  }

  flush();
  return parsedLines;
}

function walkFiles(dir, onFile) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath, entry.name);
    }
  }
}

function buildAudioIndex() {
  const index = new Map();
  const duplicates = [];
  walkFiles(voiceRoot, (fullPath, name) => {
    if (!name.toLowerCase().endsWith('.ogg')) return;
    const key = path.parse(name).name.toLowerCase();
    if (index.has(key)) duplicates.push(key);
    else index.set(key, fullPath);
  });
  if (duplicates.length) {
    throw new Error(`发现重复音频 ID（${duplicates.length} 个）：${duplicates.slice(0, 5).join(', ')}`);
  }
  return index;
}

function sceneKind(sceneId) {
  if (sceneId.includes('_Trial')) return 'trial';
  if (sceneId.includes('_Bad')) return 'bad';
  return 'adv';
}

const CHAPTER_LABELS = {
  Act01_Chapter01: '一周目第一章',
  Act01_Chapter02: '一周目第二章',
  Act01_Chapter03: '一周目第三章',
  Act01_Chapter04: '一周目第四章',
  Act01_Chapter05: '一周目第五章',
  Act02_Chapter01: '二周目第一章',
  Act02_Chapter02: '二周目第二章',
  Act02_Chapter03: '二周目第三章',
  Act02_Chapter04: '二周目第四章',
  Act02_Chapter05: '三周目第一章',
  Act02_Chapter06: '三周目第二章',
};

function chapterLabel(chapterId) {
  return CHAPTER_LABELS[chapterId] || chapterId;
}

function sceneLabel(chapterId, sceneId) {
  return sceneId.startsWith(`${chapterId}_`)
    ? sceneId.slice(chapterId.length + 1)
    : sceneId;
}

function countBadChoices(filePath) {
  const source = readUtf8(filePath);
  let count = 0;
  for (const line of source.split(/\r?\n/)) {
    if (line.includes('button:ChoiceButtons/Adv/Bad')) count += 1;
  }
  return count;
}

const CHAPTER_LAYOUT = {
  Act01_Chapter01: { advFront: 34 },
  Act01_Chapter02: { advFront: 26 },
  Act01_Chapter03: { advFront: 26 },
  Act01_Chapter04: { advFront: 12 },
  Act01_Chapter05: { advFront: 5 },
  Act02_Chapter01: { advFront: 25 },
  Act02_Chapter02: { advFront: 18 },
  Act02_Chapter03: { advFront: 13 },
  Act02_Chapter04: { advFront: 13 },
  Act02_Chapter05: { advFront: 4, movedBack: true },
  Act02_Chapter06: {
    injectBeforeTrial: ['Adv05'],
    injectAfterTrial: ['Adv06', 'Adv07', 'Adv08', 'Adv09'],
  },
};

const SPEAKER_NAME_RE =
  /_(Alisa|AnAn|Coco|Ema|Hanna|Hiro|Jailer|Leia|Margo|Meruru|Miria|Nanoka|Noah|Sherry|Warden|Yuki)(\d+)?$/;

function inferSpeaker(line) {
  if (line.speaker || !line.audio) return;
  const match = line.id.match(SPEAKER_NAME_RE);
  if (match) line.speaker = match[1];
}

function sceneNumber(label, prefix) {
  const match = label.match(new RegExp(`^${prefix}(\\d+)$`));
  return match ? Number(match[1]) : null;
}

function main() {
  const audioIndex = buildAudioIndex();
  const audioPaths = new Set();
  let totalLines = 0;
  let voicedLines = 0;

  const chapterDirs = fs
    .readdirSync(textRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^Act\d{2}_Chapter\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort(naturalCompare);

  const rawChapters = {};
  for (const chapterId of chapterDirs) {
    const dir = path.join(textRoot, chapterId);
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.txt'));
    const scenes = [];
    const badCounts = [];

    for (const name of files.sort(naturalCompare)) {
      const sceneId = path.basename(name, path.extname(name));
      if (sceneId.includes('_TrialInit')) continue;

      const lines = parseScenario(path.join(dir, name));
      for (const line of lines) {
        totalLines += 1;
        const audioPath = audioIndex.get(line.id.toLowerCase());
        if (audioPath) {
          line.audio = toPosixPath(path.relative(voiceRoot, audioPath));
          audioPaths.add(line.audio);
          voicedLines += 1;
        }
        inferSpeaker(line);
      }

      if (sceneId.startsWith(`${chapterId}_Adv`)) {
        const count = countBadChoices(path.join(dir, name));
        if (count > 0) badCounts.push({ sceneId, count });
      }

      scenes.push({
        id: sceneId,
        label: sceneLabel(chapterId, sceneId),
        kind: sceneKind(sceneId),
        lines,
      });
    }

    const badSceneIds = scenes
      .filter((scene) => scene.kind === 'bad')
      .map((scene) => scene.id)
      .sort(naturalCompare);
    const badGroups = [];
    let badIndex = 0;
    for (const item of badCounts) {
      const bads = [];
      for (let i = 0; i < item.count && badIndex < badSceneIds.length; i += 1, badIndex += 1) {
        bads.push(sceneLabel(chapterId, badSceneIds[badIndex]));
      }
      badGroups.push({
        adv: sceneLabel(chapterId, item.sceneId),
        bads,
      });
    }

    const expectedBadCount = badCounts.reduce((sum, item) => sum + item.count, 0);
    if (expectedBadCount !== badSceneIds.length) {
      throw new Error(`${chapterId} 的 Bad 分支数量不匹配：选项引用 ${expectedBadCount}，Bad 场景 ${badSceneIds.length}`);
    }
    rawChapters[chapterId] = { scenes, badGroups };
  }

  let movedFromCh5 = [];
  const chapters = [];

  for (const chapterId of chapterDirs) {
    const raw = rawChapters[chapterId];
    const layout = CHAPTER_LAYOUT[chapterId] || {};
    const advs = raw.scenes
      .filter((scene) => scene.kind === 'adv')
      .sort((a, b) => naturalCompare(a.label, b.label));
    const trials = raw.scenes
      .filter((scene) => scene.kind === 'trial')
      .sort((a, b) => naturalCompare(a.label, b.label));
    const bads = raw.scenes
      .filter((scene) => scene.kind === 'bad')
      .sort((a, b) => naturalCompare(a.label, b.label));

    let ordered = [];
    if (chapterId === 'Act02_Chapter05') {
      const front = advs.filter(
        (scene) => (sceneNumber(scene.label, 'Adv') || 99) <= layout.advFront,
      );
      movedFromCh5 = advs.filter(
        (scene) => (sceneNumber(scene.label, 'Adv') || 99) > layout.advFront,
      );
      ordered = [...front, ...trials];
    } else if (chapterId === 'Act02_Chapter06') {
      const before = movedFromCh5
        .filter((scene) => layout.injectBeforeTrial.includes(scene.label))
        .sort((a, b) => naturalCompare(a.label, b.label));
      const after = movedFromCh5
        .filter((scene) => layout.injectAfterTrial.includes(scene.label))
        .sort((a, b) => naturalCompare(a.label, b.label));
      ordered = [...before, ...trials, ...after];
    } else {
      const front = advs.filter(
        (scene) => (sceneNumber(scene.label, 'Adv') || 99) <= layout.advFront,
      );
      const back = advs.filter(
        (scene) => (sceneNumber(scene.label, 'Adv') || 99) > layout.advFront,
      );
      ordered = [...front, ...trials, ...back];
    }

    chapters.push({
      id: chapterId,
      label: chapterLabel(chapterId),
      scenes: [...ordered, ...bads],
      badGroups: raw.badGroups,
    });
  }

  fs.mkdirSync(path.dirname(dataOutFile), { recursive: true });
  fs.writeFileSync(dataOutFile, `${JSON.stringify({ chapters }, null, 2)}\n`, 'utf8');

  const manifest = [...audioPaths].sort(naturalCompare);
  const missingAudio = manifest.filter((relativePath) => !fs.existsSync(path.join(voiceRoot, relativePath)));
  if (missingAudio.length) {
    throw new Error(`生成了不存在的音频路径（${missingAudio.length} 个）：${missingAudio.slice(0, 5).join(', ')}`);
  }
  fs.writeFileSync(manifestOutFile, `${manifest.join('\n')}\n`, 'utf8');

  const sceneCount = chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0);
  console.log('Generated', dataOutFile);
  console.log('Chapters:', chapters.length, '| Scenes:', sceneCount);
  console.log('Lines:', totalLines, '| voiced:', voicedLines);
  console.log('Audio manifest:', manifestOutFile, `(${manifest.length} files)`);
}

main();
