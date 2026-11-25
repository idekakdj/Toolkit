// Input schemas and converters. Limits mirror the Toolkit server (toolkit/server/projects.js,
// paintings.js and validation.js) so a bad call fails here with a clear message instead of
// a generic "Document is invalid" from the server.
const { z } = require('zod');
const { cleanName } = require('../../server/validation');

const LIMITS = {
  NAME_MAX: 80,                 // validProjectName -> cleanName(v, 80)
  MAX_NODES: 5000,              // projects.js validDocument
  MAX_ITEMS: 5000,              // paintings.js MAX_ITEMS
  MAX_DOCUMENT_BYTES: 8 * 1024 * 1024,
  MAX_SIDE: 8000,               // validation.js dimensions()
  MAX_ABS: 1e8,                 // validation.js safeTree() number bound
  MAX_SHAPES_PER_CALL: 500,
  MAX_POINTS: 2000,
  MAX_TEXT: 5000,
};

const FONTS = ['Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS', 'Segoe UI'];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const name = z.string().refine(v => cleanName(v, LIMITS.NAME_MAX) !== null,
  { message: `Name must be 1-${LIMITS.NAME_MAX} characters with no control or text-direction characters.` })
  .describe(`Name shown on the Toolkit dashboard (1-${LIMITS.NAME_MAX} characters).`);
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/, 'Not a Toolkit id.');
const coord = z.number().finite().min(-100000).max(100000);
const size = z.number().finite().gt(0).max(20000);
const color = z.string().regex(HEX, 'Use a hex colour such as "#e0342f".');
const paint = z.union([color, z.literal('none')]);
const baseRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()
  .describe('The revision you last read with get_project. If the item has changed since, the call fails with a conflict instead of overwriting the newer version. Leave it out to apply the change to whatever the latest version is.');
const appName = z.enum(['sigma', 'pigment', 'imagevendor']);

// ---------- Sigma shapes ----------
const common = {
  name: z.string().min(1).max(80).optional().describe('Layer name shown in the Layers panel.'),
  rotation: z.number().finite().min(-360).max(360).optional().describe('Degrees clockwise around the shape centre. Default 0.'),
  opacity: z.number().min(0).max(1).optional().describe('0 (invisible) to 1 (solid). Default 1.'),
};
const box = { x: coord.describe('Left edge, in artboard pixels (0 = artboard left).'), y: coord.describe('Top edge, in artboard pixels (0 = artboard top).'), w: size.describe('Width in pixels.'), h: size.describe('Height in pixels.') };
const fillStroke = {
  fill: paint.optional().describe('Fill colour as hex, or "none". Default "#d9d9d9".'),
  stroke: paint.optional().describe('Outline colour as hex, or "none". Default "none".'),
  strokeWidth: z.number().min(0).max(500).optional().describe('Outline width in pixels. Default 0 (no outline).'),
};
const pt = z.tuple([coord, coord]);

const sigmaShape = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rect'), ...box, ...fillStroke, cornerRadius: z.number().min(0).max(10000).optional().describe('Rounded corner radius in pixels.'), ...common }).strict(),
  z.object({ type: z.literal('ellipse'), ...box, ...fillStroke, ...common }).strict()
    .describe('Ellipse filling the box x, y, w, h. Use equal w and h for a circle.'),
  z.object({ type: z.literal('polygon'), ...box, ...fillStroke, sides: z.number().int().min(3).max(64).optional().describe('Number of sides. Default 5.'), ...common }).strict()
    .describe('Regular polygon inscribed in the box, first point at the top.'),
  z.object({ type: z.literal('star'), ...box, ...fillStroke, sides: z.number().int().min(3).max(64).optional().describe('Number of points. Default 5.'), innerRatio: z.number().min(0.05).max(0.95).optional().describe('Inner radius as a fraction of the outer one. Default 0.45.'), ...common }).strict(),
  z.object({ type: z.literal('line'), x1: coord, y1: coord, x2: coord, y2: coord, stroke: color.optional().describe('Line colour. Default "#3b2c20".'), strokeWidth: z.number().gt(0).max(500).optional().describe('Line width. Default 3.'), ...common }).strict()
    .describe('Straight line from (x1, y1) to (x2, y2) in artboard pixels.'),
  z.object({ type: z.literal('path'), points: z.array(pt).min(2).max(LIMITS.MAX_POINTS).describe('Corner points [x, y] in artboard pixels, joined by straight segments.'), closed: z.boolean().optional().describe('Join the last point back to the first and allow a fill. Default false.'), ...fillStroke, ...common }).strict()
    .describe('Polyline or polygon through the given points.'),
  z.object({
    type: z.literal('text'), x: coord.describe('Left edge of the text box.'), y: coord.describe('Top of the first line.'),
    text: z.string().min(1).max(LIMITS.MAX_TEXT).describe('The text. Use \\n for new lines.'),
    w: size.optional().describe('Width of the area to align the text in, e.g. the artboard width to centre a title. With align "center" or "right" the text is placed inside this area (approximately: the exact width depends on the font). Sigma then sizes the text box to the text itself.'),
    fontSize: z.number().min(4).max(600).optional().describe('Font size in pixels. Default 24.'),
    fontFamily: z.enum(FONTS).optional().describe('Default "Arial".'),
    fontWeight: z.union([z.literal(400), z.literal(600), z.literal(700)]).optional().describe('400 regular, 600 semibold or 700 bold. Default 400.'),
    align: z.enum(['left', 'center', 'right']).optional(),
    fill: color.optional().describe('Text colour. Default "#1e1e1e".'),
    ...common,
  }).strict(),
]);

const shapeList = z.array(sigmaShape).min(1).max(LIMITS.MAX_SHAPES_PER_CALL)
  .describe(`Shapes to add, back to front: later shapes are drawn on top. At most ${LIMITS.MAX_SHAPES_PER_CALL} per call.`);

// Rough advance widths (in em) for Arial-like fonts; good to a few percent for typical text.
function charWidth(c) {
  if (c === ' ') return 0.28;
  if (/[iljtfI.,:;'!|]/.test(c)) return 0.28;
  if (/[mwMW]/.test(c)) return 0.85;
  if (/[A-Z]/.test(c)) return 0.67;
  if (/[0-9]/.test(c)) return 0.56;
  if (/[a-z]/.test(c)) return 0.52;
  return 0.56;
}
function textWidth(line, fontSize, family = 'Arial', weight = 400) {
  if (family === 'Courier New') return line.length * 0.6 * fontSize;
  let em = 0;
  for (const c of line) em += charWidth(c);
  const fontFactor = family === 'Impact' ? 0.85 : family === 'Verdana' || family === 'Tahoma' ? 1.1 : 1;
  return em * fontSize * fontFactor * (weight >= 600 ? 1.07 : 1);
}

let counter = 0;
function nodeId() {
  counter = (counter + 1) % 1679616;
  return 'n' + Math.random().toString(36).slice(2, 10) + counter.toString(36).padStart(4, '0');
}
const LABELS = { rect: 'Rectangle', ellipse: 'Ellipse', path: 'Path', line: 'Line', polygon: 'Polygon', star: 'Star', text: 'Text' };

// Converts validated tool shapes to Sigma document nodes (same fields the editor creates).
function toSigmaNodes(shapes, existing = []) {
  const counts = {};
  for (const n of existing) counts[n.type] = (counts[n.type] || 0) + 1;
  return shapes.map(s => {
    counts[s.type] = (counts[s.type] || 0) + 1;
    const base = {
      id: nodeId(), type: s.type, name: s.name || `${LABELS[s.type]} ${counts[s.type]}`,
      rotation: s.rotation || 0, opacity: s.opacity ?? 1, visible: true, locked: false, groupId: null,
    };
    const fs = { fill: s.fill ?? '#d9d9d9', stroke: s.stroke ?? 'none', strokeWidth: s.strokeWidth ?? 0 };
    switch (s.type) {
      case 'rect': return { ...base, x: s.x, y: s.y, w: s.w, h: s.h, ...fs, rx: s.cornerRadius || 0 };
      case 'ellipse': return { ...base, x: s.x, y: s.y, w: s.w, h: s.h, ...fs };
      case 'polygon': return { ...base, x: s.x, y: s.y, w: s.w, h: s.h, ...fs, sides: s.sides ?? 5 };
      case 'star': return { ...base, x: s.x, y: s.y, w: s.w, h: s.h, ...fs, sides: s.sides ?? 5, innerRatio: s.innerRatio ?? 0.45 };
      case 'line': case 'path': {
        const pts = s.type === 'line' ? [[s.x1, s.y1], [s.x2, s.y2]] : s.points;
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const x = Math.min(...xs), y = Math.min(...ys);
        const closed = s.type === 'path' && !!s.closed;
        return {
          ...base, x, y, w: Math.max(0.01, Math.max(...xs) - x), h: Math.max(0.01, Math.max(...ys) - y),
          points: pts.map(p => [p[0] - x, p[1] - y]), closed,
          fill: closed ? (s.fill ?? '#d9d9d9') : 'none',
          stroke: s.stroke ?? '#3b2c20', strokeWidth: s.strokeWidth ?? 3,
        };
      }
      case 'text': {
        const fontSize = s.fontSize ?? 24;
        const lines = s.text.split('\n');
        // Sigma always sizes a text box to its measured text, so alignment within a wider
        // area is done here by moving x, using an estimate of the rendered width.
        const est = Math.max(4, ...lines.map(l => textWidth(l, fontSize, s.fontFamily, s.fontWeight)));
        let x = s.x;
        if (s.w && s.align === 'center') x = s.x + (s.w - est) / 2;
        if (s.w && s.align === 'right') x = s.x + s.w - est;
        return {
          ...base, x: Math.round(x * 100) / 100, y: s.y,
          w: est,
          h: lines.length * fontSize * 1.25,
          text: s.text, fontSize, fontFamily: s.fontFamily || 'Arial', fontWeight: s.fontWeight || 400,
          align: s.align || 'left', fill: s.fill || '#1e1e1e',
        };
      }
      default: throw new Error('Unknown shape type ' + s.type);
    }
  });
}

const artboard = z.object({
  w: z.number().int().min(1).max(LIMITS.MAX_SIDE).optional().describe('Artboard width in pixels. Default 1280.'),
  h: z.number().int().min(1).max(LIMITS.MAX_SIDE).optional().describe('Artboard height in pixels. Default 800.'),
  bg: color.optional().describe('Artboard background colour. Default "#ffffff".'),
}).strict();

// ---------- Pigment paints ----------
const gradient = z.object({
  grad: z.enum(['linear', 'radial']),
  angle: z.number().min(-360).max(360).optional().describe('Linear gradients only: direction in degrees, 0 = left to right, 90 = top to bottom.'),
  stops: z.array(z.object({ at: z.number().min(0).max(1), color }).strict()).min(2).max(8).describe('Colour stops; "at" runs from 0 (start) to 1 (end).'),
}).strict();
const pigmentPaint = z.union([color, gradient]);

const canvas = z.object({
  w: z.number().int().min(1).max(LIMITS.MAX_SIDE).optional().describe('Canvas width in pixels. Default 1600.'),
  h: z.number().int().min(1).max(LIMITS.MAX_SIDE).optional().describe('Canvas height in pixels. Default 1000.'),
  bg: color.optional().describe('Background colour. Default "#ffffff".'),
}).strict();

function documentBytes(doc) { return Buffer.byteLength(JSON.stringify(doc)); }

module.exports = {
  z, LIMITS, FONTS, name, id, appName, baseRevision, shapeList, artboard, canvas, pigmentPaint, coord, size,
  toSigmaNodes, documentBytes,
};
