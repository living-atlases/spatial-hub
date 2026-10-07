// Unit tests for the pure helpers of
//   grails-app/assets/javascripts/spApp/service/urlParamsService.js
//   - parseSearchParams (query-string parsing)
//   - computeOffset / createCircle (geometry)
//   - mapMultiQuerySpeciesLayers (lyN layer query building)
// Run with: node --test src/test/js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {loadFactory} = require('./angular-harness');

const FILE = path.join(__dirname, '../../../grails-app/assets/javascripts/spApp/service/urlParamsService.js');

/** A minimal <a> element whose `href` setter exposes the `?...` part as `search`, like a browser. */
function fakeDocument() {
    return {
        createElement: function () {
            const el = {search: '', _href: ''};
            Object.defineProperty(el, 'href', {
                set: function (v) {
                    this._href = v;
                    const q = v.indexOf('?');
                    el.search = q >= 0 ? v.substring(q) : '';
                },
                get: function () { return this._href; }
            });
            return el;
        }
    };
}

/** Instantiate UrlParamsService with the given injectable mocks and browser-ish globals. */
function service(mocks = {}, globals = {}) {
    const dflt = {
        $rootScope: {}, $timeout: function (f) { f && f(); },
        LayersService: {}, BiocacheService: {}, MapService: {},
        LayoutService: {}, SessionsService: {}, ToolsService: {},
        $q: {when: function (v) { return {then: function (cb) { cb && cb(v); return this; }}; }}
    };
    const g = Object.assign({
        $SH: {biocacheServiceUrl: 'BS', biocacheUrl: 'WS'},
        $: {isArray: Array.isArray, each: function () {}},
        document: fakeDocument()
    }, globals);
    return loadFactory(FILE, 'UrlParamsService', Object.assign(dflt, mocks), g);
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// --- parseSearchParams ---------------------------------------------------------------------------

test('parseSearchParams decodes the query string into a map', () => {
    const s = service();
    const r = s.parseSearchParams('http://x/search?q=hello%20world&fq=state%3AVic');
    assert.equal(r.q, 'hello world');
    assert.equal(r.fq, 'state:Vic');
});

test('parseSearchParams tolerates a leading ?& with an empty first parameter', () => {
    const s = service();
    const r = s.parseSearchParams('http://x/?&q=1&r=2');
    assert.deepEqual({q: r.q, r: r.r}, {q: '1', r: '2'});
    assert.ok(!('' in r));
});

test('parseSearchParams returns an empty object when there is no query string', () => {
    const s = service();
    const r = s.parseSearchParams('http://x/path');
    assert.deepEqual(Object.keys(r), []);
});

// --- computeOffset / createCircle ---------------------------------------------------------------

test('computeOffset moves one radian-equivalent east and north at the equator', () => {
    const s = service();
    const R = 6378137.0;
    const oneDegree = R * Math.PI / 180;
    const east = s.computeOffset(0, 0, oneDegree, 90);
    const north = s.computeOffset(0, 0, oneDegree, 0);
    assert.ok(near(east[0], 1) && near(east[1], 0), `east=${east}`);
    assert.ok(near(north[0], 0) && near(north[1], 1), `north=${north}`);
});

test('createCircle builds a closed POLYGON of 360 segments at the given radius', () => {
    const s = service();
    const wkt = s.createCircle(0, 0, 6378137.0 * Math.PI / 180); // ~1 degree radius
    assert.match(wkt, /^POLYGON\(\(/);
    assert.match(wkt, /\)\)$/);
    const body = wkt.slice('POLYGON(('.length, -2);
    const pts = body.split(',').map((p) => p.trim().split(' ').map(Number));
    // 360 points plus the repeated first point to close the ring
    assert.equal(pts.length, 361);
    assert.deepEqual(pts[0], pts[pts.length - 1]);
    // every point is ~1 degree from the centre
    for (const [x, y] of pts) {
        assert.ok(near(Math.sqrt(x * x + y * y), 1, 1e-3), `radius of ${x},${y}`);
    }
});

// --- mapMultiQuerySpeciesLayers ------------------------------------------------------------------

/** A BiocacheService whose newLayer records its query and immediately resolves to a layer object. */
function captureBiocache() {
    const calls = [];
    const layer = {};
    const biocache = {
        newLayer: function (query, _u, name) {
            calls.push({query: query, name: name});
            return {then: function (cb) { cb && cb(layer); return {then: function () {}}; }};
        }
    };
    return {calls, layer, biocache};
}

test('mapMultiQuerySpeciesLayers builds one layer per "ly.N" parameter', () => {
    const {calls, biocache} = captureBiocache();
    const added = [];
    const s = service({BiocacheService: biocache, MapService: {add: (l) => added.push(l)}});

    const promises = s.mapMultiQuerySpeciesLayers(
        {'ly.1': 'My Layer', 'ly.1.q': 'kingdom:Animalia', 'ly.1.s': 'FF0000'}, 'BS', 'WS', null);

    assert.equal(promises.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'My Layer');
    assert.equal(calls[0].query.q, 'kingdom:Animalia');
    assert.equal(calls[0].query.bs, 'BS');
    assert.equal(calls[0].query.ws, 'WS');
    assert.equal(calls[0].query.fq.length, 0);
    assert.equal(added.length, 1);
});

test('mapMultiQuerySpeciesLayers turns a comma list of queries into an OR query', () => {
    const {calls, biocache} = captureBiocache();
    const s = service({BiocacheService: biocache, MapService: {add: () => {}}});
    s.mapMultiQuerySpeciesLayers({'ly.1': 'L', 'ly.1.q': 'a,b,c'}, 'BS', 'WS', null);
    assert.equal(calls[0].query.q, 'a OR b OR c');
});

test('mapMultiQuerySpeciesLayers includes the geospatialKosher fq when supplied', () => {
    const {calls, biocache} = captureBiocache();
    const s = service({BiocacheService: biocache, MapService: {add: () => {}}});
    s.mapMultiQuerySpeciesLayers({'ly.1': 'L', 'ly.1.q': 'a'}, 'BS', 'WS', 'spatiallyValid:true');
    assert.deepEqual(Array.from(calls[0].query.fq), ['spatiallyValid:true']);
});

test('mapMultiQuerySpeciesLayers ignores the .q and .s sub-parameters as layer rows', () => {
    const {calls, biocache} = captureBiocache();
    const s = service({BiocacheService: biocache, MapService: {add: () => {}}});
    // only ly.1 should drive a newLayer call; ly.1.q and ly.1.s are its attributes
    s.mapMultiQuerySpeciesLayers({'ly.1': 'L', 'ly.1.q': 'a', 'ly.1.s': '00FF00'}, 'BS', 'WS', null);
    assert.equal(calls.length, 1);
});

// The doc/examples use `ly1`, `ly1.q`, `ly1.s`, but the regex is new RegExp("ly\\.[0-9]{1,}"),
// which requires a dot (`ly.1`). So documented `lyN` parameters never create a layer.
test('mapMultiQuerySpeciesLayers builds a layer for a documented "lyN" parameter',
    {todo: 'the lyN regex requires a dot ("ly.1"); documented "ly1" parameters match nothing'},
    () => {
        const {calls, biocache} = captureBiocache();
        const s = service({BiocacheService: biocache, MapService: {add: () => {}}});
        s.mapMultiQuerySpeciesLayers({'ly1': 'My Layer', 'ly1.q': 'kingdom:Animalia'}, 'BS', 'WS', null);
        assert.equal(calls.length, 1);
    });
