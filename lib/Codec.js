(function(global) {
"use strict";

// Uint8Array to Array
//      Array.prototype.slice.call(source);
//
// Array to Uint8Array
//      new Uint8Array(source);
//
// String to UTF8String
//      unescape( encodeURIComponent(source) );
//
// UTF8String to String
//      decodeURIComponent( escape(source) );
//

// --- dependency modules ----------------------------------
// --- define / local variables ----------------------------
var _isNodeOrNodeWebKit = !!global.global;
//var _runOnNodeWebKit =  _isNodeOrNodeWebKit && /native/.test(setTimeout);
var _runOnNode       =  _isNodeOrNodeWebKit && !/native/.test(setTimeout);
//var _runOnWorker     = !_isNodeOrNodeWebKit && "WorkerLocation" in global;
//var _runOnBrowser    = !_isNodeOrNodeWebKit && "document" in global;

var HEX = ["0", "1", "2", "3", "4", "5", "6", "7",
           "8", "9", "a", "b", "c", "d", "e", "f"];
var BIG_ENDIAN = !new Uint8Array(new Uint16Array([1]).buffer)[0];

// --- class / interfaces ----------------------------------
function Codec() {
}

//{@dev
Codec["repository"] = "https://github.com/uupaa/Codec.js"; // GitHub repository URL. http://git.io/Help
//}@dev

// --- endian ---
Codec["BIG_ENDIAN"] = BIG_ENDIAN;
Codec["hton16"] = hton16;       // Codec.hton16(source:Uint8Array|Array):Array
Codec["ntoh16"] = hton16;       // Codec.ntoh16(source:Uint8Array|Array):Array
Codec["hton32"] = hton32;       // Codec.hton32(source:Uint8Array|Array):Array
Codec["ntoh32"] = hton32;       // Codec.ntoh32(source:Uint8Array|Array):Array
Codec["hton64"] = hton64;       // Codec.hton64(source:Uint8Array|Array):Array
Codec["ntoh64"] = hton64;       // Codec.ntoh64(source:Uint8Array|Array):Array

Codec["U8A_HEX"]  = U8A_HEX;    // Codec.U8A_HEX(source:Uint8Array):HexStringArray

Codec["TA_STR"]   = TA_STR;     // Codec.TA_STR(source:TypedArray|Array):BinaryString
Codec["STR_TA"]   = STR_TA;     // Codec.STR_TA(source:BinaryString, arrayBits:Integer = 8):Uint8Array

Codec["UTF8_STR"] = UTF8_STR;   // Codec.STR_UTF8(source:String):UTF8String
Codec["STR_UTF8"] = STR_UTF8;   // Codec.UTF8_STR(source:UTF8String):String

Codec["toArrayBuffer"] = toArrayBuffer;
                                // Codec.toArrayBuffer(source:BlobURLString|URLString|Blob|File|TypedArray|ArrayBuffer,
                                //                     callback:Function):void

//{@utf8
Codec["UTF8"] = {
    "encode":   UTF8_encode,    // UTF8.encode(source:Uint8Array|Uint16Array|Uint32Array|String):Uint8Array
    "decode":   UTF8_decode     // UTF8.decode(source:Uint8Array, toString:Boolean = false):Uint32Array|String
};
//}@utf8
//{@base64
Codec["Base64"] = {
    "btoa":     Base64_btoa,    // Codec.Base64.btoa(source:String):Base64String
    "atob":     Base64_atob,    // Codec.Base64.atob(source:Base64String):String
    "encode":   Base64_encode,  // Codec.Base64.encode(source:Uint8Array):Base64Uint8Array
    "decode":   Base64_decode   // Codec.Base64.decode(source:Base64Uint8Array):Uint8Array
};
//}@base64

// --- implements ------------------------------------------
function hton16(source) { // @arg Uint8Array|Array
                          // @ret Array
                          // @desc hton16 - host to network 16bit byte order
    return BIG_ENDIAN ? [ source[0], source[1] ]
                      : [ source[1], source[0] ];
}
function hton32(source) { // @arg Uint8Array|Array
                          // @ret Array
                          // @desc hton32 - host to network 32bit byte order
    return BIG_ENDIAN ? [ source[0], source[1], source[2], source[3] ]
                      : [ source[3], source[2], source[1], source[0] ];
}
function hton64(source) { // @arg Uint8Array|Array
                          // @ret Array
                          // @desc hton64 - host to network 64bit byte order
    return BIG_ENDIAN ? [ source[0], source[1], source[2], source[3],
                          source[4], source[5], source[6], source[7] ]
                      : [ source[7], source[6], source[5], source[4],
                          source[3], source[2], source[1], source[0] ];
}

function U8A_HEX(source) { // @arg Uint8Array - [0x00, 0x41, 0x53, 0x43, 0x49, 0x49, 0xff, ...]
                           // @ret HexStringArray - ["00", "41", "53", "43", "49", "49", "ff", ...]
//{@dev
    $valid($type(source, "Uint8Array"), U8A_HEX, "source");
//}@dev

    var result = [];
    for (var i = 0, iz = source.length; i < iz; ++i) {
        var v = source[i];
        result.push( HEX[v >> 4] + HEX[v & 0xf] );
    }
    return result;
}

function TA_STR(source) { // @arg TypedArray|Array
                          // @ret BinaryString
                          // @desc convert TypedArray to String
//{@dev
    $valid($type(source, "TypedArray|Array"), TA_STR, "source");
//}@dev
    var rv = [], i = 0, iz = source.length, bulkSize = 32000;
    var method = Array.isArray(source) ? "slice" : "subarray";

    // Avoid String.fromCharCode.apply(null, BigArray) exception
    if (iz < bulkSize) {
        return String.fromCharCode.apply(null, source);
    }
    for (; i < iz; i += bulkSize) {
        rv.push( String.fromCharCode.apply(null, source[method](i, i + bulkSize)) );
    }
    return rv.join("");
}

function STR_TA(source,      // @arg BinaryString
                arrayBits) { // @arg Integer = 8
                             // @ret Uint8Array|Uint16Array|Uint32Array
//{@dev
    $valid($type(source,     "BinaryString"), STR_TA, "source");
    $valid($type(arrayBits, "Integer|omit"), STR_TA, "arrayBits");
    if (arrayBits) {
        $valid(arrayBits ===  8 ||
               arrayBits === 16 ||
               arrayBits === 32, STR_TA, "arrayBits");
    }
//}@dev

    var result = null;
    var filter = 0;

    switch (arrayBits || 8) {
    case 32: result = new Uint32Array(source.length); filter = 0xffffffff; break;
    case 16: result = new Uint16Array(source.length); filter = 0xffff; break;
    case 8:  result = new Uint8Array(source.length);  filter = 0xff;
    }
    for (var i = 0, iz = source.length; i < iz; ++i) {
        result[i] = source.charCodeAt(i) & filter;
    }
    return result;
}

function STR_UTF8(source) { // @arg String
                            // @ret UTF8String
//{@dev
    $valid($type(source, "String"), STR_UTF8, "source");
//}@dev

    return unescape( encodeURIComponent(source) );
}

function UTF8_STR(source) { // @arg UTF8String
                            // @ret String
//{@dev
    $valid($type(source, "String"), UTF8_STR, "source");
//}@dev

    return decodeURIComponent( escape(source) );
}

function toArrayBuffer(source,     // @arg BlobURLString|URLString|Blob|File|TypedArray|ArrayBuffer
                       callback) { // @arg Function - callback(result:ArrayBuffer, source:Any):void
                                   // @desc convert to ArrayBuffer
    if (source) {
        if (global["ArrayBuffer"]) {
            if (source instanceof ArrayBuffer) { // ArrayBuffer
                callback(source, source);
                return;
            }
            if (source["buffer"] instanceof ArrayBuffer) { // TypedArray
                callback(source["buffer"], source);
                return;
            }
        }
        if (global["XMLHttpRequest"]) {
            if (typeof source === "string") { // BlobURLString or URLString
                var xhr = new XMLHttpRequest();
                xhr["responseType"] = "arraybuffer";
                xhr["onload"] = function() {
                    callback(xhr["response"], source);
                };
                xhr.open("GET", source);
                xhr.send();
                return;
            }
        }
        if (global["Blob"] && global["FileReader"]) {
            if (source instanceof Blob) { // Blob or File
                var reader = new FileReader();
                reader["onload"] = function() {
                    callback(reader["result"], source);
                };
                reader["readAsArrayBuffer"](source);
                return;
            }
        }
    }
    throw new TypeError("Unknown source type");
}

// === UTF8 ================================================
//{@utf8
function UTF8_encode(source) { // @arg Uint8Array|Uint16Array|Uint32Array|String - Unicode values.
                               // @ret Uint8Array  - UTF8 values
                               // @desc convert Unicode to UTF8 Integer Array.
//{@dev
    $valid($type(source, "Uint8Array|Uint16Array|Uint32Array|String"), UTF8_encode, "source");
//}@dev

    var isString = typeof source === "string";
    var result = [], i = 0, iz = source.length, d = 0, u = 0;

    while (i < iz) {
        var c = source[i++];
        if (isString) {
            c = c.charCodeAt(0);
        }
        if (c <= 0x7F) { // [1]
            // 00000000 0zzzzzzz
            result.push(c);                                   // 0zzz zzzz (1st)
        } else if (c <= 0x07FF) { // [2]
            // 00000yyy yyzzzzzz
            result.push(c >>>  6 & 0x1f | 0xc0,               // 110y yyyy (1st)
                        c        & 0x3f | 0x80);              // 10zz zzzz (2nd)
        } else if (c <= 0xFFFF) { // [3] or [5]
            if (c >= 0xD800 && c <= 0xDBFF) { // [5] Surrogate Pairs
                // 110110UU UUwwwwxx 110111yy yyzzzzzz
                d = source[i++];
                u = (c >>> 6 & 0x0f) + 1; // 0xUUUU+1 -> 0xuuuuu
                result.push(
                     u >>>  2 & 0x07 | 0xf0,                  // 1111 0uuu (1st)
                    (u <<   4 & 0x30 | 0x80) | c >>> 2 & 0xf, // 10uu wwww (2nd)
                    (c <<   4 & 0x30 | 0x80) | d >>> 6 & 0xf, // 10xx yyyy (3rd)
                     d        & 0x3f | 0x80);                 // 10zz zzzz (4th)
            } else {
                // xxxxyyyy yyzzzzzz
                result.push(c >>> 12 & 0x0f | 0xe0,           // 1110 xxxx (1st)
                            c >>>  6 & 0x3f | 0x80,           // 10yy yyyy (2nd)
                            c        & 0x3f | 0x80);          // 10zz zzzz (3rd)
            }
        } else if (c <= 0x10FFFF) { // [4]
            // 000wwwxx xxxxyyyy yyzzzzzz
            result.push(c >>> 18 & 0x07 | 0xf0,               // 1111 0www (1st)
                        c >>> 12 & 0x3f | 0x80,               // 10xx xxxx (2nd)
                        c >>>  6 & 0x3f | 0x80,               // 10yy yyyy (3rd)
                        c        & 0x3f | 0x80);              // 10zz zzzz (4th)
        }
    }
    return new Uint8Array(result);
}

function UTF8_decode(source,     // @arg Uint8Array
                     toString) { // @arg Boolean = false
                                 // @ret Uint32Array|String
                                 // @desc convert UTF8 to Unicode Integer Array.
//{@dev
    $valid($type(source,   "Uint8Array"),   UTF8_decode, "source");
    $valid($type(toString, "Boolean|omit"), UTF8_decode, "toString");
//}@dev

    var result = [], i = 0, iz = source.length;
    var c = 0, d = 0, e = 0, f = 0;
    var u = 0, w = 0, x = 0, y = 0, z = 0;

    while (i < iz) {
        c = source[i++];
        if (c < 0x80) {         // [1] 0x00 - 0x7F (1 byte)
            result.push(c);
        } else if (c < 0xE0) {  // [2] 0xC2 - 0xDF (2 byte)
            d = source[i++];
            result.push( (c & 0x1F) <<  6 | d & 0x3F );
        } else if (c < 0xF0) {  // [3] 0xE0 - 0xE1, 0xEE - 0xEF (3 bytes)
            d = source[i++];
            e = source[i++];
            result.push( (c & 0x0F) << 12 | (d & 0x3F) <<  6 | e & 0x3F );
        } else if (c < 0xF5) {  // [4] 0xF0 - 0xF4 (4 bytes)
            d = source[i++];
            e = source[i++];
            f = source[i++];
            u = (((c & 0x07) << 2) | ((d >> 4) & 0x03)) - 1;
            w = d & 0x0F;
            x = (e >> 4) & 0x03;
            z = f & 0x3F;
            result.push( 0xD8 | (u << 6) | (w << 2) | x,
                         0xDC | (y << 4) | z );
        }
    }
    if (toString) {
        return TA_STR(result);
    }
    return new Uint32Array(result);
}
//}@utf8

// === Base64 ==============================================
//{@base64
var BASE64_ENCODE = [
     65, 66, 67, 68,  69, 70, 71, 72,  73, 74, 75, 76,  77, 78, 79, 80,  // 00-0f
     81, 82, 83, 84,  85, 86, 87, 88,  89, 90, 97, 98,  99,100,101,102,  // 10-1f
    103,104,105,106, 107,108,109,110, 111,112,113,114, 115,116,117,118,  // 20-2f
    119,120,121,122,  48, 49, 50, 51,  52, 53, 54, 55,  56, 57, 43, 47]; // 30-3f
var PADDING = 61; // "="
var BASE64_DECODE = [
      0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0,  // 00-0f
      0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0,  // 10-1f
      0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0, 62,   0, 62,  0, 63,  // 20-2f
     52, 53, 54, 55,  56, 57, 58, 59,  60, 61,  0,  0,   0,  0,  0,  0,  // 30-3f
      0,  0,  1,  2,   3,  4,  5,  6,   7,  8,  9, 10,  11, 12, 13, 14,  // 40-4f
     15, 16, 17, 18,  19, 20, 21, 22,  23, 24, 25,  0,   0,  0,  0, 63,  // 50-5f
      0, 26, 27, 28,  29, 30, 31, 32,  33, 34, 35, 36,  37, 38, 39, 40,  // 60-6f
     41, 42, 43, 44,  45, 46, 47, 48,  49, 50, 51,  0,   0,  0,  0,  0]; // 70-7f

function Base64_btoa(source) { // @arg String
                               // @ret Base64String
//{@dev
    $valid($type(source, "String"), Base64_btoa, "source");
//}@dev

/* FIXME:
    if (_runOnNode) {
        return new Buffer(source, "base64").toString("binary");
    }
 */
    if ("btoa" in global) {
        try {
            return global["btoa"](source); // String to Base64String
        } catch (o_o) {
            // maybe. binary data has high-order bytes(non ascii value)
        }
        return global["btoa"]( TA_STR( STR_TA(source) ) ); // low-pass filter
    }
    return TA_STR( Base64_encode( STR_TA(source) ) );
}

function Base64_atob(source) { // @arg Base64String
                               // @ret String
//{@dev
    $valid($type(source, "Base64String"), Base64_atob, "source");
//}@dev

/* FIXME:
    if (_runOnNode) {
        return new Buffer(source, "binary").toString("base64");
    }
 */
    if ("atob" in global) {
        try {
            return global["atob"](source);
        } catch (o_o) {
            // maybe. broken base64 data
        }
    }
    return TA_STR( Base64_decode( STR_TA(source) ) );
}

function Base64_encode(source) { // @arg Uint8Array
                                 // @ret Base64Uint8Array
                                 // @desc Uint8Array to Base64Uint8Array.
//{@dev
    $valid($type(source, "Uint8Array"), Base64_encode, "source");
//}@dev

    if (_runOnNode) {
        return STR_TA( new Buffer(source).toString("base64") );
    }
    return _rawBase64Encode(source);
}

function Base64_decode(source) { // @arg Base64Uint8Array
                                 // @ret Uint8Array
                                 // @desc Base64Uint8Array to Uint8Array.
//{@dev
    $valid($type(source, "Base64Uint8Array"), Base64_decode, "source");
//}@dev

    if (_runOnNode) {
        return new Uint8Array( new Buffer(TA_STR(source), "base64") );
    }
    return _rawBase64Decode( source );
}

function _rawBase64Encode(source) { // @arg Uint8Array
                                    // @ret Base64Uint8Array
    var result = new Uint8Array( Math.ceil(source.length / 3) * 4 );
    var cursor = 0; // result cursor
    var c = 0, i = 0, iz = source.length;
    var pad = [0, 2, 1][iz % 3];
    var code = BASE64_ENCODE;

    for (; i < iz; cursor += 4, i += 3) {
        c = ((source[i    ] & 0xff) << 16) |
            ((source[i + 1] & 0xff) <<  8) |
             (source[i + 2] & 0xff); // 24bit

        result[cursor    ] = code[(c >> 18) & 0x3f];
        result[cursor + 1] = code[(c >> 12) & 0x3f];
        result[cursor + 2] = code[(c >>  6) & 0x3f];
        result[cursor + 3] = code[ c        & 0x3f];
    }
    if (pad > 1) {
        result[cursor - 2] = PADDING;
    }
    if (pad > 0) {
        result[cursor - 1] = PADDING;
    }
    return result;
}

function _rawBase64Decode(source) { // @arg Base64Uint8Array
                                    // @ret Uint8Array
    var result = new Uint8Array( Math.ceil(source.length / 4) * 3 );
    var cursor = 0; // result cursor
    var c = 0, i = 0, iz = source.length;
    var code = BASE64_DECODE;

    for (; i < iz; cursor += 3, i += 4) {      // 00000000|00000000|00000000 (8 x 3 = 24bit)
        c = (code[source[i    ]] << 18) |      // 111111  |        |         (Base64 6bit)
            (code[source[i + 1]] << 12) |      //       22|2222    |         (Base64 6bit)
            (code[source[i + 2]] <<  6) |      //         |    3333|33       (Base64 6bit)
             code[source[i + 3]];              //         |        |  444444 (Base64 6bit)
                                               //    v        v        v
        result[cursor    ] = (c >> 16) & 0xff; // 11111122                   (8bit)
        result[cursor + 1] = (c >>  8) & 0xff; //          22223333          (8bit)
        result[cursor + 2] =  c        & 0xff; //                   33444444 (8bit)
    }
    if (source[iz - 2] === PADDING) {
        return result.subarray(0, cursor - 2);
    } else if (source[iz - 1] === PADDING) {
        return result.subarray(0, cursor - 1);
    }
    return result;
}
//}@base64

// --- validate / assertions -------------------------------
//{@dev
function $valid(val, fn, hint) { if (global["Valid"]) { global["Valid"](val, fn, hint); } }
function $type(obj, type) { return global["Valid"] ? global["Valid"].type(obj, type) : true; }
//function $keys(obj, str) { return global["Valid"] ? global["Valid"].keys(obj, str) : true; }
//function $some(val, str, ignore) { return global["Valid"] ? global["Valid"].some(val, str, ignore) : true; }
//function $args(fn, args) { if (global["Valid"]) { global["Valid"].args(fn, args); } }
//}@dev

// --- exports ---------------------------------------------
if (typeof module !== "undefined") {
    module["exports"] = Codec;
}
global["Codec" in global ? "Codec_" : "Codec"] = Codec; // switch module. http://git.io/Minify

})((this || 0).self || global); // WebModule idiom. http://git.io/WebModule

