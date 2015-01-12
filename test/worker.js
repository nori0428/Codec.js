// Codec test

onmessage = function(event) {
    self.TEST_DATA = event.data;
    self.TEST_ERROR_MESSAGE = "";

    if (!self.console) {
        self.console = function() {};
        self.console.log = function() {};
        self.console.warn = function() {};
        self.console.error = function() {};
    }

    importScripts("../node_modules/uupaa.random.js/lib/Random.js");
    importScripts("../node_modules/uupaa.hash.js/lib/Hash.js");
    importScripts(".././test/wmtools.js");
    importScripts("../lib/Codec.js");
    importScripts("../lib/Doubler.js");
    importScripts("../lib/MessagePack.js");
    importScripts("../lib/ZLib.js");
    importScripts("../release/Codec.w.min.js");
    importScripts("./testcase.js");

    self.postMessage({ TEST_ERROR_MESSAGE: self.TEST_ERROR_MESSAGE || "" });
};

