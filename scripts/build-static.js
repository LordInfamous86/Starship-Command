const fs = require('node:fs/promises');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'dist');
const appFiles = [
  'index.html',
  'styles.css',
  'sim.js',
  'engine.js',
  'audio.js',
  'crew-portraits.png',
  'mara-portrait.png'
];
const tourFiles = [
  'portfolio-tour.html',
  'screenshots/campaign-map.png',
  'screenshots/crisis-dialogue.png',
  'screenshots/mission-choice.png',
  'screenshots/mission-debrief.png'
];

async function copyFiles(sourceDirectory, destinationDirectory, files) {
  for (const file of files) {
    const source = path.join(sourceDirectory, file);
    const destination = path.join(destinationDirectory, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
}

async function build() {
  await fs.mkdir(outputDirectory, { recursive: true });
  await copyFiles(projectRoot, outputDirectory, appFiles);
  await copyFiles(path.join(projectRoot, 'docs'), path.join(outputDirectory, 'docs'), tourFiles);
  process.stdout.write(`Static demo ready at ${outputDirectory}\n`);
}

build().catch((error) => {
  process.stderr.write(`Static build failed: ${error.message}\n`);
  process.exitCode = 1;
});
