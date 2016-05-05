'use strict';
var assert = require('power-assert');
var something = require('../src');


suite('Something');

test('func', function() {
    assert(something.func(1) === 2);
});

test('func - 2', function() {
    assert(4 === something.func(3));
});
