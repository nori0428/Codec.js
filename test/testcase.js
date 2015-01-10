var ModuleTestCodec = (function(global) {

var _isNodeOrNodeWebKit = !!global.global;
var _runOnNodeWebKit =  _isNodeOrNodeWebKit && /native/.test(setTimeout);
var _runOnNode       =  _isNodeOrNodeWebKit && !/native/.test(setTimeout);
var _runOnWorker     = !_isNodeOrNodeWebKit && "WorkerLocation" in global;
var _runOnBrowser    = !_isNodeOrNodeWebKit && "document" in global;

var Base64      = Codec.Base64;
var UTF8        = Codec.UTF8;
var Doubler     = Codec.Doubler;
var STR_TA      = Codec.STR_TA;
var TA_STR      = Codec.TA_STR;

var MessagePack = Codec.MessagePack;
var ZLib        = Codec.ZLib;

var test = new Test("Codec", {
        disable:    false,
        browser:    true,
        worker:     true,
        node:       true,
        nw:         true,
        button:     true,
        both:       true,
    }).add([
        // --- TypedArray and ArrayBuffer ---
        testTypedArrayAndArrayBuffer,
        // --- Base64 ---
        testBase64,
        testBase64EncodeAndDecode,
        testBase64atobAndbtoa,
//      testBase64Random,
        testBase64Issues2,
        // --- UTF8 ---
        testUTF8EncodeAndDecode,
    ]);

    if (Doubler) {
        test.add([
            // --- Doubler ---
            testDoublerBasic,
            testDoublerHasTailByte,
            testDoublerEscape,
          //testBase64_10Byte
            testBase64_100KB,
            testDoubler_100KB,
            testBase64_1MB,
            testDoubler_1MB,
            testBase64_5MB,
            testDoubler_5MB,
        ]);
    }
    if (MessagePack) {
        test.add([
            // --- MessagePack ---
            testMessagePack_Nil,
            testMessagePack_Boolean,
            testMessagePack_Float,
            testMessagePack_Uint,
            testMessagePack_Int,
            testMessagePack_String,
            testMessagePack_BooleanArray,
            testMessagePack_Object,
            testMessagePack_ObjectAndArray,
            testMessagePack_InvalidTypes,
            // --- NaN and Infinity ---
            testMessagePack_NaNFloat,
            testMessagePack_NaNDouble,
            testMessagePack_InfinityFloat,
            testMessagePack_InfinityDouble,
            testMessagePack_NaN,
            testMessagePack_Infinity,
            // --- Cyclic Reference Error ---
            testMessagePack_CyclicReferenceError,
            // --- Ext Types ---
            testMessagePack_Bin, // Uint8Array
            // --- vs JSON ---
            testMessagePack_vs_JSON_BenchMark,
        ]);
    }
    if (ZLib) {
        test.add([
            // --- ZLib ---
          //testMessagePack_ZLib_inflate,
        ]);
    }

if (typeof document !== "undefined" && global.localStorage) {
    test.add([ testDoublerStorage ]);
}

return test.run().clone();

// ---------------------------------------------------------
function testTypedArrayAndArrayBuffer(test, pass, miss) {
    //
    // 1. ArrayBuffer.slice() は新たにメモリを確保し、配列の一部をコピーする
    //
    //
    // 2. TypedArray#subarray は ArrayBuffer の View を作成するだけで、メモリは共有する
    //    subarrayは低コストだが、引数で渡された ArrayBuffer を使いまわす場合は、
    //    破壊的な動作になるので注意が必要

    // ArrayBuffer を共有する2つのView(u8,u32)を作成し、
    // ArrayBuffer が正しく共有されている事を確認します。
    var ab  = new ArrayBuffer(8);           // ab  = [00,00,00,00,00,00,00,00]
    var u8  = new Uint8Array(ab);           // u8  = [00,00,00,00,00,00,00,00]
    var u32 = new Uint32Array(ab);          // u32 = [00000000,   00000000]

    // u8 と u32 は ArrayBuffer を共有しているため、
    // u8[n] に値を設定すると u32[n] の値も変化します
    u8.set([0, 1, 2, 3, 4, 5, 6, 7]);       // u8  = [00,01,02,03,04,05,06,07]

    if ( Test.likeArray(u8, [0, 1, 2, 3, 4, 5, 6, 7]) ) {
        console.log( Test.toHex(u8), Test.toHex(u32) );
    } else {
        console.log( Test.toHex(u8) );
        test.done(miss());
    }
    if ( Test.likeArray(u32, Codec["BIG_ENDIAN"] ? [0x00010203, 0x04050607]
                                                 : [0x03020100, 0x07060504]) ) {
        console.log( Test.toHex(u8), Test.toHex(u32) );
    } else {
        console.log( Test.toHex(u32) );
        test.done(miss());
    }

    // ArrayBuffer#slice を行い
    // u8 と cu8 でバッファが共有されていない事を確認します
    var cu8 = new Uint8Array(ab.slice(0));  // ArrayBufferのコピーを作成する

  //u8                                      // u8  = [00,01,02,03,04,05,06,07]
    cu8[0] = 0xFF;                          // cu8 = [FF,01,02,03,04,05,06,07]

    if ( !Test.likeArray(u8, cu8) ) { // 違うはず
        console.log( Test.toHex(u8), Test.toHex(cu8) );
    } else {
        console.log( Test.toHex(u8), Test.toHex(cu8) );
        test.done(miss());
    }
    cu8 = null;

    // u82 = u8.subarray(2, 6) は
    //       [00,01,02,03,04,05,06,07] から
    //             [02,03,04,05] な view を作ります。length は 4 です

    var u82 = u8.subarray(2, 6);
    if (u82.length === 4) {
        // OK
    } else {
        test.done(miss());
    }

    // u82とu8は1つのArrayBufferを共有しているため
    // u82[0] = 0x22 を行うと、
    // u8[2] も 0x22 になります。

    u82[0] = 0x22;
    if (u8[2] === 0x22) {
        // OK
    } else {
        test.done(miss());
    }
    console.log( Test.toHex(u8), Test.toHex(u82) );

    // u82 の length は 4 しかないため、u82[5] = 0x00 は無効です。
    // また u82[5] に相当する u8[7] の値も変化せず 0x07 のままです

    u82[5] = 0x00;

    if (u82[5] === undefined && u8[7] === 0x07) {
        // OK
    } else {
        test.done(miss());
    }

    // u82.set([0xFF,0xEE,0xDD,0xCC]) を行うと
    // u8 は [00,01,FF,EE,DD,CC,06,07] になります
    u82.set([0xFF,0xEE,0xDD,0xCC]);

    if (u8[0] === 0x00 &&
        u8[1] === 0x01 &&
        u8[2] === 0xFF &&
        u8[3] === 0xEE &&
        u8[4] === 0xDD &&
        u8[5] === 0xCC &&
        u8[6] === 0x06 &&
        u8[7] === 0x07) {
        // OK
    } else {
        test.done(miss());
    }

    // u82 をループでダンプしてみます
    // 0xFF,0xEE,0xDD,0xCC がダンプされます
    for (var i = 0, iz = u82.length; i < iz; ++i) {
        console.log(u82[i]);
    }

    // ArrayBuffer.slice が内部的に行っている事をfor文で書いてみる
    (function() {
        var ab1 = new ArrayBuffer(8);
        var u81 = new Uint8Array(ab1);
        u81.set([0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07]);
        var ab2 = ab1.slice(1,7); // 6bytes
        var u82 = new Uint8Array(ab2);

        var ab3 = new ArrayBuffer(8);
        var u83 = new Uint8Array(ab3);
        u83.set([0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07]);
        var ab4 = new ArrayBuffer(6);
        var u84 = new Uint8Array(ab4); // ArrayBufferのバイトデータに直接アクセスできないためViewを作成する

        // ループでバイトコピー
        for (var dest = 0, src = 1; src < 7;) {
            u84[dest++] = u83[src++];
        }

        if (Test.likeArray(u81, u83) &&
            Test.likeArray(u82, u84)) {
            // OK
        } else {
            console.log( Test.toHex(u81), Test.toHex(u83) );
            console.log( Test.toHex(u82), Test.toHex(u84) );
            test.done(miss());
        }
    })();

    test.done(pass());
}

function testBase64(test, pass, miss) {

    var source = "1234567890ABCDEFGHIJKLMN";
    var base64 = Base64.btoa(source); // "MTIzNDU2Nzg5MEFCQ0RFRkdISUpLTE1O"
    var revert = Base64.atob(base64);

    if (source === revert) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testBase64EncodeAndDecode(test, pass, miss) {

    function _test(source) {
        var base64 = Base64.encode( STR_TA(source) );
        var revert = Codec.TA_STR( Base64.decode(base64) );

        return source === revert;
    }

    var source = "1234567890ABCDEFGHIJKLMN"; // -> "MTIzNDU2Nzg5MEFCQ0RFRkdISUpLTE1O"

    if (_test(source)) {
        if (_test(source + source)) {
            if (_test((source + source).slice(2, 20))) {
                test.done(pass());
                return;
            }
        }
    }
    test.done(miss());
}

function testBase64atobAndbtoa(test, pass, miss) {

    var source = "1234567890ABCDEFGHIJKLMN";
    var base64 = Base64.btoa(source); // "MTIzNDU2Nzg5MEFCQ0RFRkdISUpLTE1O"
    var revert = Base64.atob(base64);

    if (source === revert) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

/*
function testBase64Random(test, pass, miss) {

    function _testEncodeTypedArray(source) {
        var typedSource = new Uint8Array(source);
        var typedBase64 = Base64.encode( typedSource );
        var typedRevert = Base64.decode( typedBase64 );

        return JSON.stringify(Array.prototype.slice.call(typedSource)) ===
               JSON.stringify(Array.prototype.slice.call(typedRevert));
    }

    function _random(times) {
        var decimal = true;

        for (var i = 0, iz = times; i < iz; ++i) {
            var jz = (random.value(decimal) & 0xff) + 10;
            var ary = [];

            for (var j = 0; j < jz; ++j) {
                ary.push( random.value(decimal) & 0xff );
            }
            if ( !_testEncodeTypedArray(ary) ) {
                return false;
            }
        }
        return true;
    }

    var random = new Random(); // Random.js
    var times = 1000;

    if (_random(times)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}
 */

function testBase64Issues2(test, pass, miss) {
    var source = "nuko";
    var b64 = "";
    var revert = "";

    if (_runOnNode) {
        // wrong way
        b64 = Base64.btoa(source);
        revert = Base64.atob(b64);
        //console.log(source, b64, revert);
        // good way
        b64 = new Buffer(source, "base64").toString("binary")
        revert = new Buffer(b64.toString(), "binary").toString("base64");
        //console.log(source, b64, revert);
    } else {
        b64 = atob(source);
        revert = btoa(b64);
        //console.log(source, b64, revert);
    }

    if (source === revert) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

// --- UTF8 ---
function testUTF8EncodeAndDecode(test, pass, miss) {

  //var source = "\u3042\u3044\u3046\u3048\u304a"; // <japanese> A I U E O </japanese>
    var source = [0x3042, 0x3044, 0x3046, 0x3048, 0x304a];
    var u32 = new Uint32Array(source); // <japanese> A I U E O </japanese>
    var u8 = UTF8.encode( u32 );
    var result = UTF8.decode(u8);

    if (Test.likeArray(source, result)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

// --- Doubler ---
function testDoublerBasic(test, pass, miss) {

    var u8     = new Uint8Array([0x42, 0x44, 0x46, 0x48, 0x4a]);
    var u16    = Doubler.encode( u8 );
    var result = Doubler.decode( u16 );

    if (Test.likeArray(u8, result)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testDoublerHasTailByte(test, pass, miss) {

    var byteString = "\u0000\u0001\u0002\u0003\u0004\u0005\u0020\u0021\u0032\u0033\u0048\u00fd\u00fe\u00ff";
        byteString += "\u00ff"; // add tail byte

    var u8 = STR_TA( byteString );
    var u16 = Doubler.encode( u8 );
    var result = Doubler.decode( u16 );

    if (Test.likeArray(u8, result)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testDoublerEscape(test, pass, miss) {

    var u8 = new Uint8Array([0x00, 0x00,  // -> 0x0000 (NULL)
                             0x00, 0x20,  // -> 0x0020 (0x20)
                             0xff, 0xfe,  // -> 0xfffe (BOM)
                             0xff, 0xff,  // -> 0xffff (BOM)
                             0x00, 0x00,  // -> NULL
                             0x00, 0x20,  // -> 0x20
                             0xd8, 0x00,  // -> 0xd800 (SurrogatePairs)
                             0xdf, 0xff]);// -> 0xdfff (SurrogatePairs)
    var u16    = Doubler.encode( u8 );
    var result = Doubler.decode( u16 );

    if (Test.likeArray(u8, result)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testBase64_10Byte(test, pass, miss) {
    var KB = 1024;
    var obj1 = _encodeBase64( 10 );
    var obj2 = _decodeBase64( obj1 );

    console.log("testBase64_10Byte" +
                ", encode: " + obj1.elapsedTime + " ms" +
                ", decode: " + obj2.elapsedTime + " ms" +
                ", words: " + ((obj1.b64.length / 1024) | 0) + " k");
    if (Test.likeArray(obj1.u8, obj2.u8)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}
function testBase64_100KB(test, pass, miss) {
    var KB = 1024;
    var obj1 = _encodeBase64( 100 * KB );
    var obj2 = _decodeBase64( obj1 );

    console.log("testBase64_100KB" +
                ", encode: " + obj1.elapsedTime + " ms" +
                ", decode: " + obj2.elapsedTime + " ms" +
                ", words: " + ((obj1.b64.length / 1024) | 0) + " k");
    if (Test.likeArray(obj1.u8, obj2.u8)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}
function testDoubler_100KB(test, pass, miss) {

    var KB = 1024;
    var obj1 = _encodeDoubler( 100 * KB );
    var obj2 = _decodeDoubler( obj1 );

    console.log("testDoubler_100KB" +
                ", encode: " + obj1.elapsedTime + " ms" +
                ", decode: " + obj2.elapsedTime + " ms" +
                ", words: " + ((obj1.u16.length / 1024) | 0) + " k");
    if (Test.likeArray(obj1.u8, obj2.u8)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testBase64_1MB(test, pass, miss) {

    var MB = 1024 * 1024;
    var obj1 = _encodeBase64( 1 * MB );
    var obj2 = _decodeBase64( obj1 );

    console.log("testBase64_1MB" +
                ", encode: " + obj1.elapsedTime + " ms" +
                ", decode: " + obj2.elapsedTime + " ms" +
                ", words: " + ((obj1.b64.length / 1024) | 0) + " k");
    if (Test.likeArray(obj1.u8, obj2.u8)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}
function testDoubler_1MB(test, pass, miss) {

    var MB = 1024 * 1024;
    var obj1 = _encodeDoubler( 1 * MB );
    var obj2 = _decodeDoubler( obj1 );

    console.log("testDoubler_1MB" +
                ", encode: " + obj1.elapsedTime + " ms" +
                ", decode: " + obj2.elapsedTime + " ms" +
                ", words: " + ((obj1.u16.length / 1024) | 0) + " k");
    if (Test.likeArray(obj1.u8, obj2.u8)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testBase64_5MB(test, pass, miss) {

    var MB = 1024 * 1024;
    var obj1 = _encodeBase64( 5 * MB );
    var obj2 = _decodeBase64( obj1 );

    console.log("testBase64_5MB" +
                ", encode: " + obj1.elapsedTime + " ms" +
                ", decode: " + obj2.elapsedTime + " ms" +
                ", words: " + ((obj1.b64.length / 1024) | 0) + " k");
    if (Test.likeArray(obj1.u8, obj2.u8)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}
function testDoubler_5MB(test, pass, miss) {

    var MB = 1024 * 1024;
    var obj1 = _encodeDoubler( 5 * MB );
    var obj2 = _decodeDoubler( obj1 );

    console.log("testDoubler_5MB" +
                ", encode: " + obj1.elapsedTime + " ms" +
                ", decode: " + obj2.elapsedTime + " ms" +
                ", words: " + ((obj1.u16.length / 1024) | 0) + " k");
    if (Test.likeArray(obj1.u8, obj2.u8)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testDoublerStorage(test, pass, miss) {

    var key = "testDoublerStorage";
    var u8 = new Uint8Array([0x00, 0x01,
                             0x02, 0x03,
                             0x04, 0x05,
                             0x09, 0x20,
                             0x21, 0x32,
                             0x33, 0x48,
                             0xfd, 0xfe,
                             0xff, 0x00]);

    localStorage.setItem(key, TA_STR( Doubler.encode( u8 )));

    var result = Doubler.decode( STR_TA( localStorage.getItem(key) || "" , 16));

    localStorage.removeItem(key);

    if (Test.likeArray(u8, result)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function _encodeDoubler(size) {
    var u8  = _makeRandomSource(size);
    var now = Date.now();
    var u16 = Doubler.encode( u8 );

    return { elapsedTime: Date.now() - now, u8: u8, u16: u16 };
}
function _decodeDoubler(obj) {
    var now = Date.now();
    var u8  = Doubler.decode( obj.u16 );

    return { elapsedTime: Date.now() - now, u8: u8 };
}

function _encodeBase64(size) {
    var u8  = _makeRandomSource(size);
    var str = TA_STR( u8 );
    var now = Date.now();
    var b64 = Base64.btoa( str );

    return { elapsedTime: Date.now() - now, u8: u8, b64: b64 };
}
function _decodeBase64(obj) {
    var now = Date.now();
    var str = Base64.atob( obj.b64 );
    var elapsedTime = Date.now() - now;
    var u8 = STR_TA( str );

    return { elapsedTime: elapsedTime, u8: u8 };
}

function _makeRandomSource(length) { // @arg Number:
                                     // @ret Uint8Array:
    var source = new Uint8Array(length), value = 0;

    for (var i = 0; i < length; ++i) {
        source[i] = Math.floor(Math.random() * 256);
    }
    return source;
}

// === MessagePack =========================================
function testMessagePack_Nil(test, pass, miss) {
    var cases = {
        "null":     MessagePack.decode(MessagePack.encode(null)) === null,
        "undefined":MessagePack.decode(MessagePack.encode(undefined)) == null,
    };
    var result = JSON.stringify(cases, null, 2);
    console.log(result);

    if (/false/.test(result)) {
        test.done(miss());
    } else {
        test.done(pass());
    }
}
function testMessagePack_Boolean(test, pass, miss) {
    var cases = {
        "f_alse":   MessagePack.decode(MessagePack.encode(false)) === false,
        "true":     MessagePack.decode(MessagePack.encode(true)) === true,
    };
    var result = JSON.stringify(cases, null, 2);
    console.log(result);

    if (/false/.test(result)) {
        test.done(miss());
    } else {
        test.done(pass());
    }
}
function testMessagePack_Float(test, pass, miss) {
    var cases = {
        "-0.0":     MessagePack.decode(MessagePack.encode(-0.0)) === -0.0,
        "+0.0":     MessagePack.decode(MessagePack.encode(+0.0)) === +0.0,
        "0.0":      MessagePack.decode(MessagePack.encode(0.0)) === 0.0,
        "0.1":      MessagePack.decode(MessagePack.encode(0.1)) === 0.1,            // [0xcb, 0x3f, 0xb9, 0x99, 0x99, 0x99, 0x99, 0x99, 0x9a]
        "0.12":     MessagePack.decode(MessagePack.encode(0.12)) === 0.12,
        "0.123":    MessagePack.decode(MessagePack.encode(0.123)) === 0.123,
        "118.625":  MessagePack.decode(MessagePack.encode(118.625)) === 118.625,    // [203, 64, 93, 168, 0, 0, 0, 0, 0]
        "123.456":  MessagePack.decode(MessagePack.encode(123.456)) === 123.456,    // [0xcb, 0x40, 0x5e, 0xdd, 0x2f, 0x1a, 0x9f, 0xbe, 0x77]
        "-123.456": MessagePack.decode(MessagePack.encode(-123.456)) === -123.456,  // [0xcb, 0xc0, 0x5e, 0xdd, 0x2f, 0x1a, 0x9f, 0xbe, 0x77]
        "-0.1":     MessagePack.decode(MessagePack.encode(-0.1)) === -0.1,          // [0xcb, 0xbf, 0xb9, 0x99, 0x99, 0x99, 0x99, 0x99, 0x9a]
        "1.11":     MessagePack.decode(MessagePack.encode(1.11)) === 1.11,          // [203, 63, 241, 194, 143, 92, 40, 245, 195]
        "-1.11":    MessagePack.decode(MessagePack.encode(-1.11)) === -1.11,        // [0xcb, 0xbf, 0xf1, 0xc2, 0x8f, 0x5c, 0x28, 0xf5, 0xc3]
        "3.14159565358979":
                    MessagePack.decode(MessagePack.encode(3.14159565358979)) === 3.14159565358979,   // [0xcb, 0x40, 0x09, 0x21, 0xfc, 0xe6, 0xeb, 0x64, 0x22]
        "-3.14159565358979":
                    MessagePack.decode(MessagePack.encode(-3.14159565358979)) === -3.14159565358979, // [0xcb, 0xc0, 0x09, 0x21, 0xfc, 0xe6, 0xeb, 0x64, 0x22]
    };
    var result = JSON.stringify(cases, null, 2);
    console.log(result);

    if (/false/.test(result)) {
        test.done(miss());
    } else {
        test.done(pass());
    }
}
function testMessagePack_Uint(test, pass, miss) {
    var cases = {
        // FixNum
        "0":    MessagePack.decode(MessagePack.encode(0)) === 0, // [0x00]
        "1":    MessagePack.decode(MessagePack.encode(1)) === 1, // [0x01]
        "31":   MessagePack.decode(MessagePack.encode(31)) === 31, // [0x1f]
        "32":   MessagePack.decode(MessagePack.encode(32)) === 32, // [0x20]
        "33":   MessagePack.decode(MessagePack.encode(33)) === 33, // [0x21]
        "126":  MessagePack.decode(MessagePack.encode(126)) === 126, // [0x7e]
        "127":  MessagePack.decode(MessagePack.encode(127)) === 127, // [0x7f]
        // Uint8
        "128":  MessagePack.decode(MessagePack.encode(128)) === 128, // [0xcc, 0x80]
        "129":  MessagePack.decode(MessagePack.encode(129)) === 129, // [0xcc, 0x81]
        "254":  MessagePack.decode(MessagePack.encode(254)) === 254, // [0xcc, 0xfe]
        "255":  MessagePack.decode(MessagePack.encode(255)) === 255, // [0xcc, 0xff]
        // Uint16
        "256":  MessagePack.decode(MessagePack.encode(256)) === 256, // [0xcd, 0x1, 0x0]
        "257":  MessagePack.decode(MessagePack.encode(257)) === 257, // [0xcd, 0x1, 0x1]
        "65534":MessagePack.decode(MessagePack.encode(65534)) === 65534, // [0xcd, 0xff, 0xfe]
        "65535":MessagePack.decode(MessagePack.encode(65535)) === 65535, // [0xcd, 0xff, 0xff]
        // Uint32
        "65536":MessagePack.decode(MessagePack.encode(65536)) === 65536, // [0xce, 0x0, 0x1, 0x0, 0x0]
        "65537":MessagePack.decode(MessagePack.encode(65537)) === 65537, // [0xce, 0x0, 0x1, 0x0, 0x1]
        "4294967295": MessagePack.decode(MessagePack.encode(4294967295)) === 4294967295, // 0x0ffffffff
        // Uint64
        "4294967296": MessagePack.decode(MessagePack.encode(4294967296)) === 4294967296, // 0x100000000
        "4294967297": MessagePack.decode(MessagePack.encode(4294967297)) === 4294967297, // 0x100000001
        // IEEE754
        "0x80000000000000": true,   // Accuracy problems. IEEE754
        "0x7fffffffffffffff": true, // Accuracy problems. IEEE754
    };
    var result = JSON.stringify(cases, null, 2);
    console.log(result);

    if (/false/.test(result)) {
        test.done(miss());
    } else {
        test.done(pass());
    }
}
function testMessagePack_Int(test, pass, miss) {
    var cases = {
        // FixNum
        "-0":           MessagePack.decode(MessagePack.encode(-0)) === -0, // [0x00]
        "-1":           MessagePack.decode(MessagePack.encode(-1)) === -1, // [0xff]
        "-31":          MessagePack.decode(MessagePack.encode(-31)) === -31, // [0xe1]
        // Int8
        "-32":          MessagePack.decode(MessagePack.encode(-32)) === -32, // [0xe0]
        "-33":          MessagePack.decode(MessagePack.encode(-33)) === -33, // [0xd0, 0xdf]
        "-64":          MessagePack.decode(MessagePack.encode(-64)) === -64, // [0xd0, 0xc0]
        "-126":         MessagePack.decode(MessagePack.encode(-126)) === -126, // [0xd0, 0x82]
        "-127":         MessagePack.decode(MessagePack.encode(-127)) === -127, // [0xd0, 0x81]
        // Int16
        "-128":         MessagePack.decode(MessagePack.encode(-128)) === -128, // [0xd1, 0xff, 0x80]
        "-129":         MessagePack.decode(MessagePack.encode(-129)) === -129, // [0xd1, 0xff, 0x7f]
        "-254":         MessagePack.decode(MessagePack.encode(-254)) === -254, // [0xd1, 0xff, 0x02]
        "-255":         MessagePack.decode(MessagePack.encode(-255)) === -255, // [0xd1, 0xff, 0x01]
        // Int16
        "-256":         MessagePack.decode(MessagePack.encode(-256)) === -256, // [0xd1, 0xff, 0x00]
        "-257":         MessagePack.decode(MessagePack.encode(-257)) === -257, // [0xd1, 0xfe, 0xff]
        "-32767":       MessagePack.decode(MessagePack.encode(-32767)) === -32767, // [0xd1, 0x80, 0x01]
        "-32768":       MessagePack.decode(MessagePack.encode(-32768)) === -32768, // [0xd2, 0xff, 0xff, 0x80, 0x00]
        "-32769":       MessagePack.decode(MessagePack.encode(-32769)) === -32769, // [0xd2, 0xff, 0xff, 0x7f, 0xff]
        "-65534":       MessagePack.decode(MessagePack.encode(-65534)) === -65534, // [0xd2, 0xff, 0xff, 0x00, 0x02]
        "-65535":       MessagePack.decode(MessagePack.encode(-65535)) === -65535, // [0xd2, 0xff, 0xff, 0x00, 0x01]
        // Int32
        "-65536":       MessagePack.decode(MessagePack.encode(-65536)) === -65536, // [0xd2, 0xff, 0xff, 0x00, 0x00]
        "-65537":       MessagePack.decode(MessagePack.encode(-65537)) === -65537, // [0xd2, 0xff, 0xfe, 0xff, 0xff]
        "-1048576":     MessagePack.decode(MessagePack.encode(-1048576)) === -1048576, // [0xd2, 0xff, 0xf0, 0x00, 0x00]
        "-2147483646":  MessagePack.decode(MessagePack.encode(-2147483646)) === -2147483646, // [0xd2, 0x80, 0x00, 0x00, 0x02]
        "-2147483647":  MessagePack.decode(MessagePack.encode(-2147483647)) === -2147483647, // [0xd2, 0x80, 0x00, 0x00, 0x01]
        // Int64
        "-2147483648":  MessagePack.decode(MessagePack.encode(-2147483648)) === -2147483648, // [0xd3, 0xff, 0xff, 0xff, 0xff, 0x80, 0x00, 0x00, 0x00]
        "-4294967293":  MessagePack.decode(MessagePack.encode(-4294967293)) === -4294967293, // [0xd3, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x03]
        "-4294967294":  MessagePack.decode(MessagePack.encode(-4294967294)) === -4294967294, // [0xd3, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x02]
        "-4294967295":  MessagePack.decode(MessagePack.encode(-4294967295)) === -4294967295, // [0xd3, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01]
        "-4294967296":  MessagePack.decode(MessagePack.encode(-4294967296)) === -4294967296, // [0xd3, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00]
        "-4294967297":  MessagePack.decode(MessagePack.encode(-4294967297)) === -4294967297, // [0xd3, 0xff, 0xff, 0xff, 0xfe, 0xff, 0xff, 0xff, 0xff]
        "-549755813888":MessagePack.decode(MessagePack.encode(-549755813888)) === -549755813888, // [0xd3, 0xff, 0xff, 0xff, 0x80, 0x00, 0x00, 0x00, 0x00]
        "-0x1fffffffffffff": true, // IEEE754
        "-0x20000000000000": true, // IEEE754
        "-0x40000000000000": true, // IEEE754
    };
    var result = JSON.stringify(cases, null, 2);
    console.log(result);

    if (/false/.test(result)) {
        test.done(miss());
    } else {
        test.done(pass());
    }
}

function testMessagePack_String(test, pass, miss) {
    var source = [
        "",
        "Hello",
        "今日は海鮮丼が食べたいです",
        "焼き肉もいいですね。カルビx3, ハラミx2, ブタバラ, T-BORNx500g, ライス大盛りで",
    ];
    var cases = {
        "0": MessagePack.decode(MessagePack.encode(source[0])) === source[0],
        "1": MessagePack.decode(MessagePack.encode(source[1])) === source[1],
        "2": MessagePack.decode(MessagePack.encode(source[2])) === source[2],
        "3": MessagePack.decode(MessagePack.encode(source[3])) === source[3],
    };

    var result = JSON.stringify(cases, null, 2);
    console.log(result);

    if (/false/.test(result)) {
        test.done(miss());
    } else {
        test.done(pass());
    }
}

function testMessagePack_BooleanArray(test, pass, miss) {

    var source = [true, false];
    var packed = MessagePack.encode(source);
    var result = MessagePack.decode(packed);

    if (Test.likeArray(source, result)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testMessagePack_Object(test, pass, miss) {
    var source = [
        {}, // [0x80]
        { a: 0, b: 0 },
        { a: [1, 2, 3.456, { b: -4.567, c: "hoge" }, "abc"] },
        { 'abc': [123] }, // [0x81, 0xa3, 0x61, 0x62, 0x63, 0x91, 0x7b]
        { abc: [123, 456], a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10, k: 11, l: 12, l: 13, m: 14, n: 15, o: 16, p: 17 },
                // [222, 0, 17, 163, 97, 98, 99, 146, 123, 205, 1, 200, 161, 97, 1, 161, 98, 2, 161, 99, 3, 161, 100, 4, 161, 101, 5, 161,
                //  102, 6, 161, 103, 7, 161, 104, 8, 161, 105, 9, 161, 106, 10, 161, 107, 11, 161, 108, 13, 161, 109, 14, 161, 110, 15, 161,
                //  111, 16, 161, 112, 17]
        // 5
        [], // [0x90]
        [123], // [0x91, 0x7b]
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 'hoge'],
                // [220, 0, 17, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 164, 104, 111, 103, 101]
        { a: ['b', 1, 0.123, { c: {}, d: null }, -1.11] },
                // [129, 161, 97, 149, 161, 98, 1, 203, 63, 191, 124, 237, 145, 104, 114, 176, 130, 161, 99, 128, 161, 100, 192, 203, 191,
                //  241, 194, 143, 92, 40, 245, 195]
    ];
    var cases = {
        "0": Test.likeObject(MessagePack.decode(MessagePack.encode(source[0])), source[0]),
        "1": Test.likeObject(MessagePack.decode(MessagePack.encode(source[1])), source[1]),
        "2": Test.likeObject(MessagePack.decode(MessagePack.encode(source[2])), source[2]),
        "3": Test.likeObject(MessagePack.decode(MessagePack.encode(source[3])), source[3]),
        "4": Test.likeObject(MessagePack.decode(MessagePack.encode(source[4])), source[4]),
        "5": Test.likeObject(MessagePack.decode(MessagePack.encode(source[5])), source[5]),
        "6": Test.likeObject(MessagePack.decode(MessagePack.encode(source[6])), source[6]),
        "7": Test.likeObject(MessagePack.decode(MessagePack.encode(source[7])), source[7]),
        "8": Test.likeObject(MessagePack.decode(MessagePack.encode(source[8])), source[8]),
    };

    var result = JSON.stringify(cases, null, 2);
    console.log(result);

    if (/false/.test(result)) {
        test.done(miss());
    } else {
        test.done(pass());
    }
}

function testMessagePack_ObjectAndArray(test, pass, miss) {
    var source = { a: [1, 2, 3, { b: 4, c: "hoge" }, "abc"] };
    var packed = MessagePack.encode(source);
    var result = MessagePack.decode(packed);
    var compare = [
            129, 161, 97, 149, 1, 2, 3, 130,
            161, 98, 4, 161, 99, 164, 104,
            111, 103, 101, 163, 97, 98, 99
        ];

    if (Test.likeObject(source, result) && Test.likeArray(packed, compare)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testMessagePack_InvalidTypes(test, pass, miss) {

    try {
        var source = new Date;
        var packed = MessagePack.encode(source);
        var result = MessagePack.decode(packed);

        test.done(miss());
    } catch (o_o) {
    }

    try {
        var source = function hoge() {};
        var packed = MessagePack.encode(source);
        var result = MessagePack.decode(packed);

    } catch (o_o) {
    }

    try {
        var source = /^aaa/;
        var packed = MessagePack.encode(source);
        var result = MessagePack.decode(packed);

        test.done(miss());
    } catch (o_o) {
    }

    test.done(pass());
}

function testMessagePack_NaNFloat(test, pass, miss) {
    var result = MessagePack.decode(new Uint8Array([0xca, 0x7f, 0xbf, 0xff, 0xff]));

    if (isNaN(result)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testMessagePack_NaNDouble(test, pass, miss) {
    var result = MessagePack.decode(new Uint8Array([0xcb, 0xff, 0xf7, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));

    if (isNaN(result)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testMessagePack_InfinityFloat(test, pass, miss) {
    var result = MessagePack.decode(new Uint8Array([0xca, 0xff, 0x80, 0x00, 0x00]));

    if (result === Infinity || result === -Infinity) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testMessagePack_InfinityDouble(test, pass, miss) {
    var result = MessagePack.decode(new Uint8Array([0xcb, 0xff, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

    if (result === Infinity || result === -Infinity) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testMessagePack_NaN(test, pass, miss) {
    var source = NaN;
    var packed = MessagePack.encode(source);
    var result = MessagePack.decode(packed);

    if (isNaN(result)) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testMessagePack_Infinity(test, pass, miss) {
    var source = Infinity;
    var packed = MessagePack.encode(source);
    var result = MessagePack.decode(packed);

    if (result === Infinity) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testMessagePack_CyclicReferenceError(test, pass, miss) {
    var ary = [];
    var cyclicReferenceObject = {
        ary: ary
    };
    ary[0] = cyclicReferenceObject;

    try {
        var packed = MessagePack.encode(cyclicReferenceObject);

        test.done(miss());

    } catch (o_o) {
        if (o_o instanceof TypeError) {
            test.done(pass());
        }
    } finally {
        // --- GC ---
        ary = null;
        cyclicReferenceObject = null;
    }
}

function testMessagePack_Bin(test, pass, miss) {
    var source = [
        new Uint8Array([]),
        new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
    ];
    var cases = {
        "0": Test.likeArray(MessagePack.decode(MessagePack.encode(source[0])), source[0]),
        "1": Test.likeArray(MessagePack.decode(MessagePack.encode(source[1])), source[1]),
    };

    var result = JSON.stringify(cases, null, 2);
    console.log(result);

    if (/false/.test(result)) {
        test.done(miss());
    } else {
        test.done(pass());
    }
}

function testMessagePack_vs_JSON_BenchMark(test, pass, miss) {
    var result = testMessagePack_vs_JSON_bench(10);

    console.log("MessagePack vs JSON" + JSON.stringify(result, null, 2));

    var result = testMessagePack_vs_JSON_bench(100);

    console.log("MessagePack vs JSON" + JSON.stringify(result, null, 2));

    var result = testMessagePack_vs_JSON_bench(1000);

    console.log("MessagePack vs JSON" + JSON.stringify(result, null, 2));

    var result = testMessagePack_vs_JSON_bench(10000);

    console.log("MessagePack vs JSON" + JSON.stringify(result, null, 2));

    test.done(pass());
}

function testMessagePack_vs_JSON_bench(nodes) {
    var json = _createRandomJSONObject(nodes);

    var now1    = performance.now();
    var tmp1    = MessagePack.encode(json);
    var now2    = performance.now();
    var json1   = MessagePack.decode(tmp1);
    var now3    = performance.now();

    if (!Test.likeObject(json1, json)) {
        console.log("unmatch1");
    }

    var now10   = performance.now();
    var tmp10   = JSON.stringify(json);
    var now11   = performance.now();
    var json2   = JSON.parse(tmp10);
    var now12   = performance.now();

    if (!Test.likeObject(json2, json)) {
        console.log("unmatch2");
    }

    return {
        nodes: nodes,
        "MessagePack.encode": (now2 - now1).toFixed(2) + " ms",
        "MessagePack.decode": (now3 - now2).toFixed(2) + " ms",
        "MessagePack total": (now3 - now1).toFixed(2) + " ms",
        "JSON.stringify": (now11 - now10).toFixed(2) + " ms",
        "JSON.parse": (now12 - now11).toFixed(2) + " ms",
        "JSON total": (now12 - now10).toFixed(2) + " ms",
    };
}

function _createRandomJSONObject(nodes) {
    function child(num) {
        switch ( ((Math.random() * 9) | 0) % 9 ) {
        case 0: return null; break;
        case 1: return false; break;
        case 2: return true; break;
        case 3: return num.toString(16) + String.fromCharCode(i & 0xffff, i & 0xffff, i & 0xffff, i & 0xffff); break;
        case 4: return num; break;
        case 5: return -num; break;
        case 6: return num / 123.456789; break;
        case 7: return -(num / 123.456789); break;
        case 8: return [child(num), child(num + 1), child(num + 2)];
        }
        var r = {};
        r[num] = child(num);
        return r;
    }

    var result = {};

    for (var i = 0; i < nodes; ++i) {
        result[i] = child(i);
    }
    return result;
}

// === ZLib ================================================
function testMessagePack_ZLib_inflate(test, pass, miss) {

debugger;
    var source = [
        ZLib.inflate(new Uint8Array())
    ];
    test.done(pass());
}



/*

"Compatibility (http://github.com/MessagePack/MessagePack/blob/master/test/cases_gen.rb)": "",
    "[cc 00] 0 uint8": function() {
        var data = unescape('%cc%00');
        var result = [0xcc, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 0, hex(result)];
    },
    "[cd 00 00] 0 uint16": function() {
        var data = unescape('%cd%00%00');
        var result = [0xcd, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 0, hex(result)];
    },
    "[ce 00 00 00 00] 0 uint32": function() {
        var data = unescape('%ce%00%00%00%00');
        var result = [0xce, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 0, hex(result)];
    },
    "[cf 00 00 00 00 00 00 00 00] 0 uint64": function() {
        var data = unescape('%cf%00%00%00%00%00%00%00%00');
        var result = [0xcf, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 0, hex(result)];
    },
    "[d0 00] 0 int8": function() {
        var data = unescape('%d0%00');
        var result = [0xd0, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 0, hex(result)];
    },
    "[d1 00 00] 0 int16": function() {
        var data = unescape('%d1%00%00');
        var result = [0xd1, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 0, hex(result)];
    },
    "[d2 00 00 00 00] 0 int32": function() {
        var data = unescape('%d2%00%00%00%00');
        var result = [0xd2, 0x00, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 0, hex(result)];
    },
    "[d3 00 00 00 00 00 00 00 00 ] 0 int64": function() {
        var data = unescape('%d3%00%00%00%00%00%00%00%00');
        var result = [0xd3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 0, hex(result)];
    },
    "[7f] 127 Positive FixNum": function() {
        var data = unescape('%7f');
        var result = [0x7f];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 127, hex(result)];
    },
    "[cc 7f] 127 uint8": function() {
        var data = unescape('%cc%7f');
        var result = [0xcc, 0x7f];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 127, hex(result)];
    },
    "[cd 00 ff] 255 uint16": function() {
        var data = unescape('%cd%00%ff');
        var result = [0xcd, 0x00, 0xff];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 255, hex(result)];
    },
    "[ce 00 00 ff ff] 65535 uint32": function() {
        var data = unescape('%ce%00%00%ff%ff');
        var result = [0xce, 0x00, 0x00, 0xff, 0xff];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 65535, hex(result)];
    },
    "[cf 00 00 00 00 ff ff ff ff] 4294967295 uint64": function() {
        var data = unescape('%cf%00%00%00%00%ff%ff%ff%ff');
        var result = [0xcf, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 4294967295, hex(result)];
    },
    "[e0] -32 Negative FixNum": function() {
        var data = unescape('%e0');
        var result = [0xe0];
        var rv = MessagePack.unpack(data);

        return [rv, "==", -32, hex(result)];
    },
    "[d0 e0] -32 int8": function() {
        var data = unescape('%d0%e0');
        var result = [0xd0, 0xe0];
        var rv = MessagePack.unpack(data);

        return [rv, "==", -32, hex(result)];
    },
    "[d1 ff 80] -128 int16": function() {
        var data = unescape('%d1%ff%80');
        var result = [0xd1, 0xff, 0x80];
        var rv = MessagePack.unpack(data);

        return [rv, "==", -128, hex(result)];
    },
    "[d2 ff ff 80 00] -32768 int32": function() {
        var data = unescape('%d2%ff%ff%80%00');
        var result = [0xd2, 0xff, 0xff, 0x80, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", -32768, hex(result)];
    },
    "[d3 ff ff ff ff 80 00 00 00] -2147483648 int64": function() {
        var data = unescape('%d3%ff%ff%ff%ff%80%00%00%00');
        var result = [0xd3, 0xff, 0xff, 0xff, 0xff, 0x80, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", -2147483648, hex(result)];
    },
    "[d3 ff ff ff ff 80 00 00 00] -2147483648 int64": function() {
        var data = unescape('%d3%ff%ff%ff%ff%80%00%00%00');
        var result = [0xd3, 0xff, 0xff, 0xff, 0xff, 0x80, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", -2147483648, hex(result)];
    },
    "[ca 00 00 00 00] 0.0 float": function() {
        var data = unescape('%ca%00%00%00%00');
        var result = [0xca, 0x00, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 0.0, hex(result)];
    },
    "[cb 00 00 00 00 00 00 00 00] 0.0 double": function() {
        var data = unescape('%cb%00%00%00%00%00%00%00%00');
        var result = [0xca, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 0.0, hex(result)];
    },
    "[ca 80 00 00 00] -0.0 float": function() {
        var data = unescape('%ca%80%00%00%00');
        var result = [0xca, 0x80, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", -0.0, hex(result)];
    },
    "[cb 80 00 00 00 00 00 00 00] -0.0 double": function() {
        var data = unescape('%cb%80%00%00%00%00%00%00%00');
        var result = [0xca, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", -0.0, hex(result)];
    },
    "[cb 3f f0 00 00 00 00 00 00] 1.0 double": function() {
        var data = unescape('%cb%3f%f0%00%00%00%00%00%00');
        var result = [0xcb, 0x3f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", 1.0, hex(result)];
    },
    "[cb bf f0 00 00 00 00 00 00] -1.0 double": function() {
        var data = unescape('%cb%bf%f0%00%00%00%00%00%00');
        var result = [0xcb, 0xbf, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", -1.0, hex(result)];
    },

    '[a1 61] "a" FixRaw': function() {
        var data = unescape('%a1%61');
        var result = [0xa1, 0x61];
        var rv = MessagePack.unpack(data);

        return [rv, "==", "a", hex(result)];
    },
    '[da 00 01 61] "a" raw 16': function() {
        var data = unescape('%da%00%01%61');
        var result = [0xda, 0x00, 0x01, 0x61];
        var rv = MessagePack.unpack(data);

        return [rv, "==", "a", hex(result)];
    },
    '[db 00 00 00 01 61] "a" raw 32': function() {
        var data = unescape('%db%00%00%00%01%61');
        var result = [0xdb, 0x00, 0x00, 0x00, 0x01, 0x61];
        var rv = MessagePack.unpack(data);

        return [rv, "==", "a", hex(result)];
    },

    '[a0] "" FixRaw': function() {
        var data = unescape('%a0');
        var result = [0xa0];
        var rv = MessagePack.unpack(data);

        return [rv, "==", "", hex(result)];
    },
    '[da 00 00] "" raw 16': function() {
        var data = unescape('%da%00%00');
        var result = [0xda, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", "", hex(result)];
    },
    '[db 00 00 00 00] "" raw 32': function() {
        var data = unescape('%db%00%00%00%00');
        var result = [0xdb, 0x00, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", "", hex(result)];
    },

    '[91 00] [0] FixArray': function() {
        var data = unescape('%91%00');
        var result = [0x91, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", [0], hex(result)];
    },
    '[dc 00 01 00] [0] array 16': function() {
        var data = unescape('%dc%00%01%00');
        var result = [0xdc, 0x00, 0x01, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", [0], hex(result)];
    },
    '[dd 00 00 00 01 00] [0] array 32': function() {
        var data = unescape('%dd%00%00%00%01%00');
        var result = [0xdd, 0x00, 0x00, 0x00, 0x01, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", [0], hex(result)];
    },

    '[80] {} FixMap': function() {
        var data = unescape('%80');
        var result = [0x80];
        var rv = MessagePack.unpack(data);

        return [rv, "==", {}, hex(result)];
    },
    '[de 00 00] {} map 16': function() {
        var data = unescape('%de%00%00');
        var result = [0xde, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", {}, hex(result)];
    },
    '[df 00 00 00 00] {} map 32': function() {
        var data = unescape('%df%00%00%00%00');
        var result = [0xdf, 0x00, 0x00, 0x00, 0x00];
        var rv = MessagePack.unpack(data);

        return [rv, "==", {}, hex(result)];
    },

    '[81 a1 61 61] {"a"=>97} FixMap': function() {
        var data = unescape('%81%a1%61%61');
        var result = [0x81, 0xa1, 0x61, 0x61];
        var rv = MessagePack.unpack(data);

        return [rv, "==", { a: 97 }, hex(result)];
    },
    '[de 00 01 a1 61 61] {"a"=>97} map 16': function() {
        var data = unescape('%de%00%01%a1%61%61');
        var result = [0xde, 0x00, 0x01, 0xa1, 0x61, 0x61];
        var rv = MessagePack.unpack(data);

        return [rv, "==", { a: 97 }, hex(result)];
    },
    '[df 00 00 00 01 a1 61 61] {"a"=>97} map 32': function() {
        var data = unescape('%df%00%00%00%01%a1%61%61');
        var result = [0xdf, 0x00, 0x00, 0x00, 0x01, 0xa1, 0x61, 0x61];
        var rv = MessagePack.unpack(data);

        return [rv, "==", { a: 97 }, hex(result)];
    },

    '[91 90] [[]]': function() {
        var data = unescape('%91%90');
        var result = [0x91, 0x90];
        var rv = MessagePack.unpack(data);

        return [rv, "==", [[]], hex(result)];
    },
    '[91 91 a1 61] [["a"]]': function() {
        var data = unescape('%91%91%a1%61');
        var result = [0x91, 0x91, 0xa1, 0x61];
        var rv = MessagePack.unpack(data);

        return [rv, "==", [["a"]], hex(result)];
    },
"More": "",
    'Number(0.250223099719733) -> []': function() {
        var data = 0.250223099719733;
        var pack = MessagePack.pack(data);
        var rv = MessagePack.unpack(pack);

        return [rv, "is", data, hex(pack)];
    },

    'Number(0.3425064110197127) -> []': function() {
        var data = 0.3425064110197127;
        var pack = MessagePack.pack(data);
        var rv = MessagePack.unpack(pack);

        return [rv, "is", data, hex(pack)];
    },
    'Number(-0.5991213528905064) -> []': function() {
        var data = -0.5991213528905064;
        var pack = MessagePack.pack(data);
        var rv = MessagePack.unpack(pack);

        return [rv, "is", data, hex(pack)];
    },

    'Number(-0.008100000073710001) -> []': function() {
        var data = -0.008100000073710001;
        var pack = MessagePack.pack(data);
        var rv = MessagePack.unpack(pack);

        return [rv, "is", data, hex(pack)];
    },
    'Number(0.07290000066339) -> []': function() {
        var data = 0.07290000066339;
        var pack = MessagePack.pack(data);
        var rv = MessagePack.unpack(pack);

        return [rv, "is", data, hex(pack)];
    },

    'Number(0.06480000058968001) -> []': function() {
        var data = 0.06480000058968001;
        var pack = MessagePack.pack(data);
        var rv = MessagePack.unpack(pack);

        return [rv, "is", data, hex(pack)];
    },
    'Number(0.05670000051597) -> []': function() {
        var data = 0.05670000051597;
        var pack = MessagePack.pack(data);
        var rv = MessagePack.unpack(pack);

        return [rv, "is", data, hex(pack)];
    },
    'Number(0.1) -> []': function() {
        var data = 0.1;
        var pack = MessagePack.pack(data);
        var rv = MessagePack.unpack(pack);

        return [rv, "is", data, hex(pack)];
    },
    'Number(0.01) -> []': function() {
        var data = 0.01;
        var pack = MessagePack.pack(data);
        var rv = MessagePack.unpack(pack);

        return [rv, "is", data, hex(pack)];
    },
    'Number(0.001) -> []': function() {
        var data = 0.01;
        var pack = MessagePack.pack(data);
        var rv = MessagePack.unpack(pack);

        return [rv, "is", data, hex(pack)];
    },
 */


})((this || 0).self || global);

