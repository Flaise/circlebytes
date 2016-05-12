'use strict';
var assert = require('power-assert');
var util = require('util');
var circlebytes = require('../src');
var serialize = circlebytes.serialize;
var deserialize = circlebytes.deserialize;

var enums = [
    true,
    false,
    null,
    undefined,
    Infinity,
    -Infinity,
    NaN,
];

var trees = [
    0,
    1,
    -1,
    1.5,
    -1.5,
    1e9000,
    -1e9000,
    1/2/2/2/2/2/2/2/2/2/2/2,

    '',
    'asdf',
    'qwer',
    'qwer\n',
    '"',
    "'",
    '""',
    '"oiuoi"',
    '1',
    '0',
    '-1',
    'NaN',
    '\n',
    '\nzxvc',
    'a\nb\nc',
    '@',
    '@1',
    '@1234',
    '#',
    '#29',
    '#-29',
    '#undefined',
    '#true',
    '#\n',
    '#\na',
    'a\n#',
    '\na#',
    '\na # r',
    '|',
    '->',
    '||',
    '|r|',
    ' |r|',
    '|r| ',
    ' | r | ',
    '-',
    ' ',
    '  ',
    '   ',
    '    ',
    '    \n',
    '~',
    '~~',
    '!',
    '`',
    '<',
    '>',
    '/',
    '\\',
    '{',
    '}',
    '{}',
    '-',
    '--',
    '_',
    '__',
    '+',
    '=',
    '(',
    ')',
    '()',
    '[',
    ']',
    '[]',
    '*',
    '&',
    '^',
    '%',
    '$',
    ';',
    ':',
    '.',
    ',',
    '?',

    [],
    [1],
    [2],
    [1, 2],
    ['a', 'b'],

    {},
    {'a': 1},
    {'b': 'r'},

    {a: []},
    {b: [{}, null]},
    [{a: 2}, {r: 'b'}],
    {'': 1},
    {' ': 2},
    {' \n ': 3},
    {' a ': ' b '},
    {'|qwer|': 9},
    {r: ' r '},

    [{'a': 'asdf\nqwer'}, {'d': [], 3: 80, 4: 'z'}, 'r', 'asdf\nqwer'],

    new Map(),
    new Map([['a', 1]]),
    new Map([[{}, 2]]),
    new Map([[{a: 1}, {b: 2}]]),

    [new Map([['a', 'asdf\nqwer']]), new Map([[new Map(), []], [3, 80], [4, 'z']]), 'r',
     'asdf\nqwer'],

    [undefined, null, Infinity],
    {a: undefined, b: null, c: Infinity},
    new Map([[undefined, 1], [null, 2], [Infinity, 3]]),
];
trees = trees.concat(enums);


suite('Trees');

trees.forEach(function(data, index) {
    test(util.inspect(data) + ' (' + index + ')', function() {
        var serialization = serialize(data);
        var deserialization = deserialize(serialization);

        assert(typeof serialization === 'string');
        assert(typeof deserialization === typeof data);

        if (deserialization != null) {
            assert(deserialization.constructor === data.constructor);
        }

        if (! /\\n/.test(JSON.stringify(data))) {
            // No empty lines unless there was a newline in the input data.
            var lines = serialization.split('\n');
            lines.forEach(function(line, index) {
                assert(line.length, '(' + index + ') ' + JSON.stringify(data) + '\n' + serialization);
            });
        }

        if (data !== data) {
            assert(deserialization !== deserialization);
        } else {
            assert.deepEqual(deserialize(serialize(data)), data);
        }
    });
});


function countSubstring(str, substring) {
	var matches = str.match(new RegExp(substring, 'g'));
	return matches? matches.length: 0;
}

test('Long string reuse', function() {
    var result = serialize({a: 'qwer\nasdf', b: 'qwer\nasdf'});
    assert(countSubstring(result, 'qwer') === 1);
    assert(countSubstring(result, 'asdf') === 1);
});


suite('Circular Graphs');

test('Recursive hash', function() {
    var a = {};
    a.a = a;

    var result = deserialize(serialize(a));

    assert(result.a === result);
});

test('Two hashes', function() {
    var a = {};
    var b = {r: a};
    a.s = b;

    var result = deserialize(serialize(a));

    assert(result.s.r === result);
    assert(result.s.r.s === result.s);

    result = deserialize(serialize(b));

    assert(result.r.s === result);
    assert(result.r.s.r === result.r);
});

test('Recursive array', function() {
    var a = [];
    a.push(a);

    var result = deserialize(serialize(a));

    assert(Array.isArray(result));
    assert(result[0] === result);
});

test('Two arrays', function() {
    var a = [];
    var b = [a];
    a.push(b);

    var result = deserialize(serialize(a));
    assert(Array.isArray(result));

    assert(result[0][0] === result);
    assert(result[0][0][0] === result[0]);

    result = deserialize(serialize(b));

    assert(result[0][0] === result);
    assert(result[0][0][0] === result[0]);
});

test('Recursive map', function() {
    var a = new Map();
    a.set('a', a);

    var result = deserialize(serialize(a));
    assert(result && result.constructor === Map);

    assert(result.get('a') === result);
});

test('Two maps', function() {
    var a = new Map();
    var b = new Map().set(3, a);
    a.set(4, b);

    var result = deserialize(serialize(a));
    assert(result && result.constructor === Map);

    assert(result.get(4).get(3) === result);
    assert(result.get(4).get(3).get(4) === result.get(4));

    result = deserialize(serialize(b));

    assert(result.get(3).get(4) === result);
    assert(result.get(3).get(4).get(3) === result.get(3));
});


suite('Unparsable');

var unparsables = [
    '&',
    '@',
    '@1 list',
    '',
    '\n',
    '\n\n',
    ' ',
    '  ',
    '   ',
    '    ',
    '1\n2',
    'jshash\n    1 2',
    'hash\n    1',
    'hash\n    1 2 3',
    'hash 1',
    '@ hash 1',
    'wat',
    'list\n 1',
    ' list',
    'list ',
    'list hash',
    '@ list hash',
    '@ hash\n    12',
    '@ hash\n    |1|2',
    '@ hash\n    1|2|',
    '@ hash\n    |1||2|',
    '@ hash\n    |a||b|',
    '1|2|',
    '|2|1',
    '|a||b|',
    '|a|b|',
    ' 1',
    '  2',
    '   3',
    '    4',
    '@ list\n    1 2',
    '@ list\n    @3',
    '@ hash\n    @3 4',
    '@ jshash\n    1',
    '@ jshash\n    1 2 3',
    '#c',
    '1#c',
    '@ text\n    a\n # r',
    '@ text\n    a\n  # r',
];

unparsables.forEach(function(unparsable) {
    test('"' + unparsable + '"', function() {
        try {
            var result = deserialize(unparsable);
        } catch(err) {
            return;
        }
        throw new Error('Missing expected exception. Returned: ' + util.inspect(result));
    });
});

test('No transforms', function() {
    assert.throws(function() {
        deserialize('1', []);
    });
});

test('No inline transforms', function() {
    assert.throws(function() {
        deserialize('@ list\n    1', [circlebytes.list]);
    });
});


suite('Unserializables');

test('No transforms', function() {
    assert.throws(function() {
        serialize(1, []);
    });
});


suite('Short strings');

var shortStrings = [
    'a',
    '1',
    'd',
    'nnnnnn',
    'askdfjhasldkjfhalksj',
    'SDKgkfjshkj#@I*F&(SD&F',
    '',
    '"',
    "'",
    '""',
    '"asdf"',
    "'asdf'",
    ' ',
    'a a',
    ' r ',
];

shortStrings.forEach(function(st) {
    test('"' + st + '"', function() {
        assert(serialize(st) === '|' + st + '|');
    });
});


suite('Parsables');

var parsables = [
    ['@ text\n    r\n\n    r', 'r\n\nr'],
    ['@ text\n', ''],
    ['@ text\n    r\n', 'r'],
    ['\n1', 1],
    ['1\n', 1],
    ['\n1\n', 1],
    ['@ jshash\n    |a| @1\n\n@1 text\n    asdf\n\n', {a: 'asdf'}],
    ['1 #', 1],
    ['2 #asdf', 2],
    ['3 # asdf wewefsdf', 3],
    ['#asdf\n4', 4],
    ['5\n#asdf', 5],
    ['@ hash #r\n    #b\n    1 2', new Map([[1, 2]])],
    ['##\n6', 6],
    ['7 ##', 7],
    ['8 # #', 8],
    ['9 # a#', 9],
    ['#\n10', 10],
    ['@ text\n    a\n# r', 'a'],
    ['@ text\n    a\n    # r', 'a\n# r'],
];

parsables.forEach(function(pair) {
    var parsable = pair[0];
    var expectation = pair[1];
    test('"' + parsable + '"', function() {
        assert.deepEqual(deserialize(parsable), expectation);
    });
});
