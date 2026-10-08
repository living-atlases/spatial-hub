// Unit tests for small pure AngularJS services:
//   - layerDistancesService.js (LayerDistancesService.getDistance)
//   - i18nService.js           (i18nService.v / set, with $http stubbed)
// Run with: node --test src/test/js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {loadFactory} = require('./angular-harness');

const SVC = (name) => path.join(__dirname, '../../../grails-app/assets/javascripts/spApp/service/', name);

// --- LayerDistancesService -----------------------------------------------------------------------

function layerDistances(map) {
    return loadFactory(SVC('layerDistancesService.js'), 'LayerDistancesService', {gLayerDistances: map});
}

test('getDistance looks up the pair with the smaller fieldId first', () => {
    const s = layerDistances({'el1 el2': 0.5});
    assert.equal(s.getDistance('el1', 'el2'), 0.5);
});

test('getDistance is symmetric: argument order does not matter', () => {
    const s = layerDistances({'el1 el2': 0.5});
    assert.equal(s.getDistance('el2', 'el1'), 0.5);
    assert.equal(s.getDistance('el1', 'el2'), s.getDistance('el2', 'el1'));
});

test('getDistance uses lexicographic ordering of the key, not numeric', () => {
    // 'el10' < 'el2' lexicographically, so the key is 'el10 el2'
    const s = layerDistances({'el10 el2': 0.9});
    assert.equal(s.getDistance('el2', 'el10'), 0.9);
    assert.equal(s.getDistance('el10', 'el2'), 0.9);
});

test('getDistance returns undefined for an unknown pair', () => {
    const s = layerDistances({'el1 el2': 0.5});
    assert.equal(s.getDistance('el3', 'el4'), undefined);
});

test('getDistance of a layer with itself builds the "x x" key', () => {
    const s = layerDistances({'el1 el1': 0});
    assert.equal(s.getDistance('el1', 'el1'), 0);
});

// --- i18nService ---------------------------------------------------------------------------------

function i18n(messages, httpSpy) {
    const $http = {post: httpSpy || function () {}};
    return loadFactory(SVC('i18nService.js'), 'i18nService', {$http: $http, gMessages: messages},
        {$SH: {baseUrl: 'http://host', i18n: 'en', hub: 'ala'}});
}

test('v returns the mapped value for a known key', () => {
    const s = i18n({hello: 'Bonjour'});
    assert.equal(s.v('hello'), 'Bonjour');
});

test('v returns the input unchanged for an unknown key', () => {
    const s = i18n({hello: 'Bonjour'});
    assert.equal(s.v('missing'), 'missing');
});

test('v normalises a single space in the key to an underscore', () => {
    const s = i18n({my_key: 'value'});
    assert.equal(s.v('my key'), 'value');
});

test('v coerces non-string keys to strings before lookup', () => {
    const s = i18n({1: 'one'});
    assert.equal(s.v(1), 'one');
});

test('set stores a value under the normalised key so v can read it back', () => {
    const s = i18n({});
    s.set('new key', 'val');
    assert.equal(s.v('new key'), 'val');
    assert.equal(s.map.new_key, 'val');
});

// A key with two or more spaces should have ALL spaces replaced, but String.replace(" ", "_")
// only replaces the first occurrence, so the second space survives and the lookup misses.
test('v normalises every space in a multi-word key',
    () => {
        const s = i18n({a_b_c: 'value'});
        assert.equal(s.v('a b c'), 'value');
    });

test('commit posts the key/value to the server and updates the local map', () => {
    const calls = [];
    const s = i18n({}, (url, body) => { calls.push({url, body}); });
    s.commit('some key', 'text');
    assert.equal(s.map.some_key, 'text');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/portal\/i18n\?lang=en&hub=ala$/);
    assert.equal(calls[0].body.key, 'some_key');
    assert.equal(calls[0].body.value, 'text');
});
