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

    [],
    [1],
    [2],
    [1, 2],
    ['a', 'b'],

    {},

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
    '#true'
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
