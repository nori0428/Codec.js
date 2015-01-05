# Codec.js [![Build Status](https://travis-ci.org/uupaa/Codec.js.png)](http://travis-ci.org/uupaa/Codec.js)

[![npm](https://nodei.co/npm/uupaa.codec.js.png?downloads=true&stars=true)](https://nodei.co/npm/uupaa.codec.js/)

Codec functions.

## Document

- [Codec.js wiki](https://github.com/uupaa/Codec.js/wiki/Codec)
- [WebModule](https://github.com/uupaa/WebModule)
    - [Slide](http://uupaa.github.io/Slide/slide/WebModule/index.html)
    - [Development](https://github.com/uupaa/WebModule/wiki/Development)

## How to use

### Browser

```js
<script src="lib/Codec.js"></script>
<script>
console.log( Codec.BIG_ENDIAN ); // true or false
console.log( Codec.hton16([1,2,3,4]) ); // [1,2,3,4] or [4,3,2,1]
console.log( Codec.UTF8.encode(...) );
console.log( Codec.UTF8.decode(...) );
console.log( Codec.Base64.encode(...) );
console.log( Codec.Base64.decode(...) );
console.log( Codec.Doubler.encode(...) );
console.log( Codec.Doubler.decode(...) );
console.log( Codec.MessagePack.encode(...) );
console.log( Codec.MessagePack.decode(...) );
console.log( Codec.ZLib.inflate(...) );
</script>
```

### WebWorkers

```js
importScripts("lib/Codec.js");

```

### Node.js

```js
require("lib/Codec.js");

```
