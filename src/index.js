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

var defaultContextDeserialize = new Map()
    .set('true', true)
    .set('false', false)
    .set('null', null)
    .set('undefined', void 0)
    .set('nan', NaN)
    .set('infinity', Infinity)
    .set('-infinity', -Infinity);


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
    if (builder.refs.has(data)) return builder.refs.get(data);

    for (var i = 0; i < transforms.length; i += 1) {
        var transform = transforms[i];

        if (!transform.matches(data)) continue;

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

    if (context.has(data)) return context.get(data);

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

    var refs = Object.create(null);
    var chunks = chunksOf(bytes);

    if (chunks.length === 0) throw new Error('No data.\n' + bytes);
    if (chunks.length === 1 && context.has(chunks[0].title)) return context.get(chunks[0].title);

    chunks.forEach(function(chunk) {
        if (!chunk.ref) {
            if (chunks.length === 1) {
                chunk.ref = '@';
            } else {
                throw new Error('Refs are required when more than one object is present.\n' + bytes);
            }
        }
        refs[chunk.ref] = chunk;

        for (var i = 0; i < transforms.length; i += 1) {
            var transform = transforms[i];

            if ((transform.decodes && transform.decodes(chunk)) || transform.title === chunk.title) {
                chunk.object = transform.construct(chunk);
                chunk.transform = transform;
                return;
            }
        }

        throw new Error('No transform found for "' + chunk.title + '".\n' + bytes);
    });
    if (!refs['@']) throw new Error('Root ref must be "@" or omitted.\n' + bytes);

    chunks.forEach(function(chunk) {
        var transform = chunk.transform;
        if (!transform || !transform.parseLine) return;

        var elements = chunk.contents.map(function(line) {
            return transform.parseLine(line, context, refs);
        });

        if (!transform.fill) return;
        elements.forEach(function(element) {
            transform.fill(chunk.object, element);
        });
    });

    return refs['@'].object;
};


function parse(bytes, context, refs) {
    var target = refs[bytes];
    if (target) return target.object;

    if (context.has(bytes)) return context.get(bytes);

    var number = parseFloat(bytes);
    if (!isNaN(number)) return number;

    throw new Error();
}

function parsePair(bytes, context, refs) {
    var kv = bytes.split(' ');
    if (kv.length !== 2) {
        throw new Error('Expecting key/value pair. Found: ' + bytes + '\n>>>\n' + bytes);
    }
    var key = parse(kv[0], context, refs);
    var value = parse(kv[1], context, refs);
    return {key: key, value: value};
}


var transforms = [];


transforms.push({
    inline: true,

    decodes: function(chunk) {
        return !isNaN(parseFloat(chunk.title));
    },
    construct: function(chunk) {
        return parseFloat(chunk.title);
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
            throw new Error('Javascript objects do not support non-string keys.');
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
