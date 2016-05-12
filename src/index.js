'use strict';

var indentation = '    ';

function Builder(transforms) {
    return {
        lines: [],
        nextRef: 0,
        refs: new Map(),
        transforms: transforms || module.exports.defaultTransforms
    };
}

function serialize(data, builder) {
    for (var i = 0; i < builder.transforms.length; i += 1) {
        var transform = builder.transforms[i];

        if (!transform.matches(data, builder)) continue;
        return transform.serialize(data, builder);
    }

    throw new Error('No transform found for "' + data + '".');
}

module.exports.serialize = function(data, transforms) {
    var builder = Builder(transforms);
    var inlinement = serialize(data, builder);
    if (!builder.lines.length) return inlinement;
    return builder.lines.join('\n');
};


function chunkShellOf(line) {
    var chunk = {contents: []};

    if (line[0] === '@') {
        var segments = line.split(' ');
        if (segments.length === 2) {
            chunk.ref = segments[0];
            chunk.title = segments[1];
        } else {
            throw new Error('Syntax error: "' + line + '"');
        }
    } else {
        chunk.title = line;
    }

    return chunk;
}

function chunksOf(bytes) {
    var lines = bytes.split('\n');
    var result = [];
    var chunk;
    var end = false;

    while (lines.length) {
        var line = lines.shift();
        if (!line.length) {
            end = true;
            continue;
        } else if (end) {
            throw new Error();
        }

        if (line.startsWith(indentation)) {
            if (!chunk) throw new Error('Indentation error on line ' + lineNumber);

            chunk.contents.push(line.substr(indentation.length));
        } else {
            chunk = chunkShellOf(line);
            result.push(chunk);
        }
    }
    return result;
}

function inlineChunksOf(bytes, refs, transforms) {
    var result = [];

    var opener;
    for (var i = 0; i < bytes.length; i += 1) {
        if (bytes[i] === '|') {
            if (opener == null) opener = i;
            for (var j = i + 1; j < bytes.length; j += 1) {
                if (bytes[j] === '|') {
                    if (bytes[j + 1] !== ' ' && j !== bytes.length - 1) break;
                    result.push({title: bytes.substring(i, j + 1)});
                    i = j;
                    opener = undefined;
                    break;
                }
            }
        } else if (bytes[i] === ' ') {
            if (opener != null) {
                result.push({title: bytes.substring(opener, i)});
                opener = undefined;
            }
        } else if (opener == null) {
            opener = i;
        }
    }
    if (opener != null) {
        result.push({title: bytes.substring(opener)});
    }

    return result;
}

module.exports.deserialize = function deserialize(bytes, transforms) {
    if (!transforms) transforms = module.exports.defaultTransforms;

    var chunks = chunksOf(bytes, transforms);
    if (chunks.length === 0) throw new Error('No data.\n' + bytes);

    var refs = Object.create(null);

    processAll(chunks, refs, transforms);
    chunks.forEach(function(chunk) {
        chunk.contents.forEach(function(line) {
            var lineChunks = inlineChunksOf(line, refs, transforms);
            processAll(lineChunks, refs, transforms);
            chunk.transform.appendToChunk(chunk, lineChunks);
        });
    });

    if (chunks.length === 1 && chunks[0].ref == null) return chunks[0].object;

    if (!('@' in refs)) {
        throw new Error('Root ref must be "@" or omitted.\n' + bytes + '\n' + JSON.stringify(refs));
    }
    return refs['@'];
};

function processAll(chunks, refs, transforms) {
    chunks.forEach(function(chunk) {
        for (var i = 0; i < transforms.length; i += 1) {
            var transform = transforms[i];

            var decoded = transform.objectOfChunk(chunk, refs);
            if (!decoded) continue;

            chunk.transform = transform;
            chunk.object = decoded.object;
            if (chunk.ref) refs[chunk.ref] = chunk.object;
            return;
        }

        throw new Error('No transform found for "' + chunk.title + '".');
    });
}

function serializePair(key, value, builder) {
    return serialize(key, builder) + ' ' + serialize(value, builder);
}

module.exports.reference = {
    objectOfChunk: function(chunk, refs) {
        if (chunk.title[0] === '@') {
            if (!(chunk.title in refs)) throw new Error();
            return {object: refs[chunk.title], title: chunk.title};
        }
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
        objectOfChunk: function(chunk, refs) {
            if (chunk.title === identifier) return {object: value};
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
    objectOfChunk: function(chunk, refs) {
        var parsed = parseFloat(chunk.title);
        if (isNaN(parsed)) return;
        if (('' + parsed).length !== chunk.title.length) return;
        return {object: parsed};
    },

    matches: function(data) {
        return Number.isFinite(data);
    },
    serialize: function(data, builder) {
        return data.toString();
    },
};

var shortTextReg = /^\|([^\n|]*?)\|$/;
module.exports.shortText = {
    objectOfChunk: function(chunk, refs) {
        var match = shortTextReg.exec(chunk.title);
        if (match) return {object: match[1]};
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
    objectOfChunk: function(chunk, refs) {
        if (chunk.title === 'text') {
            var result = {object: chunk.contents.join('\n')};
            chunk.contents.length = 0; // empties list
            return result;
        }
    },

    matches: function(data) {
        return typeof data === 'string';
    },
    serialize: serializeContainer('text', function(data, builder) {
        return data.split('\n');
    }),
};

module.exports.list = {
    objectOfChunk: function(chunk, refs) {
        if (chunk.title === 'list') return {object: []};
    },
    appendToChunk: function(chunk, row) {
        if (row.length !== 1) throw new Error('list--append expected a single value. Found: ' + JSON.stringify(row));
        chunk.object.push(row[0].object);
    },

    matches: function(data) {
        return Array.isArray(data);
    },
    serialize: serializeContainer('list', function(data, builder) {
        return data.map(function(datum) {
            return serialize(datum, builder);
        });
    }),
};

module.exports.hash = {
    objectOfChunk: function(chunk, refs) {
        if (chunk.title === 'hash') return {object: new Map()};
    },
    appendToChunk: function(chunk, row) {
        if (row.length !== 2) throw new Error('hash--append expected a key/value pair. Found: ' + JSON.stringify(row));
        chunk.object.set(row[0].object, row[1].object);
    },

    matches: function(data) {
        return data && data.constructor === Map;
    },
    serialize: serializeContainer('hash', function(data, builder) {
        var lines = [];
        var entries = data.entries();
        while (true) {
            var iteration = entries.next();
            if (iteration.done) break;
            lines.push(serializePair(iteration.value[0], iteration.value[1], builder));
        }
        return lines;
    }),
};

module.exports.jshash = {
    objectOfChunk: function(chunk, refs) {
        if (chunk.title === 'jshash') return {object: {}};
    },
    appendToChunk: function(chunk, row) {
        if (row.length !== 2) {
            throw new Error('jshash--append expected a key/value pair. Found: ' + JSON.stringify(row));
        }
        if (typeof row[0].object !== 'string') {
            throw new Error('Javascript objects do not support non-string keys: ' +
                            JSON.stringify(row[0].object));
        }
        chunk.object[row[0].object] = row[1].object;
    },

    matches: function(data) {
        return data && typeof data === 'object';
    },
    serialize: serializeContainer('jshash', function(data, builder) {
        return Object.keys(data).map(function(key) {
            return serializePair(key, data[key], builder);
        });
    }),
};

function serializeContainer(title, ser) {
    return function(data, builder) {
        var ref = '@';
        if (builder.nextRef !== 0) ref += builder.nextRef;
        builder.nextRef += 1;
        builder.refs.set(data, ref);

        var lines = ser(data, builder);

        builder.lines.push(ref + ' ' + title);
        lines.forEach(function(line) {
            builder.lines.push(indentation + line);
        });
        return ref;
    };
}

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
