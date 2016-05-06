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

    if (Array.isArray(data)) {
        var result = [ref + ' list'];
        data.forEach(function(datum) {
            result.push(indentation + buildRefs2(datum, context, builder));
        });
        builder.lines.push.apply(builder.lines, result);
    } else if (data && typeof data === 'object') {
        var result = ref + ' hash';
        Object.keys(data).forEach(function(key) {
            result += indentation + buildRefs(data[key], context, builder) + '\n';
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
                chunk.ref = undefined;
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

    var refs = {};
    var chunks = chunksOf(bytes);

    if (chunks.length === 0) throw new Error('No data.');

    if (chunks.length === 1) {
        var chunk = chunks[0];

        if (chunk.ref && chunk.ref !== '@') {
            throw new Error('Root ref must be "@" or omitted.\n' + bytes);
        }

        var key = mapKeyOf(context, chunk.title);
        if (key !== mapKeyOf.NOT_FOUND) return key;

        var number = parseFloat(chunk.title);
        if (!isNaN(number)) return number;
    }

    chunks.forEach(function(chunk) {
        if (!chunk.ref) {
            throw new Error('Refs are required when more than one object is present.\n' + bytes);
        }
        refs[chunk.ref] = chunk;

        if (chunk.title === 'hash') {
            chunk.object = {};
        } else if (chunk.title === 'list') {
            chunk.object = [];
        } else if (chunk.title === 'text') {
            chunk.object = chunk.contents.join('\n');
        } else {
            throw new Error('No context for "' + chunk.title + '".');
        }
    });

    chunks.forEach(function(chunk) {
        if (chunk.title === 'hash') {

        } else if (chunk.title === 'list') {
            chunk.contents.forEach(function(element) {
                var target = refs[element];
                if (target) {
                    chunk.object.push(target.object);
                } else {
                    var key = mapKeyOf(context, element);
                    if (key !== mapKeyOf.NOT_FOUND) {
                        chunk.object.push(key);
                        return;
                    }

                    var number = parseFloat(element);
                    if (!isNaN(number)) {
                        chunk.object.push(number);
                        return;
                    }

                    throw new Error();
                }
            });
        }
    });

    return refs['@'].object;
};
