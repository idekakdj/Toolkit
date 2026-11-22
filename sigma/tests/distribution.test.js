import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { state, baseNode, nodeAABB, distributeSelected, getMovableSelectedNodes,
  snapshot, undo, redo, events } from '../public/js/editor/state.js';
import { refreshProps } from '../public/js/editor/panels.js';

function setup(props) {
  state.doc.nodes = props.map((p, i) => baseNode('rect', { id: String(i), ...p }));
  state.selection = state.doc.nodes.map(n => n.id);
  state.dirty = false;
}
function equalGaps(axis, nodes = getMovableSelectedNodes()) {
  const key = axis === 'horizontal' ? 'x' : 'y', size = key === 'x' ? 'w' : 'h';
  const boxes = nodes.map(nodeAABB).sort((a, b) => a[key] - b[key]);
  const gaps = boxes.slice(1).map((b, i) => b[key] - boxes[i][key] - boxes[i][size]);
  for (const gap of gaps) assert.ok(Math.abs(gap - gaps[0]) < 1e-8);
  return gaps[0];
}

for (const axis of ['horizontal', 'vertical']) {
  test(`${axis}: rotated unequal sizes, shuffled selection, endpoints, single undo and redo`, () => {
    setup([{ x: 0, y: 0, w: 20, h: 30, rotation: 45 },
      { x: 55, y: 65, w: 40, h: 10, rotation: 90 },
      { x: 130, y: 150, w: 15, h: 25, rotation: 23 },
      { x: 280, y: 300, w: 25, h: 40, rotation: -35 }]);
    state.selection = ['3', '1', '0', '2'];
    const before = snapshot();
    const endpoints = [structuredClone(state.doc.nodes[0]), structuredClone(state.doc.nodes[3])];
    let history = 0, docs = 0;
    events.on('history', () => history++); events.on('doc', () => docs++);
    assert.equal(distributeSelected(axis), true);
    assert.equal(history, 1); assert.equal(docs, 1); assert.equal(state.dirty, true);
    equalGaps(axis);
    assert.deepEqual([state.doc.nodes[0], state.doc.nodes[3]], endpoints);
    const after = snapshot();
    undo(); assert.equal(snapshot(), before);
    redo(); assert.equal(snapshot(), after);
    state.dirty = false; const count = history;
    assert.equal(distributeSelected(axis), false);
    assert.equal(history, count); assert.equal(state.dirty, false);
  });
}

test('locked and hidden nodes neither move nor influence gaps; insufficient nodes do nothing', () => {
  setup([{ x: 0, w: 10 }, { x: 20, w: 20 }, { x: 100, w: 10 },
    { x: -1000, locked: true }, { x: 2000, visible: false }]);
  const excluded = structuredClone(state.doc.nodes.slice(3));
  distributeSelected('horizontal'); equalGaps('horizontal');
  assert.deepEqual(state.doc.nodes.slice(3), excluded);
  state.doc.nodes[1].locked = true; state.dirty = false;
  const before = snapshot(); let history = 0;
  events.on('history', () => history++);
  assert.equal(distributeSelected('horizontal'), false);
  assert.equal(distributeSelected('bad-axis'), false);
  assert.equal(snapshot(), before); assert.equal(history, 0); assert.equal(state.dirty, false);
});

test('negative gaps and tied AABB starts retain stable selection order', () => {
  setup([{ x: 0, w: 100 }, { x: 0, w: 10 }, { x: 20, w: 100 }]);
  state.selection = ['0', '1', '2'];
  const endpoints = structuredClone([state.doc.nodes[0], state.doc.nodes[2]]);
  distributeSelected('horizontal');
  assert.equal(state.doc.nodes[1].x, 55);
  assert.deepEqual([state.doc.nodes[0], state.doc.nodes[2]], endpoints);
  const b = state.doc.nodes.map(nodeAABB);
  assert.equal(b[1].x - b[0].x - b[0].w, -45);
  assert.equal(b[2].x - b[1].x - b[1].w, -45);
});

test('controls are labeled in alignment section and disabled by movable count', () => {
  const html = readFileSync(new URL('../public/editor.html', import.meta.url), 'utf8');
  const alignment = html.match(/<section id="props-align"[\s\S]*?<\/section>/)[0];
  for (const axis of ['horizontal', 'vertical']) {
    assert.match(alignment, new RegExp(`data-distribute="${axis}" aria-label="Distribute ${axis} gaps"`));
  }
  const original = globalThis.document, controls = [{}, {}], inputs = new Map();
  globalThis.document = {
    querySelectorAll: selector => selector === '[data-distribute]' ? controls : [],
    getElementById: id => { if (!inputs.has(id)) inputs.set(id, {}); return inputs.get(id); },
  };
  try {
    setup([]); refreshProps(); assert.ok(controls.every(b => b.disabled));
    setup([{ x: 0 }, { x: 30 }, { x: 100 }]);
    refreshProps(); assert.ok(controls.every(b => !b.disabled));
    state.doc.nodes[1].locked = true;
    refreshProps(); assert.ok(controls.every(b => b.disabled));
    state.doc.nodes[1].locked = false; state.doc.nodes[1].visible = false;
    refreshProps(); assert.ok(controls.every(b => b.disabled));
  } finally { globalThis.document = original; }
});
