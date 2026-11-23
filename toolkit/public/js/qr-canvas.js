// Draws a QR matrix (rows of '0'/'1' strings from the server) onto a canvas.
export function drawQr(canvas, { size, rows }, { scale = 6, margin = 4 } = {}) {
  const px = (size + 2 * margin) * scale;
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = px + 'px';
  canvas.style.height = px + 'px';
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < size; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < size; x++) {
      if (row[x] === '1') ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
    }
  }
}
