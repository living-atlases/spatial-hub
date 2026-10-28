import {beforeAll, beforeEach, describe, expect, it} from 'vitest';

// urlParamsService only needs its dependency modules to exist, not their services: every service it injects is
// provided by the test.
beforeAll(function () {
    ['ngFileUpload', 'layers-service', 'facet-auto-complete-service', 'biocache-service', 'map-service',
        'layout-service'].forEach(function (name) {
        angular.module(name, []);
    });
    loadSpApp('service/urlParamsService.js');
});

function service(module, name, values) {
    angular.mock.module(module, function ($provide) {
        angular.forEach(values || {}, function (value, key) {
            $provide.value(key, value);
        });
    });
    var result;
    angular.mock.inject([name, function (s) {
        result = s;
    }]);
    return result;
}

describe('UrlParamsService', function () {
    var urlParams, newLayerCalls, addedLayers;

    beforeEach(function () {
        newLayerCalls = [];
        addedLayers = [];
        var thenable = {then: function () { return thenable; }};
        urlParams = service('url-params-service', 'UrlParamsService', {
            LayersService: {},
            LayoutService: {},
            SessionsService: {},
            ToolsService: {},
            MapService: {add: function (layer) { addedLayers.push(layer); }},
            BiocacheService: {
                newLayer: function (query, _unused, name) {
                    newLayerCalls.push({query: query, name: name});
                    return thenable;
                }
            }
        });
    });

    // The pattern used to require the dot (ly\.[0-9]+), so the layers the hub itself writes as ly1, ly2... were
    // ignored and never reached the map.
    it('adds the species layers of ly1, ly2... and of ly.1', function () {
        urlParams.mapMultiQuerySpeciesLayers({
            ly1: 'Eucalyptus',
            'ly1.q': 'genus:Eucalyptus',
            'ly.2': 'Acacia',
            'ly.2.q': 'genus:Acacia,genus:Racosperma'
        }, 'https://biocache.test/ws', 'https://biocache.test', '-geospatial_kosher:false');

        expect(newLayerCalls.map(function (c) { return c.name; }).sort()).toEqual(['Acacia', 'Eucalyptus']);
    });

    it('joins a comma separated query with OR and keeps the kosher filter', function () {
        urlParams.mapMultiQuerySpeciesLayers({
            ly1: 'Acacia',
            'ly1.q': 'genus:Acacia,genus:Racosperma'
        }, 'https://biocache.test/ws', 'https://biocache.test', '-geospatial_kosher:false');

        expect(newLayerCalls.length).toBe(1);
        expect(newLayerCalls[0].query.q).toBe('genus:Acacia OR genus:Racosperma');
        expect(newLayerCalls[0].query.fq).toEqual(['-geospatial_kosher:false']);
    });

    it('ignores keys that are not species layers', function () {
        urlParams.mapMultiQuerySpeciesLayers({pid: '1234', bbox: '112,-42,154,-9'}, 'bs', 'ws');

        expect(newLayerCalls.length).toBe(0);
    });
});
