const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dest = path.resolve(__dirname, 'public');

async function build() {
  fs.mkdirSync(dest, { recursive: true });

  const jsFiles = ['js/gpx-parser.js', 'js/scene.js', 'js/app.js'];
  let jsContent = '';
  for (const file of jsFiles) {
    jsContent += fs.readFileSync(path.join(root, file), 'utf-8') + '\n';
  }

  const result = await esbuild.transform(jsContent, { minify: true, loader: 'js' });
  fs.writeFileSync(path.join(dest, 'app.js'), result.code);

  fs.copyFileSync(path.join(root, 'css', 'style.css'), path.join(dest, 'style.css'));

  const gpxSrc = path.join(root, 'activity_22766008358.gpx');
  if (fs.existsSync(gpxSrc)) {
    fs.copyFileSync(gpxSrc, path.join(dest, 'activity_22766008358.gpx'));
  }

  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
  html = html.replace('href="css/style.css"', 'href="style.css"');
  html = html.replace('    <script src="js/gpx-parser.js"></script>\n', '');
  html = html.replace('    <script src="js/scene.js"></script>\n', '');
  html = html.replace('    <script src="js/app.js"></script>\n', '');
  html = html.replace('</body>', '    <script src="app.js"></script>\n</body>');
  fs.writeFileSync(path.join(dest, 'index.html'), html);

  console.log('Build complete: morning-wildflower-8141/public/');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
