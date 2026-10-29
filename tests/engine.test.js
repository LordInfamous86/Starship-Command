const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../engine.js');

test('creates a fresh campaign with the expected starting resources', () => {
  const state = Engine.createInitialState();

  assert.equal(state.status, 'active');
  assert.equal(state.turn, 1);
  assert.equal(state.window, 6);
  assert.equal(state.power, 68);
  assert.equal(state.crew.length, 4);
});

test('scan spends power, advances one turn, and raises the first sensor anomaly', () => {
  const initial = Engine.createInitialState();
  const next = Engine.command(initial, 'scan');

  assert.equal(initial.power, 68, 'the input campaign remains unchanged');
  assert.equal(next.power, 62);
  assert.equal(next.turn, 2);
  assert.equal(next.oxygen, 71);
  assert.equal(next.window, 5);
  assert.equal(next.progress, 34);
  assert.equal(next.pendingEvent, 'sensor');
  assert.equal(next.sensorAnomalySeen, true);
});

test('commands with insufficient resources are rejected without changing state', () => {
  const state = Engine.createInitialState();
  state.power = 5;

  assert.strictEqual(Engine.command(state, 'scan'), state);
});

test('crew reassignment is free and changes the scan result', () => {
  const state = Engine.createInitialState();
  const assigned = Engine.assignCrew(state, 'niko', 'bridge');
  const scanned = Engine.command(assigned, 'scan');

  assert.equal(assigned.turn, 1);
  assert.equal(assigned.actions, 0);
  assert.equal(scanned.progress, 25);
  assert.equal(state.crew.find(member => member.id === 'niko').assignment, 'navigation');
});

test('resolving an anomaly applies its cost and queues the scheduled impact in order', () => {
  let state = Engine.command(Engine.createInitialState(), 'scan');
  state = Engine.resolveChoice(state, 'analyze');
  state = Engine.command(state, 'scan');

  assert.equal(state.progress, 86);
  assert.equal(state.power, 51);
  assert.equal(state.turn, 3);
  assert.equal(state.pendingEvent, 'impact');
});

test('an underfunded emergency choice is rejected unchanged', () => {
  const state = Engine.createInitialState();
  state.pendingEvent = 'surge';
  state.power = 7;

  assert.strictEqual(Engine.resolveChoice(state, 'clamp'), state);
});

test('impact response uses the assigned engineer and synchronizes hull systems', () => {
  const state = Engine.createInitialState();
  state.pendingEvent = 'impact';
  const next = Engine.resolveChoice(state, 'brace');

  assert.equal(next.power, 62);
  assert.equal(next.hull, 82);
  assert.equal(next.systems.hull, 82);
  assert.equal(next.pendingEvent, null);
  assert.equal(next.log[0].title, 'COMMAND DECISION');
});

test('repairing the relay ends the mission successfully and charges the finale cost', () => {
  const state = Engine.createInitialState();
  state.pendingEvent = 'finale';
  state.missionPhase = 'finale';
  state.progress = 100;
  state.power = 20;
  const next = Engine.resolveChoice(state, 'repair');

  assert.equal(next.status, 'success');
  assert.equal(next.ending, 'relay_repaired');
  assert.equal(next.power, 6);
});

test('relay repair ending is rejected when the reactor cannot cover its cost', () => {
  const state = Engine.createInitialState();
  state.pendingEvent = 'finale';
  state.missionPhase = 'finale';
  state.progress = 100;
  state.power = 13;

  assert.strictEqual(Engine.resolveChoice(state, 'repair'), state);
});

test('the distress window closing ends the run as a failure', () => {
  const state = Engine.createInitialState();
  state.window = 1;
  const next = Engine.command(state, 'advance');

  assert.equal(next.status, 'failure');
  assert.equal(next.ending, 'lost');
  assert.equal(next.window, 0);
  assert.equal(next.pendingEvent, null);
});

test('crew assignments reject unknown departments', () => {
  const state = Engine.createInitialState();

  assert.strictEqual(Engine.assignCrew(state, 'mara', 'captain'), state);
});
