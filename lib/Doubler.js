//{@doubler
(function(global) {
"use strict";

// --- dependency modules ----------------------------------
//var Codec = global["Codec"];

// --- define / local variables ----------------------------
// --- class / interfaces ----------------------------------
var Doubler = {
    "encode":   Doubler_encode, // Codec.Doubler.encode(source:Uint8Array):Uint16Array
    "decode":   Doubler_decode  // Codec.Doubler.decode(source:Uint16Array):Uint8Array
};

// --- implements ------------------------------------------
function Doubler_encode(source) { // @arg Uint8Array - [0xff, 0xff, ...]
                                  // @ret Uint16Array - [0x0040, 0x7fff, ...]
                                  // @desc pack Doubler
//{@dev
    $valid($type(source, "Uint8Array"), Doubler_encode, "source");
//}@dev

    var iz = source.length >> 1 << 1; // byte align -> word align
    var result = new Uint16Array(iz + 2);
    var rc = 0; // result cursor

    for (var i = 0; i < iz; i += 2) {
        var w = (source[i] << 8) | source[i + 1]; // big-endian

        if (w === 0x0000 || w === 0x0040) {         // encode NULL and esc@pe
            result[rc++] = 0x0040;
            result[rc++] = w + 0x8000;
        } else if ((w >= 0xd800 && w <= 0xdfff) ||  // encode SurrogatePairs
                    w >= 0xfffe) {                  // encode BOM
            result[rc++] = 0x0040;
            result[rc++] = w - 0x8000;
        } else {
            result[rc++] = w; // through
        }
    }
    if (source.length % 2) { // tail byte
        result[rc++] = 0x0040;
        result[rc++] = source[i] + 0x9000;
    }
    if (result.length !== rc) {
        return result.subarray(0, rc);
    }
    return result;
}

function Doubler_decode(source) { // @arg Uint16Array - [0x0040, 0x7fff, ...]
                                  // @ret Uint8Array - [0xff, 0xff, ...]
                                  // @desc unpack Doubler
//{@dev
    $valid($type(source, "Uint16Array"), Doubler_decode, "source");
//}@dev

    var iz = source.length;
    var result = new Uint8Array(iz * 2);
    var rc = 0; // result cursor

    for (var i = 0; i < iz; ++i) {
        var w = source[i];

        if (w === 0x0040) { // Doubler esc@pe
            var nw = source[++i];

            if (nw === 0x8000 || nw === 0x8040) {   // decode NULL and at-mark
                result[rc++] = 0x00;
                result[rc++] = nw - 0x8000;
            } else if ((nw & 0x9000) === 0x9000) {  // decode Tail byte
                result[rc++] = nw - 0x9000;
            } else {                                // decode SurrogatePairs and BOM
                nw += 0x8000;
                result[rc++] = nw >> 8;
                result[rc++] = nw;
            }
        } else {
            result[rc++] = w >> 8;
            result[rc++] = w;
        }
    }
    if (result.length !== rc) {
        return result.subarray(0, rc);
    }
    return result;
}

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
    module["exports"] = Doubler;
}
(global["Codec_"] || global["Codec"])["Doubler"] = Doubler;

})((this || 0).self || global); // WebModule idiom. http://git.io/WebModule
//}@doubler

