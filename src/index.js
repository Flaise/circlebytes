'use strict';

var defaultContext = Object.freeze({
    '#true': true,
    '#false': false,
    '#null': null,
    '#undefined': undefined,
    '#nan': NaN,
    '#infinity': Infinity,
    '#-infinity': -Infinity,
});

module.exports.serialize = function serialize(data, context) {
    if (arguments.length < 2) context = defaultContext;

    for (var key in context) {
        if (context[key] === data) return key;

        if (context[key] !== context[key] && data !== data) return key;
    }
    if (Number.isFinite(data)) {
        return '#' + data;
    }

    if (Array.isArray(data)) {
        return 'list';
    }
    if (typeof data === 'string') {
        return 'text\n' + data;
    }
    if (data && typeof data === 'object') {
        return 'hash';
    }

    throw new Error('No context for "' + data + '".');
};

module.exports.deserialize = function deserialize(bytes, context) {
    if (arguments.length < 2) context = defaultContext;

    if (Object.hasOwnProperty.call(context, bytes)) {
        return context[bytes];
    }

    var lines = bytes.split('\n');
    var header = lines.shift();

    if (header[0] === '#') {
        var number = parseFloat(header.substr(1));
        if (!isNaN(number)) return number;
    }

    if (header === 'hash') {
        return {};
    }
    if (header === 'list') {
        return [];
    }
    if (header === 'text') {
        return lines.join('\n');
    }

    throw new Error('No context for "' + bytes + '".');
};
