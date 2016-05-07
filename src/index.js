'use strict';

var indentation = '    ';

var defaultContextSerialize = new Map()
    .set(true, 'true')
    .set(false, 'false')
    .set(null, 'null')
    .set(void 0, 'undefined')
    .set(NaN, 'nan')
    .set(Infinity, 'infinity')
    .set(-Infinity, '-infinity');

var defaultContextDeserialize = {
    true: true,
    false: false,
    null: null,
    undefined: void 0,
    nan: NaN,
    infinity: Infinity,
    '-infinity': -Infinity,
};


function copyMap(source) {
    var result = new Map();
    var entries = source.entries();
    while (true) {
        var iteration = entries.next();
        if (iteration.done) return result;
        result.set(iteration.value[0], iteration.value[1]);
    }
}


function build(data, builder) {
    for (var i = 0; i < transforms.length; i += 1) {
        var transform = transforms[i];

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
            return ref;
        }
    }

    throw new Error();
}

function buildPair(key, value, builder) {
    return build(key, builder) + ' ' + build(value, builder);
}


module.exports.serialize = function serialize(data, context) {
    if (arguments.length < 2) context = defaultContextSerialize;
    var builder = {lines: [], nextRef: 0, refs: copyMap(context)};

    var inlinement = build(data, builder);
    if (builder.nextRef === 0) return inlinement;
    return builder.lines.join('\n');
};


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

            if (line.startsWith(' ')) {
                throw new Error('Line ' + lineNumber + ' must be indented 0 or 4 spaces.\n' + bytes);
            }

            chunk.contents.push(line);
        } else {
            chunk = {};
            result.push(chunk);

            var segments = line.trim().split(' ');
            if (segments.length === 1) {
                chunk.title = segments[0];
            } else if (segments.length === 2) {
                chunk.ref = segments[0];
                chunk.title = segments[1];
            } else {
                throw new Error('Syntax error: "' + line + '" line: ' + lineNumber);
            }

            chunk.contents = [];
        }
    }
    return result;
}


module.exports.deserialize = function deserialize(bytes, context) {
    if (arguments.length < 2) context = defaultContextDeserialize;

    var chunks = chunksOf(bytes);
    if (chunks.length === 0) throw new Error('No data.\n' + bytes);

    var refs = Object.create(context);

    chunks.forEach(function(chunk) {
        if (!chunk.ref) {
            if (chunks.length === 1) {
                chunk.ref = '@';
            } else {
                throw new Error('Refs are required when more than one object is present.\n' + bytes);
            }
        }

        for (var i = 0; i < transforms.length; i += 1) {
            var transform = transforms[i];

            if (transform.inline && transform.decodesInline(chunk.title, refs)) {
                chunk.object = transform.constructInline(chunk.title, refs);
                refs[chunk.ref] = chunk.object;
                return;
            }
            if (transform.title === chunk.title) {
                chunk.object = transform.construct(chunk);
                chunk.transform = transform;
                refs[chunk.ref] = chunk.object;
                return;
            }
        }

        throw new Error('No transform found for "' + chunk.title + '".\n' + bytes);
    });
    if (!('@' in refs)) {
        throw new Error('Root ref must be "@" or omitted.\n' + bytes + '\n' + JSON.stringify(refs));
    }

    chunks.forEach(function(chunk) {
        var transform = chunk.transform;
        if (!transform || !transform.parseLine) return;

        chunk.contents
            .map(function(line) {
                return transform.parseLine(line, refs);
            }).forEach(function(element) {
                transform.fill(chunk.object, element);
            });
    });

    return refs['@'];
};


function parse(bytes, refs) {
    for (var i = 0; i < transforms.length; i += 1) {
        var transform = transforms[i];

        if (transform.inline && transform.decodesInline(bytes, refs)) {
            return transform.constructInline(bytes, refs);
        }
    }

    throw new Error('No transform found for ' + bytes);
}

function parsePair(bytes, refs) {
    var kv = bytes.split(' ');
    if (kv.length !== 2) {
        throw new Error('Expecting key/value pair. Found: ' + bytes + '\n>>>\n' + bytes);
    }
    var key = parse(kv[0], refs);
    var value = parse(kv[1], refs);
    return {key: key, value: value};
}


var transforms = [];


transforms.push({
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
});


transforms.push({
    inline: true,

    decodesInline: function(bytes) {
        return !isNaN(parseFloat(bytes));
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
});

transforms.push({
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
});

transforms.push({
    title: 'list',

    construct: function(chunk) {
        return [];
    },
    parseLine: parse,
    fill: function(object, element) {
        object.push(element);
    },

    matches: function(data) {
        return Array.isArray(data);
    },
    serialize: function(data, builder) {
        return data.map(function(datum) {
            return build(datum, builder);
        });
    }
});

transforms.push({
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
            lines.push(buildPair(iteration.value[0], iteration.value[1], builder));
        }
        return lines;
    }
});

transforms.push({
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
            return buildPair(key, data[key], builder);
        });
    }
});
