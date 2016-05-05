'use strict';
var assert = require('power-assert');
var circlebytes = require('../src');
var serialize = circlebytes.serialize;
var deserialize = circlebytes.deserialize;


var enums = [true, false, null, undefined, NaN, Infinity, -Infinity];

var primitives = enums.slice();
for (var i = -10; i <= 10; i += 1) {
    primitives.push(i);
}
primitives = primitives.concat([.25, 1.25, -.75]);

var allTypes = primitives.concat([{}, [], {a: 2}, 'qwer']);

var strings = ['', 'asdf', 'qwer', 'qwer\n', '"', "'", '""', '"oiuoi"', '1', '0', '-1', 'NaN', '\n',
               '\nzxvc', 'a\nb\nc', '@', '#', '@1234', '#29', '#undefined', '#true'];


suite('Serialization');

test('Returns a string', function() {
    allTypes.forEach(function(data) {
        var bytes = serialize(data);
        assert(typeof bytes === 'string', JSON.stringify(data));
    });
});


suite('Primitives');

primitives.forEach(function(data) {
    test(data, function() {
        if (data !== data) {
            var result = deserialize(serialize(data));
            assert(result !== result);
        } else {
            assert(data === deserialize(serialize(data)));
        }
    });
});


suite('Structures');

test('empty object', function() {
    assert.deepEqual(deserialize(serialize({})), {});
});

test('empty array', function() {
    assert.deepEqual(deserialize(serialize([])), []);
});

test('empty string', function() {
    assert.deepEqual(deserialize(serialize('')), '');
});


suite('Strings');

strings.forEach(function(data) {
    test('"' + data + '"', function() {
        assert(data === deserialize(serialize(data)));
    });
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
