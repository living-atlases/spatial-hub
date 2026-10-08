// Unit tests for grails-app/assets/javascripts/spApp/service/colourService.js
// Run with: node --test src/test/js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {loadFactory} = require('./angular-harness');

const FILE = path.join(__dirname, '../../../grails-app/assets/javascripts/spApp/service/colourService.js');

/** The default palette, duplicated here so the tests pin the exact values the service returns. */
const COLOURS = ['3366CC', 'DC3912', 'FF9900', '109618', '990099', '0099C6', 'DD4477', '66AA00',
    'B82E2E', '316395', '994499', '22AA99', 'AAAA11', '6633CC', 'E67300', '8B0707', '651067',
    '329262', '5574A6', '3B3EAC', 'B77322', '16D620', 'B91383', 'F4359E', '9C5935', 'A9C413',
    '2A778D', '668D1C', 'BEA413', '0C5922', '743411'];
const LINEAR = ['0506df', '0072ff', '00f1ff', '00ff06', 'f6ff01', 'ff8a00', 'fe1c00'];

function newService() {
    return loadFactory(FILE, 'ColourService');
}

const rgb = (hex) => ({
    red: parseInt(hex.substr(0, 2), 16),
    green: parseInt(hex.substr(2, 2), 16),
    blue: parseInt(hex.substr(4, 2), 16)
});

// Objects returned from the vm sandbox carry the sandbox's Object.prototype, which trips
// deepStrictEqual's prototype check, so flatten to a plain {red, green, blue} in this realm.
const flat = (c) => ({red: c.red, green: c.green, blue: c.blue});

test('nextColour returns the palette in order', () => {
    const s = newService();
    for (let i = 0; i < COLOURS.length; i++) {
        assert.equal(s.nextColour(), COLOURS[i], `colour at index ${i}`);
    }
});

test('nextColour wraps around after the last colour', () => {
    const s = newService();
    const first = s.nextColour();
    for (let i = 1; i < COLOURS.length; i++) {
        s.nextColour();
    }
    // index is now 31 == COLOURS.length, so the next call wraps to index 0
    assert.equal(s.nextColour(), first);
    assert.equal(s.nextColour(), COLOURS[1]);
});

test('nextColour has its own counter per service instance', () => {
    const a = newService();
    const b = newService();
    a.nextColour();
    a.nextColour();
    assert.equal(b.nextColour(), COLOURS[0]);
});

test('getColour returns the parsed RGB of the palette entry', () => {
    const s = newService();
    assert.deepEqual(flat(s.getColour(0)), {red: 0x33, green: 0x66, blue: 0xCC});
    assert.deepEqual(flat(s.getColour(1)), rgb(COLOURS[1]));
});

test('getColour wraps the index by the palette length', () => {
    const s = newService();
    assert.deepEqual(flat(s.getColour(COLOURS.length)), flat(s.getColour(0)));
    assert.deepEqual(flat(s.getColour(COLOURS.length + 2)), flat(s.getColour(2)));
});

test('getColour does not advance the nextColour counter', () => {
    const s = newService();
    s.getColour(5);
    s.getColour(9);
    assert.equal(s.nextColour(), COLOURS[0]);
});

test('getLinearColour returns the linear palette entry', () => {
    const s = newService();
    assert.deepEqual(flat(s.getLinearColour(0)), rgb(LINEAR[0]));
    assert.deepEqual(flat(s.getLinearColour(3)), rgb(LINEAR[3]));
});

test('getLinearColour clamps positions at or beyond the end to the last colour', () => {
    const s = newService();
    const last = rgb(LINEAR[LINEAR.length - 1]);
    assert.deepEqual(flat(s.getLinearColour(LINEAR.length)), last);
    assert.deepEqual(flat(s.getLinearColour(LINEAR.length + 100)), last);
});

test('getLinearColour returns the last valid colour for the last index', () => {
    const s = newService();
    assert.deepEqual(flat(s.getLinearColour(LINEAR.length - 1)), rgb(LINEAR[LINEAR.length - 1]));
});

test('parseHexToRGB parses a full 6-digit hex colour', () => {
    const s = newService();
    assert.deepEqual(flat(s.parseHexToRGB('FF8A00')), {red: 255, green: 138, blue: 0});
    assert.deepEqual(flat(s.parseHexToRGB('000000')), {red: 0, green: 0, blue: 0});
    assert.deepEqual(flat(s.parseHexToRGB('FFFFFF')), {red: 255, green: 255, blue: 255});
});

test('parseHexToRGB of a short string yields NaN for the missing channels', () => {
    const s = newService();
    // 'FFF': red='FF'=255, green='F'=15, blue=''=NaN
    const short = s.parseHexToRGB('FFF');
    assert.equal(short.red, 255);
    assert.equal(short.green, 15);
    assert.ok(Number.isNaN(short.blue));
});

test('parseHexToRGB of a non-hex string yields NaN channels', () => {
    const s = newService();
    const bad = s.parseHexToRGB('ZZZZZZ');
    assert.ok(Number.isNaN(bad.red) && Number.isNaN(bad.green) && Number.isNaN(bad.blue));
});

test('parseHexToRGB of an empty string yields all NaN', () => {
    const s = newService();
    const empty = s.parseHexToRGB('');
    assert.ok(Number.isNaN(empty.red) && Number.isNaN(empty.green) && Number.isNaN(empty.blue));
});
