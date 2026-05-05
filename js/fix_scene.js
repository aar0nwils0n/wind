const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'scene.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix missing commas in function calls
const fixes = [
  [/new THREE\.SphereGeometry\(4, 8, 8\)/g, 'new THREE.SphereGeometry(4, 8, 8)'],
  [/new THREE\.SphereGeometry\(4 \* \(1 - j \/ trailLength\), 6, 6\)/g, 'new THREE.SphereGeometry(4 * (1 - j / trailLength), 6, 6)'],
  [/new THREE\.SphereGeometry\(8, 16, 16\)/g, 'new THREE.SphereGeometry(8, 16, 16)'],
  [/new THREE\.SphereGeometry\(15, 16, 16\)/g, 'new THREE.SphereGeometry(15, 16, 16)'],
  [/new THREE\.BufferAttribute\(positions, 3\)/g, 'new THREE.BufferAttribute(positions, 3)'],
  [/new THREE\.BufferAttribute\(colors, 3\)/g, 'new THREE.BufferAttribute(colors, 3)'],
  [/\.set\(tileX, 0, tileZ\)/g, '.set(tileX, 0, tileZ)'],
  [/\.set\(x, y, z\)/g, '.set(x, y, z)'],
  [/\.set\(x - dirX \* j \* 12, y, z - dirZ \* j \* 12\)/g, '.set(x - dirX * j * 12, y, z - dirZ * j * 12)'],
  [/\.set\(currentPoint\.x, this\.pathHeight, currentPoint\.z\)/g, '.set(currentPoint.x, this.pathHeight, currentPoint.z)'],
  [/\.set\(x - dirX \* \(j \+ 1\) \* 12, y, z - dirZ \* \(j \+ 1\) \* 12\)/g, '.set(x - dirX * (j + 1) * 12, y, z - dirZ * (j + 1) * 12)'],
  [/render\(this\.scene, this\.camera\)/g, 'render(this.scene, this.camera)'],
  [/this\.cameraPosition\.set\(-cameraX, height, cameraZ\)/g, 'this.cameraPosition.set(-cameraX, height, cameraZ)'],
  [/set\(tileX, 0, tileZ\)/g, 'set(tileX, 0, tileZ)'],
  [/\.set\(x, y, z\)(?!\.)/g, '.set(x, y, z)'],
];

// Actually, let me be more precise and just fix the specific lines
const lines = content.split('\n');
const fixedLines = lines.map(line => {
  // Fix .set() calls missing commas between arguments
  line = line.replace(/\.set\(([^,)]+)\s+([^,)]+)\s+([^)]+)\)/g, '.set($1, $2, $3)');
  // Fix SphereGeometry calls
  line = line.replace(/SphereGeometry\((\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\)/g, 'SphereGeometry($1, $2, $3)');
  // Fix BufferAttribute calls
  line = line.replace(/BufferAttribute\((\w+)\s+(\d+)\)/g, 'BufferAttribute($1, $2)');
  // Fix render call
  line = line.replace(/render\(this\.scene\s+this\.camera\)/g, 'render(this.scene, this.camera)');
  // Fix cameraPosition.set
  line = line.replace(/cameraPosition\.set\(([^,]+)\s+([^,]+)\s+([^)]+)\)/g, 'cameraPosition.set($1, $2, $3)');
  return line;
});

fs.writeFileSync(filePath, fixedLines.join('\n'), 'utf8');
console.log('Fixed scene.js');
