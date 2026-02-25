var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// node_modules/@capacitor/core/dist/index.js
class WebPlugin {
  constructor() {
    this.listeners = {};
    this.retainedEventArguments = {};
    this.windowListeners = {};
  }
  addListener(eventName, listenerFunc) {
    let firstListener = false;
    const listeners = this.listeners[eventName];
    if (!listeners) {
      this.listeners[eventName] = [];
      firstListener = true;
    }
    this.listeners[eventName].push(listenerFunc);
    const windowListener = this.windowListeners[eventName];
    if (windowListener && !windowListener.registered) {
      this.addWindowListener(windowListener);
    }
    if (firstListener) {
      this.sendRetainedArgumentsForEvent(eventName);
    }
    const remove = async () => this.removeListener(eventName, listenerFunc);
    const p = Promise.resolve({ remove });
    return p;
  }
  async removeAllListeners() {
    this.listeners = {};
    for (const listener in this.windowListeners) {
      this.removeWindowListener(this.windowListeners[listener]);
    }
    this.windowListeners = {};
  }
  notifyListeners(eventName, data, retainUntilConsumed) {
    const listeners = this.listeners[eventName];
    if (!listeners) {
      if (retainUntilConsumed) {
        let args = this.retainedEventArguments[eventName];
        if (!args) {
          args = [];
        }
        args.push(data);
        this.retainedEventArguments[eventName] = args;
      }
      return;
    }
    listeners.forEach((listener) => listener(data));
  }
  hasListeners(eventName) {
    var _a;
    return !!((_a = this.listeners[eventName]) === null || _a === undefined ? undefined : _a.length);
  }
  registerWindowListener(windowEventName, pluginEventName) {
    this.windowListeners[pluginEventName] = {
      registered: false,
      windowEventName,
      pluginEventName,
      handler: (event) => {
        this.notifyListeners(pluginEventName, event);
      }
    };
  }
  unimplemented(msg = "not implemented") {
    return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
  }
  unavailable(msg = "not available") {
    return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
  }
  async removeListener(eventName, listenerFunc) {
    const listeners = this.listeners[eventName];
    if (!listeners) {
      return;
    }
    const index = listeners.indexOf(listenerFunc);
    this.listeners[eventName].splice(index, 1);
    if (!this.listeners[eventName].length) {
      this.removeWindowListener(this.windowListeners[eventName]);
    }
  }
  addWindowListener(handle) {
    window.addEventListener(handle.windowEventName, handle.handler);
    handle.registered = true;
  }
  removeWindowListener(handle) {
    if (!handle) {
      return;
    }
    window.removeEventListener(handle.windowEventName, handle.handler);
    handle.registered = false;
  }
  sendRetainedArgumentsForEvent(eventName) {
    const args = this.retainedEventArguments[eventName];
    if (!args) {
      return;
    }
    delete this.retainedEventArguments[eventName];
    args.forEach((arg) => {
      this.notifyListeners(eventName, arg);
    });
  }
}
var ExceptionCode, CapacitorException, getPlatformId = (win) => {
  var _a, _b;
  if (win === null || win === undefined ? undefined : win.androidBridge) {
    return "android";
  } else if ((_b = (_a = win === null || win === undefined ? undefined : win.webkit) === null || _a === undefined ? undefined : _a.messageHandlers) === null || _b === undefined ? undefined : _b.bridge) {
    return "ios";
  } else {
    return "web";
  }
}, createCapacitor = (win) => {
  const capCustomPlatform = win.CapacitorCustomPlatform || null;
  const cap = win.Capacitor || {};
  const Plugins = cap.Plugins = cap.Plugins || {};
  const getPlatform = () => {
    return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
  };
  const isNativePlatform = () => getPlatform() !== "web";
  const isPluginAvailable = (pluginName) => {
    const plugin = registeredPlugins.get(pluginName);
    if (plugin === null || plugin === undefined ? undefined : plugin.platforms.has(getPlatform())) {
      return true;
    }
    if (getPluginHeader(pluginName)) {
      return true;
    }
    return false;
  };
  const getPluginHeader = (pluginName) => {
    var _a;
    return (_a = cap.PluginHeaders) === null || _a === undefined ? undefined : _a.find((h) => h.name === pluginName);
  };
  const handleError = (err) => win.console.error(err);
  const registeredPlugins = new Map;
  const registerPlugin = (pluginName, jsImplementations = {}) => {
    const registeredPlugin = registeredPlugins.get(pluginName);
    if (registeredPlugin) {
      console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
      return registeredPlugin.proxy;
    }
    const platform = getPlatform();
    const pluginHeader = getPluginHeader(pluginName);
    let jsImplementation;
    const loadPluginImplementation = async () => {
      if (!jsImplementation && platform in jsImplementations) {
        jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
      } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
        jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
      }
      return jsImplementation;
    };
    const createPluginMethod = (impl, prop) => {
      var _a, _b;
      if (pluginHeader) {
        const methodHeader = pluginHeader === null || pluginHeader === undefined ? undefined : pluginHeader.methods.find((m) => prop === m.name);
        if (methodHeader) {
          if (methodHeader.rtype === "promise") {
            return (options) => cap.nativePromise(pluginName, prop.toString(), options);
          } else {
            return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
          }
        } else if (impl) {
          return (_a = impl[prop]) === null || _a === undefined ? undefined : _a.bind(impl);
        }
      } else if (impl) {
        return (_b = impl[prop]) === null || _b === undefined ? undefined : _b.bind(impl);
      } else {
        throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
      }
    };
    const createPluginMethodWrapper = (prop) => {
      let remove;
      const wrapper = (...args) => {
        const p = loadPluginImplementation().then((impl) => {
          const fn = createPluginMethod(impl, prop);
          if (fn) {
            const p2 = fn(...args);
            remove = p2 === null || p2 === undefined ? undefined : p2.remove;
            return p2;
          } else {
            throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
          }
        });
        if (prop === "addListener") {
          p.remove = async () => remove();
        }
        return p;
      };
      wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
      Object.defineProperty(wrapper, "name", {
        value: prop,
        writable: false,
        configurable: false
      });
      return wrapper;
    };
    const addListener = createPluginMethodWrapper("addListener");
    const removeListener = createPluginMethodWrapper("removeListener");
    const addListenerNative = (eventName, callback) => {
      const call = addListener({ eventName }, callback);
      const remove = async () => {
        const callbackId = await call;
        removeListener({
          eventName,
          callbackId
        }, callback);
      };
      const p = new Promise((resolve) => call.then(() => resolve({ remove })));
      p.remove = async () => {
        console.warn(`Using addListener() without 'await' is deprecated.`);
        await remove();
      };
      return p;
    };
    const proxy = new Proxy({}, {
      get(_, prop) {
        switch (prop) {
          case "$$typeof":
            return;
          case "toJSON":
            return () => ({});
          case "addListener":
            return pluginHeader ? addListenerNative : addListener;
          case "removeListener":
            return removeListener;
          default:
            return createPluginMethodWrapper(prop);
        }
      }
    });
    Plugins[pluginName] = proxy;
    registeredPlugins.set(pluginName, {
      name: pluginName,
      proxy,
      platforms: new Set([...Object.keys(jsImplementations), ...pluginHeader ? [platform] : []])
    });
    return proxy;
  };
  if (!cap.convertFileSrc) {
    cap.convertFileSrc = (filePath) => filePath;
  }
  cap.getPlatform = getPlatform;
  cap.handleError = handleError;
  cap.isNativePlatform = isNativePlatform;
  cap.isPluginAvailable = isPluginAvailable;
  cap.registerPlugin = registerPlugin;
  cap.Exception = CapacitorException;
  cap.DEBUG = !!cap.DEBUG;
  cap.isLoggingEnabled = !!cap.isLoggingEnabled;
  return cap;
}, initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win), Capacitor, registerPlugin, encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape), decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent), CapacitorCookiesPluginWeb, CapacitorCookies, readBlobAsBase64 = async (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader;
  reader.onload = () => {
    const base64String = reader.result;
    resolve(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
  };
  reader.onerror = (error) => reject(error);
  reader.readAsDataURL(blob);
}), normalizeHttpHeaders = (headers = {}) => {
  const originalKeys = Object.keys(headers);
  const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
  const normalized = loweredKeys.reduce((acc, key, index) => {
    acc[key] = headers[originalKeys[index]];
    return acc;
  }, {});
  return normalized;
}, buildUrlParams = (params, shouldEncode = true) => {
  if (!params)
    return null;
  const output = Object.entries(params).reduce((accumulator, entry) => {
    const [key, value] = entry;
    let encodedValue;
    let item;
    if (Array.isArray(value)) {
      item = "";
      value.forEach((str) => {
        encodedValue = shouldEncode ? encodeURIComponent(str) : str;
        item += `${key}=${encodedValue}&`;
      });
      item.slice(0, -1);
    } else {
      encodedValue = shouldEncode ? encodeURIComponent(value) : value;
      item = `${key}=${encodedValue}`;
    }
    return `${accumulator}&${item}`;
  }, "");
  return output.substr(1);
}, buildRequestInit = (options, extra = {}) => {
  const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
  const headers = normalizeHttpHeaders(options.headers);
  const type = headers["content-type"] || "";
  if (typeof options.data === "string") {
    output.body = options.data;
  } else if (type.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams;
    for (const [key, value] of Object.entries(options.data || {})) {
      params.set(key, value);
    }
    output.body = params.toString();
  } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
    const form = new FormData;
    if (options.data instanceof FormData) {
      options.data.forEach((value, key) => {
        form.append(key, value);
      });
    } else {
      for (const key of Object.keys(options.data)) {
        form.append(key, options.data[key]);
      }
    }
    output.body = form;
    const headers2 = new Headers(output.headers);
    headers2.delete("content-type");
    output.headers = headers2;
  } else if (type.includes("application/json") || typeof options.data === "object") {
    output.body = JSON.stringify(options.data);
  }
  return output;
}, CapacitorHttpPluginWeb, CapacitorHttp, SystemBarsStyle, SystemBarType, SystemBarsPluginWeb, SystemBars;
var init_dist = __esm(() => {
  /*! Capacitor: https://capacitorjs.com/ - MIT License */
  (function(ExceptionCode2) {
    ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
    ExceptionCode2["Unavailable"] = "UNAVAILABLE";
  })(ExceptionCode || (ExceptionCode = {}));
  CapacitorException = class CapacitorException extends Error {
    constructor(message, code, data) {
      super(message);
      this.message = message;
      this.code = code;
      this.data = data;
    }
  };
  Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
  registerPlugin = Capacitor.registerPlugin;
  CapacitorCookiesPluginWeb = class CapacitorCookiesPluginWeb extends WebPlugin {
    async getCookies() {
      const cookies = document.cookie;
      const cookieMap = {};
      cookies.split(";").forEach((cookie) => {
        if (cookie.length <= 0)
          return;
        let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
        key = decode(key).trim();
        value = decode(value).trim();
        cookieMap[key] = value;
      });
      return cookieMap;
    }
    async setCookie(options) {
      try {
        const encodedKey = encode(options.key);
        const encodedValue = encode(options.value);
        const expires = options.expires ? `; expires=${options.expires.replace("expires=", "")}` : "";
        const path = (options.path || "/").replace("path=", "");
        const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
        document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
      } catch (error) {
        return Promise.reject(error);
      }
    }
    async deleteCookie(options) {
      try {
        document.cookie = `${options.key}=; Max-Age=0`;
      } catch (error) {
        return Promise.reject(error);
      }
    }
    async clearCookies() {
      try {
        const cookies = document.cookie.split(";") || [];
        for (const cookie of cookies) {
          document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
        }
      } catch (error) {
        return Promise.reject(error);
      }
    }
    async clearAllCookies() {
      try {
        await this.clearCookies();
      } catch (error) {
        return Promise.reject(error);
      }
    }
  };
  CapacitorCookies = registerPlugin("CapacitorCookies", {
    web: () => new CapacitorCookiesPluginWeb
  });
  CapacitorHttpPluginWeb = class CapacitorHttpPluginWeb extends WebPlugin {
    async request(options) {
      const requestInit = buildRequestInit(options, options.webFetchExtra);
      const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
      const url = urlParams ? `${options.url}?${urlParams}` : options.url;
      const response = await fetch(url, requestInit);
      const contentType = response.headers.get("content-type") || "";
      let { responseType = "text" } = response.ok ? options : {};
      if (contentType.includes("application/json")) {
        responseType = "json";
      }
      let data;
      let blob;
      switch (responseType) {
        case "arraybuffer":
        case "blob":
          blob = await response.blob();
          data = await readBlobAsBase64(blob);
          break;
        case "json":
          data = await response.json();
          break;
        case "document":
        case "text":
        default:
          data = await response.text();
      }
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        data,
        headers,
        status: response.status,
        url: response.url
      };
    }
    async get(options) {
      return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
    }
    async post(options) {
      return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
    }
    async put(options) {
      return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
    }
    async patch(options) {
      return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
    }
    async delete(options) {
      return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
    }
  };
  CapacitorHttp = registerPlugin("CapacitorHttp", {
    web: () => new CapacitorHttpPluginWeb
  });
  (function(SystemBarsStyle2) {
    SystemBarsStyle2["Dark"] = "DARK";
    SystemBarsStyle2["Light"] = "LIGHT";
    SystemBarsStyle2["Default"] = "DEFAULT";
  })(SystemBarsStyle || (SystemBarsStyle = {}));
  (function(SystemBarType2) {
    SystemBarType2["StatusBar"] = "StatusBar";
    SystemBarType2["NavigationBar"] = "NavigationBar";
  })(SystemBarType || (SystemBarType = {}));
  SystemBarsPluginWeb = class SystemBarsPluginWeb extends WebPlugin {
    async setStyle() {
      this.unavailable("not available for web");
    }
    async setAnimation() {
      this.unavailable("not available for web");
    }
    async show() {
      this.unavailable("not available for web");
    }
    async hide() {
      this.unavailable("not available for web");
    }
  };
  SystemBars = registerPlugin("SystemBars", {
    web: () => new SystemBarsPluginWeb
  });
});

// node_modules/@capacitor/app/dist/esm/web.js
var exports_web = {};
__export(exports_web, {
  AppWeb: () => AppWeb
});
var AppWeb;
var init_web = __esm(() => {
  init_dist();
  AppWeb = class AppWeb extends WebPlugin {
    constructor() {
      super();
      this.handleVisibilityChange = () => {
        const data = {
          isActive: document.hidden !== true
        };
        this.notifyListeners("appStateChange", data);
        if (document.hidden) {
          this.notifyListeners("pause", null);
        } else {
          this.notifyListeners("resume", null);
        }
      };
      document.addEventListener("visibilitychange", this.handleVisibilityChange, false);
    }
    exitApp() {
      throw this.unimplemented("Not implemented on web.");
    }
    async getInfo() {
      throw this.unimplemented("Not implemented on web.");
    }
    async getLaunchUrl() {
      return { url: "" };
    }
    async getState() {
      return { isActive: document.hidden !== true };
    }
    async minimizeApp() {
      throw this.unimplemented("Not implemented on web.");
    }
    async toggleBackButtonHandler() {
      throw this.unimplemented("Not implemented on web.");
    }
  };
});

// src/app.js
init_dist();

// node_modules/@capacitor/app/dist/esm/index.js
init_dist();
var App = registerPlugin("App", {
  web: () => Promise.resolve().then(() => (init_web(), exports_web)).then((m) => new m.AppWeb)
});

// node_modules/@capacitor/push-notifications/dist/esm/index.js
init_dist();
var PushNotifications = registerPlugin("PushNotifications", {});

// node_modules/marked/lib/marked.esm.js
function M() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var T = M();
function H(u) {
  T = u;
}
var _ = { exec: () => null };
function k(u, e = "") {
  let t = typeof u == "string" ? u : u.source, n = { replace: (r, i) => {
    let s = typeof i == "string" ? i : i.source;
    return s = s.replace(m.caret, "$1"), t = t.replace(r, s), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var Re = (() => {
  try {
    return !!new RegExp("(?<=1)(?<!1)");
  } catch {
    return false;
  }
})();
var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, unescapeTest: /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (u) => new RegExp(`^( {0,3}${u})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: (u) => new RegExp(`^ {0,${Math.min(3, u - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), hrRegex: (u) => new RegExp(`^ {0,${Math.min(3, u - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), fencesBeginRegex: (u) => new RegExp(`^ {0,${Math.min(3, u - 1)}}(?:\`\`\`|~~~)`), headingBeginRegex: (u) => new RegExp(`^ {0,${Math.min(3, u - 1)}}#`), htmlBeginRegex: (u) => new RegExp(`^ {0,${Math.min(3, u - 1)}}<(?:[a-z].*>|!--)`, "i"), blockquoteBeginRegex: (u) => new RegExp(`^ {0,${Math.min(3, u - 1)}}>`) };
var Te = /^(?:[ \t]*(?:\n|$))+/;
var Oe = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var we = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var I = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var ye = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var N = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
var re = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var se = k(re).replace(/bull/g, N).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var Pe = k(re).replace(/bull/g, N).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var Q = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var Se = /^[^\n]+/;
var F = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var $e = k(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", F).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var _e = k(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, N).getRegex();
var q = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var j = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var Le = k("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$))", "i").replace("comment", j).replace("tag", q).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var ie = k(Q).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", q).getRegex();
var Me = k(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", ie).getRegex();
var U = { blockquote: Me, code: Oe, def: $e, fences: we, heading: ye, hr: I, html: Le, lheading: se, list: _e, newline: Te, paragraph: ie, table: _, text: Se };
var te = k("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}\t)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", q).getRegex();
var ze = { ...U, lheading: Pe, table: te, paragraph: k(Q).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", te).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", q).getRegex() };
var Ce = { ...U, html: k(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", j).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: k(Q).replace("hr", I).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", se).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var Ie = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var oe = /^( {2,}|\\)\n(?!\s*$)/;
var Ee = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var v = /[\p{P}\p{S}]/u;
var K = /[\s\p{P}\p{S}]/u;
var ae = /[^\s\p{P}\p{S}]/u;
var Be = k(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, K).getRegex();
var le = /(?!~)[\p{P}\p{S}]/u;
var De = /(?!~)[\s\p{P}\p{S}]/u;
var qe = /(?:[^\s\p{P}\p{S}]|~)/u;
var ue = /(?![*_])[\p{P}\p{S}]/u;
var ve = /(?![*_])[\s\p{P}\p{S}]/u;
var Ge = /(?:[^\s\p{P}\p{S}]|[*_])/u;
var He = k(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Re ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var pe = /^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/;
var Ze = k(pe, "u").replace(/punct/g, v).getRegex();
var Ne = k(pe, "u").replace(/punct/g, le).getRegex();
var ce = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Qe = k(ce, "gu").replace(/notPunctSpace/g, ae).replace(/punctSpace/g, K).replace(/punct/g, v).getRegex();
var Fe = k(ce, "gu").replace(/notPunctSpace/g, qe).replace(/punctSpace/g, De).replace(/punct/g, le).getRegex();
var je = k("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, ae).replace(/punctSpace/g, K).replace(/punct/g, v).getRegex();
var Ue = k(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, ue).getRegex();
var Ke = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
var We = k(Ke, "gu").replace(/notPunctSpace/g, Ge).replace(/punctSpace/g, ve).replace(/punct/g, ue).getRegex();
var Xe = k(/\\(punct)/, "gu").replace(/punct/g, v).getRegex();
var Je = k(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var Ve = k(j).replace("(?:-->|$)", "-->").getRegex();
var Ye = k("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Ve).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var D = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+[^`]*?`+(?!`)|[^\[\]\\`])*?/;
var et = k(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label", D).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var he = k(/^!?\[(label)\]\[(ref)\]/).replace("label", D).replace("ref", F).getRegex();
var ke = k(/^!?\[(ref)\](?:\[\])?/).replace("ref", F).getRegex();
var tt = k("reflink|nolink(?!\\()", "g").replace("reflink", he).replace("nolink", ke).getRegex();
var ne = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var W = { _backpedal: _, anyPunctuation: Xe, autolink: Je, blockSkip: He, br: oe, code: Ie, del: _, delLDelim: _, delRDelim: _, emStrongLDelim: Ze, emStrongRDelimAst: Qe, emStrongRDelimUnd: je, escape: Ae, link: et, nolink: ke, punctuation: Be, reflink: he, reflinkSearch: tt, tag: Ye, text: Ee, url: _ };
var nt = { ...W, link: k(/^!?\[(label)\]\((.*?)\)/).replace("label", D).getRegex(), reflink: k(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", D).getRegex() };
var Z = { ...W, emStrongRDelimAst: Fe, emStrongLDelim: Ne, delLDelim: Ue, delRDelim: We, url: k(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ne).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: k(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ne).getRegex() };
var rt = { ...Z, br: k(oe).replace("{2,}", "*").getRegex(), text: k(Z.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var E = { normal: U, gfm: ze, pedantic: Ce };
var z = { normal: W, gfm: Z, breaks: rt, pedantic: nt };
var st = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var de = (u) => st[u];
function O(u, e) {
  if (e) {
    if (m.escapeTest.test(u))
      return u.replace(m.escapeReplace, de);
  } else if (m.escapeTestNoEncode.test(u))
    return u.replace(m.escapeReplaceNoEncode, de);
  return u;
}
function X(u) {
  try {
    u = encodeURI(u).replace(m.percentDecode, "%");
  } catch {
    return null;
  }
  return u;
}
function J(u, e) {
  let t = u.replace(m.findPipe, (i, s, a) => {
    let o = false, l = s;
    for (;--l >= 0 && a[l] === "\\"; )
      o = !o;
    return o ? "|" : " |";
  }), n = t.split(m.splitPipe), r = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e)
    if (n.length > e)
      n.splice(e);
    else
      for (;n.length < e; )
        n.push("");
  for (;r < n.length; r++)
    n[r] = n[r].trim().replace(m.slashPipe, "|");
  return n;
}
function C(u, e, t) {
  let n = u.length;
  if (n === 0)
    return "";
  let r = 0;
  for (;r < n; ) {
    let i = u.charAt(n - r - 1);
    if (i === e && !t)
      r++;
    else if (i !== e && t)
      r++;
    else
      break;
  }
  return u.slice(0, n - r);
}
function ge(u, e) {
  if (u.indexOf(e[1]) === -1)
    return -1;
  let t = 0;
  for (let n = 0;n < u.length; n++)
    if (u[n] === "\\")
      n++;
    else if (u[n] === e[0])
      t++;
    else if (u[n] === e[1] && (t--, t < 0))
      return n;
  return t > 0 ? -2 : -1;
}
function fe(u, e = 0) {
  let t = e, n = "";
  for (let r of u)
    if (r === "\t") {
      let i = 4 - t % 4;
      n += " ".repeat(i), t += i;
    } else
      n += r, t++;
  return n;
}
function me(u, e, t, n, r) {
  let i = e.href, s = e.title || null, a = u[1].replace(r.other.outputLinkReplace, "$1");
  n.state.inLink = true;
  let o = { type: u[0].charAt(0) === "!" ? "image" : "link", raw: t, href: i, title: s, text: a, tokens: n.inlineTokens(a) };
  return n.state.inLink = false, o;
}
function it(u, e, t) {
  let n = u.match(t.other.indentCodeCompensation);
  if (n === null)
    return e;
  let r = n[1];
  return e.split(`
`).map((i) => {
    let s = i.match(t.other.beginningSpace);
    if (s === null)
      return i;
    let [a] = s;
    return a.length >= r.length ? i.slice(r.length) : i;
  }).join(`
`);
}
var w = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0)
      return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = t[0].replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: t[0], codeBlockStyle: "indented", text: this.options.pedantic ? n : C(n, `
`) };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], r = it(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: r };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let r = C(n, "#");
        (this.options.pedantic || !r || this.rules.other.endingSpaceChar.test(r)) && (n = r.trim());
      }
      return { type: "heading", raw: t[0], depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t)
      return { type: "hr", raw: C(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = C(t[0], `
`).split(`
`), r = "", i = "", s = [];
      for (;n.length > 0; ) {
        let a = false, o = [], l;
        for (l = 0;l < n.length; l++)
          if (this.rules.other.blockquoteStart.test(n[l]))
            o.push(n[l]), a = true;
          else if (!a)
            o.push(n[l]);
          else
            break;
        n = n.slice(l);
        let p = o.join(`
`), c = p.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        r = r ? `${r}
${p}` : p, i = i ? `${i}
${c}` : c;
        let d = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(c, s, true), this.lexer.state.top = d, n.length === 0)
          break;
        let h = s.at(-1);
        if (h?.type === "code")
          break;
        if (h?.type === "blockquote") {
          let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
          s[s.length - 1] = S, r = r.substring(0, r.length - R.raw.length) + S.raw, i = i.substring(0, i.length - R.text.length) + S.text;
          break;
        } else if (h?.type === "list") {
          let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
          s[s.length - 1] = S, r = r.substring(0, r.length - h.raw.length) + S.raw, i = i.substring(0, i.length - R.raw.length) + S.raw, n = f.substring(s.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: r, tokens: s, text: i };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), r = n.length > 1, i = { type: "list", raw: "", ordered: r, start: r ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = r ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = r ? n : "[*+-]");
      let s = this.rules.other.listItemRegex(n), a = false;
      for (;e; ) {
        let l = false, p = "", c = "";
        if (!(t = s.exec(e)) || this.rules.block.hr.test(e))
          break;
        p = t[0], e = e.substring(p.length);
        let d = fe(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !d.trim(), f = 0;
        if (this.options.pedantic ? (f = 2, c = d.trimStart()) : R ? f = t[1].length + 1 : (f = d.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, c = d.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (p += h + `
`, e = e.substring(h.length + 1), l = true), !l) {
          let S = this.rules.other.nextBulletRegex(f), V = this.rules.other.hrRegex(f), Y = this.rules.other.fencesBeginRegex(f), ee = this.rules.other.headingBeginRegex(f), xe = this.rules.other.htmlBeginRegex(f), be = this.rules.other.blockquoteBeginRegex(f);
          for (;e; ) {
            let G = e.split(`
`, 1)[0], A;
            if (h = G, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), A = h) : A = h.replace(this.rules.other.tabCharGlobal, "    "), Y.test(h) || ee.test(h) || xe.test(h) || be.test(h) || S.test(h) || V.test(h))
              break;
            if (A.search(this.rules.other.nonSpaceChar) >= f || !h.trim())
              c += `
` + A.slice(f);
            else {
              if (R || d.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || Y.test(d) || ee.test(d) || V.test(d))
                break;
              c += `
` + h;
            }
            R = !h.trim(), p += G + `
`, e = e.substring(G.length + 1), d = A.slice(f);
          }
        }
        i.loose || (a ? i.loose = true : this.rules.other.doubleBlankLine.test(p) && (a = true)), i.items.push({ type: "list_item", raw: p, task: !!this.options.gfm && this.rules.other.listIsTask.test(c), loose: false, text: c, tokens: [] }), i.raw += p;
      }
      let o = i.items.at(-1);
      if (o)
        o.raw = o.raw.trimEnd(), o.text = o.text.trimEnd();
      else
        return;
      i.raw = i.raw.trimEnd();
      for (let l of i.items) {
        if (this.lexer.state.top = false, l.tokens = this.lexer.blockTokens(l.text, []), l.task) {
          if (l.text = l.text.replace(this.rules.other.listReplaceTask, ""), l.tokens[0]?.type === "text" || l.tokens[0]?.type === "paragraph") {
            l.tokens[0].raw = l.tokens[0].raw.replace(this.rules.other.listReplaceTask, ""), l.tokens[0].text = l.tokens[0].text.replace(this.rules.other.listReplaceTask, "");
            for (let c = this.lexer.inlineQueue.length - 1;c >= 0; c--)
              if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[c].src)) {
                this.lexer.inlineQueue[c].src = this.lexer.inlineQueue[c].src.replace(this.rules.other.listReplaceTask, "");
                break;
              }
          }
          let p = this.rules.other.listTaskCheckbox.exec(l.raw);
          if (p) {
            let c = { type: "checkbox", raw: p[0] + " ", checked: p[0] !== "[ ]" };
            l.checked = c.checked, i.loose ? l.tokens[0] && ["paragraph", "text"].includes(l.tokens[0].type) && "tokens" in l.tokens[0] && l.tokens[0].tokens ? (l.tokens[0].raw = c.raw + l.tokens[0].raw, l.tokens[0].text = c.raw + l.tokens[0].text, l.tokens[0].tokens.unshift(c)) : l.tokens.unshift({ type: "paragraph", raw: c.raw, text: c.raw, tokens: [c] }) : l.tokens.unshift(c);
          }
        }
        if (!i.loose) {
          let p = l.tokens.filter((d) => d.type === "space"), c = p.length > 0 && p.some((d) => this.rules.other.anyLine.test(d.raw));
          i.loose = c;
        }
      }
      if (i.loose)
        for (let l of i.items) {
          l.loose = true;
          for (let p of l.tokens)
            p.type === "text" && (p.type = "paragraph");
        }
      return i;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t)
      return { type: "html", block: true, raw: t[0], pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: t[0] };
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), r = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", i = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: t[0], href: r, title: i };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2]))
      return;
    let n = J(t[1]), r = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), i = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], s = { type: "table", raw: t[0], header: [], align: [], rows: [] };
    if (n.length === r.length) {
      for (let a of r)
        this.rules.other.tableAlignRight.test(a) ? s.align.push("right") : this.rules.other.tableAlignCenter.test(a) ? s.align.push("center") : this.rules.other.tableAlignLeft.test(a) ? s.align.push("left") : s.align.push(null);
      for (let a = 0;a < n.length; a++)
        s.header.push({ text: n[a], tokens: this.lexer.inline(n[a]), header: true, align: s.align[a] });
      for (let a of i)
        s.rows.push(J(a, s.header.length).map((o, l) => ({ text: o, tokens: this.lexer.inline(o), header: false, align: s.align[l] })));
      return s;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t)
      return { type: "heading", raw: t[0], depth: t[2].charAt(0) === "=" ? 1 : 2, text: t[1], tokens: this.lexer.inline(t[1]) };
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t)
      return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t)
      return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t)
      return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n))
          return;
        let s = C(n.slice(0, -1), "\\");
        if ((n.length - s.length) % 2 === 0)
          return;
      } else {
        let s = ge(t[2], "()");
        if (s === -2)
          return;
        if (s > -1) {
          let o = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + s;
          t[2] = t[2].substring(0, s), t[0] = t[0].substring(0, o).trim(), t[3] = "";
        }
      }
      let r = t[2], i = "";
      if (this.options.pedantic) {
        let s = this.rules.other.pedanticHrefTitle.exec(r);
        s && (r = s[1], i = s[3]);
      } else
        i = t[3] ? t[3].slice(1, -1) : "";
      return r = r.trim(), this.rules.other.startAngleBracket.test(r) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? r = r.slice(1) : r = r.slice(1, -1)), me(t, { href: r && r.replace(this.rules.inline.anyPunctuation, "$1"), title: i && i.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let r = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), i = t[r.toLowerCase()];
      if (!i) {
        let s = n[0].charAt(0);
        return { type: "text", raw: s, text: s };
      }
      return me(n, i, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let r = this.rules.inline.emStrongLDelim.exec(e);
    if (!r || r[3] && n.match(this.rules.other.unicodeAlphaNumeric))
      return;
    if (!(r[1] || r[2] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let s = [...r[0]].length - 1, a, o, l = s, p = 0, c = r[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (c.lastIndex = 0, t = t.slice(-1 * e.length + s);(r = c.exec(t)) != null; ) {
        if (a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !a)
          continue;
        if (o = [...a].length, r[3] || r[4]) {
          l += o;
          continue;
        } else if ((r[5] || r[6]) && s % 3 && !((s + o) % 3)) {
          p += o;
          continue;
        }
        if (l -= o, l > 0)
          continue;
        o = Math.min(o, o + l + p);
        let d = [...r[0]][0].length, h = e.slice(0, s + r.index + d + o);
        if (Math.min(s, o) % 2) {
          let f = h.slice(1, -1);
          return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
        }
        let R = h.slice(2, -2);
        return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), r = this.rules.other.nonSpaceChar.test(n), i = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return r && i && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t)
      return { type: "br", raw: t[0] };
  }
  del(e, t, n = "") {
    let r = this.rules.inline.delLDelim.exec(e);
    if (!r)
      return;
    if (!(r[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let s = [...r[0]].length - 1, a, o, l = s, p = this.rules.inline.delRDelim;
      for (p.lastIndex = 0, t = t.slice(-1 * e.length + s);(r = p.exec(t)) != null; ) {
        if (a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !a || (o = [...a].length, o !== s))
          continue;
        if (r[3] || r[4]) {
          l += o;
          continue;
        }
        if (l -= o, l > 0)
          continue;
        o = Math.min(o, o + l);
        let c = [...r[0]][0].length, d = e.slice(0, s + r.index + c + o), h = d.slice(s, -s);
        return { type: "del", raw: d, text: h, tokens: this.lexer.inlineTokens(h) };
      }
    }
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, r;
      return t[2] === "@" ? (n = t[1], r = "mailto:" + n) : (n = t[1], r = n), { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, r;
      if (t[2] === "@")
        n = t[0], r = "mailto:" + n;
      else {
        let i;
        do
          i = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (i !== t[0]);
        n = t[0], t[1] === "www." ? r = "http://" + t[0] : r = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: t[0], escaped: n };
    }
  }
};
var x = class u {
  tokens;
  options;
  state;
  inlineQueue;
  tokenizer;
  constructor(e) {
    this.tokens = [], this.tokens.links = Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new w, this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t = { other: m, block: E.normal, inline: z.normal };
    this.options.pedantic ? (t.block = E.pedantic, t.inline = z.pedantic) : this.options.gfm && (t.block = E.gfm, this.options.breaks ? t.inline = z.breaks : t.inline = z.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: E, inline: z };
  }
  static lex(e, t) {
    return new u(t).lex(e);
  }
  static lexInline(e, t) {
    return new u(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0;t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    for (this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));e; ) {
      let r;
      if (this.options.extensions?.block?.some((s) => (r = s.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false))
        continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        r.raw.length === 1 && s !== undefined ? s.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.at(-1).src = s.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.raw, this.inlineQueue.at(-1).src = s.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let i = e;
      if (this.options.extensions?.startBlock) {
        let s = 1 / 0, a = e.slice(1), o;
        this.options.extensions.startBlock.forEach((l) => {
          o = l.call({ lexer: this }, a), typeof o == "number" && o >= 0 && (s = Math.min(s, o));
        }), s < 1 / 0 && s >= 0 && (i = e.substring(0, s + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(i))) {
        let s = t.at(-1);
        n && s?.type === "paragraph" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r);
        continue;
      }
      if (e) {
        let s = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(s);
          break;
        } else
          throw new Error(s);
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  inlineTokens(e, t = []) {
    let n = e, r = null;
    if (this.tokens.links) {
      let o = Object.keys(this.tokens.links);
      if (o.length > 0)
        for (;(r = this.tokenizer.rules.inline.reflinkSearch.exec(n)) != null; )
          o.includes(r[0].slice(r[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, r.index) + "[" + "a".repeat(r[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (;(r = this.tokenizer.rules.inline.anyPunctuation.exec(n)) != null; )
      n = n.slice(0, r.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let i;
    for (;(r = this.tokenizer.rules.inline.blockSkip.exec(n)) != null; )
      i = r[2] ? r[2].length : 0, n = n.slice(0, r.index + i) + "[" + "a".repeat(r[0].length - i - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let s = false, a = "";
    for (;e; ) {
      s || (a = ""), s = false;
      let o;
      if (this.options.extensions?.inline?.some((p) => (o = p.call({ lexer: this }, e, t)) ? (e = e.substring(o.raw.length), t.push(o), true) : false))
        continue;
      if (o = this.tokenizer.escape(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.tag(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.link(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(o.raw.length);
        let p = t.at(-1);
        o.type === "text" && p?.type === "text" ? (p.raw += o.raw, p.text += o.text) : t.push(o);
        continue;
      }
      if (o = this.tokenizer.emStrong(e, n, a)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.codespan(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.br(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.del(e, n, a)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.autolink(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (!this.state.inLink && (o = this.tokenizer.url(e))) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      let l = e;
      if (this.options.extensions?.startInline) {
        let p = 1 / 0, c = e.slice(1), d;
        this.options.extensions.startInline.forEach((h) => {
          d = h.call({ lexer: this }, c), typeof d == "number" && d >= 0 && (p = Math.min(p, d));
        }), p < 1 / 0 && p >= 0 && (l = e.substring(0, p + 1));
      }
      if (o = this.tokenizer.inlineText(l)) {
        e = e.substring(o.raw.length), o.raw.slice(-1) !== "_" && (a = o.raw.slice(-1)), s = true;
        let p = t.at(-1);
        p?.type === "text" ? (p.raw += o.raw, p.text += o.text) : t.push(o);
        continue;
      }
      if (e) {
        let p = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(p);
          break;
        } else
          throw new Error(p);
      }
    }
    return t;
  }
};
var y = class {
  options;
  parser;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let r = (t || "").match(m.notSpaceStart)?.[0], i = e.replace(m.endingNewline, "") + `
`;
    return r ? '<pre><code class="language-' + O(r) + '">' + (n ? i : O(i, true)) + `</code></pre>
` : "<pre><code>" + (n ? i : O(i, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let { ordered: t, start: n } = e, r = "";
    for (let a = 0;a < e.items.length; a++) {
      let o = e.items[a];
      r += this.listitem(o);
    }
    let i = t ? "ol" : "ul", s = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + i + s + `>
` + r + "</" + i + `>
`;
  }
  listitem(e) {
    return `<li>${this.parser.parse(e.tokens)}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let i = 0;i < e.header.length; i++)
      n += this.tablecell(e.header[i]);
    t += this.tablerow({ text: n });
    let r = "";
    for (let i = 0;i < e.rows.length; i++) {
      let s = e.rows[i];
      n = "";
      for (let a = 0;a < s.length; a++)
        n += this.tablecell(s[a]);
      r += this.tablerow({ text: n });
    }
    return r && (r = `<tbody>${r}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + r + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${O(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, tokens: n }) {
    let r = this.parser.parseInline(n), i = X(e);
    if (i === null)
      return r;
    e = i;
    let s = '<a href="' + e + '"';
    return t && (s += ' title="' + O(t) + '"'), s += ">" + r + "</a>", s;
  }
  image({ href: e, title: t, text: n, tokens: r }) {
    r && (n = this.parser.parseInline(r, this.parser.textRenderer));
    let i = X(e);
    if (i === null)
      return O(n);
    e = i;
    let s = `<img src="${e}" alt="${n}"`;
    return t && (s += ` title="${O(t)}"`), s += ">", s;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : ("escaped" in e) && e.escaped ? e.text : O(e.text);
  }
};
var $ = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
  checkbox({ raw: e }) {
    return e;
  }
};
var b = class u2 {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || T, this.options.renderer = this.options.renderer || new y, this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new $;
  }
  static parse(e, t) {
    return new u2(t).parse(e);
  }
  static parseInline(e, t) {
    return new u2(t).parseInline(e);
  }
  parse(e) {
    let t = "";
    for (let n = 0;n < e.length; n++) {
      let r = e[n];
      if (this.options.extensions?.renderers?.[r.type]) {
        let s = r, a = this.options.extensions.renderers[s.type].call({ parser: this }, s);
        if (a !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(s.type)) {
          t += a || "";
          continue;
        }
      }
      let i = r;
      switch (i.type) {
        case "space": {
          t += this.renderer.space(i);
          break;
        }
        case "hr": {
          t += this.renderer.hr(i);
          break;
        }
        case "heading": {
          t += this.renderer.heading(i);
          break;
        }
        case "code": {
          t += this.renderer.code(i);
          break;
        }
        case "table": {
          t += this.renderer.table(i);
          break;
        }
        case "blockquote": {
          t += this.renderer.blockquote(i);
          break;
        }
        case "list": {
          t += this.renderer.list(i);
          break;
        }
        case "checkbox": {
          t += this.renderer.checkbox(i);
          break;
        }
        case "html": {
          t += this.renderer.html(i);
          break;
        }
        case "def": {
          t += this.renderer.def(i);
          break;
        }
        case "paragraph": {
          t += this.renderer.paragraph(i);
          break;
        }
        case "text": {
          t += this.renderer.text(i);
          break;
        }
        default: {
          let s = 'Token with "' + i.type + '" type was not found.';
          if (this.options.silent)
            return console.error(s), "";
          throw new Error(s);
        }
      }
    }
    return t;
  }
  parseInline(e, t = this.renderer) {
    let n = "";
    for (let r = 0;r < e.length; r++) {
      let i = e[r];
      if (this.options.extensions?.renderers?.[i.type]) {
        let a = this.options.extensions.renderers[i.type].call({ parser: this }, i);
        if (a !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(i.type)) {
          n += a || "";
          continue;
        }
      }
      let s = i;
      switch (s.type) {
        case "escape": {
          n += t.text(s);
          break;
        }
        case "html": {
          n += t.html(s);
          break;
        }
        case "link": {
          n += t.link(s);
          break;
        }
        case "image": {
          n += t.image(s);
          break;
        }
        case "checkbox": {
          n += t.checkbox(s);
          break;
        }
        case "strong": {
          n += t.strong(s);
          break;
        }
        case "em": {
          n += t.em(s);
          break;
        }
        case "codespan": {
          n += t.codespan(s);
          break;
        }
        case "br": {
          n += t.br(s);
          break;
        }
        case "del": {
          n += t.del(s);
          break;
        }
        case "text": {
          n += t.text(s);
          break;
        }
        default: {
          let a = 'Token with "' + s.type + '" type was not found.';
          if (this.options.silent)
            return console.error(a), "";
          throw new Error(a);
        }
      }
    }
    return n;
  }
};
var P = class {
  options;
  block;
  constructor(e) {
    this.options = e || T;
  }
  static passThroughHooks = new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer() {
    return this.block ? x.lex : x.lexInline;
  }
  provideParser() {
    return this.block ? b.parse : b.parseInline;
  }
};
var B = class {
  defaults = M();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = b;
  Renderer = y;
  TextRenderer = $;
  Lexer = x;
  Tokenizer = w;
  Hooks = P;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let r of e)
      switch (n = n.concat(t.call(this, r)), r.type) {
        case "table": {
          let i = r;
          for (let s of i.header)
            n = n.concat(this.walkTokens(s.tokens, t));
          for (let s of i.rows)
            for (let a of s)
              n = n.concat(this.walkTokens(a.tokens, t));
          break;
        }
        case "list": {
          let i = r;
          n = n.concat(this.walkTokens(i.items, t));
          break;
        }
        default: {
          let i = r;
          this.defaults.extensions?.childTokens?.[i.type] ? this.defaults.extensions.childTokens[i.type].forEach((s) => {
            let a = i[s].flat(1 / 0);
            n = n.concat(this.walkTokens(a, t));
          }) : i.tokens && (n = n.concat(this.walkTokens(i.tokens, t)));
        }
      }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let r = { ...n };
      if (r.async = this.defaults.async || r.async || false, n.extensions && (n.extensions.forEach((i) => {
        if (!i.name)
          throw new Error("extension name required");
        if ("renderer" in i) {
          let s = t.renderers[i.name];
          s ? t.renderers[i.name] = function(...a) {
            let o = i.renderer.apply(this, a);
            return o === false && (o = s.apply(this, a)), o;
          } : t.renderers[i.name] = i.renderer;
        }
        if ("tokenizer" in i) {
          if (!i.level || i.level !== "block" && i.level !== "inline")
            throw new Error("extension level must be 'block' or 'inline'");
          let s = t[i.level];
          s ? s.unshift(i.tokenizer) : t[i.level] = [i.tokenizer], i.start && (i.level === "block" ? t.startBlock ? t.startBlock.push(i.start) : t.startBlock = [i.start] : i.level === "inline" && (t.startInline ? t.startInline.push(i.start) : t.startInline = [i.start]));
        }
        "childTokens" in i && i.childTokens && (t.childTokens[i.name] = i.childTokens);
      }), r.extensions = t), n.renderer) {
        let i = this.defaults.renderer || new y(this.defaults);
        for (let s in n.renderer) {
          if (!(s in i))
            throw new Error(`renderer '${s}' does not exist`);
          if (["options", "parser"].includes(s))
            continue;
          let a = s, o = n.renderer[a], l = i[a];
          i[a] = (...p) => {
            let c = o.apply(i, p);
            return c === false && (c = l.apply(i, p)), c || "";
          };
        }
        r.renderer = i;
      }
      if (n.tokenizer) {
        let i = this.defaults.tokenizer || new w(this.defaults);
        for (let s in n.tokenizer) {
          if (!(s in i))
            throw new Error(`tokenizer '${s}' does not exist`);
          if (["options", "rules", "lexer"].includes(s))
            continue;
          let a = s, o = n.tokenizer[a], l = i[a];
          i[a] = (...p) => {
            let c = o.apply(i, p);
            return c === false && (c = l.apply(i, p)), c;
          };
        }
        r.tokenizer = i;
      }
      if (n.hooks) {
        let i = this.defaults.hooks || new P;
        for (let s in n.hooks) {
          if (!(s in i))
            throw new Error(`hook '${s}' does not exist`);
          if (["options", "block"].includes(s))
            continue;
          let a = s, o = n.hooks[a], l = i[a];
          P.passThroughHooks.has(s) ? i[a] = (p) => {
            if (this.defaults.async && P.passThroughHooksRespectAsync.has(s))
              return (async () => {
                let d = await o.call(i, p);
                return l.call(i, d);
              })();
            let c = o.call(i, p);
            return l.call(i, c);
          } : i[a] = (...p) => {
            if (this.defaults.async)
              return (async () => {
                let d = await o.apply(i, p);
                return d === false && (d = await l.apply(i, p)), d;
              })();
            let c = o.apply(i, p);
            return c === false && (c = l.apply(i, p)), c;
          };
        }
        r.hooks = i;
      }
      if (n.walkTokens) {
        let i = this.defaults.walkTokens, s = n.walkTokens;
        r.walkTokens = function(a) {
          let o = [];
          return o.push(s.call(this, a)), i && (o = o.concat(i.call(this, a))), o;
        };
      }
      this.defaults = { ...this.defaults, ...r };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return x.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return b.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, r) => {
      let i = { ...r }, s = { ...this.defaults, ...i }, a = this.onError(!!s.silent, !!s.async);
      if (this.defaults.async === true && i.async === false)
        return a(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null)
        return a(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string")
        return a(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (s.hooks && (s.hooks.options = s, s.hooks.block = e), s.async)
        return (async () => {
          let o = s.hooks ? await s.hooks.preprocess(n) : n, p = await (s.hooks ? await s.hooks.provideLexer() : e ? x.lex : x.lexInline)(o, s), c = s.hooks ? await s.hooks.processAllTokens(p) : p;
          s.walkTokens && await Promise.all(this.walkTokens(c, s.walkTokens));
          let h = await (s.hooks ? await s.hooks.provideParser() : e ? b.parse : b.parseInline)(c, s);
          return s.hooks ? await s.hooks.postprocess(h) : h;
        })().catch(a);
      try {
        s.hooks && (n = s.hooks.preprocess(n));
        let l = (s.hooks ? s.hooks.provideLexer() : e ? x.lex : x.lexInline)(n, s);
        s.hooks && (l = s.hooks.processAllTokens(l)), s.walkTokens && this.walkTokens(l, s.walkTokens);
        let c = (s.hooks ? s.hooks.provideParser() : e ? b.parse : b.parseInline)(l, s);
        return s.hooks && (c = s.hooks.postprocess(c)), c;
      } catch (o) {
        return a(o);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let r = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(r) : r;
      }
      if (t)
        return Promise.reject(n);
      throw n;
    };
  }
};
var L = new B;
function g(u3, e) {
  return L.parse(u3, e);
}
g.options = g.setOptions = function(u3) {
  return L.setOptions(u3), g.defaults = L.defaults, H(g.defaults), g;
};
g.getDefaults = M;
g.defaults = T;
g.use = function(...u3) {
  return L.use(...u3), g.defaults = L.defaults, H(g.defaults), g;
};
g.walkTokens = function(u3, e) {
  return L.walkTokens(u3, e);
};
g.parseInline = L.parseInline;
g.Parser = b;
g.parser = b.parse;
g.Renderer = y;
g.TextRenderer = $;
g.Lexer = x;
g.lexer = x.lex;
g.Tokenizer = w;
g.Hooks = P;
g.parse = g;
var Ut = g.options;
var Kt = g.setOptions;
var Wt = g.use;
var Xt = g.walkTokens;
var Jt = g.parseInline;
var Yt = b.parse;
var en = x.lex;

// src/markdown.js
g.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false
});
var renderer = new g.Renderer;
var originalLink = renderer.link.bind(renderer);
renderer.link = function(token) {
  const html = originalLink(token);
  return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
};
g.use({ renderer });
function renderMarkdown(content) {
  if (!content)
    return "";
  try {
    return g.parse(content);
  } catch (e) {
    console.error("Markdown rendering failed:", e);
    return escapeHtml(content);
  }
}
function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

// src/app.js
var app = document.getElementById("app");
var currentUser = null;
var sessionToken = null;
var currentChannel = null;
var openThreadId = null;
var viewingThreads = false;
var viewingSettings = false;
var wsConn = null;
var unreadState = new Map;
var REACTION_EMOJIS = ["\uD83D\uDC4D", "\uD83D\uDC4E", "❤️", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDD25", "\uD83C\uDF89", "\uD83D\uDC40", "\uD83D\uDE4F"];
function getApiBase() {
  if (Capacitor.isNativePlatform()) {
    return localStorage.getItem("serverUrl") || "";
  }
  return "";
}
function getWsUrl() {
  if (Capacitor.isNativePlatform()) {
    const base = localStorage.getItem("serverUrl");
    if (base) {
      try {
        const url = new URL(base);
        const proto2 = url.protocol === "https:" ? "wss:" : "ws:";
        return `${proto2}//${url.host}/ws`;
      } catch {}
    }
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}
if ("serviceWorker" in navigator && !Capacitor.isNativePlatform()) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
if ("Notification" in window && !Capacitor.isNativePlatform()) {
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}
function isMobile() {
  return window.matchMedia("(max-width: 768px)").matches;
}
var wsReconnectAttempt = 0;
var connectionStatusTimeout = null;
async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const opts = { method, headers };
  if (Capacitor.isNativePlatform() && sessionToken) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
  } else {
    opts.credentials = "include";
  }
  if (body)
    opts.body = JSON.stringify(body);
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, opts);
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Request failed");
  return data;
}
async function registerNativePush() {
  try {
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === "prompt") {
      await PushNotifications.requestPermissions();
    }
    await PushNotifications.register();
    let ntfyTopic = localStorage.getItem("ntfyTopic");
    if (!ntfyTopic) {
      ntfyTopic = "relaychat-" + currentUser.id + "-" + Math.random().toString(36).substring(2, 10);
      localStorage.setItem("ntfyTopic", ntfyTopic);
    }
    await api("POST", "/api/push/subscribe", {
      ntfyTopic,
      platform: "android"
    });
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      console.log("Push received:", notification);
    });
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      console.log("Push action:", action);
      const data = action.notification.data;
      if (data && data.click) {
        const url = new URL(data.click);
        const hash = url.hash || "";
        if (hash) {
          window.location.hash = hash;
        }
      }
    });
  } catch (e) {
    console.error("Push registration failed:", e);
  }
}
function getReconnectDelay() {
  const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempt), 30000);
  return Math.round(delay * (0.75 + Math.random() * 0.5));
}
function updateConnectionStatus(connected) {
  const el = document.getElementById("connection-status");
  if (!el)
    return;
  if (connected) {
    clearTimeout(connectionStatusTimeout);
    el.classList.add("hidden");
  } else {
    clearTimeout(connectionStatusTimeout);
    connectionStatusTimeout = setTimeout(() => {
      el.classList.remove("hidden");
      el.textContent = "[ reconnecting... ]";
    }, 2000);
  }
}
function connectWS() {
  if (wsConn) {
    wsConn.close();
    wsConn = null;
  }
  let url = getWsUrl();
  if (sessionToken)
    url += `?token=${encodeURIComponent(sessionToken)}`;
  const ws = new WebSocket(url);
  ws.onopen = () => {
    wsReconnectAttempt = 0;
    updateConnectionStatus(true);
  };
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      handleWSEvent(data);
    } catch {}
  };
  ws.onclose = () => {
    wsConn = null;
    updateConnectionStatus(false);
    const delay = getReconnectDelay();
    wsReconnectAttempt++;
    setTimeout(() => {
      if (currentUser)
        connectWS();
    }, delay);
  };
  wsConn = ws;
}
function handleWSEvent(data) {
  if (data.type === "new_message") {
    const msg = data.payload;
    if (currentChannel && msg.channelId === currentChannel.id && !msg.parentId) {
      appendMessage(msg);
      markChannelRead(msg.channelId, msg.id);
    } else if (!msg.parentId) {
      const state = unreadState.get(msg.channelId) || { count: 0, hasMention: false };
      state.count++;
      if (msg.mentions && currentUser && msg.mentions.includes(currentUser.username)) {
        state.hasMention = true;
      }
      unreadState.set(msg.channelId, state);
      updateChannelBadge(msg.channelId);
      if (!Capacitor.isNativePlatform() && Notification.permission === "granted") {
        if (document.hidden || !currentChannel || msg.channelId !== currentChannel.id) {
          const channelName = document.querySelector(`#channel-list li[data-id="${msg.channelId}"]`)?.dataset?.name || "unknown";
          new Notification(`#${channelName}`, {
            body: `${msg.displayName}: ${msg.content.substring(0, 100)}`,
            tag: `relaychat-${msg.channelId}-${msg.id}`
          });
        }
      }
    }
  } else if (data.type === "new_reply") {
    const msg = data.payload;
    if (openThreadId && msg.parentId === openThreadId) {
      appendReply(msg);
    }
    if (currentChannel && msg.channelId === currentChannel.id) {
      updateReplyCount(msg.parentId);
    }
    if (!Capacitor.isNativePlatform() && Notification.permission === "granted") {
      if (document.hidden || !openThreadId || msg.parentId !== openThreadId) {
        new Notification("Thread reply", {
          body: `${msg.displayName}: ${msg.content.substring(0, 100)}`,
          tag: `relaychat-thread-${msg.parentId}-${msg.id}`
        });
      }
    }
  } else if (data.type === "reaction_added") {
    const r = data.payload;
    updateReactionUI(r.messageId, r.emoji, r.userId, true);
  } else if (data.type === "reaction_removed") {
    const r = data.payload;
    updateReactionUI(r.messageId, r.emoji, r.userId, false);
  } else if (data.type === "channel_created") {
    const ch = data.payload;
    unreadState.set(ch.id, { count: 0, hasMention: false });
    const list = document.getElementById("channel-list");
    if (list && !list.querySelector(`li[data-id="${ch.id}"]`)) {
      const li = document.createElement("li");
      li.dataset.id = ch.id;
      li.dataset.name = ch.name;
      li.textContent = ch.name;
      list.appendChild(li);
    }
  }
}
function updateChannelBadge(channelId) {
  const li = document.querySelector(`#channel-list li[data-id="${channelId}"]`);
  if (!li)
    return;
  const u3 = unreadState.get(channelId) || { count: 0, hasMention: false };
  li.classList.toggle("has-unread", u3.count > 0);
  let badge = li.querySelector(".mention-badge");
  if (u3.hasMention) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "mention-badge";
      badge.textContent = "@";
      li.appendChild(badge);
    }
  } else if (badge) {
    badge.remove();
  }
}
function markChannelRead(channelId, messageId) {
  if (!messageId || messageId <= 0)
    return;
  api("POST", `/api/channels/${channelId}/read`, { messageId }).catch(() => {});
}
function showCreateChannelModal() {
  const existing = document.querySelector(".modal-backdrop");
  if (existing)
    existing.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3># create channel</h3>
      <label for="channel-name-input">Name</label>
      <input type="text" id="channel-name-input" placeholder="e.g. random" maxlength="50" autocomplete="off">
      <div class="channel-name-preview hidden" id="channel-name-preview"></div>
      <div class="error hidden" id="channel-create-error"></div>
      <div class="modal-actions">
        <button id="channel-create-submit">Create</button>
        <button id="channel-create-cancel" class="secondary">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const input = document.getElementById("channel-name-input");
  const preview = document.getElementById("channel-name-preview");
  const errEl = document.getElementById("channel-create-error");
  function formatName(raw) {
    return raw.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-");
  }
  input.addEventListener("input", () => {
    const formatted = formatName(input.value);
    if (formatted && formatted !== input.value) {
      preview.textContent = "# " + formatted;
      preview.classList.remove("hidden");
    } else {
      preview.classList.add("hidden");
    }
  });
  async function submit() {
    const name = formatName(input.value).replace(/^-+|-+$/g, "");
    if (!name) {
      errEl.textContent = "Name is required";
      errEl.classList.remove("hidden");
      return;
    }
    try {
      const ch = await api("POST", "/api/channels", { name });
      backdrop.remove();
      const list = document.getElementById("channel-list");
      if (list && !list.querySelector(`li[data-id="${ch.id}"]`)) {
        const li = document.createElement("li");
        li.dataset.id = ch.id;
        li.dataset.name = ch.name;
        li.textContent = ch.name;
        list.appendChild(li);
      }
      selectChannel({ id: ch.id, name: ch.name });
    } catch (e) {
      errEl.textContent = e.message || "Failed to create channel";
      errEl.classList.remove("hidden");
    }
  }
  document.getElementById("channel-create-submit").onclick = submit;
  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };
  function close() {
    backdrop.remove();
  }
  document.getElementById("channel-create-cancel").onclick = close;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop)
      close();
  });
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", escHandler);
    }
  });
  input.focus();
}
function renderLinkPreviews(previews) {
  if (!previews || previews.length === 0)
    return "";
  return previews.filter((p) => p.title).map((p) => `
    <div class="link-preview">
      <button class="link-preview-dismiss" title="Dismiss">&times;</button>
      <div class="link-preview-content">
        <div class="link-preview-text">
          ${p.siteName ? `<div class="link-preview-site">${esc(p.siteName)}</div>` : ""}
          <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="link-preview-title">${esc(p.title)}</a>
          ${p.description ? `<div class="link-preview-desc">${esc(p.description)}</div>` : ""}
        </div>
        ${p.image ? `<img class="link-preview-img" src="${esc(p.image)}" alt="" loading="lazy">` : ""}
      </div>
    </div>
  `).join("");
}
function renderReactions(msgId, reactions) {
  let html = '<div class="reactions-bar">';
  for (const r of reactions) {
    const mine = currentUser && r.userIds && r.userIds.includes(currentUser.id);
    html += `<button class="reaction-pill${mine ? " mine" : ""}" data-emoji="${esc(r.emoji)}">${r.emoji} <span class="reaction-count">${r.count}</span></button>`;
  }
  html += `<button class="reaction-add-btn" data-add-for="${msgId}">+</button>`;
  html += "</div>";
  return html;
}
function attachReactionHandlers(container, msgId) {
  const bar = container.querySelector(".reactions-bar");
  if (!bar)
    return;
  bar.querySelectorAll(".reaction-pill").forEach((btn) => {
    btn.onclick = () => toggleReaction(msgId, btn.dataset.emoji, btn.classList.contains("mine"));
  });
  const addBtn = bar.querySelector(".reaction-add-btn");
  if (addBtn) {
    addBtn.onclick = (e) => {
      e.stopPropagation();
      showReactionPicker(addBtn, msgId);
    };
  }
}
function showReactionPicker(anchorBtn, msgId) {
  const existing = document.querySelector(".reaction-picker");
  if (existing)
    existing.remove();
  const picker = document.createElement("div");
  picker.className = "reaction-picker";
  picker.innerHTML = REACTION_EMOJIS.map((em) => `<button class="reaction-picker-btn" data-emoji="${em}">${em}</button>`).join("");
  picker.querySelectorAll(".reaction-picker-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      picker.remove();
      addReaction(msgId, btn.dataset.emoji);
    };
  });
  document.body.appendChild(picker);
  const rect = anchorBtn.getBoundingClientRect();
  const pickerHeight = 80;
  let top = rect.top - pickerHeight - 4;
  let left = rect.left;
  if (top < 8)
    top = rect.bottom + 4;
  if (left + 220 > window.innerWidth - 8)
    left = window.innerWidth - 228;
  if (left < 8)
    left = 8;
  picker.style.top = `${top}px`;
  picker.style.left = `${left}px`;
  const closeHandler = (ev) => {
    if (!picker.contains(ev.target) && ev.target !== anchorBtn) {
      picker.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 0);
}
async function addReaction(msgId, emoji) {
  await api("POST", `/api/messages/${msgId}/reactions`, { emoji });
}
async function removeReaction(msgId, emoji) {
  await api("DELETE", `/api/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`);
}
async function toggleReaction(msgId, emoji, isMine) {
  try {
    if (isMine) {
      await removeReaction(msgId, emoji);
    } else {
      await addReaction(msgId, emoji);
    }
  } catch {}
}
function findMessageContainers(msgId) {
  const results = [];
  document.querySelectorAll(`.message[data-msg-id="${msgId}"]`).forEach((el) => results.push(el));
  document.querySelectorAll(`.message[data-reply-id="${msgId}"]`).forEach((el) => {
    if (!results.includes(el))
      results.push(el);
  });
  return results;
}
function updateReactionUI(msgId, emoji, userId, added) {
  const containers = findMessageContainers(msgId);
  containers.forEach((msgEl) => {
    let bar = msgEl.querySelector(".reactions-bar");
    if (!bar) {
      const actionsEl = msgEl.querySelector(".msg-actions");
      bar = document.createElement("div");
      bar.className = "reactions-bar";
      bar.innerHTML = `<button class="reaction-add-btn" data-add-for="${msgId}">+</button>`;
      if (actionsEl) {
        msgEl.insertBefore(bar, actionsEl);
      } else {
        msgEl.appendChild(bar);
      }
      attachReactionHandlers(msgEl, msgId);
    }
    let pill = bar.querySelector(`.reaction-pill[data-emoji="${CSS.escape(emoji)}"]`);
    if (added) {
      if (pill) {
        const countEl = pill.querySelector(".reaction-count");
        const count = parseInt(countEl.textContent, 10) + 1;
        countEl.textContent = count;
        if (currentUser && userId === currentUser.id)
          pill.classList.add("mine");
      } else {
        const newPill = document.createElement("button");
        newPill.className = "reaction-pill" + (currentUser && userId === currentUser.id ? " mine" : "");
        newPill.dataset.emoji = emoji;
        newPill.innerHTML = `${emoji} <span class="reaction-count">1</span>`;
        newPill.onclick = () => toggleReaction(msgId, emoji, newPill.classList.contains("mine"));
        const addBtn = bar.querySelector(".reaction-add-btn");
        bar.insertBefore(newPill, addBtn);
      }
    } else {
      if (pill) {
        const countEl = pill.querySelector(".reaction-count");
        const count = parseInt(countEl.textContent, 10) - 1;
        if (count <= 0) {
          pill.remove();
        } else {
          countEl.textContent = count;
          if (currentUser && userId === currentUser.id)
            pill.classList.remove("mine");
        }
      }
    }
  });
}
function setupSwipeGestures() {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isSwiping = false;
  const EDGE_ZONE = 30;
  const MIN_DISTANCE = 60;
  const MAX_Y_DRIFT = 80;
  document.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    const sidebar = document.querySelector(".sidebar");
    isSwiping = touchStartX < EDGE_ZONE || sidebar && sidebar.classList.contains("sidebar-open");
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!isSwiping)
      return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = Math.abs(touch.clientY - touchStartY);
    const elapsed = Date.now() - touchStartTime;
    if (deltaY > MAX_Y_DRIFT || elapsed > 500 || Math.abs(deltaX) < MIN_DISTANCE)
      return;
    const sidebar = document.querySelector(".sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (!sidebar || !backdrop)
      return;
    if (deltaX > 0 && touchStartX < EDGE_ZONE && !sidebar.classList.contains("sidebar-open")) {
      sidebar.classList.add("sidebar-open");
      backdrop.classList.add("sidebar-backdrop-visible");
      document.body.classList.add("sidebar-is-open");
    } else if (deltaX < 0 && sidebar.classList.contains("sidebar-open")) {
      sidebar.classList.remove("sidebar-open");
      backdrop.classList.remove("sidebar-backdrop-visible");
      document.body.classList.remove("sidebar-is-open");
    }
  }, { passive: true });
}
function setupThreadResize() {
  if (isMobile())
    return;
  const panel = document.getElementById("thread-panel");
  const handle = document.getElementById("thread-resize-handle");
  if (!panel || !handle)
    return;
  const MIN_WIDTH = 320;
  const MAX_WIDTH = window.innerWidth * 0.8;
  const DEFAULT_WIDTH = 480;
  const STORAGE_KEY = "thread-panel-width";
  let savedWidth = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (!savedWidth || savedWidth < MIN_WIDTH || savedWidth > MAX_WIDTH) {
    savedWidth = DEFAULT_WIDTH;
  }
  function applyWidth(width) {
    const clampedWidth = Math.max(MIN_WIDTH, Math.min(width, MAX_WIDTH));
    if (panel.classList.contains("visible")) {
      panel.style.width = `${clampedWidth}px`;
    }
    return clampedWidth;
  }
  const openThread = window.openThread;
  window.openThread = async function(...args) {
    await openThread.apply(this, args);
    applyWidth(savedWidth);
  };
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    panel.classList.add("resizing");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });
  document.addEventListener("mousemove", (e) => {
    if (!isResizing)
      return;
    e.preventDefault();
    const deltaX = startX - e.clientX;
    const newWidth = startWidth + deltaX;
    const clampedWidth = applyWidth(newWidth);
    savedWidth = clampedWidth;
  });
  document.addEventListener("mouseup", () => {
    if (!isResizing)
      return;
    isResizing = false;
    panel.classList.remove("resizing");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    localStorage.setItem(STORAGE_KEY, savedWidth.toString());
  });
  window.addEventListener("resize", () => {
    if (!isMobile() && panel.classList.contains("visible")) {
      const maxWidth = window.innerWidth * 0.8;
      if (savedWidth > maxWidth) {
        savedWidth = maxWidth;
        applyWidth(savedWidth);
      }
    }
  });
}
function renderServerConfig() {
  const saved = localStorage.getItem("serverUrl") || "";
  app.innerHTML = `
    <div class="auth-page">
      <h1>Relay Chat</h1>
      <p class="subtitle">Enter your server address</p>
      <form id="server-config-form">
        <input type="url" id="server-url" placeholder="https://chat.example.com" value="${esc(saved)}" required>
        <div class="error hidden" id="server-config-error"></div>
        <button type="submit">Connect</button>
      </form>
    </div>
  `;
  document.getElementById("server-config-form").onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("server-config-error");
    errEl.classList.add("hidden");
    let url = document.getElementById("server-url").value.trim();
    url = url.replace(/\/+$/, "");
    try {
      const res = await fetch(`${url}/api/health`);
      const data = await res.json();
      if (data.status !== "ok")
        throw new Error("Unexpected response");
      localStorage.setItem("serverUrl", url);
      boot();
    } catch {
      errEl.textContent = "Could not connect to server. Check the URL and try again.";
      errEl.classList.remove("hidden");
    }
  };
}
function renderBootstrap() {
  app.innerHTML = `
    <div class="auth-container">
      <h1>Relay Chat Setup</h1>
      <div class="card">
        <h2>Create Admin Account</h2>
        <div id="error" class="error hidden"></div>
        <label for="username">Username</label>
        <input type="text" id="username" autocomplete="username">
        <label for="displayName">Display Name</label>
        <input type="text" id="displayName">
        <label for="password">Password</label>
        <input type="password" id="password" autocomplete="new-password">
        <button id="submit">Create Admin</button>
      </div>
    </div>
  `;
  document.getElementById("submit").onclick = async () => {
    const errEl = document.getElementById("error");
    errEl.classList.add("hidden");
    try {
      const data = await api("POST", "/api/auth/bootstrap", {
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
        displayName: document.getElementById("displayName").value || undefined
      });
      currentUser = data.user;
      sessionToken = data.token;
      renderMain();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  };
}
function renderLogin(prefillInviteCode) {
  const showSignup = !!prefillInviteCode;
  app.innerHTML = `
    <div class="auth-container">
      <h1>Relay Chat</h1>
      <div class="auth-tabs">
        <button class="auth-tab${showSignup ? "" : " active"}" data-tab="login">Login</button>
        <button class="auth-tab${showSignup ? " active" : ""}" data-tab="signup">Sign Up</button>
      </div>
      <div class="card${showSignup ? " hidden" : ""}" id="login-card">
        <div id="error" class="error hidden"></div>
        <label for="username">Username</label>
        <input type="text" id="username" autocomplete="username">
        <label for="password">Password</label>
        <input type="password" id="password" autocomplete="current-password">
        <button id="submit">Login</button>
      </div>
      <div class="card${showSignup ? "" : " hidden"}" id="signup-card">
        <div id="signup-error" class="error hidden"></div>
        <label for="invite-code">Invite Code</label>
        <input type="text" id="invite-code" value="${esc(prefillInviteCode || "")}"${prefillInviteCode ? " readonly" : ""}>
        <label for="signup-username">Username</label>
        <input type="text" id="signup-username" autocomplete="username">
        <label for="signup-display">Display Name</label>
        <input type="text" id="signup-display">
        <label for="signup-password">Password</label>
        <input type="password" id="signup-password" autocomplete="new-password">
        <button id="signup-submit" class="secondary">Sign Up</button>
      </div>
    </div>
  `;
  const tabs = document.querySelectorAll(".auth-tab");
  const loginCard = document.getElementById("login-card");
  const signupCard = document.getElementById("signup-card");
  tabs.forEach((tab) => {
    tab.onclick = () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      if (tab.dataset.tab === "login") {
        loginCard.classList.remove("hidden");
        signupCard.classList.add("hidden");
      } else {
        loginCard.classList.add("hidden");
        signupCard.classList.remove("hidden");
      }
    };
  });
  document.getElementById("submit").onclick = async () => {
    const errEl = document.getElementById("error");
    errEl.classList.add("hidden");
    try {
      const data = await api("POST", "/api/auth/login", {
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
      });
      currentUser = data.user;
      sessionToken = data.token;
      renderMain();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  };
  document.getElementById("signup-submit").onclick = async () => {
    const errEl = document.getElementById("signup-error");
    errEl.classList.add("hidden");
    try {
      const data = await api("POST", "/api/auth/signup", {
        username: document.getElementById("signup-username").value,
        password: document.getElementById("signup-password").value,
        displayName: document.getElementById("signup-display").value || undefined,
        inviteCode: document.getElementById("invite-code").value
      });
      currentUser = data.user;
      sessionToken = data.token;
      renderMain();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  };
}
async function renderMain() {
  wsReconnectAttempt = 0;
  connectWS();
  if (Capacitor.isNativePlatform()) {
    registerNativePush();
  }
  let channelsList = [];
  try {
    channelsList = await api("GET", "/api/channels");
    unreadState.clear();
    channelsList.forEach((c) => {
      unreadState.set(c.id, { count: c.unreadCount || 0, hasMention: c.hasMention || false });
    });
  } catch {}
  const isAdmin = currentUser && currentUser.role === "admin";
  const adminSection = isAdmin ? `
    <div class="admin-section">
      <button id="toggle-admin" class="secondary btn-sm">Admin</button>
      <div id="admin-panel" class="hidden">
        <div class="card">
          <h3>Create Invite</h3>
          <div id="invite-error" class="error hidden"></div>
          <div id="invite-result"></div>
          <button id="create-invite" class="btn-sm">Create Invite</button>
          <ul class="invite-list" id="invite-list"></ul>
        </div>
        <div class="card">
          <h3>Bots</h3>
          <button id="create-bot" class="btn-sm">Create Bot</button>
          <ul class="bot-list" id="bot-list"></ul>
        </div>
      </div>
    </div>
  ` : "";
  const settingsBtn = `<button class="settings-btn" id="open-settings-btn" aria-label="Settings">&#9881;</button>`;
  app.innerHTML = `
    <div class="chat-layout">
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <div class="sidebar">
        <div class="sidebar-header">
          <h2>relay chat</h2>
          <div class="user-bar">
            <span class="user-info">${esc(currentUser.displayName)}</span>
            <button id="logout" class="secondary btn-sm">Logout</button>
          </div>
          ${adminSection}
        </div>
        <div class="channel-list-container">
          <button class="my-threads-btn" id="my-threads-btn">My Threads</button>
          <div class="channel-list-header"><h3>Channels</h3><button id="create-channel-btn" class="channel-create-btn" aria-label="Create channel">+</button></div>
          <ul class="channel-list" id="channel-list">
            ${channelsList.map((c) => {
    const u3 = unreadState.get(c.id) || { count: 0, hasMention: false };
    const cls = u3.count > 0 ? ' class="has-unread"' : "";
    const badge = u3.hasMention ? '<span class="mention-badge">@</span>' : "";
    return `<li data-id="${c.id}" data-name="${esc(c.name)}"${cls}>${esc(c.name)}${badge}</li>`;
  }).join("")}
          </ul>
        </div>
      </div>
      <div class="main-panel">
        <div id="channel-view" class="channel-view">
          <div class="channel-header" id="channel-header"><button class="hamburger-btn" id="sidebar-toggle" aria-label="Toggle sidebar">&#9776;</button><span id="channel-header-text">Select a channel</span>${settingsBtn}</div>
          <div id="connection-status" class="connection-status hidden"></div>
          <div class="message-list" id="message-list"></div>
          <div class="composer" id="composer" style="display:none">
            <textarea id="msg-input" placeholder="> message..." rows="1"></textarea>
            <button id="msg-send">Send</button>
          </div>
        </div>
        <div id="thread-backdrop" class="thread-backdrop"></div>
        <div id="thread-panel" class="thread-panel">
          <div class="thread-resize-handle" id="thread-resize-handle"></div>
          <div class="thread-header">
            <h3>Thread</h3>
            <div class="thread-actions">
              <button id="mute-thread" class="icon-button" title="Mute/Unmute thread" aria-label="Mute thread">\uD83D\uDD14</button>
              <button id="close-thread" class="secondary btn-sm" aria-label="Close thread">&#8592; <span class="close-text">Close</span></button>
            </div>
          </div>
          <div class="thread-parent" id="thread-parent"></div>
          <div class="thread-replies" id="thread-replies"></div>
          <div class="composer">
            <textarea id="reply-input" placeholder="> reply..." rows="1"></textarea>
            <button id="reply-send">Send</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById("logout").onclick = doLogout;
  document.getElementById("channel-list").onclick = async (e) => {
    const li = e.target.closest("li");
    if (!li)
      return;
    const id = parseInt(li.dataset.id, 10);
    const name = li.dataset.name;
    await selectChannel({ id, name });
  };
  document.getElementById("create-channel-btn").onclick = showCreateChannelModal;
  document.getElementById("my-threads-btn").onclick = () => {
    const sb = document.querySelector(".sidebar");
    const bd = document.querySelector(".sidebar-backdrop");
    if (sb)
      sb.classList.remove("sidebar-open");
    if (bd)
      bd.classList.remove("sidebar-backdrop-visible");
    document.body.classList.remove("sidebar-is-open");
    showMyThreads();
  };
  document.getElementById("msg-send").onclick = sendMessage;
  const msgInput = document.getElementById("msg-input");
  setupAutoGrow(msgInput);
  msgInput.onkeydown = (e) => {
    if (mentionDropdown && mentionUsers.length > 0 && (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Escape")) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  setupMentionAutocomplete(msgInput);
  document.getElementById("reply-send").onclick = sendReply;
  const replyInput = document.getElementById("reply-input");
  setupAutoGrow(replyInput);
  replyInput.onkeydown = (e) => {
    if (mentionDropdown && mentionUsers.length > 0 && (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Escape")) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };
  setupMentionAutocomplete(replyInput);
  document.getElementById("close-thread").onclick = closeThread;
  document.getElementById("thread-backdrop").onclick = closeThread;
  document.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") {
      if (mentionDropdown && mentionUsers.length > 0)
        return;
      if (openThreadId) {
        closeThread();
      } else if (viewingSettings) {
        try {
          const channelsList2 = await api("GET", "/api/channels");
          let targetChannel = channelsList2.find((c) => c.name === "general");
          if (!targetChannel && channelsList2.length > 0) {
            targetChannel = channelsList2[0];
          }
          if (targetChannel) {
            await selectChannel(targetChannel);
          }
        } catch (e2) {
          console.error("Failed to navigate from settings:", e2);
        }
      }
    }
  });
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  document.getElementById("sidebar-toggle").onclick = () => {
    sidebar.classList.toggle("sidebar-open");
    backdrop.classList.toggle("sidebar-backdrop-visible");
    document.body.classList.toggle("sidebar-is-open");
  };
  backdrop.onclick = () => {
    sidebar.classList.remove("sidebar-open");
    backdrop.classList.remove("sidebar-backdrop-visible");
    document.body.classList.remove("sidebar-is-open");
  };
  setupSwipeGestures();
  setupThreadResize();
  const openSettingsBtn = document.getElementById("open-settings-btn");
  if (openSettingsBtn) {
    openSettingsBtn.onclick = () => {
      navigate("/settings");
      renderSettings();
    };
  }
  if (isAdmin) {
    const toggleAdmin = document.getElementById("toggle-admin");
    if (toggleAdmin) {
      toggleAdmin.onclick = () => {
        document.getElementById("admin-panel").classList.toggle("hidden");
      };
    }
    const createInvite = document.getElementById("create-invite");
    if (createInvite) {
      createInvite.onclick = async () => {
        try {
          const invite = await api("POST", "/api/invites", {});
          const resultEl = document.getElementById("invite-result");
          resultEl.innerHTML = renderInviteLink(invite.code);
          attachCopyHandler(resultEl);
          loadInvites();
        } catch (e) {
          const errEl = document.getElementById("invite-error");
          errEl.textContent = e.message;
          errEl.classList.remove("hidden");
        }
      };
    }
    loadInvites();
    const createBot = document.getElementById("create-bot");
    if (createBot) {
      createBot.onclick = () => showCreateBotModal();
    }
    loadBots("bot-list");
  }
  await handleRoute(channelsList);
}
async function doLogout() {
  if (Capacitor.isNativePlatform()) {
    const ntfyTopic = localStorage.getItem("ntfyTopic");
    if (ntfyTopic) {
      try {
        await api("DELETE", "/api/push/subscribe", { ntfyTopic });
      } catch (e) {}
      localStorage.removeItem("ntfyTopic");
    }
  }
  await api("POST", "/api/auth/logout");
  currentUser = null;
  sessionToken = null;
  if (wsConn) {
    wsConn.close();
    wsConn = null;
  }
  renderLogin();
}
function inviteUrl(code) {
  return `${location.origin}/invite/${code}`;
}
function renderInviteLink(code) {
  const url = inviteUrl(code);
  return `<div class="invite-code">${esc(url)}</div><button class="btn-sm copy-link-btn" data-url="${esc(url)}">Copy Link</button>`;
}
function attachCopyHandler(container) {
  const btn = container.querySelector(".copy-link-btn");
  if (!btn)
    return;
  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = btn.dataset.url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const origText = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => {
      btn.textContent = origText;
    }, 2000);
  };
}
async function renderSettings() {
  viewingSettings = true;
  viewingThreads = false;
  currentChannel = null;
  openThreadId = null;
  document.getElementById("thread-panel").classList.remove("visible");
  const threadBackdrop = document.getElementById("thread-backdrop");
  if (threadBackdrop)
    threadBackdrop.classList.remove("visible");
  const isAdmin = currentUser && currentUser.role === "admin";
  const adminInvitesSection = isAdmin ? `
    <div class="card">
      <h3>Invites</h3>
      <div id="admin-invite-error" class="error hidden"></div>
      <div id="admin-invite-result"></div>
      <button id="admin-create-invite" class="btn-sm">Create Invite</button>
      <ul class="invite-list" id="admin-invite-list"></ul>
    </div>
  ` : "";
  const adminBotsSection = isAdmin ? `
    <div class="card">
      <h3>Bots</h3>
      <button id="admin-create-bot" class="btn-sm">Create Bot</button>
      <ul class="bot-list" id="admin-bot-list"></ul>
    </div>
  ` : "";
  const adminNtfySection = isAdmin ? `
    <div class="card">
      <h3>General Settings</h3>
      <div id="general-settings-error" class="error hidden"></div>
      <div id="general-settings-success" class="success hidden"></div>
      <div id="general-settings-content">
        <div class="form-group">
          <label>Base URL</label>
          <input type="text" id="base-url" placeholder="https://chat.example.com" class="input-sm">
          <small>Used in notification links. Include protocol (http:// or https://)</small>
        </div>
        <button id="save-general-settings" class="btn-sm">Save General Settings</button>
      </div>
    </div>
    <div class="card">
      <h3>Push Notifications (ntfy.sh)</h3>
      <div id="ntfy-settings-error" class="error hidden"></div>
      <div id="ntfy-settings-success" class="success hidden"></div>
      <div id="ntfy-settings-content">
        <div class="form-group">
          <label>ntfy Server URL</label>
          <input type="text" id="ntfy-server-url" placeholder="https://ntfy.example.com" class="input-sm">
          <small>Your self-hosted ntfy server URL or https://ntfy.sh for the public instance</small>
        </div>
        <button id="save-ntfy-settings" class="btn-sm">Save ntfy Settings</button>
      </div>
    </div>
  ` : "";
  const channelView = document.getElementById("channel-view");
  channelView.innerHTML = `
    <div class="channel-header">
      <button class="hamburger-btn" id="settings-sidebar-toggle" aria-label="Toggle sidebar">&#9776;</button>
      <span>Settings</span>
    </div>
    <div class="settings-page-content">
      <div class="settings-user-info">
        Logged in as <strong>${esc(currentUser.displayName)}</strong> (${esc(currentUser.role)})
      </div>
      <div class="card">
        <h3>Notifications</h3>
        <div id="notification-error" class="error hidden"></div>
        <div id="notification-success" class="success hidden"></div>
        <div id="notification-settings-content">
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="notify-mentions" checked>
              Notify on @mentions
            </label>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="notify-thread-replies" checked>
              Notify on thread replies
            </label>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="notify-all-messages">
              Notify on all messages
            </label>
          </div>
          <button id="save-notifications" class="btn-sm">Save Notification Settings</button>
        </div>
      </div>
      ${adminInvitesSection}
      ${adminBotsSection}
      ${adminNtfySection}
      <div class="card">
        <h3>Account</h3>
        ${Capacitor.isNativePlatform() && window.location.hostname === "localhost" ? '<button id="settings-change-server" class="secondary" style="margin-bottom: 8px;">Change Server</button>' : ""}
        <button id="settings-logout" class="secondary">Logout</button>
      </div>
    </div>
  `;
  const settingsSidebarToggle = document.getElementById("settings-sidebar-toggle");
  if (settingsSidebarToggle) {
    settingsSidebarToggle.onclick = () => {
      const sidebar = document.querySelector(".sidebar");
      const backdrop = document.getElementById("sidebar-backdrop");
      sidebar.classList.toggle("sidebar-open");
      backdrop.classList.toggle("sidebar-backdrop-visible");
      document.body.classList.toggle("sidebar-is-open");
    };
  }
  document.getElementById("settings-logout").onclick = doLogout;
  const changeServerEl = document.getElementById("settings-change-server");
  if (changeServerEl) {
    changeServerEl.onclick = () => {
      localStorage.removeItem("serverUrl");
      sessionToken = null;
      currentUser = null;
      renderServerConfig();
    };
  }
  document.getElementById("save-notifications").onclick = saveNotificationSettings;
  await loadNotificationSettings();
  if (isAdmin) {
    const adminCreateInvite = document.getElementById("admin-create-invite");
    if (adminCreateInvite) {
      adminCreateInvite.onclick = async () => {
        try {
          const invite = await api("POST", "/api/invites", {});
          const resultEl = document.getElementById("admin-invite-result");
          resultEl.innerHTML = renderInviteLink(invite.code);
          attachCopyHandler(resultEl);
          loadAdminInvites();
        } catch (e) {
          const errEl = document.getElementById("admin-invite-error");
          errEl.textContent = e.message;
          errEl.classList.remove("hidden");
        }
      };
    }
    const adminCreateBot = document.getElementById("admin-create-bot");
    if (adminCreateBot) {
      adminCreateBot.onclick = () => showCreateBotModal();
    }
    const saveGeneralSettingsBtn = document.getElementById("save-general-settings");
    if (saveGeneralSettingsBtn) {
      saveGeneralSettingsBtn.onclick = saveGeneralSettings;
    }
    const saveNtfySettingsBtn = document.getElementById("save-ntfy-settings");
    if (saveNtfySettingsBtn) {
      saveNtfySettingsBtn.onclick = saveNtfySettings;
    }
    loadAdminInvites();
    loadBots("admin-bot-list");
    await loadGeneralSettings();
    await loadNtfySettings();
  }
}
async function loadAdminInvites() {
  try {
    const invites = await api("GET", "/api/invites");
    const list = document.getElementById("admin-invite-list");
    if (!list)
      return;
    list.innerHTML = invites.map((i) => `<li><div class="invite-code">${esc(inviteUrl(i.code))}</div><div class="invite-meta"><span class="invite-usage">${i.useCount}${i.maxUses ? "/" + i.maxUses : ""} used</span><button class="btn-sm copy-link-btn" data-url="${esc(inviteUrl(i.code))}">Copy</button></div></li>`).join("");
    list.querySelectorAll("li").forEach((li) => attachCopyHandler(li));
  } catch {}
}
async function loadNotificationSettings() {
  try {
    const res = await api("GET", "/api/notifications/settings");
    const notifyMentions = document.getElementById("notify-mentions");
    const notifyThreadReplies = document.getElementById("notify-thread-replies");
    const notifyAllMessages = document.getElementById("notify-all-messages");
    if (res.configured !== false && res.userId) {
      notifyMentions.checked = res.notifyMentions !== false;
      notifyThreadReplies.checked = res.notifyThreadReplies !== false;
      notifyAllMessages.checked = res.notifyAllMessages === true;
    }
  } catch (e) {
    console.error("Error loading notification settings:", e);
  }
}
async function saveNotificationSettings() {
  const errEl = document.getElementById("notification-error");
  const successEl = document.getElementById("notification-success");
  errEl.classList.add("hidden");
  successEl.classList.add("hidden");
  const notifyMentions = document.getElementById("notify-mentions").checked;
  const notifyThreadReplies = document.getElementById("notify-thread-replies").checked;
  const notifyAllMessages = document.getElementById("notify-all-messages").checked;
  try {
    await api("POST", "/api/notifications/settings", {
      notifyMentions,
      notifyThreadReplies,
      notifyAllMessages
    });
    successEl.textContent = "Notification settings saved successfully";
    successEl.classList.remove("hidden");
    setTimeout(() => successEl.classList.add("hidden"), 3000);
  } catch (e) {
    errEl.textContent = "Failed to save settings: " + e.message;
    errEl.classList.remove("hidden");
  }
}
async function loadGeneralSettings() {
  try {
    const res = await api("GET", "/api/admin/settings");
    const baseUrlInput = document.getElementById("base-url");
    if (!baseUrlInput)
      return;
    if (res.baseUrl) {
      baseUrlInput.value = res.baseUrl;
    }
  } catch (e) {
    console.log("No general settings configured yet");
  }
}
async function saveGeneralSettings() {
  const errEl = document.getElementById("general-settings-error");
  const successEl = document.getElementById("general-settings-success");
  errEl.classList.add("hidden");
  successEl.classList.add("hidden");
  const baseUrl = document.getElementById("base-url").value.trim();
  if (!baseUrl) {
    errEl.textContent = "Base URL is required";
    errEl.classList.remove("hidden");
    return;
  }
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    errEl.textContent = "Base URL must start with http:// or https://";
    errEl.classList.remove("hidden");
    return;
  }
  try {
    await api("POST", "/api/admin/settings", {
      base_url: baseUrl
    });
    successEl.textContent = "General settings saved successfully.";
    successEl.classList.remove("hidden");
    setTimeout(() => successEl.classList.add("hidden"), 5000);
  } catch (e) {
    errEl.textContent = "Failed to save settings: " + e.message;
    errEl.classList.remove("hidden");
  }
}
async function loadNtfySettings() {
  try {
    const res = await api("GET", "/api/admin/settings");
    const ntfyUrlInput = document.getElementById("ntfy-server-url");
    if (!ntfyUrlInput)
      return;
    if (res.ntfyServerUrl) {
      ntfyUrlInput.value = res.ntfyServerUrl;
    }
  } catch (e) {
    console.log("No ntfy settings configured yet");
  }
}
async function saveNtfySettings() {
  const errEl = document.getElementById("ntfy-settings-error");
  const successEl = document.getElementById("ntfy-settings-success");
  errEl.classList.add("hidden");
  successEl.classList.add("hidden");
  const serverUrl = document.getElementById("ntfy-server-url").value.trim();
  if (!serverUrl) {
    errEl.textContent = "ntfy Server URL is required";
    errEl.classList.remove("hidden");
    return;
  }
  try {
    await api("POST", "/api/admin/settings", {
      ntfy_server_url: serverUrl
    });
    successEl.textContent = "ntfy settings saved. Provider reloaded.";
    successEl.classList.remove("hidden");
    setTimeout(() => successEl.classList.add("hidden"), 5000);
  } catch (e) {
    errEl.textContent = "Failed to save settings: " + e.message;
    errEl.classList.remove("hidden");
  }
}
async function selectChannel(channel, fromRoute = false) {
  const wasViewingSettings = viewingSettings;
  viewingThreads = false;
  viewingSettings = false;
  currentChannel = channel;
  openThreadId = null;
  if (wasViewingSettings) {
    const channelView = document.getElementById("channel-view");
    const settingsBtn = `<button class="settings-btn" id="open-settings-btn" aria-label="Settings">&#9881;</button>`;
    channelView.innerHTML = `
      <div class="channel-header" id="channel-header"><button class="hamburger-btn" id="sidebar-toggle" aria-label="Toggle sidebar">&#9776;</button><span id="channel-header-text"># ${esc(channel.name)}</span>${settingsBtn}</div>
      <div id="connection-status" class="connection-status hidden"></div>
      <div class="message-list" id="message-list"></div>
      <div class="composer" id="composer" style="display:flex">
        <textarea id="msg-input" placeholder="> message..." rows="1"></textarea>
        <button id="msg-send">Send</button>
      </div>
    `;
    const sidebar = document.querySelector(".sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    document.getElementById("sidebar-toggle").onclick = () => {
      sidebar.classList.toggle("sidebar-open");
      backdrop.classList.toggle("sidebar-backdrop-visible");
      document.body.classList.toggle("sidebar-is-open");
    };
    document.getElementById("msg-send").onclick = sendMessage;
    const msgInput = document.getElementById("msg-input");
    setupAutoGrow(msgInput);
    msgInput.onkeydown = (e) => {
      if (mentionDropdown && mentionUsers.length > 0 && (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Escape")) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };
    setupMentionAutocomplete(msgInput);
    const openSettingsBtn = document.getElementById("open-settings-btn");
    if (openSettingsBtn) {
      openSettingsBtn.onclick = () => {
        navigate("/settings");
        renderSettings();
      };
    }
  }
  document.getElementById("thread-panel").classList.remove("visible");
  const threadBackdrop = document.getElementById("thread-backdrop");
  if (threadBackdrop)
    threadBackdrop.classList.remove("visible");
  const threadsBtn = document.getElementById("my-threads-btn");
  if (threadsBtn)
    threadsBtn.classList.remove("active");
  document.querySelectorAll(".channel-list li").forEach((li) => {
    li.classList.toggle("active", parseInt(li.dataset.id, 10) === channel.id);
  });
  document.getElementById("channel-header-text").textContent = `# ${channel.name}`;
  const sb = document.querySelector(".sidebar");
  const bd = document.querySelector(".sidebar-backdrop");
  if (sb)
    sb.classList.remove("sidebar-open");
  if (bd)
    bd.classList.remove("sidebar-backdrop-visible");
  document.body.classList.remove("sidebar-is-open");
  document.getElementById("composer").style.display = "flex";
  if (!fromRoute) {
    navigate(`/${channel.name}`);
  }
  await loadMessages(channel.id);
  const lastMsg = document.querySelector("#message-list .message:last-child");
  if (lastMsg) {
    const msgId = parseInt(lastMsg.dataset.msgId, 10);
    markChannelRead(channel.id, msgId);
  }
  unreadState.set(channel.id, { count: 0, hasMention: false });
  updateChannelBadge(channel.id);
  if (!isMobile())
    document.getElementById("msg-input").focus();
}
async function loadMessages(channelId) {
  const list = document.getElementById("message-list");
  list.innerHTML = "";
  try {
    const msgs = await api("GET", `/api/channels/${channelId}/messages?limit=50`);
    msgs.reverse().forEach((msg) => {
      try {
        appendMessage(msg);
      } catch (e) {
        console.error("Failed to render message:", msg.id, e);
      }
    });
    list.scrollTop = list.scrollHeight;
  } catch (e) {
    list.innerHTML = `<div class="error">Failed to load messages</div>`;
  }
}
function appendMessage(msg) {
  const list = document.getElementById("message-list");
  if (!list)
    return;
  if (list.querySelector(`[data-msg-id="${msg.id}"]`))
    return;
  const div = document.createElement("div");
  div.className = "message";
  div.dataset.msgId = msg.id;
  const replyBtn = `<button class="reply-btn btn-sm secondary" data-msg-id="${msg.id}">Reply${msg.replyCount ? ` (${msg.replyCount})` : ""}</button>`;
  const reactionsHtml = renderReactions(msg.id, msg.reactions || []);
  const linkPreviewsHtml = renderLinkPreviews(msg.linkPreviews);
  const botBadge = msg.isBot ? '<span class="bot-badge">BOT</span>' : "";
  div.innerHTML = `
    <div class="msg-header">
      <strong>${esc(msg.displayName)}</strong>${botBadge}
      <span class="msg-time">${fmtTime(msg.createdAt)}</span>
    </div>
    <div class="msg-body">${renderMarkdown(msg.content)}</div>
    ${linkPreviewsHtml}
    ${reactionsHtml}
    <div class="msg-actions">${replyBtn}</div>
  `;
  div.querySelector(".reply-btn").onclick = () => openThread(msg.id);
  attachReactionHandlers(div, msg.id);
  div.querySelectorAll(".link-preview-dismiss").forEach((btn) => {
    btn.onclick = () => btn.closest(".link-preview").style.display = "none";
  });
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}
function updateReplyCount(parentId) {
  const msgEl = document.querySelector(`[data-msg-id="${parentId}"]`);
  if (!msgEl)
    return;
  const btn = msgEl.querySelector(".reply-btn");
  if (!btn)
    return;
  const match = btn.textContent.match(/\((\d+)\)/);
  const count = match ? parseInt(match[1], 10) + 1 : 1;
  btn.textContent = `Reply (${count})`;
}
async function openThread(parentId, fromRoute = false) {
  openThreadId = parentId;
  const panel = document.getElementById("thread-panel");
  panel.classList.add("visible");
  document.getElementById("thread-backdrop").classList.add("visible");
  const parentEl = document.getElementById("thread-parent");
  const msgEl = document.querySelector(`[data-msg-id="${parentId}"]`);
  if (msgEl) {
    const name = msgEl.querySelector("strong").textContent;
    const body = msgEl.querySelector(".msg-body").innerHTML;
    const time = msgEl.querySelector(".msg-time").textContent;
    parentEl.innerHTML = `
      <div class="message">
        <div class="msg-header"><strong>${esc(name)}</strong><span class="msg-time">${esc(time)}</span></div>
        <div class="msg-body">${body}</div>
      </div>
    `;
  }
  await updateThreadMuteButton(parentId);
  if (!fromRoute && currentChannel) {
    navigate(`/${currentChannel.name}/t/${parentId}`);
  }
  await loadReplies(parentId);
  if (!isMobile())
    document.getElementById("reply-input").focus();
}
async function loadReplies(parentId) {
  const list = document.getElementById("thread-replies");
  list.innerHTML = "";
  try {
    const replies = await api("GET", `/api/messages/${parentId}/thread?limit=50`);
    replies.forEach((reply) => {
      try {
        appendReply(reply);
      } catch (e) {
        console.error("Failed to render reply:", reply.id, e);
      }
    });
    list.scrollTop = list.scrollHeight;
  } catch {
    list.innerHTML = `<div class="error">Failed to load replies</div>`;
  }
}
function appendReply(reply) {
  const list = document.getElementById("thread-replies");
  if (!list)
    return;
  if (list.querySelector(`[data-reply-id="${reply.id}"]`))
    return;
  const div = document.createElement("div");
  div.className = "message reply";
  div.dataset.replyId = reply.id;
  div.dataset.msgId = reply.id;
  const reactionsHtml = renderReactions(reply.id, reply.reactions || []);
  const linkPreviewsHtml = renderLinkPreviews(reply.linkPreviews);
  const botBadge = reply.isBot ? '<span class="bot-badge">BOT</span>' : "";
  div.innerHTML = `
    <div class="msg-header">
      <strong>${esc(reply.displayName)}</strong>${botBadge}
      <span class="msg-time">${fmtTime(reply.createdAt)}</span>
    </div>
    <div class="msg-body">${renderMarkdown(reply.content)}</div>
    ${linkPreviewsHtml}
    ${reactionsHtml}
  `;
  attachReactionHandlers(div, reply.id);
  div.querySelectorAll(".link-preview-dismiss").forEach((btn) => {
    btn.onclick = () => btn.closest(".link-preview").style.display = "none";
  });
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}
function closeThread() {
  openThreadId = null;
  document.getElementById("thread-panel").classList.remove("visible");
  document.getElementById("thread-backdrop").classList.remove("visible");
  if (viewingThreads) {
    navigate("/threads");
  } else if (currentChannel) {
    navigate(`/${currentChannel.name}`);
  }
}
async function updateThreadMuteButton(parentId) {
  const muteBtn = document.getElementById("mute-thread");
  if (!muteBtn)
    return;
  try {
    const res = await api("GET", `/api/threads/${parentId}/mute`);
    const isMuted = res.muted;
    muteBtn.textContent = isMuted ? "\uD83D\uDD14" : "\uD83D\uDD15";
    muteBtn.title = isMuted ? "Unmute thread" : "Mute thread";
    muteBtn.dataset.muted = isMuted;
    muteBtn.onclick = async () => {
      try {
        if (muteBtn.dataset.muted === "true") {
          await api("DELETE", `/api/threads/${parentId}/mute`);
          muteBtn.textContent = "\uD83D\uDD15";
          muteBtn.title = "Mute thread";
          muteBtn.dataset.muted = "false";
        } else {
          await api("POST", `/api/threads/${parentId}/mute`);
          muteBtn.textContent = "\uD83D\uDD14";
          muteBtn.title = "Unmute thread";
          muteBtn.dataset.muted = "true";
        }
      } catch (e) {
        console.error("Failed to toggle mute", e);
      }
    };
  } catch (e) {
    console.error("Failed to check mute status", e);
  }
}
async function showMyThreads(fromRoute = false) {
  viewingThreads = true;
  currentChannel = null;
  openThreadId = null;
  document.getElementById("thread-panel").classList.remove("visible");
  const threadBackdrop = document.getElementById("thread-backdrop");
  if (threadBackdrop)
    threadBackdrop.classList.remove("visible");
  document.getElementById("channel-header-text").textContent = "My Threads";
  document.querySelectorAll(".channel-list li").forEach((li) => li.classList.remove("active"));
  document.getElementById("my-threads-btn").classList.add("active");
  document.getElementById("composer").style.display = "none";
  if (!fromRoute) {
    navigate("/threads");
  }
  const list = document.getElementById("message-list");
  list.innerHTML = '<div class="threads-loading">Loading threads...</div>';
  try {
    const threads = await api("GET", "/api/me/threads?limit=30");
    list.innerHTML = "";
    if (threads.length === 0) {
      list.innerHTML = '<div class="threads-empty">No threads yet. Start or reply to a conversation to see it here.</div>';
      return;
    }
    threads.forEach((t) => {
      const div = document.createElement("div");
      div.className = "thread-summary";
      div.dataset.parentId = t.parentId;
      div.dataset.channelId = t.channelId;
      div.dataset.channelName = t.channelName;
      const botBadge = t.authorIsBot ? '<span class="bot-badge">BOT</span>' : "";
      div.innerHTML = `
        <div class="thread-summary-header">
          <span class="thread-summary-channel"># ${esc(t.channelName)}</span>
          <span class="thread-summary-time">${fmtRelativeTime(t.lastActivityAt)}</span>
        </div>
        <div class="thread-summary-author">
          <strong>${esc(t.authorDisplayName)}</strong>${botBadge}
        </div>
        <div class="thread-summary-preview">${esc(t.contentPreview)}</div>
        <div class="thread-summary-meta">
          ${t.replyCount} ${t.replyCount === 1 ? "reply" : "replies"}
        </div>
      `;
      div.onclick = () => openThreadFromSummary(t);
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = '<div class="error">Failed to load threads</div>';
  }
}
async function openThreadFromSummary(threadSummary) {
  const channel = { id: threadSummary.channelId, name: threadSummary.channelName };
  currentChannel = channel;
  viewingThreads = false;
  document.querySelectorAll(".channel-list li").forEach((li) => {
    li.classList.toggle("active", parseInt(li.dataset.id, 10) === channel.id);
  });
  document.getElementById("my-threads-btn").classList.remove("active");
  document.getElementById("channel-header-text").textContent = `# ${channel.name}`;
  document.getElementById("composer").style.display = "flex";
  await loadMessages(channel.id);
  navigate(`/${channel.name}/t/${threadSummary.parentId}`);
  await openThread(threadSummary.parentId, true);
}
function fmtRelativeTime(ts) {
  try {
    const d = new Date(ts);
    const now = new Date;
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1)
      return "just now";
    if (diffMins < 60)
      return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24)
      return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7)
      return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return ts;
  }
}
var mentionDropdown = null;
var mentionActiveIndex = 0;
var mentionUsers = [];
var mentionDebounce = null;
var mentionInput = null;
var mentionAtPos = -1;
function setupMentionAutocomplete(input) {
  input.addEventListener("input", () => onMentionInput(input));
  input.addEventListener("keydown", (e) => onMentionKeydown(e, input));
  input.addEventListener("blur", () => {
    setTimeout(closeMentionDropdown, 150);
  });
}
function onMentionInput(input) {
  const pos = input.selectionStart;
  const text = input.value;
  let atIdx = -1;
  for (let i = pos - 1;i >= 0; i--) {
    if (text[i] === " " || text[i] === `
`)
      break;
    if (text[i] === "@") {
      if (i === 0 || text[i - 1] === " " || text[i - 1] === `
`) {
        atIdx = i;
      }
      break;
    }
  }
  if (atIdx === -1) {
    closeMentionDropdown();
    return;
  }
  const query = text.slice(atIdx + 1, pos);
  mentionInput = input;
  mentionAtPos = atIdx;
  clearTimeout(mentionDebounce);
  mentionDebounce = setTimeout(() => fetchMentionUsers(query, input), 150);
}
async function fetchMentionUsers(query, input) {
  try {
    const users = await api("GET", `/api/users/search?q=${encodeURIComponent(query)}`);
    if (mentionInput !== input)
      return;
    mentionUsers = users;
    mentionActiveIndex = 0;
    if (users.length > 0) {
      showMentionDropdown(input);
    } else {
      closeMentionDropdown();
    }
  } catch {
    closeMentionDropdown();
  }
}
function showMentionDropdown(input) {
  if (!mentionDropdown) {
    mentionDropdown = document.createElement("div");
    mentionDropdown.className = "mention-dropdown";
    document.body.appendChild(mentionDropdown);
  }
  mentionDropdown.innerHTML = mentionUsers.map((u3, i) => {
    const active = i === mentionActiveIndex ? " active" : "";
    const badge = u3.isBot ? '<span class="bot-badge">BOT</span>' : "";
    return `<div class="mention-item${active}" data-index="${i}">
      <span class="mention-name">@${esc(u3.username)}</span>${badge}
      <span class="mention-display">${esc(u3.displayName)}</span>
    </div>`;
  }).join("");
  mentionDropdown.querySelectorAll(".mention-item").forEach((el) => {
    el.onmousedown = (e) => {
      e.preventDefault();
      selectMention(parseInt(el.dataset.index, 10));
    };
  });
  const rect = input.getBoundingClientRect();
  const dropdownHeight = Math.min(mentionUsers.length, 6) * 40;
  let top = rect.top - dropdownHeight - 4;
  let left = rect.left;
  if (top < 8)
    top = rect.bottom + 4;
  if (left + 260 > window.innerWidth - 8)
    left = window.innerWidth - 268;
  if (left < 8)
    left = 8;
  mentionDropdown.style.top = `${top}px`;
  mentionDropdown.style.left = `${left}px`;
  mentionDropdown.style.width = `${Math.min(rect.width, 300)}px`;
}
function closeMentionDropdown() {
  if (mentionDropdown) {
    mentionDropdown.remove();
    mentionDropdown = null;
  }
  mentionUsers = [];
  mentionActiveIndex = 0;
  mentionAtPos = -1;
  mentionInput = null;
  clearTimeout(mentionDebounce);
}
function selectMention(index) {
  const user = mentionUsers[index];
  if (!user || !mentionInput)
    return;
  const input = mentionInput;
  const before = input.value.slice(0, mentionAtPos);
  const after = input.value.slice(input.selectionStart);
  const insert = `@${user.username} `;
  input.value = before + insert + after;
  const newPos = mentionAtPos + insert.length;
  input.setSelectionRange(newPos, newPos);
  input.focus();
  closeMentionDropdown();
}
function onMentionKeydown(e, input) {
  if (!mentionDropdown || mentionUsers.length === 0)
    return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    mentionActiveIndex = (mentionActiveIndex + 1) % mentionUsers.length;
    showMentionDropdown(input);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    mentionActiveIndex = (mentionActiveIndex - 1 + mentionUsers.length) % mentionUsers.length;
    showMentionDropdown(input);
  } else if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();
    selectMention(mentionActiveIndex);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeMentionDropdown();
  }
}
function setupAutoGrow(textarea) {
  const maxRows = 5;
  const computeHeight = () => {
    textarea.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight, 10);
    const maxHeight = lineHeight * maxRows;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  };
  textarea.addEventListener("input", computeHeight);
  textarea.addEventListener("paste", () => setTimeout(computeHeight, 0));
  computeHeight();
}
async function sendMessage() {
  const input = document.getElementById("msg-input");
  const content = input.value.trim();
  if (!content || !currentChannel)
    return;
  input.value = "";
  input.style.height = "auto";
  try {
    await api("POST", `/api/channels/${currentChannel.id}/messages`, { content });
  } catch (e) {
    input.value = content;
    input.dispatchEvent(new Event("input"));
  }
}
async function sendReply() {
  const input = document.getElementById("reply-input");
  const content = input.value.trim();
  if (!content || !openThreadId)
    return;
  input.value = "";
  input.style.height = "auto";
  try {
    await api("POST", `/api/messages/${openThreadId}/reply`, { content });
  } catch (e) {
    input.value = content;
    input.dispatchEvent(new Event("input"));
  }
}
async function loadInvites() {
  try {
    const invites = await api("GET", "/api/invites");
    const list = document.getElementById("invite-list");
    if (!list)
      return;
    list.innerHTML = invites.map((i) => `<li><div class="invite-code">${esc(inviteUrl(i.code))}</div><div class="invite-meta"><span class="invite-usage">${i.useCount}${i.maxUses ? "/" + i.maxUses : ""} used</span><button class="btn-sm copy-link-btn" data-url="${esc(inviteUrl(i.code))}">Copy</button></div></li>`).join("");
    list.querySelectorAll("li").forEach((li) => attachCopyHandler(li));
  } catch {}
}
async function loadBots(listId) {
  try {
    const botList = await api("GET", "/api/bots");
    const list = document.getElementById(listId);
    if (!list)
      return;
    if (!botList.length) {
      list.innerHTML = '<li class="bot-empty">No bots yet</li>';
      return;
    }
    list.innerHTML = botList.map((b2) => `
      <li class="bot-item" data-bot-id="${b2.id}">
        <div class="bot-info">
          <strong>${esc(b2.displayName)}</strong>
          <span class="bot-username">@${esc(b2.username)}</span>
        </div>
        <div class="bot-item-actions">
          <button class="btn-sm secondary manage-bot-btn" data-bot-id="${b2.id}">Manage</button>
        </div>
      </li>
    `).join("");
    list.querySelectorAll(".manage-bot-btn").forEach((btn) => {
      btn.onclick = () => showManageBotModal(parseInt(btn.dataset.botId, 10));
    });
  } catch {}
}
function showCreateBotModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Create Bot</h3>
      <label>Username</label>
      <input type="text" id="bot-username-input" placeholder="my-bot" maxlength="50" autocomplete="off">
      <label>Display Name</label>
      <input type="text" id="bot-displayname-input" placeholder="My Bot" maxlength="100" autocomplete="off">
      <div id="bot-create-error" class="error hidden"></div>
      <div class="modal-actions">
        <button id="bot-create-submit">Create</button>
        <button id="bot-create-cancel" class="secondary">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#bot-create-cancel").onclick = () => backdrop.remove();
  backdrop.onclick = (e) => {
    if (e.target === backdrop)
      backdrop.remove();
  };
  const nameInput = backdrop.querySelector("#bot-username-input");
  nameInput.focus();
  backdrop.querySelector("#bot-create-submit").onclick = async () => {
    const username = nameInput.value.trim().toLowerCase();
    const displayName = backdrop.querySelector("#bot-displayname-input").value.trim();
    if (!username)
      return;
    try {
      await api("POST", "/api/bots", { username, displayName: displayName || username });
      backdrop.remove();
      loadBots("bot-list");
      loadBots("admin-bot-list");
    } catch (e) {
      const errEl = backdrop.querySelector("#bot-create-error");
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  };
  nameInput.onkeydown = (e) => {
    if (e.key === "Enter")
      backdrop.querySelector("#bot-create-submit").click();
  };
}
async function showManageBotModal(botId) {
  let botList;
  try {
    botList = await api("GET", "/api/bots");
  } catch {
    return;
  }
  const bot = botList.find((b2) => b2.id === botId);
  if (!bot)
    return;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal modal-wide">
      <h3>${esc(bot.displayName)} <span class="bot-username">@${esc(bot.username)}</span></h3>

      <div class="manage-section">
        <h4>Tokens</h4>
        <div id="manage-token-list" class="manage-list"></div>
        <div class="manage-actions">
          <input type="text" id="token-label-input" placeholder="Token label (optional)" class="input-sm">
          <button id="generate-token-btn" class="btn-sm">Generate Token</button>
        </div>
      </div>

      <div class="manage-section">
        <h4>Channel Bindings</h4>
        <div id="manage-binding-list" class="manage-list"></div>
        <div class="manage-actions">
          <select id="bind-channel-select" class="input-sm"></select>
          <button id="bind-channel-btn" class="btn-sm">Bind</button>
        </div>
      </div>

      <div class="modal-actions">
        <button id="delete-bot-btn" class="btn-sm" style="background:#c0392b">Delete Bot</button>
        <button id="manage-close" class="secondary">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#manage-close").onclick = () => backdrop.remove();
  backdrop.onclick = (e) => {
    if (e.target === backdrop)
      backdrop.remove();
  };
  async function refreshTokens() {
    try {
      const tokens = await api("GET", `/api/bots/${botId}/tokens`);
      const el = backdrop.querySelector("#manage-token-list");
      if (!tokens.length) {
        el.innerHTML = '<div class="manage-empty">No tokens</div>';
        return;
      }
      el.innerHTML = tokens.map((t) => `
        <div class="manage-item">
          <span>${esc(t.label || "(no label)")} <span class="manage-meta">${t.revokedAt ? "revoked" : "active"}</span></span>
          ${t.revokedAt ? "" : `<button class="btn-sm secondary revoke-token-btn" data-token-id="${t.id}">Revoke</button>`}
        </div>
      `).join("");
      el.querySelectorAll(".revoke-token-btn").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await api("DELETE", `/api/bots/tokens/${btn.dataset.tokenId}`);
            refreshTokens();
          } catch {}
        };
      });
    } catch {}
  }
  async function refreshBindings() {
    try {
      const bindings = await api("GET", `/api/bots/${botId}/bindings`);
      const channels = await api("GET", "/api/channels");
      const el = backdrop.querySelector("#manage-binding-list");
      if (!bindings.length) {
        el.innerHTML = '<div class="manage-empty">No channel bindings</div>';
      } else {
        el.innerHTML = bindings.map((b2) => {
          const ch = channels.find((c) => c.id === b2.channelId);
          const name = ch ? ch.name : `#${b2.channelId}`;
          const scopes = [b2.canRead ? "read" : "", b2.canWrite ? "write" : ""].filter(Boolean).join(", ");
          return `
            <div class="manage-item">
              <span>#${esc(name)} <span class="manage-meta">${scopes}</span></span>
              <button class="btn-sm secondary unbind-btn" data-channel-id="${b2.channelId}">Unbind</button>
            </div>
          `;
        }).join("");
        el.querySelectorAll(".unbind-btn").forEach((btn) => {
          btn.onclick = async () => {
            try {
              await api("DELETE", `/api/bots/${botId}/bindings/${btn.dataset.channelId}`);
              refreshBindings();
            } catch {}
          };
        });
      }
      const boundIds = new Set(bindings.map((b2) => b2.channelId));
      const select = backdrop.querySelector("#bind-channel-select");
      const available = channels.filter((c) => !boundIds.has(c.id));
      select.innerHTML = available.length ? available.map((c) => `<option value="${c.id}">#${esc(c.name)}</option>`).join("") : "<option disabled>All channels bound</option>";
    } catch {}
  }
  refreshTokens();
  refreshBindings();
  backdrop.querySelector("#generate-token-btn").onclick = async () => {
    const label = backdrop.querySelector("#token-label-input").value.trim();
    try {
      const result = await api("POST", `/api/bots/${botId}/tokens`, { label });
      backdrop.querySelector("#token-label-input").value = "";
      refreshTokens();
      showBotTokenModal(result.token);
    } catch {}
  };
  backdrop.querySelector("#bind-channel-btn").onclick = async () => {
    const select = backdrop.querySelector("#bind-channel-select");
    const channelId = parseInt(select.value, 10);
    if (!channelId)
      return;
    try {
      await api("POST", `/api/bots/${botId}/bindings`, { channelId, canRead: true, canWrite: true });
      refreshBindings();
    } catch {}
  };
  backdrop.querySelector("#delete-bot-btn").onclick = async () => {
    if (!confirm(`Delete bot @${bot.username}? This cannot be undone.`))
      return;
    try {
      await api("DELETE", `/api/bots/${botId}`);
      backdrop.remove();
      loadBots("bot-list");
      loadBots("admin-bot-list");
    } catch {}
  };
}
function showBotTokenModal(token) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Bot Token Generated</h3>
      <p class="token-warning">Copy this token now. It will not be shown again.</p>
      <div class="invite-code" style="user-select:all;word-break:break-all">${esc(token)}</div>
      <div class="modal-actions">
        <button class="btn-sm copy-link-btn" data-url="${esc(token)}">Copy Token</button>
        <button id="token-modal-close" class="secondary">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  attachCopyHandler(backdrop);
  backdrop.querySelector("#token-modal-close").onclick = () => backdrop.remove();
  backdrop.onclick = (e) => {
    if (e.target === backdrop)
      backdrop.remove();
  };
}
function esc(s) {
  return escapeHtml(s);
}
function fmtTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}
function navigate(path, replace = false) {
  if (replace) {
    history.replaceState(null, "", path);
  } else {
    history.pushState(null, "", path);
  }
}
async function handleRoute(channelsList) {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 1 && parts[0] === "settings") {
    await renderSettings();
    return;
  }
  if (parts.length === 1 && parts[0] === "threads") {
    showMyThreads(true);
    return;
  }
  let channelName = null;
  let threadId = null;
  if (parts.length >= 1) {
    channelName = parts[0];
  }
  if (parts.length === 3 && parts[1] === "t") {
    threadId = parseInt(parts[2], 10);
    if (isNaN(threadId))
      threadId = null;
  }
  let target = null;
  if (channelName) {
    target = channelsList.find((c) => c.name === channelName);
  }
  if (!target) {
    target = channelsList.find((c) => c.name === "general");
  }
  if (target) {
    await selectChannel(target, true);
    const canonicalPath = `/${target.name}`;
    if (!channelName || !channelsList.find((c) => c.name === channelName)) {
      navigate(canonicalPath, true);
    }
    if (threadId) {
      await openThread(threadId, true);
    }
  }
}
window.addEventListener("popstate", async () => {
  if (!currentUser)
    return;
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 1 && parts[0] === "settings") {
    await renderSettings();
    return;
  }
  if (viewingSettings) {
    try {
      const channelsList2 = await api("GET", "/api/channels");
      await handleRoute(channelsList2);
    } catch (e) {
      console.error("Failed to load channels:", e);
    }
    return;
  }
  const channelEls = document.querySelectorAll(".channel-list li");
  const channelsList = Array.from(channelEls).map((li) => ({
    id: parseInt(li.dataset.id, 10),
    name: li.dataset.name
  }));
  await handleRoute(channelsList);
});
function extractInviteCode() {
  const match = location.pathname.match(/^\/invite\/([a-f0-9]+)$/i);
  return match ? match[1] : null;
}
async function handleDeepLink() {
  const hash = window.location.hash;
  if (!hash || !currentUser)
    return;
  const match = hash.match(/^#\/channel\/(\d+)(?:\/thread\/(\d+))?$/);
  if (!match)
    return;
  const channelId = parseInt(match[1], 10);
  const threadId = match[2] ? parseInt(match[2], 10) : null;
  const channelEls = document.querySelectorAll(".channel-list li");
  let targetChannel = null;
  channelEls.forEach((li) => {
    if (parseInt(li.dataset.id, 10) === channelId) {
      targetChannel = { id: channelId, name: li.dataset.name };
    }
  });
  if (!targetChannel) {
    console.log("Channel not found for deep link");
    return;
  }
  await selectChannel(targetChannel, false);
  if (threadId) {
    setTimeout(() => openThread(threadId, false), 300);
  }
  window.location.hash = "";
}
async function boot() {
  if (Capacitor.isNativePlatform() && window.location.hostname === "localhost" && !localStorage.getItem("serverUrl")) {
    renderServerConfig();
    return;
  }
  const inviteCode = extractInviteCode();
  try {
    const { hasUsers } = await api("GET", "/api/auth/has-users");
    if (!hasUsers) {
      renderBootstrap();
      return;
    }
  } catch {
    renderLogin(inviteCode);
    return;
  }
  try {
    currentUser = await api("GET", "/api/auth/me");
    await renderMain();
    setTimeout(() => handleDeepLink(), 500);
    if (Capacitor.isNativePlatform()) {
      App.addListener("backButton", () => {
        if (openThreadId) {
          closeThread();
          return;
        }
        const sidebar = document.querySelector(".sidebar");
        if (sidebar && sidebar.classList.contains("sidebar-open")) {
          sidebar.classList.remove("sidebar-open");
          const backdrop = document.getElementById("sidebar-backdrop");
          if (backdrop)
            backdrop.classList.remove("sidebar-backdrop-visible");
          document.body.classList.remove("sidebar-is-open");
          return;
        }
        if (viewingSettings) {
          viewingSettings = false;
          if (currentChannel)
            selectChannel(currentChannel);
          return;
        }
        App.minimizeApp();
      });
    }
  } catch {
    renderLogin(inviteCode);
  }
}
window.addEventListener("hashchange", () => {
  if (currentUser) {
    handleDeepLink();
  }
});
boot();
