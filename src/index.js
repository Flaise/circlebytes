'use strict';

var indentation = '    ';

function serialize(data, _builder) {
    var builder = _builder;
    if (Array.isArray(builder)) {
        builder = {lines: [], nextRef: 0, refs: new Map(), transforms: _builder};
    } else if (!builder) {
        builder = {lines: [], nextRef: 0, refs: new Map(),
                   transforms: module.exports.defaultTransforms};
    }

    for (var i = 0; i < builder.transforms.length; i += 1) {
        var transform = builder.transforms[i];

        if (!transform.matches(data, builder)) continue;

        if (transform.inline) {
            return transform.serialize(data, builder);
        } else {
            var ref = '@';
            if (builder.nextRef !== 0) ref += builder.nextRef;
            builder.nextRef += 1;
            builder.refs.set(data, ref);

            var lines = transform.serialize(data, builder);

            builder.lines.push(ref + ' ' + transform.title);
            lines = lines.map(function(line) { return indentation + line; });
            builder.lines.push.apply(builder.lines, lines);

            if (_builder) {
                return ref;
            } else {
                return builder.lines.join('\n');
            }
        }
    }

    throw new Error();
}
module.exports.serialize = serialize;


function chunksOf(bytes) {
    var lines = bytes.split('\n');
    var result = [];
    var chunk;

    for (var i = 0; i < lines.length; i += 1) {
        var lineNumber = i + 1;
        var line = lines[i];
        if (!line.length) continue;

        if (line.startsWith(indentation)) {
            if (!chunk) throw new Error('Indentation error on line ' + lineNumber);

            line = line.substr(indentation.length);
            chunk.contents.push(line);
        } else {
            chunk = {};
            result.push(chunk);

            if (line[0] === '@') {
                var segments = line.split(' ');
                if (segments.length === 2) {
                    chunk.ref = segments[0];
                    chunk.title = segments[1];
                } else {
                    throw new Error('Syntax error: "' + line + '" line: ' + lineNumber);
                }
            } else {
                chunk.title = line;
            }

            chunk.contents = [];
        }
    }
    return result;
}


module.exports.deserialize = function deserialize(bytes, transforms) {
    if (!transforms) transforms = module.exports.defaultTransforms;

    var chunks = chunksOf(bytes);
    if (chunks.length === 0) throw new Error('No data.\n' + bytes);

    var refs = Object.create(null);

    chunks.forEach(function(chunk) {
        if (!chunk.ref) {
            if (chunks.length === 1) {
                chunk.ref = '@';
            } else {
                throw new Error('Refs are required when more than one object is present.\n' + bytes);
            }
        }
        chunk.object = parse(chunk, refs, transforms);
        refs[chunk.ref] = chunk.object;
    });
    if (!('@' in refs)) {
        throw new Error('Root ref must be "@" or omitted.\n' + bytes + '\n' + JSON.stringify(refs));
    }

    chunks.forEach(function(chunk) {
        unpackChunk(chunk, refs, transforms);
    });

    return refs['@'];
};


function parse(chunk, refs, transforms) {
    var title = chunk.title;

    for (var i = 0; i < transforms.length; i += 1) {
        var transform = transforms[i];

        if (transform.inline && transform.decodesInline(title, refs)) {
            return transform.constructInline(title, refs);
        }

        if (transform.title === title) {
            chunk.transform = transform;
            return transform.construct(chunk);
        }
    }

    throw new Error('No transform found for "' + chunk.title + '".');
}

function parseInline(bytes, refs, transforms) {
    for (var i = 0; i < transforms.length; i += 1) {
        var transform = transforms[i];

        if (transform.inline && transform.decodesInline(bytes, refs)) {
            return transform.constructInline(bytes, refs);
        }
    }

    throw new Error('No inline transform found for "' + chunk.title + '".');
}

function unpackChunk(chunk, refs, transforms) {
    var transform = chunk.transform;
    if (!transform || !transform.parseLine) return;

    chunk.contents
        .map(function(line) {
            return transform.parseLine(line, refs, transforms);
        }).forEach(function(element) {
            transform.fill(chunk.object, element);
        });
}

function serializePair(key, value, builder) {
    return serialize(key, builder) + ' ' + serialize(value, builder);
}


var stringReg = /^\|[^\n]*?\|/;
function parsePair(bytes, refs, transforms) {
    var key, value;

    var match = stringReg.exec(bytes);
    if (match) {
        key = match[0];

        if (bytes[key.length] !== ' ') throw new Error('Expecting key/value pair. Found: ' + bytes);

        value = bytes.substr(key.length + 1);
    } else {
        var kv = bytes.split(' ');
        if (kv.length !== 2) throw new Error('Expecting key/value pair. Found: ' + bytes);
        key = kv[0];
        value = kv[1];
    }

    key = parseInline(key, refs, transforms);
    value = parseInline(value, refs, transforms);
    return {key: key, value: value};
}


module.exports.reference = {
    inline: true,

    decodesInline: function(bytes, refs) {
        return bytes in refs;
    },
    constructInline: function(bytes, refs) {
        return refs[bytes];
    },

    matches: function(data, builder) {
        return builder.refs.has(data);
    },
    serialize: function(data, builder) {
        return builder.refs.get(data);
    },
};

function enumTransform(identifier, value) {
    return {
        inline: true,

        decodesInline: function(bytes, refs) {
            return bytes === identifier;
        },
        constructInline: function(bytes, refs) {
            return value;
        },

        matches: function(data, builder) {
            if (value !== value && data !== data) return true;
            return data === value;
        },
        serialize: function(data, builder) {
            return identifier;
        },
    };
}

module.exports.enumTrue = enumTransform('true', true);
module.exports.enumFalse = enumTransform('false', false);
module.exports.enumNull = enumTransform('null', null);
module.exports.enumUndefined = enumTransform('undefined', void 0);
module.exports.enumInfinity = enumTransform('infinity', Infinity);
module.exports.enumNegativeInfinity = enumTransform('-infinity', -Infinity);
module.exports.enumNaN = enumTransform('nan', NaN);

module.exports.number = {
    inline: true,

    decodesInline: function(bytes) {
        var parsed = parseFloat(bytes);
        if (isNaN(parsed)) return false;
        return ('' + parsed).length === bytes.length;
    },
    constructInline: function(bytes) {
        return parseFloat(bytes);
    },

    matches: function(data) {
        return Number.isFinite(data);
    },
    serialize: function(data, builder) {
        return data.toString();
    },
};

var shortTextReg = /^\|[^\n]*\|$/;
module.exports.shortText = {
    inline: true,

    decodesInline: function(bytes) {
        return shortTextReg.test(bytes);
    },
    constructInline: function(bytes) {
        return bytes.substring(1, bytes.length - 1);
    },

    matches: function(data) {
        return typeof data === 'string' && data.length < 50 && data.indexOf('\n') < 0
            && data.indexOf('|') < 0;
    },
    serialize: function(data, builder) {
        return '|' + data.toString() + '|';
    },
};

module.exports.text = {
    title: 'text',

    construct: function(chunk) {
        return chunk.contents.join('\n');
    },

    matches: function(data) {
        return typeof data === 'string';
    },
    serialize: function(data, builder) {
        return data.split('\n');
    }
};

module.exports.list = {
    title: 'list',

    construct: function(chunk) {
        return [];
    },
    parseLine: parseInline,
    fill: function(object, element) {
        object.push(element);
    },

    matches: function(data) {
        return Array.isArray(data);
    },
    serialize: function(data, builder) {
        return data.map(function(datum) {
            return serialize(datum, builder);
        });
    }
};

module.exports.hash = {
    title: 'hash',

    construct: function(chunk) {
        return new Map();
    },
    parseLine: parsePair,
    fill: function(object, element) {
        object.set(element.key, element.value);
    },

    matches: function(data) {
        return data && data.constructor === Map;
    },
    serialize: function(data, builder) {
        var lines = [];
        var entries = data.entries();
        while(true) {
            var iteration = entries.next();
            if (iteration.done) break;
            lines.push(serializePair(iteration.value[0], iteration.value[1], builder));
        }
        return lines;
    }
};

module.exports.jshash = {
    title: 'jshash',

    construct: function(chunk) {
        return {};
    },
    parseLine: parsePair,
    fill: function(object, element) {
        if (typeof element.key !== 'string') {
            throw new Error('Javascript objects do not support non-string keys. ' +
                            JSON.stringify(element.key));
        }
        object[element.key] = element.value;
    },

    matches: function(data) {
        return data && typeof data === 'object';
    },
    serialize: function(data, builder) {
        return Object.keys(data).map(function(key) {
            return serializePair(key, data[key], builder);
        });
    }
};


module.exports.defaultTransforms = Object.freeze([
    module.exports.reference,
    module.exports.enumTrue,
    module.exports.enumFalse,
    module.exports.enumNull,
    module.exports.enumUndefined,
    module.exports.enumInfinity,
    module.exports.enumNegativeInfinity,
    module.exports.enumNaN,
    module.exports.number,
    module.exports.shortText,
    module.exports.text,
    module.exports.list,
    module.exports.hash,
    module.exports.jshash,
]);
