var _undef;

// Tools
var _wrench = require('wrench');
var _fs = require('fs');
var _path = require('path');
var _unique = require('mout/array/unique');
var _isObject = require('mout/lang/isObject');
var _mixIn = require('mout/object/mixIn');
var _isFunction = require('mout/lang/isFunction');
var _contains = require('mout/array/contains');
var _reject = require('mout/array/reject');
var _map = require('mout/array/map');
var _trim = require('mout/string/trim');
var _bind = require('mout/function/bind');
var _interpolate = require('mout/string/interpolate');

var INCLUDE_LIST = [
    'threejs/utils/build/includes/math.json',
    'threejs/utils/build/includes/extras.json',
    'threejs/utils/build/includes/common.json'
];


var self = {}; // This is used in THREE.js

var _maps = {};
var _extraMaps = {};
var _allMaps = {};

var SRC_DIR = './threejs/src/';
var DIST_DIR = './dist/';
var BUILD_SRC_PATH = './threejs/build/three.min.js';
var REPORT_PATH = './report.html';

var TRY_ADDING_FURTHER_DEPENDENCIES = true;

var SHADOW_THREE = {};

var _globalCalledProperties = [];

var _classOrders = {};
var _mapList = [];

function init() {
    _generateClassOrderList();
    _loadBuiltTHREE();
    _addModulesToMap();
    _maps.THREE = _maps.Three;
    _maps.THREE.name = 'THREE';
    delete _maps.Three;
    _mixIn(_allMaps, _maps);

    _findDependencies();
    _output();
    _generateReport();
}

// use the json file list as the dependency order.
function _generateClassOrderList() {
    var fileList = [];
    var added = {};
    var className;
    var filePath;
    var orderIndex = 0;
    for(var i = 0, len = INCLUDE_LIST.length; i < len; i++) {
        var includePath = INCLUDE_LIST[i];
        var list = JSON.parse(_fs.readFileSync(includePath, 'utf8'));
        for(var j = 0, len2 = list.length; j < len2; j++) {
            filePath = list[j];
            className = filePath.substring(filePath.lastIndexOf('/') + 1, filePath.lastIndexOf('.js'));
            if(!added[className]) {
                added[className] = true;
                _classOrders[className] = orderIndex;
                orderIndex++;
            }
        }
    }
}

// load the built THREE js file and create getter/setter for its root properties.
function _loadBuiltTHREE() {
    var _THREE;
    eval(_fs.readFileSync(BUILD_SRC_PATH, 'utf8') + ';_THREE=THREE;');
    for(var property in _THREE) {
        var ref = _THREE[property];
        SHADOW_THREE.__defineGetter__(property, _bind(_hijackTHREEProperty, SHADOW_THREE, property, ref));
        SHADOW_THREE.__defineSetter__(property, function(){});
    }
}

function _hijackTHREEProperty(property, ref) {
    _globalCalledProperties.push(property);
    return ref;
}

function _addModuleToMap(filePath, modulePath){
    moduleName = modulePath.substr(modulePath.lastIndexOf('\\') + 1);
    _maps[moduleName] = {
        name: moduleName,
        path: modulePath.replace(/\\/g, '/'),
        filePath: filePath.replace(/\\/g, '/'),
        extraModules: [], // for test if there are more than one module defined in one file
        softDependencies: [],
        allDependencies: [],
        dependedBy: [],
        missingDepencencies: []
    };
    if(moduleName === 'Three') moduleName = 'THREE';
    _mapList.push(moduleName);
}

function _addModulesToMap() {
    // list all files
    var i, j, len;
    var filePathList = _wrench.readdirSyncRecursive(SRC_DIR);
    var filePath, moduleName;
    i = filePathList.length;
    while(i--) {
        filePath = filePathList[i];
        filePath.replace(/^(.*).js$/, _addModuleToMap);
    }

    _mapList.sort(function(a, b){
        return _classOrders[a] - _classOrders[b];
    });
}

function _findDependencies() {
    var i, j, len, moduleName, mapData, softDependencies;
    for(i = 0, len = _mapList.length; i < len; i++) {
        moduleName = _mapList[i];
        mapData = _maps[moduleName];
        mapData.content = _fs.readFileSync(SRC_DIR + mapData.filePath, 'utf8');
        mapData.noCommentContent = _removeComments(mapData.content);
        mapData.noCommentContent.replace(/THREE\.([^ (){};.,|\[\]\?:\/\<\>\'\"\n\r]+)\s?=/g, function(match, matchedModuleName) {
            matchedModuleName = _trim(matchedModuleName);
            if(!_maps[matchedModuleName]) {
                mapData.extraModules.push(matchedModuleName);
                _extraMaps[matchedModuleName] = mapData;
                _allMaps[matchedModuleName] = mapData;
            }
        });
        mapData.extraModules = _unique(mapData.extraModules);
    }
    for(i = 0, len = _mapList.length; i < len; i++) {
        moduleName = _mapList[i];
        mapData = _maps[moduleName];
        // dependencies = [];
        mapData.noCommentContent.replace(/THREE\.([^ (){};.,|\[\]\?:\/\<\>\'\"\n\r]+)/g, function(match, matchedModuleName) {
            matchedModuleName = _trim(matchedModuleName);

            // Found module is not the module itself
            if(matchedModuleName !== moduleName) {

                // If it depends on its self extra module, ignore it

                if(!_contains(mapData.extraModules, matchedModuleName)) {
                    if(!_allMaps[matchedModuleName]) {
                        mapData.missingDepencencies.push(matchedModuleName);
                    } else {
                        mapData.allDependencies.push(_extraMaps[matchedModuleName] ? _extraMaps[matchedModuleName].name : matchedModuleName);
                    }
                }
            }
        });
        _globalCalledProperties = [];
        var THREE = SHADOW_THREE;

        // use eval to check what module was actually called when the module is required.
        if(moduleName !== 'THREE') {
            eval(mapData.content);
            mapData.dependencies = _unique(_globalCalledProperties);
            mapData.dependencies.unshift('THREE');
        }

        mapData.dependencies = _reject(mapData.dependencies, function(dependency){
            return dependency === moduleName || _contains(mapData.extraModules, dependency);
        });

        allDependencies = _unique(mapData.allDependencies);
        mapData.softDependencies = _reject(_unique(mapData.allDependencies), function(dependency) {
            return _contains(mapData.dependencies, dependency);
        });
        mapData.missingDepencencies = _unique(mapData.missingDepencencies);
    }

    // //get dependedBy from out soft dependencies
    // for(i = 0, len = _mapList.length; i < len; i++) {
    //     moduleName = _mapList[i];
    //     mapData = _maps[moduleName];
    //     softDependencies = mapData.softDependencies;
    //     j = softDependencies.length;
    //     while(j--) {
    //         _mapList[mapData.softDependencies[j]].dependedBy.push(moduleName);
    //     }
    // }


    // will need better logic for this.
    if(TRY_ADDING_FURTHER_DEPENDENCIES) {

        for(i = 0, len = _mapList.length; i < len; i++) {
            moduleName = _mapList[i];
            mapData = _maps[moduleName];
            softDependencies = mapData.softDependencies;
            j = softDependencies.length;
            while(j--) {
                if(!testDependencyTraceBack(softDependencies[j], moduleName, {})) {
                    mapData.dependencies.push(softDependencies[j]);
                    softDependencies.splice(j, 1);
                }
            }

        }

    }

}

// function to test if the dependency will trace it back to the module itself
function testDependencyTraceBack(moduleName, originalModuleName, checkedList) {
    var result, dependency;
    var mapData = _maps[moduleName];
    var allDependencies = mapData.allDependencies;
    for(var i in allDependencies) {
        dependency = allDependencies[i];

        if(!checkedList[dependency]) {
            checkedList[dependency] = true;

            // if(dependency == toModuleName) {
            //     return 1;
            // }
            if(dependency == originalModuleName) {
                return true;
            }

            result = testDependencyTraceBack(dependency, originalModuleName, checkedList);
            if(result) {
                return result;
            }
        }
    }
    return false;
}



function _generateReport() {
    var html = '<html><head><style>body{font-family:"Trebuchet MS",Helvetica,sans-serif;}</style></head><body>';
    var mapData, i, len;
    for(i = 0, len = _mapList.length; i < len; i++) {
        moduleName = _mapList[i];
        mapData = _maps[moduleName];
        html += '<h2>- ' + moduleName + '</h2>';
        html += '<ul>';
        html += '<li>Module Path: ' + mapData.path + '</li>';
        html += '<li>File Path: ' + mapData.filePath + '</li>';
        // if(mapData.extraModules.length > 0) {
            html += '<li>Extra modules: ' + mapData.extraModules.join(', ') + '</li>';
        // }
        // if(mapData.dependencies.length > 0) {
            html += '<li>Dependencies: ' + mapData.dependencies.join(', ') + '</li>';
        // }
        // if(mapData.softDependencies.length > 0) {
            html += '<li>Soft dependencies: ' + mapData.softDependencies.join(', ') + '</li>';
        // }
        // if(mapData.missingDepencencies.length > 0) {
            html += '<li>Missing dependencies: ' + mapData.missingDepencencies.join(', ') + '</li>';
        // }
        html += '</ul>';
        if(i < len - 1) {
            html += '<hr/>';
        }
    }
    html += '</body></html>';
    _fs.writeFileSync(REPORT_PATH, html, 'utf8');
}


function _output() {
    var moduleName, mapData, dependencyMapData;
    var wrapBeginSource = _fs.readFileSync('wrap_begin.txt', 'utf8');
    var wrapEndSource = _fs.readFileSync('wrap_end.txt', 'utf8');
    var modulePath, relativePath, wrapBegin, wrapEnd, content, modulePaths, moduleNames;


    if (_fs.existsSync(DIST_DIR)) {
        _wrench.rmdirSyncRecursive(DIST_DIR);
    }
    for(var i = 0, len = _mapList.length; i < len; i++) {
        moduleName = _mapList[i];
        mapData = _maps[moduleName];
        modulePath = mapData.path;
        content = mapData.content;
        modulePaths = [];
        moduleNames = [];

        _map(mapData.dependencies, function(dependency) {
            dependencyMapData = _allMaps[dependency];
            if(dependencyMapData) {
                relativePath = _path.relative(_path.dirname(modulePath), dependencyMapData.path).replace(/\\/g, '/');
                if(relativePath.indexOf('..') !== 0) {
                    relativePath = './' + relativePath;
                }
                modulePaths.push('\'' + relativePath + '\'');
                moduleNames.push(dependencyMapData.name === 'THREE' ? 'THREE' : 'THREE_' + dependencyMapData.name);

                if(dependencyMapData.name !== 'THREE') {
                    var regex = new RegExp('(THREE\\.' + dependencyMapData.name + ')(\\W+)', 'g');
                    content = content.replace(regex, function(a, b, c){return 'THREE_' + dependencyMapData.name + c;});
                }
            }
        });

        wrapBegin = _interpolate(wrapBeginSource, {
            module_paths: modulePaths.join(', '),
            module_names: moduleNames.join(', ')
        });

        wrapEnd = _interpolate(wrapEndSource, {
            module_name: moduleName === 'THREE' ? 'THREE' : 'THREE.' + moduleName
        });

        // mapData.extraModules = _unique(mapData.extraModules);
        _wrench.mkdirSyncRecursive(_path.dirname(DIST_DIR + mapData.filePath), 0777);
        _fs.writeFileSync(DIST_DIR + mapData.filePath, wrapBegin + content + wrapEnd, 'utf8');
    }
}



// http://james.padolsey.com/javascript/removing-comments-in-javascript/
function _removeComments(str) {
    str = ('__' + str + '__').split('');
    var mode = {
        singleQuote: false,
        doubleQuote: false,
        regex: false,
        blockComment: false,
        lineComment: false,
        condComp: false
    };
    for (var i = 0, l = str.length; i < l; i++) {

        if (mode.regex) {
            if (str[i] === '/' && str[i-1] !== '\\') {
                mode.regex = false;
            }
            continue;
        }

        if (mode.singleQuote) {
            if (str[i] === "'" && str[i-1] !== '\\') {
                mode.singleQuote = false;
            }
            continue;
        }

        if (mode.doubleQuote) {
            if (str[i] === '"' && str[i-1] !== '\\') {
                mode.doubleQuote = false;
            }
            continue;
        }

        if (mode.blockComment) {
            if (str[i] === '*' && str[i+1] === '/') {
                str[i+1] = '';
                mode.blockComment = false;
            }
            str[i] = '';
            continue;
        }

        if (mode.lineComment) {
            if (str[i+1] === '\n' || str[i+1] === '\r') {
                mode.lineComment = false;
            }
            str[i] = '';
            continue;
        }

        if (mode.condComp) {
            if (str[i-2] === '@' && str[i-1] === '*' && str[i] === '/') {
                mode.condComp = false;
            }
            continue;
        }

        mode.doubleQuote = str[i] === '"';
        mode.singleQuote = str[i] === "'";

        if (str[i] === '/') {

            if (str[i+1] === '*' && str[i+2] === '@') {
                mode.condComp = true;
                continue;
            }
            if (str[i+1] === '*') {
                str[i] = '';
                mode.blockComment = true;
                continue;
            }
            if (str[i+1] === '/') {
                str[i] = '';
                mode.lineComment = true;
                continue;
            }
            mode.regex = true;

        }

    }
    return str.join('').slice(2, -2);
}


init();
