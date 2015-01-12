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

// https://github.com/msgpack/msgpack/blob/master/spec.md
//  MessagePack types              | JavaScript types | data length   | value range       |
// --------------------------------|------------------|---------------|-------------------|
var TYPE_POS_FIXINT     = 0x00; // | Number           |               |      0 - 127      |
var TYPE_POS_FIXINT_MAX = 0x7f; // |                  |               |                   |
var TYPE_FIX_MAP        = 0x80; // | Object           | <= 0x0F       |                   |
var TYPE_FIX_MAP_MAX    = 0x8f; // |                  |               |                   |
var TYPE_FIX_ARRAY      = 0x90; // | Array            | <= 0x0F       |                   |
var TYPE_FIX_ARRAY_MAX  = 0x9f; // |                  |               |                   |
var TYPE_FIX_STR        = 0xa0; // | String           | <= 0x1F       |                   |
var TYPE_FIX_STR_MAX    = 0xbf; // |                  |               |                   |
var TYPE_NIL            = 0xc0; // | null, undefined  |               |                   |
//  TYPE_RESERVED       = 0xc1; // |                  |               |                   |
var TYPE_FALSE          = 0xc2; // | false            |               |                   |
var TYPE_TRUE           = 0xc3; // | true             |               |                   |
var TYPE_BIN8           = 0xc4; // | Uint8Array       | <= 0xFF       |                   |
var TYPE_BIN16          = 0xc5; // | Uint8Array       | <= 0xFFFF     |                   |
var TYPE_BIN32          = 0xc6; // | Uint8Array       | <= 0xFFFFFFFF |                   |
//  TYPE_EXT8           = 0xc7; // |                  |               |                   |
//  TYPE_EXT16          = 0xc8; // |                  |               |                   |
//  TYPE_EXT32          = 0xc9; // |                  |               |                   |
var TYPE_FLOAT32        = 0xca; // |                  |               |                   |
var TYPE_FLOAT64        = 0xcb; // | Number           |               |                   |
var TYPE_UINT8          = 0xcc; // | Number           |               |    128 - 255      |
var TYPE_UINT16         = 0xcd; // | Number           |               | < 0x10000         |
var TYPE_UINT32         = 0xce; // | Number           |               | < 0x100000000     |
var TYPE_UINT64         = 0xcf; // | Number           |               | <  IEEE754 limit  |
var TYPE_INT8           = 0xd0; // | Number           |               |   -127 - -33      |
var TYPE_INT16          = 0xd1; // | Number           |               | < -0x8000         |
var TYPE_INT32          = 0xd2; // | Number           |               | < -0x80000000     |
var TYPE_INT64          = 0xd3; // | Number           |               | < IEEE754 limi    |
//  TYPE_FIX_EXT1       = 0xd4; // |                  |               |                   |
//  TYPE_FIX_EXT2       = 0xd5; // |                  |               |                   |
//  TYPE_FIX_EXT4       = 0xd6; // |                  |               |                   |
//  TYPE_FIX_EXT8       = 0xd7; // |                  |               |                   |
//  TYPE_FIX_EXT16      = 0xd8; // |                  |               |                   |
var TYPE_STR8           = 0xd9; // | String           | <= 0xFF       |                   |
var TYPE_STR16          = 0xda; // | String           | <= 0xFFFF     |                   |
var TYPE_STR32          = 0xdb; // | String           | <= 0xFFFFFFFF |                   |
var TYPE_ARRAY16        = 0xdc; // | Array            | <= 0xFFFF     |                   |
var TYPE_ARRAY32        = 0xdd; // | Array            | <= 0xFFFFFFFF |                   |
var TYPE_MAP16          = 0xde; // | Object           | <= 0xFFFF     |                   |
var TYPE_MAP32          = 0xdf; // | Object           | <= 0xFFFFFFFF |                   |
var TYPE_NEG_FIXINT     = 0xe0; // | Number           |               |    -32 - -1       |

// --- class / interfaces ----------------------------------
var MessagePack = {
    "encode": MessagePack_encode, // Codec.MessagePack.encode(source:Any, options:Object = {}):Uint8Array
    "decode": MessagePack_decode  // Codec.MessagePack.decode(source:Uint8Array):Any
};

function MessagePack_encode(source,    // @arg Any
                            options) { // @arg Object = {} - { ascii, buffer }
                                       // @options.ascii Boolean = false - String is FIX_STR and ASCII only.
                                       // @options.buffer Uint8Array = null - encode buffer.
                                       // @ret Uint8Array - return new view of buffer.
/*
//{@dev
    $valid($type(options, "Object|omit"), MessagePack_encode, "options");
    $valid($keys(options, "ascii|buffer"), MessagePack_encode, "options");
    if (options) {
        $valid($type(options.ascii, "Boolean|omit"),     MessagePack_encode, "options.ascii");
        $valid($type(options.buffer, "Uint8Array|omit"), MessagePack_encode, "options.buffer");
    }
//}@dev
 */
    options = options || {};
    var sharedBuffer = new ArrayBuffer(8);
    var view = {
            ascii:      options["ascii"] || false,
            buffer:     options["buffer"] || new Uint8Array(1024 * 16), // 16kb
            cursor:     0, // buffer cursor.
            threshold:  0, // threshold of buffer length.
            "double":   new Float64Array(sharedBuffer), // ref _encodeMessagePackNumber
            "byte":     new Uint8Array(sharedBuffer)    // ref _encodeMessagePackNumber
        };
    view.threshold = (view.buffer.length * 0.9) | 0;

    _encodeMessagePackAny(source, view, 0);

    return view.buffer.subarray(0, view.cursor); // return view
}

function MessagePack_decode(source,    // @arg Uint8Array - source
                            options) { // @arg Object = {} - { ascii, copy }
                                       // @ret Any
/*
//{@dev
    $valid($type(source, "Uint8Array"),   MessagePack_decode, "source");
    $valid($type(options, "Object|omit"), MessagePack_decode, "options");
    $valid($keys(options, "ascii|copy"),  MessagePack_decode, "options");
    if (options) {
        $valid($type(options.ascii, "Boolean|omit"), MessagePack_decode, "options.ascii");
        $valid($type(options.copy,  "Boolean|omit"), MessagePack_decode, "options.copy");
    }
//}@dev
 */
    options = options || {};
    var sharedBuffer = new ArrayBuffer(8);
    var view = {
            copy:       options["copy"] || false,
            ascii:      options["ascii"] || false,
            cursor:     0,
            "double":   new Float64Array(sharedBuffer), // ref _decodeMessagePackDouble
            "float":    new Float32Array(sharedBuffer), // ref _decodeMessagePackFloat
            "byte":     new Uint8Array(sharedBuffer),   // ref _decodeMessagePackDouble and ***Float
            data:       new DataView(source.buffer),
        };
    var result = null;

    try {
        result = _decodeMessagePack(source, view);
    } finally {
        view.data = null;
        view = null;
    }
    return result;
}

// --- implements ------------------------------------------
function _encodeMessagePackAny(source, view, depth) {
    if (++depth >= MAX_DEPTH) {
        throw new TypeError("CYCLIC_REFERENCE_ERROR");
    }
    if (view.cursor >= view.threshold) { // over the buffer threshold.
        _expandBuffer(view, view.buffer.length);
    }
    if (source === null || source === undefined) {
        view.buffer[view.cursor++] = TYPE_NIL;
    } else {
        switch (typeof source) {
        case "boolean": view.buffer[view.cursor++] = source ? TYPE_TRUE : TYPE_FALSE; break;
        case "number":  _encodeMessagePackNumber(source, view); break;
        case "string":
            if (view.ascii) {
                _encodeMessagePackASCIIString(source, view);
            } else {
                _encodeMessagePackString(source, view);
            }
            break;
        default:
            if (Array.isArray(source)) {
                _encodeMessagePackArray(source, view, depth);
            } else if (source instanceof Uint8Array) {
                _encodeMessagePackBin(source, view);
            } else if (source.constructor === ({}).constructor) { // isObject
                _encodeMessagePackObject(source, view, depth);
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
}

function _encodeMessagePackArray(source, view, depth) {
    // https://github.com/msgpack/msgpack/blob/master/spec.md#array-format-family
    var iz = source.length;

    if (iz <= 0x0F) {
        view.buffer[view.cursor++] = TYPE_FIX_ARRAY + iz;
    } else if (iz <= 0xFFFF) {
        view.buffer.set([TYPE_ARRAY16, iz >>  8, iz], view.cursor);
        view.cursor += 3;
    } else if (iz <= 0xFFFFFFFF) {
        view.buffer.set([TYPE_ARRAY32, iz >> 24, iz >> 16, iz >>  8, iz], view.cursor);
        view.cursor += 5;
    }

    for (var i = 0; i < iz; ++i) {
        _encodeMessagePackAny(source[i], view, depth);
    }
}

function _encodeMessagePackObject(source, view, depth) {
    // https://github.com/msgpack/msgpack/blob/master/spec.md#map-format-family
    var keys = Object.keys(source), iz = keys.length;

    if (iz <= 0xF) {
        view.buffer[view.cursor++] = TYPE_FIX_MAP + iz;
    } else if (iz <= 0xFFFF) {
        view.buffer.set([TYPE_MAP16, iz >>  8, iz], view.cursor);
        view.cursor += 3;
    } else if (iz <= 0xFFFFFFFF) {
        view.buffer.set([TYPE_MAP32, iz >> 24, iz >> 16, iz >>  8, iz], view.cursor);
        view.cursor += 5;
    }

    for (var i = 0; i < iz; ++i) { // uupaa-looper
        var key = keys[i];

        if (view.ascii) {
            _encodeMessagePackASCIIString(key, view);
        } else {
            _encodeMessagePackString(key, view);
        }
        _encodeMessagePackAny(source[key], view, depth);
    }
}

function _encodeMessagePackBin(source, view) {
    // https://github.com/msgpack/msgpack/blob/master/spec.md#bin-format-family
    var iz = source.length;

    if (iz <= 0xFF) {
        view.buffer.set([TYPE_BIN8, iz], view.cursor);
        view.cursor += 2;
    } else if (iz <= 0xFFFF) {
        view.buffer.set([TYPE_BIN16, iz >>  8, iz], view.cursor);
        view.cursor += 3;
    } else if (iz <= 0xFFFFFFFF) {
        view.buffer.set([TYPE_BIN32, iz >> 24, iz >> 16, iz >>  8, iz], view.cursor);
        view.cursor += 5;
    }

    if (view.cursor + iz >= view.threshold) {
        _expandBuffer(view, Math.max(view.cursor + iz, view.buffer.length));
    }
    view.buffer.set(source, view.cursor);
    view.cursor += iz;
}

function _encodeMessagePackNumber(source, view) {
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
        view.buffer[view.cursor++] = TYPE_FLOAT64;
        view.buffer.set(hton64(view["byte"]), view.cursor); // get byte representation
        view.cursor += 8;
    } else if (source < 0) { // negative integer
        if (source >= -32) {                // [TYPE_NEG_FIXINT | 0xNNNNN]
            view.buffer[view.cursor++] = TYPE_NEG_FIXINT + source + 32;
        } else if (source >= -0x80) {       // [TYPE_INT8, value] ( INT8: -128(-0x80) - 127(0x7f) )
            view.buffer[view.cursor++] = TYPE_INT8;
            view.buffer[view.cursor++] = source + 0x100;
        } else if (source >= -0x8000) {     // [TYPE_INT16, value x 2] ( INT16: -32768(-0x8000) - 32767(0x7fff) )
            source += 0x10000;
            view.buffer.set([TYPE_INT16, source >>  8, source], view.cursor);
            view.cursor += 3;
        } else if (source >= -0x80000000) { // [TYPE_INT32, value x 4]
            source += 0x100000000;
            view.buffer.set([TYPE_INT32, source >> 24, source >> 16,
                                         source >>  8, source], view.cursor);
            view.cursor += 5;
        } else {                            // [TYPE_INT64, value x 8]
            high = Math.floor(source / 0x100000000);
            low  = source & 0xffffffff;
            view.buffer.set([TYPE_INT64, high >> 24, high >> 16, high >>  8, high,
                                         low  >> 24, low  >> 16, low  >>  8, low], view.cursor);
            view.cursor += 9;
        }
    } else { // positive integer
        if (source < 0x80) {                // [TYPE_POS_FIXINT]
            view.buffer[view.cursor++] = TYPE_POS_FIXINT + source;
        } else  if (source < 0x100) {       // [TYPE_UINT8, value]
            view.buffer[view.cursor++] = TYPE_UINT8;
            view.buffer[view.cursor++] = source;
        } else if (source < 0x10000) {      // [TYPE_UINT16, value x 2]
            view.buffer.set([TYPE_UINT16, source >>  8, source], view.cursor);
            view.cursor += 3;
        } else if (source < 0x100000000) {  // [TYPE_UINT32, value x 4]
            view.buffer.set([TYPE_UINT32, source >> 24, source >> 16,
                                          source >>  8, source], view.cursor);
            view.cursor += 5;
        } else {                            // [TYPE_UINT64, value x 8]
            high = Math.floor(source / 0x100000000);
            low  = source & 0xffffffff;
            view.buffer.set([TYPE_UINT64, high >> 24, high >> 16, high >>  8, high,
                                          low  >> 24, low  >> 16, low  >>  8, low], view.cursor);
            view.cursor += 9;
        }
    }
}

function _encodeMessagePackASCIIString(source, view) {
    var i = 0, iz = source.length;
    var buffer = view.buffer;
    var cursor = view.cursor;

    buffer[cursor++] = TYPE_FIX_STR + iz;

    while (i + 8 < iz) {
        buffer[cursor++] = source.charCodeAt(i++);
        buffer[cursor++] = source.charCodeAt(i++);
        buffer[cursor++] = source.charCodeAt(i++);
        buffer[cursor++] = source.charCodeAt(i++);
        buffer[cursor++] = source.charCodeAt(i++);
        buffer[cursor++] = source.charCodeAt(i++);
        buffer[cursor++] = source.charCodeAt(i++);
        buffer[cursor++] = source.charCodeAt(i++);
    }
    while (i < iz) {
        buffer[cursor++] = source.charCodeAt(i++);
    }
    view.cursor = cursor;
}

function _encodeMessagePackString(source, view) {
    // https://github.com/msgpack/msgpack/blob/master/spec.md#str-format-family
    var utf8String = unescape( encodeURIComponent(source) );
    var result = new Uint8Array(utf8String.length);

    for (var i = 0, iz = utf8String.length; i < iz; ++i) {
        result[i] = utf8String.charCodeAt(i);
    }
    var size = result.length;

    if (size <= 0x1F) {
        view.buffer[view.cursor++] = TYPE_FIX_STR + size;
    } else if (size <= 0xFF) {
        view.buffer.set([TYPE_STR8,  size], view.cursor);
        view.cursor += 2;
    } else if (size <= 0xFFFF) {
        view.buffer.set([TYPE_STR16, size >>  8, size], view.cursor);
        view.cursor += 3;
    } else if (size <= 0xFFFFFFFF) {
        view.buffer.set([TYPE_STR32, size >> 24, size >> 16, size >>  8, size], view.cursor);
        view.cursor += 5;
    }
    view.buffer.set(result, view.cursor);
    view.cursor += size;
}

// --- decoder ---------------------------------------------
function _decodeMessagePack(source, // @arg Uint8Array
                            view) { // @arg Object - { ascii, cursor, double, float, byte }
                                    // @ret Any
                                    // @recursive
    var size = 0; // this variable is the data length or a uint/int value.
    var type = source[view.cursor++];

    // --- FIX_INT ---
    if (type <= TYPE_POS_FIXINT_MAX) { // Positive FixNum (0xxx xxxx) (0 ~ 127)
        return type;
    }
    if (type >= TYPE_NEG_FIXINT) {     // Negative FixNum (111x xxxx) (-32 ~ -1)
        return type - 0x100;
    }
    if (type <= TYPE_FIX_STR_MAX) {
        // --- FIX_MAP, FIX_ARRAY, FIX_STR ---
        if (type <= TYPE_FIX_MAP_MAX) {          // FixMap    (1000 xxxx)
            size = type - TYPE_FIX_MAP;
            type = TYPE_FIX_MAP;
        } else if (type <= TYPE_FIX_ARRAY_MAX) { // FixArray  (1001 xxxx)
            size = type - TYPE_FIX_ARRAY;
            type = TYPE_FIX_ARRAY;
        } else if (type <= TYPE_FIX_STR_MAX) {   // FixString (101x xxxx)
            size = type - TYPE_FIX_STR;
            type = TYPE_FIX_STR;
        }
    } else if (type >= TYPE_BIN8) {
        // --- XXX32, XXX16, XXX8 ---
        switch (type) {
        case TYPE_STR32: case TYPE_UINT32: case TYPE_INT32: case TYPE_BIN32: case TYPE_MAP32: case TYPE_ARRAY32:
            size  = source[view.cursor++] << 24 | source[view.cursor++] << 16;
            /* falls through */
        case TYPE_STR16: case TYPE_UINT16: case TYPE_INT16: case TYPE_BIN16: case TYPE_MAP16: case TYPE_ARRAY16:
            size |= source[view.cursor++] << 8;
            /* falls through */
        case TYPE_STR8:  case TYPE_UINT8:  case TYPE_INT8:  case TYPE_BIN8:
            size |= source[view.cursor++];
        }
        size = size >>> 0;
    }

    var obj, key, value, ary, len;

    switch (type) {
    case TYPE_NIL:   return null;
    case TYPE_TRUE:  return true;
    case TYPE_FALSE: return false;
    case TYPE_UINT8:
    case TYPE_UINT16:
    case TYPE_UINT32:return size;
    case TYPE_INT8:  return size < 0x80       ? size : size - 0x100;
    case TYPE_INT16: return size < 0x8000     ? size : size - 0x10000;
    case TYPE_INT32: return size < 0x80000000 ? size : size - 0x100000000;
    case TYPE_INT64:
        if (source[view.cursor] & 0x80) {
            return -( ( ((source[view.cursor++] ^ 0xff) << 24 >>> 0) |
                        ((source[view.cursor++] ^ 0xff) << 16) |
                        ((source[view.cursor++] ^ 0xff) <<  8) |
                         (source[view.cursor++] ^ 0xff) ) * 0x100000000 +
                      ( ((source[view.cursor++] ^ 0xff) << 24 >>> 0) +
                        ((source[view.cursor++] ^ 0xff) << 16) +
                        ((source[view.cursor++] ^ 0xff) <<  8) +
                         (source[view.cursor++] ^ 0xff) ) + 1 );
        }
        /* falls through */
    case TYPE_UINT64:
        view.cursor += 8;
        return view.data.getUint32(view.cursor - 8) * 0x100000000 +
               view.data.getUint32(view.cursor - 4);
    case TYPE_FLOAT32:
        view.cursor += 4;
        view["byte"].set(ntoh32(source.subarray(view.cursor - 4, view.cursor)), 0);
        return view["float"][0];
    case TYPE_FLOAT64:
        view.cursor += 8;
        view["byte"].set(ntoh64(source.subarray(view.cursor - 8, view.cursor)), 0);
        return view["double"][0];
    case TYPE_FIX_STR:
    case TYPE_STR8:
    case TYPE_STR16:
    case TYPE_STR32:
        view.cursor += size;
        if (view.ascii) {
            return String.fromCharCode.apply(null, source.subarray(view.cursor - size, view.cursor));
        }
        try {
            return decodeURIComponent( escape( TA_STR(
                                  source.subarray(view.cursor - size, view.cursor) ) ) );
        } catch ( o___o ) {
            return UTF8["decode"](source.subarray(view.cursor - size, view.cursor), true);
        }
        break;
    case TYPE_FIX_ARRAY:
    case TYPE_ARRAY16:
    case TYPE_ARRAY32:
        ary = [];
        while (size--) {
            ary.push( _decodeMessagePack(source, view) );
        }
        return ary;
    case TYPE_FIX_MAP:
    case TYPE_MAP16:
    case TYPE_MAP32:
        obj = {};
        if (view.ascii) {
            // --- FIX_STR inlining ---
            while (size--) {
                len = source[view.cursor++] - TYPE_FIX_STR;
                key = String.fromCharCode.apply(null, source.subarray(view.cursor, view.cursor + len));
                view.cursor += len;
                obj[key] = _decodeMessagePack(source, view);
            }
        } else {
            while (size--) {
                key   = _decodeMessagePack(source, view);
                value = _decodeMessagePack(source, view);
                obj[key] = value;
            }
        }
        return obj;
    case TYPE_BIN8:
    case TYPE_BIN16:
    case TYPE_BIN32:
        view.cursor += size;
        return view.copy ? new Uint8Array(source.buffer.slice(view.cursor - size, view.cursor))
                         : new Uint8Array(source.subarray(view.cursor - size, view.cursor));
    }
    throw new TypeError("UNKNOWN_TYPE");
}

// --- validate / assertions -------------------------------
//{@dev
//function $valid(val, fn, hint) { if (global["Valid"]) { global["Valid"](val, fn, hint); } }
//function $type(obj, type) { return global["Valid"] ? global["Valid"].type(obj, type) : true; }
//function $keys(obj, str) { return global["Valid"] ? global["Valid"].keys(obj, str) : true; }
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

