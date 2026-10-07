// Unit tests for grails-app/assets/javascripts/spApp/util.js
// Run with: node --test src/test/js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const UTIL_JS = path.join(__dirname, '../../../grails-app/assets/javascripts/spApp/util.js');

/** Loads util.js in a fresh context with the globals it expects ($SH, $). */
function loadUtil(sh = {}) {
    const context = {
        $SH: sh,
        $: {isArray: Array.isArray},
        Math, Number, Date, parseFloat, parseInt, isNaN
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(UTIL_JS, 'utf8') + '\nthis.Util = Util;', context);
    return {Util: context.Util, context};
}

const {Util, context} = loadUtil();

/** Copies a value into the util.js context, so `instanceof Array` works there. */
const inCtx = (value) => vm.runInContext(`(${JSON.stringify(value)})`, context);

/** Copies a value out of the util.js context, for deepStrictEqual. */
const plain = (value) => JSON.parse(JSON.stringify(value));

const R = 6378137.0;

function haversine([lng1, lat1], [lng2, lat2]) {
    const toRad = (d) => d * Math.PI / 180;
    const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

/** Parses 'MULTIPOLYGON (((x y, x y)), ((...)))' into [[[x, y], ...], ...] (outer rings only). */
function parseMultiPolygon(wkt) {
    assert.match(wkt, /^MULTIPOLYGON \(/);
    return wkt.slice('MULTIPOLYGON ('.length, -1).split(/\)\),\s*\(\(/).map((part) =>
        part.replace(/[()]/g, '').split(',').map((p) => p.trim().split(' ').map(Number)));
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// --- geometry -----------------------------------------------------------------------------------

test('computeOffset moves 1 degree east and north at the equator', () => {
    const oneDegree = R * Math.PI / 180;
    const east = Util.computeOffset(0, 0, oneDegree, 90);
    const north = Util.computeOffset(0, 0, oneDegree, 0);
    assert.ok(near(east[0], 1) && near(east[1], 0), `east: ${east}`);
    assert.ok(near(north[0], 0) && near(north[1], 1), `north: ${north}`);
});

test('createCircle returns a closed ring whose points are at the radius from the centre', () => {
    const centre = [149.1, -35.3];
    const radius = 10000;
    const rings = parseMultiPolygon(Util.createCircle(centre[0], centre[1], radius));

    assert.equal(rings.length, 1);
    const ring = rings[0];
    assert.equal(ring.length, 51);
    assert.deepEqual(ring[0], ring[ring.length - 1]);
    for (const p of ring) {
        assert.ok(Math.abs(haversine(centre, p) - radius) < 1, `${p} is ${haversine(centre, p)} m away`);
    }
});

test('createCircle across the antimeridian is split into polygons within -180..180', () => {
    const rings = parseMultiPolygon(Util.createCircle(179.95, -16.5, 20000));

    assert.equal(rings.length, 2);
    for (const ring of rings) {
        assert.deepEqual(ring[0], ring[ring.length - 1]);
        for (const [lng, lat] of ring) {
            assert.ok(lng >= -180 && lng <= 180, `longitude ${lng}`);
            assert.ok(lat > -17 && lat < -16, `latitude ${lat}`);
        }
    }
    // one part east of 179, the other west of -179
    assert.ok(rings.some((r) => r.every(([lng]) => lng > 179)));
    assert.ok(rings.some((r) => r.every(([lng]) => lng < -179)));
});

test('wrap leaves a polygon inside -180..180 unchanged', () => {
    const polygon = [[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]];
    assert.deepEqual(plain(Util.wrap(inCtx(polygon))), [polygon]);
});

test('wrap splits a polygon crossing +180 into two closed polygons', () => {
    const polygon = [[170, 0], [190, 0], [190, 10], [170, 10], [170, 0]];
    const parts = plain(Util.wrap(inCtx(polygon)));

    assert.equal(parts.length, 2);
    for (const part of parts) {
        assert.deepEqual(part[0], part[part.length - 1]);
        assert.ok(part.every(([lng]) => lng >= -180 && lng <= 180));
    }
    const lngs = parts.map((part) => part.map(([lng]) => lng));
    assert.ok(lngs.some((l) => Math.min(...l) === 170 && Math.max(...l) === 180));
    assert.ok(lngs.some((l) => Math.min(...l) === -180 && Math.max(...l) === -170));
});

test('wrappedToWkt writes one polygon per part', () => {
    const wkt = Util.wrappedToWkt(inCtx([[[0, 0], [1, 0], [1, 1], [0, 0]], [[5, 5], [6, 5], [6, 6], [5, 5]]]));
    assert.equal(parseMultiPolygon(wkt).length, 2);
});

test('wrappedToWkt does not leak a global variable', {todo: 'wrappedToWkt assigns "wkt" without var'}, () => {
    const {Util: U, context} = loadUtil();
    U.wrappedToWkt([[[0, 0], [1, 0], [1, 1], [0, 0]]]);
    assert.equal(context.wkt, undefined);
});

// --- facet ranges -------------------------------------------------------------------------------

test('integer ranges cover min..max without gaps or overlaps', () => {
    const ranges = Util.getRangeBetweenTwoInteger(1, 100);
    assert.equal(ranges[0][0], 1);
    assert.equal(ranges[ranges.length - 1][1], 100);
    for (let i = 1; i < ranges.length; i++) {
        assert.equal(ranges[i][0], ranges[i - 1][1] + 1);
    }
    assert.equal(ranges.length, 7);
});

test('integer ranges of a single value', () => {
    assert.deepEqual(plain(Util.getRangeBetweenTwoInteger(5, 5)), [[5, 5]]);
    assert.deepEqual(plain(Util.getRangeBetweenTwoInteger(5, 4)), []);
});

test('float ranges cover min..max in increasing order', () => {
    const ranges = Util.getRangeBetweenTwoFloat(0, 1);
    assert.equal(ranges[0][0], 0);
    assert.equal(ranges[ranges.length - 1][1], 1);
    for (let i = 1; i < ranges.length; i++) {
        assert.ok(ranges[i][0] > ranges[i - 1][1]);
        assert.ok(ranges[i][1] >= ranges[i][0]);
    }
});

test('the number of intervals comes from $SH.numberOfIntervalsForRangeData', () => {
    const {Util: U} = loadUtil({numberOfIntervalsForRangeData: 4});
    assert.equal(U.getRangeBetweenTwoInteger(1, 100).length, 4);
});

test('getRangeBetweenTwoNumber honours numberOfIntervals',
    {todo: 'getRangeBetweenTwoInteger/Float overwrite the numberOfIntervals argument with $SH or 7'}, () => {
        assert.equal(Util.getRangeBetweenTwoNumber(1, 100, 3).length, 3);
    });

test('getRanges for dates uses the years', () => {
    const ranges = Util.getRanges('tdate', new Date('1990-06-01'), new Date('2020-01-01'));
    assert.equal(ranges[0][0], 1990);
    assert.equal(ranges[ranges.length - 1][1], 2020);
});

// --- data types ---------------------------------------------------------------------------------

test('inferDataTypeFromValue', () => {
    assert.equal(Util.inferDataTypeFromValue('42'), 'int');
    assert.equal(Util.inferDataTypeFromValue('4.2'), 'tfloat');
    assert.equal(Util.inferDataTypeFromValue('2020-01-31'), 'tdate');
    assert.equal(Util.inferDataTypeFromValue('Eucalyptus'), 'string');
});

test('inferDataTypeFromValue of an empty value is not a number',
    {todo: "isNaN('') and isNaN(null) are false, so empty values are inferred as 'tfloat'"}, () => {
        assert.notEqual(Util.inferDataTypeFromValue(''), 'tfloat');
        assert.notEqual(Util.inferDataTypeFromValue(null), 'tfloat');
    });

test('castValue', () => {
    assert.equal(Util.castValue('42', 'int'), 42);
    assert.equal(Util.castValue('4.5', 'tfloat'), 4.5);
    assert.equal(Util.castValue('2020-01-31', 'tdate').getUTCFullYear(), 2020);
    assert.equal(Util.castValue(null, 'string'), '');
    assert.equal(Util.castValue(7, 'string'), '7');
});

test('notEmpty', () => {
    assert.equal(Util.notEmpty('a'), true);
    assert.equal(Util.notEmpty(0), true);
    assert.equal(Util.notEmpty(''), false);
    assert.equal(Util.notEmpty(null), false);
    assert.equal(Util.notEmpty(undefined), false);
});

test('deepCopy copies nested values and skips private keys and functions', () => {
    const src = inCtx({a: 1, b: {c: [1, 2, {d: 3}]}, _private: 1});
    src.f = () => 1;
    const copy = Util.deepCopy(src);
    assert.deepEqual(plain(copy), {a: 1, b: {c: [1, 2, {d: 3}]}});
    copy.b.c[2].d = 4;
    assert.equal(src.b.c[2].d, 3);
});
