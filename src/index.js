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
Object.freeze(defaultContextSerialize);

var defaultContextDeserialize = new Map()
    .set('true', true)
    .set('false', false)
    .set('null', null)
    .set('undefined', void 0)
    .set('nan', NaN)
    .set('infinity', Infinity)
    .set('-infinity', -Infinity);
Object.freeze(defaultContextDeserialize);


function eachMapEntry(source, callback) {
    var entries = source.entries();
    while (true) {
        var iteration = entries.next();
        if (iteration.done) return;
        if (callback(iteration.value[0], iteration.value[1])) return;
    }
}
function copyMap(source) {
    var result = new Map();
    eachMapEntry(source, function(key, value) {
        result.set(key, value);
    });
    return result;
}


function buildRefs1(data, builder) {
    var context = builder.refs;
    if (context.has(data)) {
        builder.lines.push(context.get(data));
        return;
    }
    if (Number.isFinite(data)) {
        builder.lines.push(data.toString());
        return;
    }

    buildRefs2(data, builder);
}

function buildRefs2(data, builder) {
    if (builder.refs.has(data)) return builder.refs.get(data);
    if (Number.isFinite(data)) return data.toString();

    var ref = '@';
    if (builder.nextRef !== 0) ref += builder.nextRef;
    builder.nextRef += 1;

    builder.refs.set(data, ref);

    for (var title in transforms) {
        if (!transforms[title].serialize) continue;
        var serialization = transforms[title].serialize(data, builder, ref);
        if (!serialization) continue;

        builder.lines.push(ref + ' ' + title);

        var lines = serialization.lines.map(function(line) { return indentation + line; });
        builder.lines.push.apply(builder.lines, lines);

        break;
    }

    return ref;
}

function buildRefPair(key, value, builder) {
    return buildRefs2(key, builder) + ' ' + buildRefs2(value, builder);
}


module.exports.serialize = function serialize(data, context) {
    if (arguments.length < 2) context = defaultContextSerialize;

    var builder = {lines: [], nextRef: 0, refs: copyMap(context)};
    buildRefs1(data, builder);
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

    chunks.forEach(function(chunk) {
        if (!chunk.ref) {
            if (chunks.length === 1) {
                chunk.ref = '@';
            } else {
                throw new Error('Refs are required when more than one object is present.\n' + bytes);
            }
        }
        refs[chunk.ref] = chunk;

        if (context.has(chunk.title)) {
            chunk.object = context.get(chunk.title);
            return;
        }

        var number = parseFloat(chunk.title);
        if (!isNaN(number)) {
            chunk.object = number;
            return;
        }

        var transform = transforms[chunk.title];
        if (!transforms[chunk.title]) throw new Error('No context for "' + chunk.title + '".');

        chunk.object = transform.construct(chunk);
    });
    if (!refs['@']) throw new Error('Root ref must be "@" or omitted.\n' + bytes);

    chunks.forEach(function(chunk) {
        var transform = transforms[chunk.title];
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

function parseTarget(bytes, context, refs) {
    var target = refs[bytes];
    if (target) return target.object;

    if (context.has(bytes)) return context.get(bytes);

    var number = parseFloat(bytes);
    if (!isNaN(number)) return number;

    throw new Error();
}

function parseTargetPair(bytes, context, refs) {
    var kv = bytes.split(' ');
    if (kv.length !== 2) {
        throw new Error('Expecting key/value pair. Found: ' + bytes + '\n>>>\n' + bytes);
    }
    var key = parseTarget(kv[0], context, refs);
    var value = parseTarget(kv[1], context, refs);
    return {key: key, value: value};
}


var transforms = Object.create(null);

transforms['text'] = {
    construct: function(chunk) {
        return chunk.contents.join('\n');
    },
    serialize: function(data, builder) {
        if (typeof data !== 'string') return;

        return {lines: data.split('\n')};
    }
};

transforms['list'] = {
    construct: function(chunk) {
        return [];
    },
    parseLine: parseTarget,
    fill: function(object, element) {
        object.push(element);
    },
    serialize: function(data, builder) {
        if (!Array.isArray(data)) return;

        return {lines: data.map(function(datum) {
            return buildRefs2(datum, builder);
        })};
    }
};

transforms['hash'] = {
    construct: function(chunk) {
        return new Map();
    },
    parseLine: parseTargetPair,
    fill: function(object, element) {
        object.set(element.key, element.value);
    },
    serialize: function(data, builder) {
        if (!data || data.constructor !== Map) return;

        var lines = [];
        var entries = data.entries();
        while(true) {
            var iteration = entries.next();
            if (iteration.done) break;
            lines.push(buildRefPair(iteration.value[0], iteration.value[1], builder));
        }
        return {lines: lines};
    }
};

// requires `transforms` to observe ordering to keep from using jshash when hash was intended
transforms['jshash'] = {
    construct: function(chunk) {
        return {};
    },
    parseLine: parseTargetPair,
    fill: function(object, element) {
        if (typeof element.key !== 'string') {
            throw new Error('Javascript objects do not support non-string keys.');
        }
        object[element.key] = element.value;
    },
    serialize: function(data, builder) {
        if (!data || typeof data !== 'object') return;

        return {lines: Object.keys(data).map(function(key) {
            return buildRefPair(key, data[key], builder);
        })};
    }
};
