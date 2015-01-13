//{@messagepack
(function(global) {
"use strict";

// --- dependency modules ----------------------------------
var Codec = global["Codec"];

// --- define / local variables ----------------------------
//var _isNodeOrNodeWebKit = !!global.global;
//var _runOnNodeWebKit =  _isNodeOrNodeWebKit &&  /native/.test(setTimeout);
//var _runOnNode       =  _isNodeOrNodeWebKit && !/native/.test(setTimeout);
//var _runOnWorker     = !_isNodeOrNodeWebKit && "WorkerLocation" in global;
//var _runOnBrowser    = !_isNodeOrNodeWebKit && "document" in global;

var BIG_ENDIAN = !new Uint8Array(new Uint16Array([1]).buffer)[0];
var UTF8 = Codec["UTF8"];

var MAX_DEPTH         = 512; // threshold of cyclic reference.
var QUIET_NAN         = [0xcb, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
var POSITIVE_INFINITY = [0xcb, 0x7f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

// https://github.com/msgpack/msgpack/blob/master/spec.md
//  MessagePack types              | JavaScript types | data length   | value range               |  hex value range          |
// --------------------------------|------------------|---------------|---------------------------|---------------------------|
var TYPE_FIX_UINT       = 0x00; // | Number           |               |           0 - 127         |        0x00 - 0x7F        |
var TYPE_FIX_UINT_MAX   = 0x7f; // |                  |               |                           |                           |
var TYPE_FIX_MAP        = 0x80; // | Object           | <= 0x0F       |                           |                           |
var TYPE_FIX_MAP_MAX    = 0x8f; // |                  |               |                           |                           |
var TYPE_FIX_ARRAY      = 0x90; // | Array            | <= 0x0F       |                           |                           |
var TYPE_FIX_ARRAY_MAX  = 0x9f; // |                  |               |                           |                           |
var TYPE_FIX_STR        = 0xa0; // | String           | <= 0x1F       |                           |                           |
var TYPE_FIX_STR_MAX    = 0xbf; // |                  |               |                           |                           |
var TYPE_NIL            = 0xc0; // | null, undefined  |               |                           |                           |
//  TYPE_RESERVED       = 0xc1; // |                  |               |                           |                           |
var TYPE_FALSE          = 0xc2; // | false            |               |                           |                           |
var TYPE_TRUE           = 0xc3; // | true             |               |                           |                           |
var TYPE_BIN8           = 0xc4; // | Uint8Array       | <= 0xFF       |                           |                           |
var TYPE_BIN16          = 0xc5; // | Uint8Array       | <= 0xFFFF     |                           |                           |
var TYPE_BIN32          = 0xc6; // | Uint8Array       | <= 0xFFFFFFFF |                           |                           |
var TYPE_EXT8           = 0xc7; // |                  | <= 0xFF       |                           |                           |
var TYPE_EXT16          = 0xc8; // |                  | <= 0xFFFF     |                           |                           |
var TYPE_EXT32          = 0xc9; // |                  | <= 0xFFFFFFFF |                           |                           |
var TYPE_FLOAT32        = 0xca; // |                  |               |                           |                           |
var TYPE_FLOAT64        = 0xcb; // | Number           |               |                           |                           |
var TYPE_UINT8          = 0xcc; // | Number           |               |           0 - 255         |        0x00 - 0xFF        |
var TYPE_UINT16         = 0xcd; // | Number           |               |         256 - 65535       |       0x100 - 0xFFFF      |
var TYPE_UINT32         = 0xce; // | Number           |               |       65536 - 4294967295  |     0x10000 - 0xFFFFFFFF  |
var TYPE_UINT64         = 0xcf; // | Number           |               |  4294967296 - IEEE Max    | 0x100000000 - IEEE Max    |
var TYPE_INT8           = 0xd0; // | Number           |               |        -127 - -1          |       -0x7F - -0x1        |
var TYPE_INT16          = 0xd1; // | Number           |               |      -32767 - -128        |     -0x7FFF - -0x80       |
var TYPE_INT32          = 0xd2; // | Number           |               | -2147483647 - -32768      | -0x7FFFFFFF - -0x8000     |
var TYPE_INT64          = 0xd3; // | Number           |               |    IEEE Min - -2147483648 |    IEEE Min - -0x80000000 |
var TYPE_FIX_EXT1       = 0xd4; // |                  | 1             |                           |                           |
var TYPE_FIX_EXT2       = 0xd5; // |                  | 2             |                           |                           |
var TYPE_FIX_EXT4       = 0xd6; // |                  | 4             |                           |                           |
var TYPE_FIX_EXT8       = 0xd7; // |                  | 8             |                           |                           |
var TYPE_FIX_EXT16      = 0xd8; // |                  | 16            |                           |                           |
var TYPE_STR8           = 0xd9; // | String           | <= 0xFF       |                           |                           |
var TYPE_STR16          = 0xda; // | String           | <= 0xFFFF     |                           |                           |
var TYPE_STR32          = 0xdb; // | String           | <= 0xFFFFFFFF |                           |                           |
var TYPE_ARRAY16        = 0xdc; // | Array            | <= 0xFFFF     |                           |                           |
var TYPE_ARRAY32        = 0xdd; // | Array            | <= 0xFFFFFFFF |                           |                           |
var TYPE_MAP16          = 0xde; // | Object           | <= 0xFFFF     |                           |                           |
var TYPE_MAP32          = 0xdf; // | Object           | <= 0xFFFFFFFF |                           |                           |
var TYPE_FIX_INT        = 0xe0; // | Number           |               |         -32 - -1          |       -0x20 - -0x01       |
// ----------------------------------------------------------------------------------------------------------------------------
var TYPE_EXT_DATE       = 0x01;

// --- class / interfaces ----------------------------------
var MessagePack = {
    "encode": MessagePack_encode, // Codec.MessagePack.encode(source:Any, options:Object = {}):Uint8Array
    "decode": MessagePack_decode, // Codec.MessagePack.decode(source:Uint8Array, options:Object = {}):Any
    "extenc": MessagePack_extenc, // Codec.MessagePack.extenc(source:Any):Object - { data:Uint8Array, type:INT8 }
    "extdec": MessagePack_extdec, // Codec.MessagePack.extdec(data:Uint8Array, type:INT8):Any
};

function MessagePack_encode(source,    // @arg Any
                            options) { // @arg Object = {} - { askey, ascii, buffer, extenc }
                                       // @options.askey Boolean = false - Map key encode to FIX_STR ASCII.
                                       // @options.ascii Boolean = false - String encode to FIX_STR ASCII.
                                       // @options.buffer Uint8Array = null - encode buffer.
                                       // @options.extenc Function = MessagePack.extenc - TYPE_EXT encode function.
                                       // @ret Uint8Array - return new view of buffer.
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(options, "Object|omit"), MessagePack_encode, "options");
        $valid($keys(options, "askey|ascii|buffer|extenc|extdec|copy"), MessagePack_encode, "options");
        if (options) {
            $valid($type(options.askey,  "Boolean|omit"),    MessagePack_encode, "options.askey");
            $valid($type(options.ascii,  "Boolean|omit"),    MessagePack_encode, "options.ascii");
            $valid($type(options.buffer, "Uint8Array|omit"), MessagePack_encode, "options.buffer");
            $valid($type(options.extenc, "Function|omit"),   MessagePack_encode, "options.extenc");
        }
    }
//}@dev
    options = options || {};
    var sharedBuffer = new ArrayBuffer(8);
    var view = {
            askey:      options["askey"]  || false,
            ascii:      options["ascii"]  || false,
            buffer:     options["buffer"] || new Uint8Array(1024 * 16), // 16kb
            extenc:     options["extenc"] !== undefined ? options["extenc"] : MessagePack_extenc,
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
                            options) { // @arg Object = {} - { askey, ascii, extdec, copy }
                                       // @options.askey Boolean = false - Map key decode to FIX_STR ASCII.
                                       // @options.ascii Boolean = false - String decode to FIX_STR ASCII.
                                       // @options.extdec Function = MessagePack.extdec - TYPE_EXT decode function.
                                       // @options.copy Boolean = false - copy memory.
                                       // @ret Any
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(source,  "Uint8Array"),       MessagePack_decode, "source");
        $valid($type(options, "Object|omit"),      MessagePack_decode, "options");
        $valid($keys(options, "askey|ascii|buffer|extenc|extdec|copy"), MessagePack_decode, "options");
        if (options) {
            $valid($type(options.askey,  "Boolean|omit"),  MessagePack_decode, "options.askey");
            $valid($type(options.ascii,  "Boolean|omit"),  MessagePack_decode, "options.ascii");
            $valid($type(options.extdec, "Function|omit"), MessagePack_decode, "options.extdec");
            $valid($type(options.copy,   "Boolean|omit"),  MessagePack_decode, "options.copy");
        }
    }
//}@dev

    options = options || {};
    var sharedBuffer = new ArrayBuffer(8);
    var view = {
            copy:       options["copy"]   || false,
            askey:      options["askey"]  || false,
            ascii:      options["ascii"]  || false,
            extdec:     options["extdec"] !== undefined ? options["extdec"] : MessagePack_extdec,
            cursor:     0,
            "double":   new Float64Array(sharedBuffer), // ref _decodeMessagePackDouble
            "float":    new Float32Array(sharedBuffer), // ref _decodeMessagePackFloat
            "byte":     new Uint8Array(sharedBuffer),   // ref _decodeMessagePackDouble and ***Float
        };
    return _decodeMessagePack(source, view);
}

function MessagePack_extenc(source) { // @arg Any
                                      // @ret Object - { data:Uint8Array, type:INT8 }
    if (source instanceof Date) {
        var buffer = new Array(8);
        _encodeUint8(source.getTime(), buffer, 0);
        return { "data": buffer, "type": TYPE_EXT_DATE };
    }
}

function MessagePack_extdec(data,   // @arg Uint8Array
                            type) { // @arg Int8
                                    // @ret Any
    var view = { cursor: 0 };

    switch (type) {
    case TYPE_EXT_DATE:
        var date = new Date();
        date.setTime(_decodeUint8(data, view));
        return date;
    }
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
                _encodeMessagePackASCII(source, view);
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
            } else if (view.extenc) {
                _encodeMessagePackExt(source, view);
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
    var keys = Object.keys(source), i = 0, iz = keys.length, key = "";

    if (iz <= 0xF) {
        view.buffer[view.cursor++] = TYPE_FIX_MAP + iz;
    } else if (iz <= 0xFFFF) {
        view.buffer.set([TYPE_MAP16, iz >>  8, iz], view.cursor);
        view.cursor += 3;
    } else if (iz <= 0xFFFFFFFF) {
        view.buffer.set([TYPE_MAP32, iz >> 24, iz >> 16, iz >>  8, iz], view.cursor);
        view.cursor += 5;
    }

    if (view.askey) {
        for (; i < iz; ++i) { // uupaa-looper
            key = keys[i];
            _encodeMessagePackASCII(key, view);
            _encodeMessagePackAny(source[key], view, depth);
        }
    } else {
        for (; i < iz; ++i) { // uupaa-looper
            key = keys[i];
            _encodeMessagePackString(key, view);
            _encodeMessagePackAny(source[key], view, depth);
        }
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
    var buffer = view.buffer;
    var cursor = view.cursor;

    if (source !== source) {
        buffer.set(QUIET_NAN, cursor);
        cursor += 9;
    } else if (source === Infinity) {
        buffer.set(POSITIVE_INFINITY, cursor);
        cursor += 9;
    } else if (Math.floor(source) !== source) { // float or double?
        view["double"][0] = source; // set double value
        buffer[cursor++] = TYPE_FLOAT64;
        var u8 = view["byte"];
        buffer.set(BIG_ENDIAN ? u8 : [ u8[7], u8[6], u8[5], u8[4], u8[3], u8[2], u8[1], u8[0] ], cursor); // get byte representation
        cursor += 8;
    } else if (source < 0) { // negative integer
        if (source >= -32) {                // [TYPE_FIX_INT | 0xNNNNN]
            buffer[cursor++] = TYPE_FIX_INT + source + 32;
        } else if (source >= -0x80) {       // [TYPE_INT8, value] ( INT8: -128(-0x80) - 127(0x7f) )
            buffer[cursor++] = TYPE_INT8;
            buffer[cursor++] = source + 0x100;
        } else if (source >= -0x8000) {     // [TYPE_INT16, value x 2] ( INT16: -32768(-0x8000) - 32767(0x7fff) )
         // http://gyazo.com/67d91c7783c33c3e95d9bca5320f0817.png
         // buffer.set([TYPE_INT16, source >>  8, source], cursor);
         // cursor += 3;
         // http://gyazo.com/6e348112a7b3e5abb6d601e76e700b92.png
            buffer[cursor++] = TYPE_INT16;
            buffer[cursor++] = source >>  8;
            buffer[cursor++] = source;
        } else if (source >= -0x80000000) { // [TYPE_INT32, value x 4]
         // http://gyazo.com/fdd442197944213234254edfc9544468.png
         // buffer.set([TYPE_INT32, source >> 24, source >> 16, source >>  8, source], cursor);
         // cursor += 5;
         // http://gyazo.com/81014bcc18892cceda43301c9a0ba0c3.png
            buffer[cursor++] = TYPE_INT32;
            buffer[cursor++] = source >> 24;
            buffer[cursor++] = source >> 16;
            buffer[cursor++] = source >>  8;
            buffer[cursor++] = source;
        } else {                            // [TYPE_INT64, value x 8]
            buffer[cursor++] = TYPE_INT64;
            cursor = _encodeUint8(source, buffer, cursor);
        }
    } else { // positive integer
        if (source < 0x80) {                // [TYPE_FIX_UINT]
            buffer[cursor++] = TYPE_FIX_UINT + source;
        } else  if (source < 0x100) {       // [TYPE_UINT8, value]
            buffer[cursor++] = TYPE_UINT8;
            buffer[cursor++] = source;
        } else if (source < 0x10000) {      // [TYPE_UINT16, value x 2]
         // http://gyazo.com/9a5409ae7739514b93b2ec50f4eb9d64.png
         // buffer.set([TYPE_UINT16, source >>  8, source], cursor);
         // cursor += 3;
         // http://gyazo.com/6182e2e32de87de49441f02a59fceae3.png
            buffer[cursor++] = TYPE_UINT16;
            buffer[cursor++] = source >>  8;
            buffer[cursor++] = source;
        } else if (source < 0x100000000) {  // [TYPE_UINT32, value x 4]
         // http://gyazo.com/9ef8d93ff8f7cd267352287c971bd14f.png
         // buffer.set([TYPE_UINT32, source >> 24, source >> 16, source >>  8, source], cursor);
         // cursor += 5;
         // http://gyazo.com/aaee3eb913047d8f092b4d0b33f8debd.png
            buffer[cursor++] = TYPE_UINT32;
            buffer[cursor++] = source >> 24;
            buffer[cursor++] = source >> 16;
            buffer[cursor++] = source >>  8;
            buffer[cursor++] = source;
        } else {                            // [TYPE_UINT64, value x 8]
            buffer[cursor++] = TYPE_UINT64;
            cursor = _encodeUint8(source, buffer, cursor);
        }
    }
    view.cursor = cursor;
}

function _encodeMessagePackASCII(source, view) {
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

function _encodeMessagePackExt(source, view) {
    var r = view.extenc(source); // extenc(source:Any):Object - { data:Uint8Array, type:INT8 }
    if (!r) {
        throw new TypeError("UNKNOWN_TYPE");
    }
    var EXT_TYPES = { 1: TYPE_FIX_EXT1, 2: TYPE_FIX_EXT2, 4: TYPE_FIX_EXT4,
                      8: TYPE_FIX_EXT8, 16: TYPE_FIX_EXT16 };

    var type = r["type"];
    var data = r["data"];

    if (!type || !data) {
        throw new TypeError("INVALID_DATA");
    }
    var size = data.length;

    switch (size) {
    case 1: case 2: case 4: case 8: case 16:
        view.buffer[view.cursor++] = EXT_TYPES[size];
        view.buffer[view.cursor++] = type;
        view.buffer.set(data, view.cursor);
        view.cursor += size;
        break;
    default:
        if (size <= 0xFF) {
            view.buffer.set([TYPE_EXT8, size, type], view.cursor);
            view.buffer.set(data, view.cursor += 3);
            view.cursor += size;
        } else if (size <= 0xFFFF) {
            view.buffer.set([TYPE_EXT16, size >> 8, size, type], view.cursor);
            view.buffer.set(data, view.cursor += 4);
            view.cursor += size;
        } else if (size <= 0xFFFFFFFF) {
            view.buffer.set([TYPE_EXT32, size >> 24, size >> 16, size >> 8, size, type], view.cursor);
            view.buffer.set(data, view.cursor += 6);
            view.cursor += size;
        } else {
            throw new TypeError("DATA_LENGTH_TOO_LONG");
        }
    }
}

// --- decoder ---------------------------------------------
function _decodeMessagePack(source, // @arg Uint8Array
                            view) { // @arg Object - { extdec, askey, cursor, double, float, byte }
                                    // @ret Any
                                    // @recursive
    var size = 0; // this variable is the data length or a uint/int value.
    var type = source[view.cursor++];

    // --- FIX_UINT, FIX_INT ---
    if (type <= TYPE_FIX_UINT_MAX) { // Positive FixNum (0xxx xxxx) (0 ~ 127)
        return type;
    }
    if (type >= TYPE_FIX_INT) {      // Negative FixNum (111x xxxx) (-32 ~ -1)
        return type - 0x100;
    }

    var u8;

    if (type >= TYPE_NIL && type <= TYPE_INT64) {
        switch (type) {
        case TYPE_NIL:      return null;
        case TYPE_TRUE:     return true;
        case TYPE_FALSE:    return false;
        case TYPE_INT32:    size = (source[view.cursor++] << 24 | source[view.cursor++] << 16 |
                                    source[view.cursor++] << 8  | source[view.cursor++]) >>> 0;
                            return size < 0x80000000 ? size : size - 0x100000000;
        case TYPE_INT16:    size =  source[view.cursor++] << 8  | source[view.cursor++];
                            return size < 0x8000     ? size : size - 0x10000;
        case TYPE_INT8:     size =  source[view.cursor++];
                            return size < 0x80       ? size : size - 0x100;
        case TYPE_INT64:    if (source[view.cursor] & 0x80) {
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
        case TYPE_UINT64:   return _decodeUint8(source, view);
        case TYPE_UINT32:   return (source[view.cursor++] << 24 | source[view.cursor++] << 16 |
                                    source[view.cursor++] << 8  | source[view.cursor++]) >>> 0;
        case TYPE_UINT16:   return  source[view.cursor++] << 8  | source[view.cursor++];
        case TYPE_UINT8:    return  source[view.cursor++];
        case TYPE_FLOAT64:  view.cursor += 8;
                            // http://gyazo.com/b572c6217259963f179c4451469ce190.png
                            // view["byte"].set(ntoh64( source.subarray(view.cursor - 8, view.cursor) ), 0);
                            // http://gyazo.com/6cf1bf0e888a5f5b1560824c55c06682.png
                            u8 = source.subarray(view.cursor - 8, view.cursor);
                            view["byte"].set(BIG_ENDIAN ? u8 : [ u8[7], u8[6], u8[5], u8[4], u8[3], u8[2], u8[1], u8[0] ], 0);
                            return view["double"][0];
        case TYPE_FLOAT32:  view.cursor += 4;
                            u8 = source.subarray(view.cursor - 4, view.cursor);
                            view["byte"].set(BIG_ENDIAN ? u8 : [ u8[3], u8[2], u8[1], u8[0] ], 0);
                            return view["float"][0];
        }
    }

    if (type <= TYPE_FIX_STR_MAX) {
        // --- FIX_MAP, FIX_ARRAY, FIX_STR ---
        if (type <= TYPE_FIX_MAP_MAX) {          // FixMap    (1000 xxxx)
            size = type - TYPE_FIX_MAP;
            type = TYPE_FIX_MAP;
        } else if (type <= TYPE_FIX_ARRAY_MAX) { // FixArray  (1001 xxxx)
            size = type - TYPE_FIX_ARRAY;
            type = TYPE_FIX_ARRAY;
        } else {                                 // FixString (101x xxxx)
            size = type - TYPE_FIX_STR;
            type = TYPE_FIX_STR;
        }
    } else if (type >= TYPE_BIN8) {
        // --- XXX32, XXX16, XXX8 ---
        switch (type) {
        case TYPE_STR32: case TYPE_BIN32: case TYPE_EXT32: case TYPE_MAP32:  case TYPE_ARRAY32:
            size = (source[view.cursor++] << 24 | source[view.cursor++] << 16 |
                    source[view.cursor++] << 8  | source[view.cursor++]) >>> 0;
            break;
        case TYPE_STR16: case TYPE_BIN16: case TYPE_EXT16: case TYPE_MAP16:  case TYPE_ARRAY16:
            size = source[view.cursor++] << 8 | source[view.cursor++];
            break;
        case TYPE_STR8:  case TYPE_BIN8: case TYPE_EXT8:
            size = source[view.cursor++];
        }
    }

    var object, key, len, i = 0;

    switch (type) {
    case TYPE_STR32:
    case TYPE_STR16:
    case TYPE_STR8:
    case TYPE_FIX_STR:
        view.cursor += size;
        u8 = source.subarray(view.cursor - size, view.cursor);
        if (view.ascii) {
            return String.fromCharCode.apply(null, u8);
        }
        try {
            return decodeURIComponent( escape( String.fromCharCode.apply(null, u8) ) );
        } catch ( o___o ) {
            return UTF8["decode"](u8, true);
        }
        break;
    case TYPE_ARRAY32:
    case TYPE_ARRAY16:
    case TYPE_FIX_ARRAY:
        object = [];
// http://gyazo.com/671cc7ec8b59f5da3b7ffa11c0672ac6.png
      //while (size--) {
      //    object.push( _decodeMessagePack(source, view) );
      //}
// http://gyazo.com/b65c680f04b2759f30147e2618d2bea6.png
        while (i + 8 < size) {
            object.push(_decodeMessagePack(source, view),
                        _decodeMessagePack(source, view),
                        _decodeMessagePack(source, view),
                        _decodeMessagePack(source, view),
                        _decodeMessagePack(source, view),
                        _decodeMessagePack(source, view),
                        _decodeMessagePack(source, view),
                        _decodeMessagePack(source, view));
            i += 8;
        }
        while (i++ < size) {
            object.push( _decodeMessagePack(source, view) );
        }
        return object;
    case TYPE_MAP32:
    case TYPE_MAP16:
    case TYPE_FIX_MAP:
        object = {};
        if (view.askey) {
            // --- FIX_STR inlining ---
            while (size--) {
                len = source[view.cursor++] - TYPE_FIX_STR;
                key = String.fromCharCode.apply(null, source.subarray(view.cursor, view.cursor + len));
                view.cursor += len;
                object[key] = _decodeMessagePack(source, view);
            }
        } else {
            while (size--) {
                key         = _decodeMessagePack(source, view);
                object[key] = _decodeMessagePack(source, view);
            }
        }
        return object;
    case TYPE_BIN32:
    case TYPE_BIN16:
    case TYPE_BIN8:
        view.cursor += size;
        return view.copy ? new Uint8Array(source.buffer.slice(view.cursor - size, view.cursor))
                         : new Uint8Array(source.subarray(view.cursor - size, view.cursor));
    case TYPE_FIX_EXT16:
    case TYPE_FIX_EXT8:
    case TYPE_FIX_EXT4:
    case TYPE_FIX_EXT2:
    case TYPE_FIX_EXT1:
        size = type === TYPE_FIX_EXT1 ? 1 :
               type === TYPE_FIX_EXT2 ? 2 :
               type === TYPE_FIX_EXT4 ? 4 :
               type === TYPE_FIX_EXT8 ? 8 : 16;
        /* falls through */
    case TYPE_EXT32:
    case TYPE_EXT16:
    case TYPE_EXT8:
        type = source[view.cursor++];
        view.cursor += size;
        if (view.extdec) {
            // extdec(data:Uint8Array, type:INT8):Any;
            return view.extdec(source.subarray(view.cursor - size, view.cursor), type);
        }
        return undefined;
    }
    throw new TypeError("UNKNOWN_TYPE");
}

function _encodeUint8(source,   // @arg INT64|UINT64
                      buffer,   // @arg Uint8Array|Array
                      cursor) { // @arg Integer
                                // @ret Integer
    var high = Math.floor(source / 0x100000000);
    var low  = source & 0xffffffff;
    buffer[cursor++] = high >> 24;
    buffer[cursor++] = high >> 16;
    buffer[cursor++] = high >>  8;
    buffer[cursor++] = high;
    buffer[cursor++] = low  >> 24;
    buffer[cursor++] = low  >> 16;
    buffer[cursor++] = low  >>  8;
    buffer[cursor++] = low;
    return cursor;
}

function _decodeUint8(source,  // @arg Uint8Array
                      view) {  // @arg Object - { cursor }
                               // @ret UINT64
    var cursor = view.cursor;
    var high = (source[cursor++] << 24 | source[cursor++] << 16 |
                source[cursor++] << 8  | source[cursor++]) >>> 0;
    var low  = (source[cursor++] << 24 | source[cursor++] << 16 |
                source[cursor++] << 8  | source[cursor++]) >>> 0;
    view.cursor = cursor;
    return high * 0x100000000 + low;
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

