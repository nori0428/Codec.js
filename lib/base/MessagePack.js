//{@messagepack
(function(global) {
"use strict";

// --- dependency modules ----------------------------------
var Codec = global["Codec"];

// --- define / local variables ----------------------------
//var _isNodeOrNodeWebKit = !!global.global;
//var _runOnNodeWebKit =  _isNodeOrNodeWebKit && /native/.test(setTimeout);
//var _runOnNode       =  _isNodeOrNodeWebKit && !/native/.test(setTimeout);
//var _runOnWorker     = !_isNodeOrNodeWebKit && "WorkerLocation" in global;
//var _runOnBrowser    = !_isNodeOrNodeWebKit && "document" in global;

var ntoh32 = Codec["ntoh32"];
var hton64 = Codec["hton64"];
var ntoh64 = Codec["ntoh64"];
var TA_STR = Codec["TA_STR"];
var UTF8   = Codec["UTF8"];

var MAX_DEPTH         = 512; // threshold of cyclic reference.
var QUIET_NAN         = [0xcb, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
var POSITIVE_INFINITY = [0xcb, 0x7f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

//  MessagePack types              | JavaScript types | data length   | value range       |
// --------------------------------|------------------|---------------|-------------------|
var MSG_POS_FIXINT      = 0x00; // | Number           |               |      0 - 127      |
var MSG_POS_FIXINT_MAX  = 0x7f; // |                  |               |                   |
var MSG_FIX_MAP         = 0x80; // | Object           | <= 0x0F       |                   |
var MSG_FIX_MAP_MAX     = 0x8f; // |                  |               |                   |
var MSG_FIX_ARRAY       = 0x90; // | Array            | <= 0x0F       |                   |
var MSG_FIX_ARRAY_MAX   = 0x9f; // |                  |               |                   |
var MSG_FIX_STR         = 0xa0; // | String           | <= 0x1F       |                   |
var MSG_FIX_STR_MAX     = 0xbf; // |                  |               |                   |
var MSG_NIL             = 0xc0; // | null, undefined  |               |                   |
//  MSG_RESERVED        = 0xc1; // |                  |               |                   |
var MSG_FALSE           = 0xc2; // | false            |               |                   |
var MSG_TRUE            = 0xc3; // | true             |               |                   |
var MSG_BIN8            = 0xc4; // | Uint8Array       | <= 0xFF       |                   |
var MSG_BIN16           = 0xc5; // | Uint8Array       | <= 0xFFFF     |                   |
var MSG_BIN32           = 0xc6; // | Uint8Array       | <= 0xFFFFFFFF |                   |
//  MSG_EXT8            = 0xc7; // |                  |               |                   |
//  MSG_EXT16           = 0xc8; // |                  |               |                   |
//  MSG_EXT32           = 0xc9; // |                  |               |                   |
var MSG_FLOAT32         = 0xca; // |                  |               |                   |
var MSG_FLOAT64         = 0xcb; // | Number           |               |                   |
var MSG_UINT8           = 0xcc; // | Number           |               |    128 - 255      |
var MSG_UINT16          = 0xcd; // | Number           |               | < 0x10000         |
var MSG_UINT32          = 0xce; // | Number           |               | < 0x100000000     |
var MSG_UINT64          = 0xcf; // | Number           |               | <  IEEE754 limit  |
var MSG_INT8            = 0xd0; // | Number           |               |   -127 - -33      |
var MSG_INT16           = 0xd1; // | Number           |               | < -0x8000         |
var MSG_INT32           = 0xd2; // | Number           |               | < -0x80000000     |
var MSG_INT64           = 0xd3; // | Number           |               | < IEEE754 limi    |
//  MSG_FIX_EXT1        = 0xd4; // |                  |               |                   |
//  MSG_FIX_EXT2        = 0xd5; // |                  |               |                   |
//  MSG_FIX_EXT4        = 0xd6; // |                  |               |                   |
//  MSG_FIX_EXT8        = 0xd7; // |                  |               |                   |
//  MSG_FIX_EXT16       = 0xd8; // |                  |               |                   |
var MSG_STR8            = 0xd9; // | String           | <= 0xFF       |                   |
var MSG_STR16           = 0xda; // | String           | <= 0xFFFF     |                   |
var MSG_STR32           = 0xdb; // | String           | <= 0xFFFFFFFF |                   |
var MSG_ARRAY16         = 0xdc; // | Array            | <= 0xFFFF     |                   |
var MSG_ARRAY32         = 0xdd; // | Array            | <= 0xFFFFFFFF |                   |
var MSG_MAP16           = 0xde; // | Object           | <= 0xFFFF     |                   |
var MSG_MAP32           = 0xdf; // | Object           | <= 0xFFFFFFFF |                   |
var MSG_NEG_FIXINT      = 0xe0; // | Number           |               |    -32 - -1       |

// --- class / interfaces ----------------------------------
var MessagePack = {
    "encode": MessagePack_encode, // Codec.MessagePack.encode(source:Any, options:Object = {}):Uint8Array
    "decode": MessagePack_decode  // Codec.MessagePack.decode(source:Uint8Array):Any
};

function MessagePack_encode(source,    // @arg Any
                            options) { // @arg Object = {} - { buffer }
                                       // @options.buffer Uint8Array - encode buffer.
                                       // @ret Uint8Array - return new view of buffer.
//{@dev
    $valid($type(options, "Object|omit"), MessagePack_encode, "options");
    $valid($keys(options, "buffer"),      MessagePack_encode, "options");
    if (options) {
        $valid($type(options.buffer, "Uint8Array|omit"), MessagePack_encode, "options.buffer");
    }
//}@dev

    options = options || {};
    var sharedBuffer = new ArrayBuffer(8);
    var view = {
            buffer:     options["buffer"] || new Uint8Array(1024 * 16), // 16kb
            size:       0, // buffer.length.
            cursor:     0, // buffer cursor.
            threshold:  0, // threshold of buffer size.
            "double":   new Float64Array(sharedBuffer), // ref _encodeMessagePackNumber
            "byte":     new Uint8Array(sharedBuffer)    // ref _encodeMessagePackNumber
        };
    view.size = view.buffer.length;
    view.threshold = (view.size * 0.9) | 0;

    _encodeMessagePackAny(view, source, 0);

    return view.buffer.subarray(0, view.cursor); // return view
}

function MessagePack_decode(source) { // @arg Uint8Array - source
                                      // @ret Any
//{@dev
    $valid($type(source, "Uint8Array"), MessagePack_decode, "source");
//}@dev

    var sharedBuffer = new ArrayBuffer(8);
    var view = {
            cursor:     0,
            "double":   new Float64Array(sharedBuffer), // ref _decodeMessagePackDouble
            "float":    new Float32Array(sharedBuffer), // ref _decodeMessagePackFloat
            "byte":     new Uint8Array(sharedBuffer),   // ref _decodeMessagePackDouble and ***Float
        };

    return _decodeMessagePack(source, view);
}

// --- implements ------------------------------------------
function _encodeMessagePackAny(view, source, depth) {
    if (++depth >= MAX_DEPTH) {
        throw new TypeError("CYCLIC_REFERENCE_ERROR");
    }
    if (view.cursor >= view.threshold) { // over the buffer threshold.
        _expandBuffer(view, view.size);
    }
    if (source === null || source === undefined) {
        view.buffer[view.cursor++] = MSG_NIL;
    } else {
        switch (typeof source) {
        case "boolean": view.buffer[view.cursor++] = source ? MSG_TRUE : MSG_FALSE; break;
        case "number":  _encodeMessagePackNumber(view, source); break;
        case "string":  _encodeMessagePackString(view, source); break;
        default:
            if (Array.isArray(source)) {
                _encodeMessagePackArray(view, source, depth);
            } else if (source.constructor === ({}).constructor) { // isObject
                _encodeMessagePackObject(view, source, depth);
            } else if (source instanceof Uint8Array) {
                _encodeMessagePackBin(view, source);
            } else {
                throw new TypeError("UNKNOWN_TYPE");
            }
        }
    }
}
function _expandBuffer(view, need) {
    // get next power of 2 - https://gist.github.com/uupaa/8771007016e3ead56835
    var newSize = Math.pow(2, need.toString(2).length) << 1;
    var newBuffer = new Uint8Array(newSize);

    newBuffer.set(view.buffer, 0); // memcpy
    view.threshold = newSize * 0.9;
    view.buffer = newBuffer;
    view.size = newSize;
}

function _encodeMessagePackArray(view, source, depth) {
    // https://github.com/msgpack/msgpack/blob/master/spec.md#array-format-family
    var iz = source.length;

    if (iz <= 0x0F) {
        view.buffer[view.cursor++] = MSG_FIX_ARRAY + iz;
    } else if (iz <= 0xFFFF) {
        view.buffer.set([MSG_ARRAY16, iz >>  8, iz], view.cursor);
        view.cursor += 3;
    } else if (iz <= 0xFFFFFFFF) {
        view.buffer.set([MSG_ARRAY32, iz >> 24, iz >> 16, iz >>  8, iz], view.cursor);
        view.cursor += 5;
    }

    for (var i = 0; i < iz; ++i) {
        _encodeMessagePackAny(view, source[i], depth);
    }
}

function _encodeMessagePackObject(view, source, depth) {
    // https://github.com/msgpack/msgpack/blob/master/spec.md#map-format-family
    var keys = Object.keys(source), iz = keys.length;

    if (iz <= 0xF) {
        view.buffer[view.cursor++] = MSG_FIX_MAP + iz;
    } else if (iz <= 0xFFFF) {
        view.buffer.set([MSG_MAP16, iz >>  8, iz], view.cursor);
        view.cursor += 3;
    } else if (iz <= 0xFFFFFFFF) {
        view.buffer.set([MSG_MAP32, iz >> 24, iz >> 16, iz >>  8, iz], view.cursor);
        view.cursor += 5;
    }

    for (var i = 0; i < iz; ++i) { // uupaa-looper
        var key = keys[i];

        _encodeMessagePackString(view, key);
        _encodeMessagePackAny(view, source[key], depth);
    }
}

function _encodeMessagePackBin(view, source) {
    // https://github.com/msgpack/msgpack/blob/master/spec.md#bin-format-family
    var iz = source.length;

    if (iz <= 0xFF) {
        view.buffer.set([MSG_BIN8, iz], view.cursor);
        view.cursor += 2;
    } else if (iz <= 0xFFFF) {
        view.buffer.set([MSG_BIN16, iz >>  8, iz], view.cursor);
        view.cursor += 3;
    } else if (iz <= 0xFFFFFFFF) {
        view.buffer.set([MSG_BIN32, iz >> 24, iz >> 16, iz >>  8, iz], view.cursor);
        view.cursor += 5;
    }

    if (view.cursor + iz >= view.threshold) {
        _expandBuffer(view, Math.max(view.cursor + iz, view.size));
    }
    view.buffer.set(source, view.cursor);
    view.cursor += iz;
}

function _encodeMessagePackNumber(view, source) {
    // https://github.com/msgpack/msgpack/blob/master/spec.md#int-format-family
    // https://github.com/msgpack/msgpack/blob/master/spec.md#float-format-family
    var high = 0, low = 0;

    if (source !== source) {
        view.buffer.set(QUIET_NAN, view.cursor);
        view.cursor += 9;
    } else if (source === Infinity) {
        view.buffer.set(POSITIVE_INFINITY, view.cursor);
        view.cursor += 9;
    } else if (Math.floor(source) !== source) { // float or double?
        view["double"][0] = source; // set double value
        view.buffer[view.cursor++] = MSG_FLOAT64;
        view.buffer.set(hton64(view["byte"]), view.cursor); // get byte representation
        view.cursor += 8;
    } else if (source < 0) { // negative integer
        if (source >= -32) {                // [MSG_NEG_FIXINT | 0xNNNNN]
            view.buffer[view.cursor++] = MSG_NEG_FIXINT + source + 32;
        } else if (source > -0x80) {        // [MSG_INT8, value]
            view.buffer[view.cursor++] = MSG_INT8;
            view.buffer[view.cursor++] = source + 0x100;
        } else if (source > -0x8000) {      // [MSG_INT16, value x 2]
            source += 0x10000;
            view.buffer.set([MSG_INT16, source >>  8, source], view.cursor);
            view.cursor += 3;
        } else if (source > -0x80000000) {  // [MSG_INT32, value x 4]
            source += 0x100000000;
            view.buffer.set([MSG_INT32, source >> 24, source >> 16,
                                        source >>  8, source], view.cursor);
            view.cursor += 5;
        } else {                            // [MSG_INT64, value x 8]
            high = Math.floor(source / 0x100000000);
            low  = source & 0xffffffff;
            view.buffer.set([MSG_INT64, high >> 24, high >> 16, high >>  8, high,
                                        low  >> 24, low  >> 16, low  >>  8, low], view.cursor);
            view.cursor += 9;
        }
    } else { // positive integer
        if (source < 0x80) {                // [MSG_POS_FIXINT]
            view.buffer[view.cursor++] = MSG_POS_FIXINT + source;
        } else  if (source < 0x100) {       // [MSG_UINT8, value]
            view.buffer[view.cursor++] = MSG_UINT8;
            view.buffer[view.cursor++] = source;
        } else if (source < 0x10000) {      // [MSG_UINT16, value x 2]
            view.buffer.set([MSG_UINT16, source >>  8, source], view.cursor);
            view.cursor += 3;
        } else if (source < 0x100000000) {  // [MSG_UINT32, value x 4]
            view.buffer.set([MSG_UINT32, source >> 24, source >> 16,
                                         source >>  8, source], view.cursor);
            view.cursor += 5;
        } else {                            // [MSG_UINT64, value x 8]
            high = Math.floor(source / 0x100000000);
            low  = source & 0xffffffff;
            view.buffer.set([MSG_UINT64, high >> 24, high >> 16, high >>  8, high,
                                         low  >> 24, low  >> 16, low  >>  8, low], view.cursor);
            view.cursor += 9;
        }
    }
}

function _encodeMessagePackString(view, source) {
    // https://github.com/msgpack/msgpack/blob/master/spec.md#str-format-family
    var utf8String = unescape( encodeURIComponent(source) );
    var result = new Uint8Array(utf8String.length);

    for (var i = 0, iz = utf8String.length; i < iz; ++i) {
        result[i] = utf8String.charCodeAt(i);
    }
    var size = result.length;

    if (size <= 0x1F) {
        view.buffer[view.cursor++] = MSG_FIX_STR + size;
    } else if (size <= 0xFF) {
        view.buffer.set([MSG_STR8,  size], view.cursor);
        view.cursor += 2;
    } else if (size <= 0xFFFF) {
        view.buffer.set([MSG_STR16, size >>  8, size], view.cursor);
        view.cursor += 3;
    } else if (size <= 0xFFFFFFFF) {
        view.buffer.set([MSG_STR32, size >> 24, size >> 16, size >>  8, size], view.cursor);
        view.cursor += 5;
    }
    view.buffer.set(result, view.cursor);
    view.cursor += size;
}

// --- decoder ---------------------------------------------
function _decodeMessagePack(source, // @arg Uint8Array
                            view) { // @arg Object - { cursor, double, float, byte }
                                    // @ret Any
                                    // @recursive
    var size = 0; // this variable is the data length or a uint/int value.
    var type = source[view.cursor++];

    // -- range values ---
    if (type >= MSG_NEG_FIXINT) { // Negative FixNum (111x xxxx) (-32 ~ -1)
        return type - 0x100;
    }
    if (type >= MSG_POS_FIXINT && type <= MSG_POS_FIXINT_MAX) {
        return type;              // Positive FixNum (0xxx xxxx) (0 ~ 127)
    }
    if (type <= MSG_FIX_STR_MAX) {
        if (type <= MSG_FIX_MAP_MAX) {          // FixMap (1000 xxxx)
            size = type - MSG_FIX_MAP;
            type = MSG_FIX_MAP;
        } else if (type <= MSG_FIX_ARRAY_MAX) { // FixArray (1001 xxxx)
            size = type - MSG_FIX_ARRAY;
            type = MSG_FIX_ARRAY;
        } else if (type <= MSG_FIX_STR_MAX) {   // FixString (101x xxxx)
            size = type - MSG_FIX_STR;
            type = MSG_FIX_STR;
        }
    }

    switch (type) {
    case MSG_ARRAY32:
    case MSG_STR32:
    case MSG_MAP32:
    case MSG_BIN32:
    case MSG_INT32:
    case MSG_UINT32:    size = (source[view.cursor++] * 0x1000000) +
                               (source[view.cursor++] << 16) +
                               (source[view.cursor++] <<  8) +
                                source[view.cursor++]; break;
    case MSG_ARRAY16:
    case MSG_STR16:
    case MSG_MAP16:
    case MSG_BIN16:
    case MSG_INT16:
    case MSG_UINT16:    size = (source[view.cursor++] << 8) | source[view.cursor++]; break;
    case MSG_STR8:
    case MSG_BIN8:
    case MSG_INT8:
    case MSG_UINT8:     size = source[view.cursor++]; break;
    }

    var obj, key, value, ary;

    switch (type) {
    case MSG_NIL:       return null;
    case MSG_FALSE:     return false;
    case MSG_TRUE:      return true;
    case MSG_MAP32:
    case MSG_MAP16:
    case MSG_FIX_MAP:   obj = {};
                        while (size--) {
                            key   = _decodeMessagePack(source, view);
                            value = _decodeMessagePack(source, view);
                            obj[key] = value;
                        }
                        return obj;
    case MSG_ARRAY32:
    case MSG_ARRAY16:
    case MSG_FIX_ARRAY: ary = [];
                        while (size--) {
                            ary.push( _decodeMessagePack(source, view) );
                        }
                        return ary;
    case MSG_BIN32:
    case MSG_BIN16:
    case MSG_BIN8:      view.cursor += size;
                        return new Uint8Array(source.buffer.slice(view.cursor - size, view.cursor));
    case MSG_FLOAT32:   view.cursor += 4;
                        view["byte"].set(ntoh32(source.subarray(view.cursor - 4, view.cursor)), 0);
                        return view["float"][0];
    case MSG_FLOAT64:   view.cursor += 8;
                        view["byte"].set(ntoh64(source.subarray(view.cursor - 8, view.cursor)), 0);
                        return view["double"][0];
    case MSG_UINT64:    return _decodeMessagePackUint64(source, view);
    case MSG_UINT32:
    case MSG_UINT16:
    case MSG_UINT8:     return size;
    case MSG_INT64:     return source[view.cursor] & 0x80 ? _decodeMessagePackInt64(source, view) // Negative
                                                          : _decodeMessagePackUint64(source, view);
    case MSG_INT32:     return size < 0x80000000 ? size : size - 0x100000000;
    case MSG_INT16:     return size < 0x8000 ? size : size - 0x10000;
    case MSG_INT8:      return size < 0x80 ? size : size - 0x100;
    case MSG_STR32:
    case MSG_STR16:
    case MSG_STR8:
    case MSG_FIX_STR:   view.cursor += size;
                        try {
                            return decodeURIComponent( escape( TA_STR(
                                                  source.subarray(view.cursor - size, view.cursor) ) ) );
                        } catch ( o___o ) { // Hello, I am try-catch.
                            return UTF8["decode"](source.subarray(view.cursor - size, view.cursor), true);
                        }
    }
    throw new TypeError("UNKNOWN_TYPE");
}

function _decodeMessagePackUint64(source, view) {
    view.cursor += 8;
    var dataView = new DataView(source.buffer.slice(view.cursor - 8, view.cursor));
    return dataView.getUint32(0) * 0x100000000 + dataView.getUint32(4);
}

function _decodeMessagePackInt64(source, view) {
    return ((source[view.cursor++] ^ 0xff) * 0x100000000000000 +
            (source[view.cursor++] ^ 0xff) *   0x1000000000000 +
            (source[view.cursor++] ^ 0xff) *     0x10000000000 +
            (source[view.cursor++] ^ 0xff) *       0x100000000 +
            (source[view.cursor++] ^ 0xff) *         0x1000000 +
            (source[view.cursor++] ^ 0xff) *           0x10000 +
            (source[view.cursor++] ^ 0xff) *             0x100 +
            (source[view.cursor++] ^ 0xff) + 1) * -1;
}

// --- validate / assertions -------------------------------
//{@dev
function $valid(val, fn, hint) { if (global["Valid"]) { global["Valid"](val, fn, hint); } }
function $type(obj, type) { return global["Valid"] ? global["Valid"].type(obj, type) : true; }
function $keys(obj, str) { return global["Valid"] ? global["Valid"].keys(obj, str) : true; }
//function $some(val, str, ignore) { return global["Valid"] ? global["Valid"].some(val, str, ignore) : true; }
//function $args(fn, args) { if (global["Valid"]) { global["Valid"].args(fn, args); } }
//}@dev

// --- exports ---------------------------------------------
if (typeof module !== "undefined") {
    module["exports"] = MessagePack;
}
(global["Codec_"] || global["Codec"])["MessagePack"] = MessagePack;

})((this || 0).self || global); // WebModule idiom. http://git.io/WebModule
//}@messagepack

