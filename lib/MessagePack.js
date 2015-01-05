//{@messagepack
(function(global) {
"use strict";

// --- dependency modules ----------------------------------
var Codec = global["Codec"];

// --- define / local variables ----------------------------
//var _runOnNode = "process" in global;
//var _runOnWorker = "WorkerLocation" in global;
//var _runOnBrowser = "document" in global;

var ntoh32 = Codec["ntoh32"];
var hton64 = Codec["hton64"];
var ntoh64 = Codec["ntoh64"];
var U8A_STR = Codec["U8A_STR"];

var MAX_DEPTH = 512; // cyclic reference safe guard
var ENCODE_BUFFER_SIZE = 1024 * 16;

//                              // | value range | JavaScript Types | encode    | decode    |
//                              // |-------------|------------------|-----------|-----------|
var MSG_POS_FIXINT      = 0x00; // | 0x00 - 0x7f | Number           |           |           |
var MSG_POS_FIXINT_MAX  = 0x7f; // |             |                  |           |           |
var MSG_FIX_MAP         = 0x80; // | 0x80 - 0x8f | Object           |           |           |
var MSG_FIX_MAP_MAX     = 0x8f; // |             |                  |           |           |
var MSG_FIX_ARRAY       = 0x90; // | 0x90 - 0x9f | Array            |           |           |
var MSG_FIX_ARRAY_MAX   = 0x9f; // |             |                  |           |           |
var MSG_FIX_STR         = 0xa0; // | 0xa0 - 0xbf | String           |           |           |
var MSG_FIX_STR_MAX     = 0xbf; // |             |                  |           |           |
var MSG_NIL             = 0xc0; // |             | null, undefined  |           | null      |
//  MSG_RESERVED        = 0xc1; // |             |                  |           |           |
var MSG_FALSE           = 0xc2; // |             | Boolean          |           |           |
var MSG_TRUE            = 0xc3; // |             | Boolean          |           |           |
var MSG_BIN8            = 0xc4; // |             | Uint8Array       |           |           |
var MSG_BIN16           = 0xc5; // |             | Uint8Array       |           |           |
var MSG_BIN32           = 0xc6; // |             | Uint8Array       |           |           |
//  MSG_EXT8            = 0xc7; // |             |                  |           |           |
//  MSG_EXT16           = 0xc8; // |             |                  |           |           |
//  MSG_EXT32           = 0xc9; // |             |                  |           |           |
var MSG_FLOAT32         = 0xca; // |             |                  |           |           |
var MSG_FLOAT64         = 0xcb; // |             | Number           |           |           |
var MSG_UINT8           = 0xcc; // |             | Number           |           |           |
var MSG_UINT16          = 0xcd; // |             | Number           |           |           |
var MSG_UINT32          = 0xce; // |             | Number           |           |           |
var MSG_UINT64          = 0xcf; // |             | Number           |           |           |
var MSG_INT8            = 0xd0; // |             | Number           |           |           |
var MSG_INT16           = 0xd1; // |             | Number           |           |           |
var MSG_INT32           = 0xd2; // |             | Number           |           |           |
var MSG_INT64           = 0xd3; // |             | Number           |           |           |
//  MSG_FIX_EXT1        = 0xd4; // |             |                  |           |           |
//  MSG_FIX_EXT2        = 0xd5; // |             |                  |           |           |
//  MSG_FIX_EXT4        = 0xd6; // |             |                  |           |           |
//  MSG_FIX_EXT8        = 0xd7; // |             |                  |           |           |
//  MSG_FIX_EXT16       = 0xd8; // |             |                  |           |           |
var MSG_STR8            = 0xd9; // |             | String           |           |           |
var MSG_STR16           = 0xda; // |             | String           |           |           |
var MSG_STR32           = 0xdb; // |             | String           |           |           |
var MSG_ARRAY16         = 0xdc; // |             | Array            |           |           |
var MSG_ARRAY32         = 0xdd; // |             | Array            |           |           |
var MSG_MAP16           = 0xde; // |             | Object           |           |           |
var MSG_MAP32           = 0xdf; // |             | Object           |           |           |
var MSG_NEG_FIXINT      = 0xe0; // | 0xe0 - 0xff | Number           |           |           |

// --- class / interfaces ----------------------------------
var MessagePack = {
    "encode": MessagePack_encode, // Codec.MessagePack.encode(source:Any, options:Object = {}):Uint8Array
    "decode": MessagePack_decode  // Codec.MessagePack.decode(source:Uint8Array):Any
};

function MessagePack_encode(source,    // @arg Any
                            options) { // @arg Object = {} - { bufferSize }
                                       // @options.bufferSize Integer = 16384 - encode buffer size.
                                       // @ret Uint8Array
//{@dev
    $valid($type(options, "Object|omit"), MessagePack_encode, "options");
    $valid($keys(options, "bufferSize"),  MessagePack_encode, "options");
    if (options) {
        $valid($type(options.bufferSize, "Integer|omit"), MessagePack_encode, "options.size");
    }
//}@dev

    options = options || {};

    var bufferSize = options["bufferSize"] || ENCODE_BUFFER_SIZE;
    var sharedBuffer = new ArrayBuffer(8);
    var view = {
            buffer:     new Uint8Array(bufferSize),
            size:       bufferSize,
            cursor:     0,
            "double":   new Float64Array(sharedBuffer), // ref _encodeMessagePackNumber
            "byte":     new Uint8Array(sharedBuffer)    // ref _encodeMessagePackNumber
        };
    _encodeMessagePackAny(view, source, 0);

    return view.buffer.subarray(0, view.cursor);
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
    if (view.cursor >= view.size) {
        throw new RangeError("INDEX_IS_OUT_OF_RANGE");
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

function _encodeMessagePackArray(view, source, depth) {
    // https://github.com/msgpack/msgpack/blob/master/spec.md#array-format-family
    var iz = source.length;

    if (iz < 0x10) { // FixArray
        view.buffer[view.cursor++] = MSG_FIX_ARRAY + iz;
    } else if (iz < 0x10000) { // Array16
        view.buffer.set([MSG_ARRAY16, iz >>  8, iz], view.cursor);
        view.cursor += 3;
    } else if (iz < 0x100000000) { // Array32
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

    if (iz < 0x10) { // FixMap
        view.buffer[view.cursor++] = MSG_FIX_MAP + iz;
    } else if (iz < 0x10000) { // Map16
        view.buffer.set([MSG_MAP16, iz >>  8, iz], view.cursor);
        view.cursor += 3;
    } else if (iz < 0x100000000) { // Map32
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

    if (iz < 0x10) {
        view.buffer.set([MSG_BIN8, iz], view.cursor);
        view.cursor += 2;
    } else if (iz < 0x10000) {
        view.buffer.set([MSG_BIN16, iz >>  8, iz], view.cursor);
        view.cursor += 3;
    } else if (iz < 0x100000000) {
        view.buffer.set([MSG_BIN32, iz >> 24, iz >> 16, iz >>  8, iz], view.cursor);
        view.cursor += 5;
    }
    view.buffer.set(source, view.cursor);
    view.cursor += iz;
}

function _encodeMessagePackNumber(view, source) {
    var high = 0, low = 0;

    // https://github.com/msgpack/msgpack/blob/master/spec.md#int-format-family
    if (source !== source) { // quiet NaN
        view.buffer.set([0xcb, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], view.cursor);
        view.cursor += 9;
    } else if (source === Infinity) { // positive infinity
        view.buffer.set([0xcb, 0x7f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], view.cursor);
        view.cursor += 9;
    } else if (Math.floor(source) === source) { // is Integer
        if (source < 0) {
            // --- negative integer ---
            if (source >= -32) {                // fixnum -> [111xxxxx]
                view.buffer[view.cursor++] = MSG_NEG_FIXINT + source + 32;
            } else if (source > -0x80) {        // int 8  -> [0xd0, value]
                view.buffer[view.cursor++] = MSG_INT8;
                view.buffer[view.cursor++] = source + 0x100;
            } else if (source > -0x8000) {      // int 16 -> [0xd1, value x 2]
                source += 0x10000;
                view.buffer.set([MSG_INT16, source >>  8, source], view.cursor);
                view.cursor += 3;
            } else if (source > -0x80000000) {  // int 32 -> [0xd2, value x 4]
                source += 0x100000000;
                view.buffer.set([MSG_INT32, source >> 24, source >> 16,
                                            source >>  8, source], view.cursor);
                view.cursor += 5;
            } else {                            // int 64 -> [0xd3, value x 8]
                high = Math.floor(source / 0x100000000);
                low  = source & 0xffffffff;
                view.buffer.set([MSG_INT64, high >> 24, high >> 16, high >>  8, high,
                                            low  >> 24, low  >> 16, low  >>  8, low], view.cursor);
                view.cursor += 9;
            }
        } else {
            // --- positive integer ---
            if (source < 0x80) {                // fixnum  -> [value]
                view.buffer[view.cursor++] = MSG_POS_FIXINT + source;
            } else  if (source < 0x100) {       // uint 8  -> [0xcc, value]
                view.buffer[view.cursor++] = MSG_UINT8;
                view.buffer[view.cursor++] = source;
            } else if (source < 0x10000) {      // uint 16 -> [0xcd, value x 2]
                view.buffer.set([MSG_UINT16, source >>  8, source], view.cursor);
                view.cursor += 3;
            } else if (source < 0x100000000) {  // uint 32 -> [0xce, value x 4]
                view.buffer.set([MSG_UINT32, source >> 24, source >> 16,
                                             source >>  8, source], view.cursor);
                view.cursor += 5;
            } else {                            // uint 64 -> [0xcf, value x 8]
                high = Math.floor(source / 0x100000000);
                low  = source & 0xffffffff;
                view.buffer.set([MSG_UINT64, high >> 24, high >> 16, high >>  8, high,
                                             low  >> 24, low  >> 16, low  >>  8, low], view.cursor);
                view.cursor += 9;
            }
        }
    } else { // --- double ---
        // https://github.com/msgpack/msgpack/blob/master/spec.md#float-format-family
        view["double"][0] = source; // set double value

        view.buffer[view.cursor++] = MSG_FLOAT64;
        view.buffer.set(hton64(view["byte"]), view.cursor); // get byte representation
        view.cursor += 8;
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

    if (size < 0x20) {                  // FixSTR
        view.buffer[view.cursor++] = MSG_FIX_STR + size;
    } else if (size < 0x100) {          // STR8
        view.buffer.set([MSG_STR8,  size], view.cursor);
        view.cursor += 2;
    } else if (size < 0x10000) {        // STR16
        view.buffer.set([MSG_STR16, size >>  8, size], view.cursor);
        view.cursor += 3;
    } else if (size < 0x100000000) {    // STR32
        view.buffer.set([MSG_STR32, size >> 24, size >> 16, size >>  8, size], view.cursor);
        view.cursor += 5;
    }
    view.buffer.set(result, view.cursor);
    view.cursor += size;
}

// --- decoder ---------------------------------------------
function _decodeMessagePack(source, // @arg Uint8Array
                            view) { // @arg Object - { cursor }
                                    // @ret Any
                                    // @recursive
    var size = 0;
    var type = source[view.cursor++];

    // -- range values ---
    if (type >= MSG_NEG_FIXINT) {           // Negative FixNum (111x xxxx) (-32 ~ -1)
        return type - 0x100;
    }
    if (type >= MSG_POS_FIXINT &&
        type <= MSG_POS_FIXINT_MAX) {       // Positive FixNum (0xxx xxxx) (0 ~ 127)
        return type;
    }
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

    switch (type) {
    case MSG_STR32:
    case MSG_MAP32:
    case MSG_ARRAY32:
    case MSG_BIN32:
    case MSG_INT32:
    case MSG_UINT32:
        size = (source[view.cursor++] * 0x1000000) +
               (source[view.cursor++] << 16) +
               (source[view.cursor++] <<  8) +
                source[view.cursor++];
        break;
    case MSG_STR16:
    case MSG_MAP16:
    case MSG_ARRAY16:
    case MSG_BIN16:
    case MSG_INT16:
    case MSG_UINT16:
        size = (source[view.cursor++] << 8) +
                source[view.cursor++];
        break;
    case MSG_STR8:
    case MSG_BIN8:
    case MSG_INT8:
    case MSG_UINT8:
        size = source[view.cursor++];
        break;
    }

    switch (type) {
    case MSG_MAP32:
    case MSG_MAP16:
    case MSG_FIX_MAP:   return _decodeMessagePackObject(source, view, type, size);
    case MSG_ARRAY32:
    case MSG_ARRAY16:
    case MSG_FIX_ARRAY: return _decodeMessagePackArray(source, view, type, size);
    case MSG_BIN32:
    case MSG_BIN16:
    case MSG_BIN8:      return _decodeMessagePackBin(source, view, type, size);
    case MSG_NIL:       return null;
    case MSG_FALSE:     return false;
    case MSG_TRUE:      return true;
    case MSG_FLOAT32:   return _decodeMessagePackFloat(source, view);
    case MSG_FLOAT64:   return _decodeMessagePackDouble(source, view);
    case MSG_UINT64:
    case MSG_UINT32:
    case MSG_UINT16:
    case MSG_UINT8:     return _decodeMessagePackUint(source, view, type, size);
    case MSG_INT64:
    case MSG_INT32:
    case MSG_INT16:
    case MSG_INT8:      return _decodeMessagePackInt(source, view, type, size);
    case MSG_STR32:
    case MSG_STR16:
    case MSG_STR8:
    case MSG_FIX_STR:   return _decodeMessagePackString(source, view, type, size);
    }
    throw new TypeError("UNKNOWN_TYPE");
}

function _decodeMessagePackObject(source, view, type, size) {
    var obj = {};

    while (size--) {
        var key   = _decodeMessagePack(source, view);
        var value = _decodeMessagePack(source, view);

        obj[key] = value;
    }
    return obj;
}

function _decodeMessagePackArray(source, view, type, size) {
    var ary = [];

    while (size--) {
        ary.push( _decodeMessagePack(source, view) );
    }
    return ary;
}

function _decodeMessagePackBin(source, view, type, size) {
    view.cursor += size;
    //return source.subarray(view.cursor - size, view.cursor);
    return new Uint8Array(source.buffer.slice(view.cursor - size, view.cursor));
}

function _decodeMessagePackFloat(source, view) {
    view["byte"].set(ntoh32(source.subarray(view.cursor, view.cursor + 4)), 0 );
    view.cursor += 4;
    return view["float"][0];
}

function _decodeMessagePackDouble(source, view) {
    view["byte"].set(ntoh64(source.subarray(view.cursor, view.cursor + 8)), 0);
    view.cursor += 8;
    return view["double"][0];
}

function _decodeMessagePackUint(source, view, type, num) {
    switch (type) {
    case MSG_UINT64:
        view.cursor += 8;
        var dataView = new DataView(source.buffer.slice(view.cursor - 8, view.cursor));
        return dataView.getUint32(0) * 0x100000000 + dataView.getUint32(4);
    }
    return num;
}

function _decodeMessagePackInt(source, view, type, num) {
    switch (type) {
    case MSG_INT64:
        if (source[view.cursor] & 0x80) { // Negative
            return ((source[view.cursor++] ^ 0xff) * 0x100000000000000 +
                    (source[view.cursor++] ^ 0xff) *   0x1000000000000 +
                    (source[view.cursor++] ^ 0xff) *     0x10000000000 +
                    (source[view.cursor++] ^ 0xff) *       0x100000000 +
                    (source[view.cursor++] ^ 0xff) *         0x1000000 +
                    (source[view.cursor++] ^ 0xff) *           0x10000 +
                    (source[view.cursor++] ^ 0xff) *             0x100 +
                    (source[view.cursor++] ^ 0xff) + 1) * -1;
        }
        view.cursor += 8;
        var dataView = new DataView(source.buffer.slice(view.cursor - 8, view.cursor));
        return dataView.getUint32(0) * 0x100000000 + dataView.getUint32(4); // Positive
    case MSG_INT32:
        return num < 0x80000000 ? num : num - 0x100000000;
    case MSG_INT16:
        return num < 0x8000 ? num : num - 0x10000;
    case MSG_INT8:
        return num < 0x80 ? num : num - 0x100;
    }
}

function _decodeMessagePackString(source, view, type, size) {
    var result = null;
    var subView = source.subarray(view.cursor, view.cursor + size);
    try {
        result = decodeURIComponent( escape( U8A_STR(subView) ) );
    } catch (o_o) {
        result = Codec["U32A_STR"]( Codec["UTF8"]["decode"](subView) );
    }
    view.cursor += size;
    return result;
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
if ("process" in global) {
    module["exports"] = MessagePack;
}
if (global["Codec_"]) {
    global["Codec_"]["MessagePack"] = MessagePack;
} else {
    global["Codec"]["MessagePack"] = MessagePack;
}

})((this || 0).self || global); // WebModule idiom. http://git.io/WebModule
//}@messagepack

