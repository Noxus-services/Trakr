const { createCanvas } = require('canvas');
const fs = require('fs');

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Fond bleu arrondi
  const r = size * 0.2;
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();
  
  // Bug/insecte simplifié : cercle blanc centré
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size*0.28, 0, Math.PI*2);
  ctx.fill();
  
  // Croix bleue (+ = ajouter)
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(size*0.44, size*0.28, size*0.12, size*0.44);
  ctx.fillRect(size*0.28, size*0.44, size*0.44, size*0.12);
  
  return canvas.toBuffer('image/png');
}

[16,32,48,128].forEach(size => {
  fs.writeFileSync(`icons/icon${size}.png`, createIcon(size));
  console.log(`Created icon${size}.png`);
});
