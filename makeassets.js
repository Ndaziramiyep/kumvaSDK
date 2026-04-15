const Jimp = require('./node_modules/jimp-compact');
const path = require('path');

async function main() {
  const img = await new Promise((res, rej) =>
    new Jimp(1, 1, 0xFFFFFFFF, (err, i) => err ? rej(err) : res(i))
  );
  for (const name of ['icon', 'adaptive-icon', 'splash', 'favicon']) {
    await img.writeAsync(path.join(__dirname, 'assets', name + '.png'));
    console.log('wrote', name + '.png');
  }
}
main().catch(console.error);
