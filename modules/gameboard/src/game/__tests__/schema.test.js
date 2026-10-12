import { TRANSITION_METHODS } from 'dw-state-machine/lib/BaseGameStateMachine.js';

const fs = require('fs');
const path = require('path');

const modules = path.resolve(__dirname, '../../../..');
const canonical = path.join(modules, 'shared/schema/PongAPISchema.json');
const libCopy = path.join(modules, 'shared/js_packages/dw/state-machine/lib/PongAPISchema.json');

test('the dw-state-machine schema copy matches the canonical schema', () => {
  // Docker overwrites the lib copy with the canonical one; local dev uses the lib copy.
  expect(fs.readFileSync(libCopy, 'utf8')).toBe(fs.readFileSync(canonical, 'utf8'));
});

test('the game/state enum lists exactly the transitions the state machine understands', () => {
  const schema = JSON.parse(fs.readFileSync(canonical, 'utf8'));
  const allowed = schema.properties['game/state'].properties.transition.enum;
  expect([...allowed].sort()).toEqual(Object.keys(TRANSITION_METHODS).sort());
});
