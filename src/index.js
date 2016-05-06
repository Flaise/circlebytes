'use strict';

var indentation = '    ';

var defaultContext = new Map()
    .set(true, 'true')
    .set(false, 'false')
    .set(null, 'null')
    .set(void 0, 'undefined')
    .set(NaN, 'nan')
    .set(Infinity, 'infinity')
    .set(-Infinity, '-infinity');
Object.freeze(defaultContext);


function mapKeyOf(source, value) {
    var entries = source.entries();
    while (true) {
        var iteration = entries.next();
        if (iteration.done) return mapKeyOf.NOT_FOUND;
        if (iteration.value[1] === value) return iteration.value[0];
    }
}
mapKeyOf.NOT_FOUND = Object.freeze(Object.create(null));


function buildRefs1(data, context, builder) {
    if (context.has(data)) {
        builder.lines.push(context.get(data));
        return;
    }
    if (Number.isFinite(data)) {
        builder.lines.push(data.toString());
        return;
    }

    buildRefs2(data, context, builder);
}

function buildRefs2(data, context, builder) {
    if (context.has(data)) return context.get(data);
    if (Number.isFinite(data)) return data.toString();
    if (builder.refs.has(data)) return builder.refs.get(data);

    var ref = '@';
    if (builder.nextRef !== 0) ref += builder.nextRef;
    builder.nextRef += 1;

    builder.refs.set(data, ref);

    if (data == null) return ref;

    if (data.constructor === Map) {
        var result = ref + ' hash';
        var entries = data.entries();
        while(true) {
            var iteration = entries.next();
            if (iteration.done) break;
            var key = iteration.value[0];
            var value = iteration.value[1];
            result += '\n' + indentation + buildRefs2(key, context, builder) + ' ' +
                      buildRefs2(value, context, builder);
        }
        builder.lines.push(result);
    } else if (Array.isArray(data)) {
        var result = [ref + ' list'];
        data.forEach(function(datum) {
            result.push(indentation + buildRefs2(datum, context, builder));
        });
        builder.lines.push.apply(builder.lines, result);
    } else if (typeof data === 'object') {
        var result = ref + ' jshash';
        Object.keys(data).forEach(function(key) {
            result += '\n' + indentation + buildRefs2(key, context, builder) + ' ' +
                      buildRefs2(data[key], context, builder);
        });
        builder.lines.push(result);
    } else if (typeof data === 'string') {
        builder.lines.push(ref + ' text\n' + indentation + data.split('\n').join('\n' + indentation));
    }

    return ref;
}

module.exports.serialize = function serialize(data, context) {
    if (arguments.length < 2) context = defaultContext;

    var builder = {lines: [], nextRef: 0, refs: new Map()};
    buildRefs1(data, context, builder);
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
    if (arguments.length < 2) context = defaultContext;

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

        var key = mapKeyOf(context, chunk.title);
        if (key !== mapKeyOf.NOT_FOUND) {
            chunk.object = key;
            return;
        }

        var number = parseFloat(chunk.title);
        if (!isNaN(number)) {
            chunk.object = number;
            return;
        }

        if (construct[chunk.title]) {
            construct[chunk.title](chunk);
        } else {
            throw new Error('No context for "' + chunk.title + '".');
        }
    });
    if (!refs['@']) throw new Error('Root ref must be "@" or omitted.\n' + bytes);

    chunks.forEach(function(chunk) {
        if (parseLine[chunk.title]) {
            var elements = chunk.contents.map(function(line) {
                return parseLine[chunk.title](line, context, refs);
            });
            if (fill[chunk.title]) {
                elements.forEach(function(element) {
                    fill[chunk.title](chunk.object, element);
                });
            }
        }
    });

    return refs['@'].object;
};

function parseTarget(bytes, context, refs) {
    var target = refs[bytes];
    if (target) return target.object;

    var key = mapKeyOf(context, bytes);
    if (key !== mapKeyOf.NOT_FOUND) return key;

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


var construct = Object.create(null);
var parseLine = Object.create(null);
var fill = Object.create(null);


construct['text'] = function(chunk) {
    chunk.object = chunk.contents.join('\n');
};


construct['list'] = function(chunk) {
    chunk.object = [];
};
parseLine['list'] = parseTarget;
fill['list'] = function(object, element) {
    object.push(element);
};


construct['jshash'] = function(chunk) {
    chunk.object = {};
};
parseLine['jshash'] = parseTargetPair;
fill['jshash'] = function(object, element) {
    if (typeof element.key !== 'string') {
        throw new Error('Javascript objects do not support non-string keys.');
    }
    object[element.key] = element.value;
};


construct['hash'] = function(chunk) {
    chunk.object = new Map();
};
parseLine['hash'] = parseTargetPair;
fill['hash'] = function(object, element) {
    object.set(element.key, element.value);
};
