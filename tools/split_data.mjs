import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(projectRoot, 'data');
const sourceFile = path.join(dataRoot, 'game.json');
const chaptersRoot = path.join(dataRoot, 'chapters');
const game = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));

if (!Array.isArray(game.chapters) || game.chapters.length === 0) {
  throw new Error('data/game.json 中没有可拆分的章节');
}



const speakers = [...new Set(game.chapters.flatMap((chapter) => chapter.scenes.flatMap((scene) =>
  scene.lines.map((line) => line.speaker).filter(Boolean))))].sort((a, b) => a.localeCompare(b));
const chapterSummary = (chapter) => ({
  id: chapter.id,
  label: chapter.label,
  badGroups: chapter.badGroups || [],
  sceneCount: chapter.scenes.length,
  lineCount: chapter.scenes.reduce((sum, scene) => sum + scene.lines.length, 0),
  voiceCount: chapter.scenes.reduce(
    (sum, scene) => sum + scene.lines.filter((line) => line.audio).length,
    0,
  ),
  scenes: chapter.scenes.map((scene) => ({
    id: scene.id,
    label: scene.label,
    kind: scene.kind,
    lineCount: scene.lines.length,
    voiceCount: scene.lines.filter((line) => line.audio).length,
  })),
});

fs.mkdirSync(chaptersRoot, { recursive: true });
for (const chapter of game.chapters) {
  fs.writeFileSync(
    path.join(chaptersRoot, `${chapter.id}.json`),
    `${JSON.stringify(chapter)}\n`,
    'utf8',
  );
}

fs.writeFileSync(
  path.join(dataRoot, 'manifest.json'),
  `${JSON.stringify({ version: 1, speakers, chapters: game.chapters.map(chapterSummary) }, null, 2)}\n`,
  'utf8',
);

const entries = [];
for (const chapter of game.chapters) {
  for (const scene of chapter.scenes) {
    for (const line of scene.lines) {
      entries.push({
        chapterId: chapter.id,
        sceneId: scene.id,
        lineId: line.id,
        speaker: line.speaker,
        text: line.text,
        markedText: line.markedText,
        kind: line.kind,
        audio: line.audio,
      });
    }
  }
}

fs.writeFileSync(
  path.join(dataRoot, 'search-index.json'),
  `${JSON.stringify({ version: 1, entries })}\n`,
  'utf8',
);

console.log(`Generated ${game.chapters.length} chapter files, manifest and search index.`);
