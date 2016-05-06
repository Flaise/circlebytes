'use strict';
var assert = require('power-assert');
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
    '#',
    '@1234',
    '#29',
    '#undefined',
    '#true',

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

    [{'a': 'asdf\nqwer'}, {'d': [], 3: 80, 4: 'z'}, 'r', 'asdf\nqwer']
];
trees = trees.concat(enums);


suite('Trees');

trees.forEach(function(data) {
    test(JSON.stringify(data), function() {
        assert(typeof serialize(data) === 'string');

        assert.deepEqual(deserialize(serialize(data)), data);
    });
});

test('NaN', function() {
    var result = deserialize(serialize(NaN));
    assert(result !== result);
});


function countSubstring(str, subStr){
	var matches = str.match(new RegExp(subStr, 'g'));
	return matches? matches.length: 0;
}

test('Long string reuse', function() {
    var result = serialize({a: 'qwer\nasdf', b: 'qwer\nasdf'});
    assert(countSubstring(result, 'qwer') === 1);
    assert(countSubstring(result, 'asdf') === 1);
});


suite('Custom Context');

test('Serializing unhandled enum values', function() {
    enums.forEach(function(data) {
        assert.throws(function() {
            serialize(data, {});
        });
    });
});

test('Deserializing unhandled enum values', function() {
    enums.forEach(function(data) {
        assert.throws(function() {
            deserialize(serialize(data), {});
        });
    });
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

    assert(result[0][0] === result);
    assert(result[0][0][0] === result[0]);

    result = deserialize(serialize(b));

    assert(result[0][0] === result);
    assert(result[0][0][0] === result[0]);
});

