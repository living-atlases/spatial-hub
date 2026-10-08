// Test harness for loading AngularJS factory/service files without a browser or Angular runtime.
//
// AngularJS source files in this project are IIFEs of the form
//   (function (angular) { angular.module(name, deps).factory(name, [..deps.., fn]); }(angular));
// This harness loads such a file in a `vm` sandbox with a stubbed `angular` that captures every
// .factory/.service/.value/.constant registration, so a pure factory can then be instantiated by
// resolving its injectable dependency names against a caller-supplied map of mocks.
//
// It supports only the subset of the Angular module API these files use; .directive/.controller/
// .filter/.config/.run/.component are accepted (so loading does not throw) but not instantiated.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REGISTER_METHODS = ['factory', 'service', 'provider'];
const VALUE_METHODS = ['value', 'constant'];
// Accepted but ignored (return the module for chaining) so files that also register these still load.
const IGNORED_METHODS = ['directive', 'controller', 'filter', 'animation', 'component', 'run', 'config', 'decorator'];

/**
 * Load an Angular service/factory file in a sandbox and capture its registrations.
 *
 * @param {string} filePath absolute path to the .js file
 * @param {object} globals extra sandbox globals the file expects (e.g. {$SH: {...}, $: {...}})
 * @returns {{registrations: object, sandbox: object, modules: object}}
 *   registrations maps componentName -> descriptor {type, name, deps, fn} or {type, name, value}.
 */
function loadAngularModule(filePath, globals = {}) {
    const registrations = {};
    const modules = {};

    function makeModule(name, requires) {
        const mod = {name: name, requires: requires || []};

        REGISTER_METHODS.forEach(function (type) {
            mod[type] = function (compName, def) {
                let deps = [];
                let fn = def;
                if (Array.isArray(def)) {
                    fn = def[def.length - 1];
                    deps = def.slice(0, -1);
                }
                registrations[compName] = {type: type, name: compName, deps: deps, fn: fn};
                return mod;
            };
        });

        VALUE_METHODS.forEach(function (type) {
            mod[type] = function (compName, value) {
                registrations[compName] = {type: type, name: compName, value: value};
                return mod;
            };
        });

        IGNORED_METHODS.forEach(function (m) {
            mod[m] = function () { return mod; };
        });

        return mod;
    }

    const angular = {
        module: function (name, requires) {
            // With `requires` this is a definition; without, a getter. Either way return a stub.
            const mod = modules[name] || makeModule(name, requires);
            modules[name] = mod;
            return mod;
        },
        isArray: Array.isArray,
        isDefined: function (v) { return typeof v !== 'undefined'; },
        isObject: function (v) { return v !== null && typeof v === 'object'; },
        forEach: function (obj, iterator) {
            if (Array.isArray(obj)) { obj.forEach(iterator); }
            else { Object.keys(obj || {}).forEach(function (k) { iterator(obj[k], k); }); }
        },
        extend: Object.assign,
        copy: function (v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
    };

    const sandbox = Object.assign({
        angular: angular,
        console: console,
        Math: Math, Number: Number, Date: Date, JSON: JSON, RegExp: RegExp,
        Array: Array, Object: Object, String: String, Boolean: Boolean, Error: Error,
        parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite,
        encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent
    }, globals);

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(filePath, 'utf8'), sandbox, {filename: path.basename(filePath)});

    return {registrations: registrations, sandbox: sandbox, modules: modules};
}

/**
 * Instantiate a captured factory/service by resolving its dependencies from `mocks`.
 *
 * @param {object} registrations from loadAngularModule
 * @param {string} name component name to instantiate
 * @param {object} mocks map of dependencyName -> mock value
 * @returns the factory's return value (or constructed service / stored value)
 */
function instantiate(registrations, name, mocks = {}) {
    const reg = registrations[name];
    if (!reg) {
        throw new Error('No registration named "' + name + '". Have: ' + Object.keys(registrations).join(', '));
    }
    if (reg.type === 'value' || reg.type === 'constant') {
        return reg.value;
    }
    const args = (reg.deps || []).map(function (dep) {
        if (!Object.prototype.hasOwnProperty.call(mocks, dep)) {
            throw new Error('Missing mock for dependency "' + dep + '" of "' + name + '"');
        }
        return mocks[dep];
    });
    if (reg.type === 'service') {
        return new reg.fn(...args);
    }
    return reg.fn.apply(null, args);
}

/** Convenience: load a file and instantiate one component in a single call. */
function loadFactory(filePath, name, mocks = {}, globals = {}) {
    const {registrations} = loadAngularModule(filePath, globals);
    return instantiate(registrations, name, mocks);
}

module.exports = {loadAngularModule: loadAngularModule, instantiate: instantiate, loadFactory: loadFactory};
