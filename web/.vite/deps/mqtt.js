import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet,
  __privateWrapper,
  __publicField
} from "./chunk-WOOG5QLI.js";

// node_modules/mqtt/dist/mqtt.esm.js
var Ro = Object.defineProperty;
var xy = Object.getOwnPropertyDescriptor;
var Ty = Object.getOwnPropertyNames;
var Py = Object.prototype.hasOwnProperty;
var ze = (t, e) => () => (t && (e = t(t = 0)), e);
var H = (t, e) => () => (e || t((e = { exports: {} }).exports, e), e.exports);
var Mr = (t, e) => {
  for (var r in e) Ro(t, r, { get: e[r], enumerable: true });
};
var Oy = (t, e, r, n) => {
  if (e && typeof e == "object" || typeof e == "function") for (let i of Ty(e)) !Py.call(t, i) && i !== r && Ro(t, i, { get: () => e[i], enumerable: !(n = xy(e, i)) || n.enumerable });
  return t;
};
var _e = (t) => Oy(Ro({}, "__esModule", { value: true }), t);
var x = ze(() => {
});
var q = {};
Mr(q, { _debugEnd: () => zl, _debugProcess: () => Hl, _events: () => uc, _eventsCount: () => lc, _exiting: () => xl, _fatalExceptions: () => jl, _getActiveHandles: () => Rl, _getActiveRequests: () => Ol, _kill: () => Cl, _linkedBinding: () => Al, _maxListeners: () => ac, _preload_modules: () => ic, _rawDebug: () => Sl, _startProfilerIdleNotifier: () => Gl, _stopProfilerIdleNotifier: () => Ql, _tickCallback: () => Vl, abort: () => Xl, addListener: () => cc, allowedNodeEnvironmentFlags: () => Dl, arch: () => ul, argv: () => fl, argv0: () => nc, assert: () => Ul, binding: () => yl, browser: () => vl, chdir: () => _l, config: () => Tl, cpuUsage: () => pi, cwd: () => ml, debugPort: () => rc, default: () => _c, dlopen: () => Pl, domain: () => Il, emit: () => gc, emitWarning: () => gl, env: () => cl, execArgv: () => dl, execPath: () => tc, exit: () => Ll, features: () => Fl, hasUncaughtExceptionCaptureCallback: () => Wl, hrtime: () => hi, kill: () => Nl, listeners: () => mc, memoryUsage: () => Bl, moduleLoadList: () => El, nextTick: () => ol, off: () => dc, on: () => It, once: () => fc, openStdin: () => ql, pid: () => Zl, platform: () => ll, ppid: () => ec, prependListener: () => yc, prependOnceListener: () => bc, reallyExit: () => kl, release: () => wl, removeAllListeners: () => pc, removeListener: () => hc, resourceUsage: () => Ml, setSourceMapsEnabled: () => oc, setUncaughtExceptionCaptureCallback: () => $l, stderr: () => Yl, stdin: () => Jl, stdout: () => Kl, title: () => al, umask: () => bl, uptime: () => sc, version: () => hl, versions: () => pl });
function Mo(t) {
  throw new Error("Node.js process " + t + " is not supported by JSPM core outside of Node.js");
}
function Ry() {
  !Br || !lr || (Br = false, lr.length ? At = lr.concat(At) : di = -1, At.length && il());
}
function il() {
  if (!Br) {
    var t = setTimeout(Ry, 0);
    Br = true;
    for (var e = At.length; e; ) {
      for (lr = At, At = []; ++di < e; ) lr && lr[di].run();
      di = -1, e = At.length;
    }
    lr = null, Br = false, clearTimeout(t);
  }
}
function ol(t) {
  var e = new Array(arguments.length - 1);
  if (arguments.length > 1) for (var r = 1; r < arguments.length; r++) e[r - 1] = arguments[r];
  At.push(new sl(t, e)), At.length === 1 && !Br && setTimeout(il, 0);
}
function sl(t, e) {
  this.fun = t, this.array = e;
}
function De() {
}
function Al(t) {
  Mo("_linkedBinding");
}
function Pl(t) {
  Mo("dlopen");
}
function Ol() {
  return [];
}
function Rl() {
  return [];
}
function Ul(t, e) {
  if (!t) throw new Error(e || "assertion error");
}
function Wl() {
  return false;
}
function sc() {
  return $t.now() / 1e3;
}
function hi(t) {
  var e = Math.floor((Date.now() - $t.now()) * 1e-3), r = $t.now() * 1e-3, n = Math.floor(r) + e, i = Math.floor(r % 1 * 1e9);
  return t && (n = n - t[0], i = i - t[1], i < 0 && (n--, i += Co)), [n, i];
}
function It() {
  return _c;
}
function mc(t) {
  return [];
}
var At;
var Br;
var lr;
var di;
var al;
var ul;
var ll;
var cl;
var fl;
var dl;
var hl;
var pl;
var gl;
var yl;
var bl;
var ml;
var _l;
var wl;
var vl;
var Sl;
var El;
var Il;
var xl;
var Tl;
var kl;
var Cl;
var pi;
var Ml;
var Bl;
var Nl;
var Ll;
var ql;
var Dl;
var Fl;
var jl;
var $l;
var Vl;
var Hl;
var zl;
var Gl;
var Ql;
var Kl;
var Yl;
var Jl;
var Xl;
var Zl;
var ec;
var tc;
var rc;
var nc;
var ic;
var oc;
var $t;
var ko;
var Co;
var ac;
var uc;
var lc;
var cc;
var fc;
var dc;
var hc;
var pc;
var gc;
var yc;
var bc;
var _c;
var wc = ze(() => {
  x();
  P();
  T();
  At = [], Br = false, di = -1;
  sl.prototype.run = function() {
    this.fun.apply(null, this.array);
  };
  al = "browser", ul = "x64", ll = "browser", cl = { PATH: "/usr/bin", LANG: typeof navigator < "u" ? navigator.language + ".UTF-8" : void 0, PWD: "/", HOME: "/home", TMP: "/tmp" }, fl = ["/usr/bin/node"], dl = [], hl = "v16.8.0", pl = {}, gl = function(t, e) {
    console.warn((e ? e + ": " : "") + t);
  }, yl = function(t) {
    Mo("binding");
  }, bl = function(t) {
    return 0;
  }, ml = function() {
    return "/";
  }, _l = function(t) {
  }, wl = { name: "node", sourceUrl: "", headersUrl: "", libUrl: "" };
  vl = true, Sl = De, El = [];
  Il = {}, xl = false, Tl = {};
  kl = De, Cl = De, pi = function() {
    return {};
  }, Ml = pi, Bl = pi, Nl = De, Ll = De, ql = De, Dl = {};
  Fl = { inspector: false, debug: false, uv: false, ipv6: false, tls_alpn: false, tls_sni: false, tls_ocsp: false, tls: false, cached_builtins: true }, jl = De, $l = De;
  Vl = De, Hl = De, zl = De, Gl = De, Ql = De, Kl = void 0, Yl = void 0, Jl = void 0, Xl = De, Zl = 2, ec = 1, tc = "/bin/usr/node", rc = 9229, nc = "node", ic = [], oc = De, $t = { now: typeof performance < "u" ? performance.now.bind(performance) : void 0, timing: typeof performance < "u" ? performance.timing : void 0 };
  $t.now === void 0 && (ko = Date.now(), $t.timing && $t.timing.navigationStart && (ko = $t.timing.navigationStart), $t.now = () => Date.now() - ko);
  Co = 1e9;
  hi.bigint = function(t) {
    var e = hi(t);
    return typeof BigInt > "u" ? e[0] * Co + e[1] : BigInt(e[0] * Co) + BigInt(e[1]);
  };
  ac = 10, uc = {}, lc = 0;
  cc = It, fc = It, dc = It, hc = It, pc = It, gc = De, yc = It, bc = It;
  _c = { version: hl, versions: pl, arch: ul, platform: ll, browser: vl, release: wl, _rawDebug: Sl, moduleLoadList: El, binding: yl, _linkedBinding: Al, _events: uc, _eventsCount: lc, _maxListeners: ac, on: It, addListener: cc, once: fc, off: dc, removeListener: hc, removeAllListeners: pc, emit: gc, prependListener: yc, prependOnceListener: bc, listeners: mc, domain: Il, _exiting: xl, config: Tl, dlopen: Pl, uptime: sc, _getActiveRequests: Ol, _getActiveHandles: Rl, reallyExit: kl, _kill: Cl, cpuUsage: pi, resourceUsage: Ml, memoryUsage: Bl, kill: Nl, exit: Ll, openStdin: ql, allowedNodeEnvironmentFlags: Dl, assert: Ul, features: Fl, _fatalExceptions: jl, setUncaughtExceptionCaptureCallback: $l, hasUncaughtExceptionCaptureCallback: Wl, emitWarning: gl, nextTick: ol, _tickCallback: Vl, _debugProcess: Hl, _debugEnd: zl, _startProfilerIdleNotifier: Gl, _stopProfilerIdleNotifier: Ql, stdout: Kl, stdin: Jl, stderr: Yl, abort: Xl, umask: bl, chdir: _l, cwd: ml, env: cl, title: al, argv: fl, execArgv: dl, pid: Zl, ppid: ec, execPath: tc, debugPort: rc, hrtime: hi, argv0: nc, _preload_modules: ic, setSourceMapsEnabled: oc };
});
var T = ze(() => {
  wc();
});
function ky() {
  if (vc) return hn;
  vc = true, hn.byteLength = u, hn.toByteArray = f, hn.fromByteArray = _;
  for (var t = [], e = [], r = typeof Uint8Array < "u" ? Uint8Array : Array, n = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", i = 0, s = n.length; i < s; ++i) t[i] = n[i], e[n.charCodeAt(i)] = i;
  e[45] = 62, e[95] = 63;
  function o(y) {
    var I = y.length;
    if (I % 4 > 0) throw new Error("Invalid string. Length must be a multiple of 4");
    var S = y.indexOf("=");
    S === -1 && (S = I);
    var b = S === I ? 0 : 4 - S % 4;
    return [S, b];
  }
  function u(y) {
    var I = o(y), S = I[0], b = I[1];
    return (S + b) * 3 / 4 - b;
  }
  function c(y, I, S) {
    return (I + S) * 3 / 4 - S;
  }
  function f(y) {
    var I, S = o(y), b = S[0], m = S[1], w = new r(c(y, b, m)), R = 0, A = m > 0 ? b - 4 : b, g;
    for (g = 0; g < A; g += 4) I = e[y.charCodeAt(g)] << 18 | e[y.charCodeAt(g + 1)] << 12 | e[y.charCodeAt(g + 2)] << 6 | e[y.charCodeAt(g + 3)], w[R++] = I >> 16 & 255, w[R++] = I >> 8 & 255, w[R++] = I & 255;
    return m === 2 && (I = e[y.charCodeAt(g)] << 2 | e[y.charCodeAt(g + 1)] >> 4, w[R++] = I & 255), m === 1 && (I = e[y.charCodeAt(g)] << 10 | e[y.charCodeAt(g + 1)] << 4 | e[y.charCodeAt(g + 2)] >> 2, w[R++] = I >> 8 & 255, w[R++] = I & 255), w;
  }
  function d(y) {
    return t[y >> 18 & 63] + t[y >> 12 & 63] + t[y >> 6 & 63] + t[y & 63];
  }
  function h(y, I, S) {
    for (var b, m = [], w = I; w < S; w += 3) b = (y[w] << 16 & 16711680) + (y[w + 1] << 8 & 65280) + (y[w + 2] & 255), m.push(d(b));
    return m.join("");
  }
  function _(y) {
    for (var I, S = y.length, b = S % 3, m = [], w = 16383, R = 0, A = S - b; R < A; R += w) m.push(h(y, R, R + w > A ? A : R + w));
    return b === 1 ? (I = y[S - 1], m.push(t[I >> 2] + t[I << 4 & 63] + "==")) : b === 2 && (I = (y[S - 2] << 8) + y[S - 1], m.push(t[I >> 10] + t[I >> 4 & 63] + t[I << 2 & 63] + "=")), m.join("");
  }
  return hn;
}
function Cy() {
  if (Sc) return gi;
  Sc = true;
  return gi.read = function(t, e, r, n, i) {
    var s, o, u = i * 8 - n - 1, c = (1 << u) - 1, f = c >> 1, d = -7, h = r ? i - 1 : 0, _ = r ? -1 : 1, y = t[e + h];
    for (h += _, s = y & (1 << -d) - 1, y >>= -d, d += u; d > 0; s = s * 256 + t[e + h], h += _, d -= 8) ;
    for (o = s & (1 << -d) - 1, s >>= -d, d += n; d > 0; o = o * 256 + t[e + h], h += _, d -= 8) ;
    if (s === 0) s = 1 - f;
    else {
      if (s === c) return o ? NaN : (y ? -1 : 1) * (1 / 0);
      o = o + Math.pow(2, n), s = s - f;
    }
    return (y ? -1 : 1) * o * Math.pow(2, s - n);
  }, gi.write = function(t, e, r, n, i, s) {
    var o, u, c, f = s * 8 - i - 1, d = (1 << f) - 1, h = d >> 1, _ = i === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0, y = n ? 0 : s - 1, I = n ? 1 : -1, S = e < 0 || e === 0 && 1 / e < 0 ? 1 : 0;
    for (e = Math.abs(e), isNaN(e) || e === 1 / 0 ? (u = isNaN(e) ? 1 : 0, o = d) : (o = Math.floor(Math.log(e) / Math.LN2), e * (c = Math.pow(2, -o)) < 1 && (o--, c *= 2), o + h >= 1 ? e += _ / c : e += _ * Math.pow(2, 1 - h), e * c >= 2 && (o++, c /= 2), o + h >= d ? (u = 0, o = d) : o + h >= 1 ? (u = (e * c - 1) * Math.pow(2, i), o = o + h) : (u = e * Math.pow(2, h - 1) * Math.pow(2, i), o = 0)); i >= 8; t[r + y] = u & 255, y += I, u /= 256, i -= 8) ;
    for (o = o << i | u, f += i; f > 0; t[r + y] = o & 255, y += I, o /= 256, f -= 8) ;
    t[r + y - I] |= S * 128;
  }, gi;
}
function Ac() {
  if (Ec) return cr;
  Ec = true;
  let t = ky(), e = Cy(), r = typeof Symbol == "function" && typeof Symbol.for == "function" ? Symbol.for("nodejs.util.inspect.custom") : null;
  cr.Buffer = o, cr.SlowBuffer = m, cr.INSPECT_MAX_BYTES = 50;
  let n = 2147483647;
  cr.kMaxLength = n, o.TYPED_ARRAY_SUPPORT = i(), !o.TYPED_ARRAY_SUPPORT && typeof console < "u" && typeof console.error == "function" && console.error("This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support.");
  function i() {
    try {
      let p = new Uint8Array(1), a = { foo: function() {
        return 42;
      } };
      return Object.setPrototypeOf(a, Uint8Array.prototype), Object.setPrototypeOf(p, a), p.foo() === 42;
    } catch {
      return false;
    }
  }
  Object.defineProperty(o.prototype, "parent", { enumerable: true, get: function() {
    if (o.isBuffer(this)) return this.buffer;
  } }), Object.defineProperty(o.prototype, "offset", { enumerable: true, get: function() {
    if (o.isBuffer(this)) return this.byteOffset;
  } });
  function s(p) {
    if (p > n) throw new RangeError('The value "' + p + '" is invalid for option "size"');
    let a = new Uint8Array(p);
    return Object.setPrototypeOf(a, o.prototype), a;
  }
  function o(p, a, l) {
    if (typeof p == "number") {
      if (typeof a == "string") throw new TypeError('The "string" argument must be of type string. Received type number');
      return d(p);
    }
    return u(p, a, l);
  }
  o.poolSize = 8192;
  function u(p, a, l) {
    if (typeof p == "string") return h(p, a);
    if (ArrayBuffer.isView(p)) return y(p);
    if (p == null) throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof p);
    if (Xe(p, ArrayBuffer) || p && Xe(p.buffer, ArrayBuffer) || typeof SharedArrayBuffer < "u" && (Xe(p, SharedArrayBuffer) || p && Xe(p.buffer, SharedArrayBuffer))) return I(p, a, l);
    if (typeof p == "number") throw new TypeError('The "value" argument must not be of type number. Received type number');
    let E = p.valueOf && p.valueOf();
    if (E != null && E !== p) return o.from(E, a, l);
    let C = S(p);
    if (C) return C;
    if (typeof Symbol < "u" && Symbol.toPrimitive != null && typeof p[Symbol.toPrimitive] == "function") return o.from(p[Symbol.toPrimitive]("string"), a, l);
    throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof p);
  }
  o.from = function(p, a, l) {
    return u(p, a, l);
  }, Object.setPrototypeOf(o.prototype, Uint8Array.prototype), Object.setPrototypeOf(o, Uint8Array);
  function c(p) {
    if (typeof p != "number") throw new TypeError('"size" argument must be of type number');
    if (p < 0) throw new RangeError('The value "' + p + '" is invalid for option "size"');
  }
  function f(p, a, l) {
    return c(p), p <= 0 ? s(p) : a !== void 0 ? typeof l == "string" ? s(p).fill(a, l) : s(p).fill(a) : s(p);
  }
  o.alloc = function(p, a, l) {
    return f(p, a, l);
  };
  function d(p) {
    return c(p), s(p < 0 ? 0 : b(p) | 0);
  }
  o.allocUnsafe = function(p) {
    return d(p);
  }, o.allocUnsafeSlow = function(p) {
    return d(p);
  };
  function h(p, a) {
    if ((typeof a != "string" || a === "") && (a = "utf8"), !o.isEncoding(a)) throw new TypeError("Unknown encoding: " + a);
    let l = w(p, a) | 0, E = s(l), C = E.write(p, a);
    return C !== l && (E = E.slice(0, C)), E;
  }
  function _(p) {
    let a = p.length < 0 ? 0 : b(p.length) | 0, l = s(a);
    for (let E = 0; E < a; E += 1) l[E] = p[E] & 255;
    return l;
  }
  function y(p) {
    if (Xe(p, Uint8Array)) {
      let a = new Uint8Array(p);
      return I(a.buffer, a.byteOffset, a.byteLength);
    }
    return _(p);
  }
  function I(p, a, l) {
    if (a < 0 || p.byteLength < a) throw new RangeError('"offset" is outside of buffer bounds');
    if (p.byteLength < a + (l || 0)) throw new RangeError('"length" is outside of buffer bounds');
    let E;
    return a === void 0 && l === void 0 ? E = new Uint8Array(p) : l === void 0 ? E = new Uint8Array(p, a) : E = new Uint8Array(p, a, l), Object.setPrototypeOf(E, o.prototype), E;
  }
  function S(p) {
    if (o.isBuffer(p)) {
      let a = b(p.length) | 0, l = s(a);
      return l.length === 0 || p.copy(l, 0, 0, a), l;
    }
    if (p.length !== void 0) return typeof p.length != "number" || fn(p.length) ? s(0) : _(p);
    if (p.type === "Buffer" && Array.isArray(p.data)) return _(p.data);
  }
  function b(p) {
    if (p >= n) throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + n.toString(16) + " bytes");
    return p | 0;
  }
  function m(p) {
    return +p != p && (p = 0), o.alloc(+p);
  }
  o.isBuffer = function(a) {
    return a != null && a._isBuffer === true && a !== o.prototype;
  }, o.compare = function(a, l) {
    if (Xe(a, Uint8Array) && (a = o.from(a, a.offset, a.byteLength)), Xe(l, Uint8Array) && (l = o.from(l, l.offset, l.byteLength)), !o.isBuffer(a) || !o.isBuffer(l)) throw new TypeError('The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array');
    if (a === l) return 0;
    let E = a.length, C = l.length;
    for (let N = 0, F = Math.min(E, C); N < F; ++N) if (a[N] !== l[N]) {
      E = a[N], C = l[N];
      break;
    }
    return E < C ? -1 : C < E ? 1 : 0;
  }, o.isEncoding = function(a) {
    switch (String(a).toLowerCase()) {
      case "hex":
      case "utf8":
      case "utf-8":
      case "ascii":
      case "latin1":
      case "binary":
      case "base64":
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
        return true;
      default:
        return false;
    }
  }, o.concat = function(a, l) {
    if (!Array.isArray(a)) throw new TypeError('"list" argument must be an Array of Buffers');
    if (a.length === 0) return o.alloc(0);
    let E;
    if (l === void 0) for (l = 0, E = 0; E < a.length; ++E) l += a[E].length;
    let C = o.allocUnsafe(l), N = 0;
    for (E = 0; E < a.length; ++E) {
      let F = a[E];
      if (Xe(F, Uint8Array)) N + F.length > C.length ? (o.isBuffer(F) || (F = o.from(F)), F.copy(C, N)) : Uint8Array.prototype.set.call(C, F, N);
      else if (o.isBuffer(F)) F.copy(C, N);
      else throw new TypeError('"list" argument must be an Array of Buffers');
      N += F.length;
    }
    return C;
  };
  function w(p, a) {
    if (o.isBuffer(p)) return p.length;
    if (ArrayBuffer.isView(p) || Xe(p, ArrayBuffer)) return p.byteLength;
    if (typeof p != "string") throw new TypeError('The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof p);
    let l = p.length, E = arguments.length > 2 && arguments[2] === true;
    if (!E && l === 0) return 0;
    let C = false;
    for (; ; ) switch (a) {
      case "ascii":
      case "latin1":
      case "binary":
        return l;
      case "utf8":
      case "utf-8":
        return St(p).length;
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
        return l * 2;
      case "hex":
        return l >>> 1;
      case "base64":
        return li(p).length;
      default:
        if (C) return E ? -1 : St(p).length;
        a = ("" + a).toLowerCase(), C = true;
    }
  }
  o.byteLength = w;
  function R(p, a, l) {
    let E = false;
    if ((a === void 0 || a < 0) && (a = 0), a > this.length || ((l === void 0 || l > this.length) && (l = this.length), l <= 0) || (l >>>= 0, a >>>= 0, l <= a)) return "";
    for (p || (p = "utf8"); ; ) switch (p) {
      case "hex":
        return W(this, a, l);
      case "utf8":
      case "utf-8":
        return $(this, a, l);
      case "ascii":
        return ee(this, a, l);
      case "latin1":
      case "binary":
        return z(this, a, l);
      case "base64":
        return U(this, a, l);
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
        return te(this, a, l);
      default:
        if (E) throw new TypeError("Unknown encoding: " + p);
        p = (p + "").toLowerCase(), E = true;
    }
  }
  o.prototype._isBuffer = true;
  function A(p, a, l) {
    let E = p[a];
    p[a] = p[l], p[l] = E;
  }
  o.prototype.swap16 = function() {
    let a = this.length;
    if (a % 2 !== 0) throw new RangeError("Buffer size must be a multiple of 16-bits");
    for (let l = 0; l < a; l += 2) A(this, l, l + 1);
    return this;
  }, o.prototype.swap32 = function() {
    let a = this.length;
    if (a % 4 !== 0) throw new RangeError("Buffer size must be a multiple of 32-bits");
    for (let l = 0; l < a; l += 4) A(this, l, l + 3), A(this, l + 1, l + 2);
    return this;
  }, o.prototype.swap64 = function() {
    let a = this.length;
    if (a % 8 !== 0) throw new RangeError("Buffer size must be a multiple of 64-bits");
    for (let l = 0; l < a; l += 8) A(this, l, l + 7), A(this, l + 1, l + 6), A(this, l + 2, l + 5), A(this, l + 3, l + 4);
    return this;
  }, o.prototype.toString = function() {
    let a = this.length;
    return a === 0 ? "" : arguments.length === 0 ? $(this, 0, a) : R.apply(this, arguments);
  }, o.prototype.toLocaleString = o.prototype.toString, o.prototype.equals = function(a) {
    if (!o.isBuffer(a)) throw new TypeError("Argument must be a Buffer");
    return this === a ? true : o.compare(this, a) === 0;
  }, o.prototype.inspect = function() {
    let a = "", l = cr.INSPECT_MAX_BYTES;
    return a = this.toString("hex", 0, l).replace(/(.{2})/g, "$1 ").trim(), this.length > l && (a += " ... "), "<Buffer " + a + ">";
  }, r && (o.prototype[r] = o.prototype.inspect), o.prototype.compare = function(a, l, E, C, N) {
    if (Xe(a, Uint8Array) && (a = o.from(a, a.offset, a.byteLength)), !o.isBuffer(a)) throw new TypeError('The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof a);
    if (l === void 0 && (l = 0), E === void 0 && (E = a ? a.length : 0), C === void 0 && (C = 0), N === void 0 && (N = this.length), l < 0 || E > a.length || C < 0 || N > this.length) throw new RangeError("out of range index");
    if (C >= N && l >= E) return 0;
    if (C >= N) return -1;
    if (l >= E) return 1;
    if (l >>>= 0, E >>>= 0, C >>>= 0, N >>>= 0, this === a) return 0;
    let F = N - C, k = E - l, M = Math.min(F, k), re = this.slice(C, N), ie = a.slice(l, E);
    for (let oe = 0; oe < M; ++oe) if (re[oe] !== ie[oe]) {
      F = re[oe], k = ie[oe];
      break;
    }
    return F < k ? -1 : k < F ? 1 : 0;
  };
  function g(p, a, l, E, C) {
    if (p.length === 0) return -1;
    if (typeof l == "string" ? (E = l, l = 0) : l > 2147483647 ? l = 2147483647 : l < -2147483648 && (l = -2147483648), l = +l, fn(l) && (l = C ? 0 : p.length - 1), l < 0 && (l = p.length + l), l >= p.length) {
      if (C) return -1;
      l = p.length - 1;
    } else if (l < 0) if (C) l = 0;
    else return -1;
    if (typeof a == "string" && (a = o.from(a, E)), o.isBuffer(a)) return a.length === 0 ? -1 : O(p, a, l, E, C);
    if (typeof a == "number") return a = a & 255, typeof Uint8Array.prototype.indexOf == "function" ? C ? Uint8Array.prototype.indexOf.call(p, a, l) : Uint8Array.prototype.lastIndexOf.call(p, a, l) : O(p, [a], l, E, C);
    throw new TypeError("val must be string, number or Buffer");
  }
  function O(p, a, l, E, C) {
    let N = 1, F = p.length, k = a.length;
    if (E !== void 0 && (E = String(E).toLowerCase(), E === "ucs2" || E === "ucs-2" || E === "utf16le" || E === "utf-16le")) {
      if (p.length < 2 || a.length < 2) return -1;
      N = 2, F /= 2, k /= 2, l /= 2;
    }
    function M(ie, oe) {
      return N === 1 ? ie[oe] : ie.readUInt16BE(oe * N);
    }
    let re;
    if (C) {
      let ie = -1;
      for (re = l; re < F; re++) if (M(p, re) === M(a, ie === -1 ? 0 : re - ie)) {
        if (ie === -1 && (ie = re), re - ie + 1 === k) return ie * N;
      } else ie !== -1 && (re -= re - ie), ie = -1;
    } else for (l + k > F && (l = F - k), re = l; re >= 0; re--) {
      let ie = true;
      for (let oe = 0; oe < k; oe++) if (M(p, re + oe) !== M(a, oe)) {
        ie = false;
        break;
      }
      if (ie) return re;
    }
    return -1;
  }
  o.prototype.includes = function(a, l, E) {
    return this.indexOf(a, l, E) !== -1;
  }, o.prototype.indexOf = function(a, l, E) {
    return g(this, a, l, E, true);
  }, o.prototype.lastIndexOf = function(a, l, E) {
    return g(this, a, l, E, false);
  };
  function v(p, a, l, E) {
    l = Number(l) || 0;
    let C = p.length - l;
    E ? (E = Number(E), E > C && (E = C)) : E = C;
    let N = a.length;
    E > N / 2 && (E = N / 2);
    let F;
    for (F = 0; F < E; ++F) {
      let k = parseInt(a.substr(F * 2, 2), 16);
      if (fn(k)) return F;
      p[l + F] = k;
    }
    return F;
  }
  function B(p, a, l, E) {
    return Rr(St(a, p.length - l), p, l, E);
  }
  function D(p, a, l, E) {
    return Rr(Et(a), p, l, E);
  }
  function L(p, a, l, E) {
    return Rr(li(a), p, l, E);
  }
  function K(p, a, l, E) {
    return Rr(cn(a, p.length - l), p, l, E);
  }
  o.prototype.write = function(a, l, E, C) {
    if (l === void 0) C = "utf8", E = this.length, l = 0;
    else if (E === void 0 && typeof l == "string") C = l, E = this.length, l = 0;
    else if (isFinite(l)) l = l >>> 0, isFinite(E) ? (E = E >>> 0, C === void 0 && (C = "utf8")) : (C = E, E = void 0);
    else throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported");
    let N = this.length - l;
    if ((E === void 0 || E > N) && (E = N), a.length > 0 && (E < 0 || l < 0) || l > this.length) throw new RangeError("Attempt to write outside buffer bounds");
    C || (C = "utf8");
    let F = false;
    for (; ; ) switch (C) {
      case "hex":
        return v(this, a, l, E);
      case "utf8":
      case "utf-8":
        return B(this, a, l, E);
      case "ascii":
      case "latin1":
      case "binary":
        return D(this, a, l, E);
      case "base64":
        return L(this, a, l, E);
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
        return K(this, a, l, E);
      default:
        if (F) throw new TypeError("Unknown encoding: " + C);
        C = ("" + C).toLowerCase(), F = true;
    }
  }, o.prototype.toJSON = function() {
    return { type: "Buffer", data: Array.prototype.slice.call(this._arr || this, 0) };
  };
  function U(p, a, l) {
    return a === 0 && l === p.length ? t.fromByteArray(p) : t.fromByteArray(p.slice(a, l));
  }
  function $(p, a, l) {
    l = Math.min(p.length, l);
    let E = [], C = a;
    for (; C < l; ) {
      let N = p[C], F = null, k = N > 239 ? 4 : N > 223 ? 3 : N > 191 ? 2 : 1;
      if (C + k <= l) {
        let M, re, ie, oe;
        switch (k) {
          case 1:
            N < 128 && (F = N);
            break;
          case 2:
            M = p[C + 1], (M & 192) === 128 && (oe = (N & 31) << 6 | M & 63, oe > 127 && (F = oe));
            break;
          case 3:
            M = p[C + 1], re = p[C + 2], (M & 192) === 128 && (re & 192) === 128 && (oe = (N & 15) << 12 | (M & 63) << 6 | re & 63, oe > 2047 && (oe < 55296 || oe > 57343) && (F = oe));
            break;
          case 4:
            M = p[C + 1], re = p[C + 2], ie = p[C + 3], (M & 192) === 128 && (re & 192) === 128 && (ie & 192) === 128 && (oe = (N & 15) << 18 | (M & 63) << 12 | (re & 63) << 6 | ie & 63, oe > 65535 && oe < 1114112 && (F = oe));
        }
      }
      F === null ? (F = 65533, k = 1) : F > 65535 && (F -= 65536, E.push(F >>> 10 & 1023 | 55296), F = 56320 | F & 1023), E.push(F), C += k;
    }
    return J(E);
  }
  let G = 4096;
  function J(p) {
    let a = p.length;
    if (a <= G) return String.fromCharCode.apply(String, p);
    let l = "", E = 0;
    for (; E < a; ) l += String.fromCharCode.apply(String, p.slice(E, E += G));
    return l;
  }
  function ee(p, a, l) {
    let E = "";
    l = Math.min(p.length, l);
    for (let C = a; C < l; ++C) E += String.fromCharCode(p[C] & 127);
    return E;
  }
  function z(p, a, l) {
    let E = "";
    l = Math.min(p.length, l);
    for (let C = a; C < l; ++C) E += String.fromCharCode(p[C]);
    return E;
  }
  function W(p, a, l) {
    let E = p.length;
    (!a || a < 0) && (a = 0), (!l || l < 0 || l > E) && (l = E);
    let C = "";
    for (let N = a; N < l; ++N) C += vo[p[N]];
    return C;
  }
  function te(p, a, l) {
    let E = p.slice(a, l), C = "";
    for (let N = 0; N < E.length - 1; N += 2) C += String.fromCharCode(E[N] + E[N + 1] * 256);
    return C;
  }
  o.prototype.slice = function(a, l) {
    let E = this.length;
    a = ~~a, l = l === void 0 ? E : ~~l, a < 0 ? (a += E, a < 0 && (a = 0)) : a > E && (a = E), l < 0 ? (l += E, l < 0 && (l = 0)) : l > E && (l = E), l < a && (l = a);
    let C = this.subarray(a, l);
    return Object.setPrototypeOf(C, o.prototype), C;
  };
  function Y(p, a, l) {
    if (p % 1 !== 0 || p < 0) throw new RangeError("offset is not uint");
    if (p + a > l) throw new RangeError("Trying to access beyond buffer length");
  }
  o.prototype.readUintLE = o.prototype.readUIntLE = function(a, l, E) {
    a = a >>> 0, l = l >>> 0, E || Y(a, l, this.length);
    let C = this[a], N = 1, F = 0;
    for (; ++F < l && (N *= 256); ) C += this[a + F] * N;
    return C;
  }, o.prototype.readUintBE = o.prototype.readUIntBE = function(a, l, E) {
    a = a >>> 0, l = l >>> 0, E || Y(a, l, this.length);
    let C = this[a + --l], N = 1;
    for (; l > 0 && (N *= 256); ) C += this[a + --l] * N;
    return C;
  }, o.prototype.readUint8 = o.prototype.readUInt8 = function(a, l) {
    return a = a >>> 0, l || Y(a, 1, this.length), this[a];
  }, o.prototype.readUint16LE = o.prototype.readUInt16LE = function(a, l) {
    return a = a >>> 0, l || Y(a, 2, this.length), this[a] | this[a + 1] << 8;
  }, o.prototype.readUint16BE = o.prototype.readUInt16BE = function(a, l) {
    return a = a >>> 0, l || Y(a, 2, this.length), this[a] << 8 | this[a + 1];
  }, o.prototype.readUint32LE = o.prototype.readUInt32LE = function(a, l) {
    return a = a >>> 0, l || Y(a, 4, this.length), (this[a] | this[a + 1] << 8 | this[a + 2] << 16) + this[a + 3] * 16777216;
  }, o.prototype.readUint32BE = o.prototype.readUInt32BE = function(a, l) {
    return a = a >>> 0, l || Y(a, 4, this.length), this[a] * 16777216 + (this[a + 1] << 16 | this[a + 2] << 8 | this[a + 3]);
  }, o.prototype.readBigUInt64LE = ot(function(a) {
    a = a >>> 0, xe(a, "offset");
    let l = this[a], E = this[a + 7];
    (l === void 0 || E === void 0) && it(a, this.length - 8);
    let C = l + this[++a] * 2 ** 8 + this[++a] * 2 ** 16 + this[++a] * 2 ** 24, N = this[++a] + this[++a] * 2 ** 8 + this[++a] * 2 ** 16 + E * 2 ** 24;
    return BigInt(C) + (BigInt(N) << BigInt(32));
  }), o.prototype.readBigUInt64BE = ot(function(a) {
    a = a >>> 0, xe(a, "offset");
    let l = this[a], E = this[a + 7];
    (l === void 0 || E === void 0) && it(a, this.length - 8);
    let C = l * 2 ** 24 + this[++a] * 2 ** 16 + this[++a] * 2 ** 8 + this[++a], N = this[++a] * 2 ** 24 + this[++a] * 2 ** 16 + this[++a] * 2 ** 8 + E;
    return (BigInt(C) << BigInt(32)) + BigInt(N);
  }), o.prototype.readIntLE = function(a, l, E) {
    a = a >>> 0, l = l >>> 0, E || Y(a, l, this.length);
    let C = this[a], N = 1, F = 0;
    for (; ++F < l && (N *= 256); ) C += this[a + F] * N;
    return N *= 128, C >= N && (C -= Math.pow(2, 8 * l)), C;
  }, o.prototype.readIntBE = function(a, l, E) {
    a = a >>> 0, l = l >>> 0, E || Y(a, l, this.length);
    let C = l, N = 1, F = this[a + --C];
    for (; C > 0 && (N *= 256); ) F += this[a + --C] * N;
    return N *= 128, F >= N && (F -= Math.pow(2, 8 * l)), F;
  }, o.prototype.readInt8 = function(a, l) {
    return a = a >>> 0, l || Y(a, 1, this.length), this[a] & 128 ? (255 - this[a] + 1) * -1 : this[a];
  }, o.prototype.readInt16LE = function(a, l) {
    a = a >>> 0, l || Y(a, 2, this.length);
    let E = this[a] | this[a + 1] << 8;
    return E & 32768 ? E | 4294901760 : E;
  }, o.prototype.readInt16BE = function(a, l) {
    a = a >>> 0, l || Y(a, 2, this.length);
    let E = this[a + 1] | this[a] << 8;
    return E & 32768 ? E | 4294901760 : E;
  }, o.prototype.readInt32LE = function(a, l) {
    return a = a >>> 0, l || Y(a, 4, this.length), this[a] | this[a + 1] << 8 | this[a + 2] << 16 | this[a + 3] << 24;
  }, o.prototype.readInt32BE = function(a, l) {
    return a = a >>> 0, l || Y(a, 4, this.length), this[a] << 24 | this[a + 1] << 16 | this[a + 2] << 8 | this[a + 3];
  }, o.prototype.readBigInt64LE = ot(function(a) {
    a = a >>> 0, xe(a, "offset");
    let l = this[a], E = this[a + 7];
    (l === void 0 || E === void 0) && it(a, this.length - 8);
    let C = this[a + 4] + this[a + 5] * 2 ** 8 + this[a + 6] * 2 ** 16 + (E << 24);
    return (BigInt(C) << BigInt(32)) + BigInt(l + this[++a] * 2 ** 8 + this[++a] * 2 ** 16 + this[++a] * 2 ** 24);
  }), o.prototype.readBigInt64BE = ot(function(a) {
    a = a >>> 0, xe(a, "offset");
    let l = this[a], E = this[a + 7];
    (l === void 0 || E === void 0) && it(a, this.length - 8);
    let C = (l << 24) + this[++a] * 2 ** 16 + this[++a] * 2 ** 8 + this[++a];
    return (BigInt(C) << BigInt(32)) + BigInt(this[++a] * 2 ** 24 + this[++a] * 2 ** 16 + this[++a] * 2 ** 8 + E);
  }), o.prototype.readFloatLE = function(a, l) {
    return a = a >>> 0, l || Y(a, 4, this.length), e.read(this, a, true, 23, 4);
  }, o.prototype.readFloatBE = function(a, l) {
    return a = a >>> 0, l || Y(a, 4, this.length), e.read(this, a, false, 23, 4);
  }, o.prototype.readDoubleLE = function(a, l) {
    return a = a >>> 0, l || Y(a, 8, this.length), e.read(this, a, true, 52, 8);
  }, o.prototype.readDoubleBE = function(a, l) {
    return a = a >>> 0, l || Y(a, 8, this.length), e.read(this, a, false, 52, 8);
  };
  function X(p, a, l, E, C, N) {
    if (!o.isBuffer(p)) throw new TypeError('"buffer" argument must be a Buffer instance');
    if (a > C || a < N) throw new RangeError('"value" argument is out of bounds');
    if (l + E > p.length) throw new RangeError("Index out of range");
  }
  o.prototype.writeUintLE = o.prototype.writeUIntLE = function(a, l, E, C) {
    if (a = +a, l = l >>> 0, E = E >>> 0, !C) {
      let k = Math.pow(2, 8 * E) - 1;
      X(this, a, l, E, k, 0);
    }
    let N = 1, F = 0;
    for (this[l] = a & 255; ++F < E && (N *= 256); ) this[l + F] = a / N & 255;
    return l + E;
  }, o.prototype.writeUintBE = o.prototype.writeUIntBE = function(a, l, E, C) {
    if (a = +a, l = l >>> 0, E = E >>> 0, !C) {
      let k = Math.pow(2, 8 * E) - 1;
      X(this, a, l, E, k, 0);
    }
    let N = E - 1, F = 1;
    for (this[l + N] = a & 255; --N >= 0 && (F *= 256); ) this[l + N] = a / F & 255;
    return l + E;
  }, o.prototype.writeUint8 = o.prototype.writeUInt8 = function(a, l, E) {
    return a = +a, l = l >>> 0, E || X(this, a, l, 1, 255, 0), this[l] = a & 255, l + 1;
  }, o.prototype.writeUint16LE = o.prototype.writeUInt16LE = function(a, l, E) {
    return a = +a, l = l >>> 0, E || X(this, a, l, 2, 65535, 0), this[l] = a & 255, this[l + 1] = a >>> 8, l + 2;
  }, o.prototype.writeUint16BE = o.prototype.writeUInt16BE = function(a, l, E) {
    return a = +a, l = l >>> 0, E || X(this, a, l, 2, 65535, 0), this[l] = a >>> 8, this[l + 1] = a & 255, l + 2;
  }, o.prototype.writeUint32LE = o.prototype.writeUInt32LE = function(a, l, E) {
    return a = +a, l = l >>> 0, E || X(this, a, l, 4, 4294967295, 0), this[l + 3] = a >>> 24, this[l + 2] = a >>> 16, this[l + 1] = a >>> 8, this[l] = a & 255, l + 4;
  }, o.prototype.writeUint32BE = o.prototype.writeUInt32BE = function(a, l, E) {
    return a = +a, l = l >>> 0, E || X(this, a, l, 4, 4294967295, 0), this[l] = a >>> 24, this[l + 1] = a >>> 16, this[l + 2] = a >>> 8, this[l + 3] = a & 255, l + 4;
  };
  function ce(p, a, l, E, C) {
    Oe(a, E, C, p, l, 7);
    let N = Number(a & BigInt(4294967295));
    p[l++] = N, N = N >> 8, p[l++] = N, N = N >> 8, p[l++] = N, N = N >> 8, p[l++] = N;
    let F = Number(a >> BigInt(32) & BigInt(4294967295));
    return p[l++] = F, F = F >> 8, p[l++] = F, F = F >> 8, p[l++] = F, F = F >> 8, p[l++] = F, l;
  }
  function Z(p, a, l, E, C) {
    Oe(a, E, C, p, l, 7);
    let N = Number(a & BigInt(4294967295));
    p[l + 7] = N, N = N >> 8, p[l + 6] = N, N = N >> 8, p[l + 5] = N, N = N >> 8, p[l + 4] = N;
    let F = Number(a >> BigInt(32) & BigInt(4294967295));
    return p[l + 3] = F, F = F >> 8, p[l + 2] = F, F = F >> 8, p[l + 1] = F, F = F >> 8, p[l] = F, l + 8;
  }
  o.prototype.writeBigUInt64LE = ot(function(a, l = 0) {
    return ce(this, a, l, BigInt(0), BigInt("0xffffffffffffffff"));
  }), o.prototype.writeBigUInt64BE = ot(function(a, l = 0) {
    return Z(this, a, l, BigInt(0), BigInt("0xffffffffffffffff"));
  }), o.prototype.writeIntLE = function(a, l, E, C) {
    if (a = +a, l = l >>> 0, !C) {
      let M = Math.pow(2, 8 * E - 1);
      X(this, a, l, E, M - 1, -M);
    }
    let N = 0, F = 1, k = 0;
    for (this[l] = a & 255; ++N < E && (F *= 256); ) a < 0 && k === 0 && this[l + N - 1] !== 0 && (k = 1), this[l + N] = (a / F >> 0) - k & 255;
    return l + E;
  }, o.prototype.writeIntBE = function(a, l, E, C) {
    if (a = +a, l = l >>> 0, !C) {
      let M = Math.pow(2, 8 * E - 1);
      X(this, a, l, E, M - 1, -M);
    }
    let N = E - 1, F = 1, k = 0;
    for (this[l + N] = a & 255; --N >= 0 && (F *= 256); ) a < 0 && k === 0 && this[l + N + 1] !== 0 && (k = 1), this[l + N] = (a / F >> 0) - k & 255;
    return l + E;
  }, o.prototype.writeInt8 = function(a, l, E) {
    return a = +a, l = l >>> 0, E || X(this, a, l, 1, 127, -128), a < 0 && (a = 255 + a + 1), this[l] = a & 255, l + 1;
  }, o.prototype.writeInt16LE = function(a, l, E) {
    return a = +a, l = l >>> 0, E || X(this, a, l, 2, 32767, -32768), this[l] = a & 255, this[l + 1] = a >>> 8, l + 2;
  }, o.prototype.writeInt16BE = function(a, l, E) {
    return a = +a, l = l >>> 0, E || X(this, a, l, 2, 32767, -32768), this[l] = a >>> 8, this[l + 1] = a & 255, l + 2;
  }, o.prototype.writeInt32LE = function(a, l, E) {
    return a = +a, l = l >>> 0, E || X(this, a, l, 4, 2147483647, -2147483648), this[l] = a & 255, this[l + 1] = a >>> 8, this[l + 2] = a >>> 16, this[l + 3] = a >>> 24, l + 4;
  }, o.prototype.writeInt32BE = function(a, l, E) {
    return a = +a, l = l >>> 0, E || X(this, a, l, 4, 2147483647, -2147483648), a < 0 && (a = 4294967295 + a + 1), this[l] = a >>> 24, this[l + 1] = a >>> 16, this[l + 2] = a >>> 8, this[l + 3] = a & 255, l + 4;
  }, o.prototype.writeBigInt64LE = ot(function(a, l = 0) {
    return ce(this, a, l, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
  }), o.prototype.writeBigInt64BE = ot(function(a, l = 0) {
    return Z(this, a, l, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
  });
  function ne(p, a, l, E, C, N) {
    if (l + E > p.length) throw new RangeError("Index out of range");
    if (l < 0) throw new RangeError("Index out of range");
  }
  function de(p, a, l, E, C) {
    return a = +a, l = l >>> 0, C || ne(p, a, l, 4), e.write(p, a, l, E, 23, 4), l + 4;
  }
  o.prototype.writeFloatLE = function(a, l, E) {
    return de(this, a, l, true, E);
  }, o.prototype.writeFloatBE = function(a, l, E) {
    return de(this, a, l, false, E);
  };
  function be(p, a, l, E, C) {
    return a = +a, l = l >>> 0, C || ne(p, a, l, 8), e.write(p, a, l, E, 52, 8), l + 8;
  }
  o.prototype.writeDoubleLE = function(a, l, E) {
    return be(this, a, l, true, E);
  }, o.prototype.writeDoubleBE = function(a, l, E) {
    return be(this, a, l, false, E);
  }, o.prototype.copy = function(a, l, E, C) {
    if (!o.isBuffer(a)) throw new TypeError("argument should be a Buffer");
    if (E || (E = 0), !C && C !== 0 && (C = this.length), l >= a.length && (l = a.length), l || (l = 0), C > 0 && C < E && (C = E), C === E || a.length === 0 || this.length === 0) return 0;
    if (l < 0) throw new RangeError("targetStart out of bounds");
    if (E < 0 || E >= this.length) throw new RangeError("Index out of range");
    if (C < 0) throw new RangeError("sourceEnd out of bounds");
    C > this.length && (C = this.length), a.length - l < C - E && (C = a.length - l + E);
    let N = C - E;
    return this === a && typeof Uint8Array.prototype.copyWithin == "function" ? this.copyWithin(l, E, C) : Uint8Array.prototype.set.call(a, this.subarray(E, C), l), N;
  }, o.prototype.fill = function(a, l, E, C) {
    if (typeof a == "string") {
      if (typeof l == "string" ? (C = l, l = 0, E = this.length) : typeof E == "string" && (C = E, E = this.length), C !== void 0 && typeof C != "string") throw new TypeError("encoding must be a string");
      if (typeof C == "string" && !o.isEncoding(C)) throw new TypeError("Unknown encoding: " + C);
      if (a.length === 1) {
        let F = a.charCodeAt(0);
        (C === "utf8" && F < 128 || C === "latin1") && (a = F);
      }
    } else typeof a == "number" ? a = a & 255 : typeof a == "boolean" && (a = Number(a));
    if (l < 0 || this.length < l || this.length < E) throw new RangeError("Out of range index");
    if (E <= l) return this;
    l = l >>> 0, E = E === void 0 ? this.length : E >>> 0, a || (a = 0);
    let N;
    if (typeof a == "number") for (N = l; N < E; ++N) this[N] = a;
    else {
      let F = o.isBuffer(a) ? a : o.from(a, C), k = F.length;
      if (k === 0) throw new TypeError('The value "' + a + '" is invalid for argument "value"');
      for (N = 0; N < E - l; ++N) this[N + l] = F[N % k];
    }
    return this;
  };
  let ge = {};
  function Ae(p, a, l) {
    ge[p] = class extends l {
      constructor() {
        super(), Object.defineProperty(this, "message", { value: a.apply(this, arguments), writable: true, configurable: true }), this.name = `${this.name} [${p}]`, this.stack, delete this.name;
      }
      get code() {
        return p;
      }
      set code(C) {
        Object.defineProperty(this, "code", { configurable: true, enumerable: true, value: C, writable: true });
      }
      toString() {
        return `${this.name} [${p}]: ${this.message}`;
      }
    };
  }
  Ae("ERR_BUFFER_OUT_OF_BOUNDS", function(p) {
    return p ? `${p} is outside of buffer bounds` : "Attempt to access memory outside buffer bounds";
  }, RangeError), Ae("ERR_INVALID_ARG_TYPE", function(p, a) {
    return `The "${p}" argument must be of type number. Received type ${typeof a}`;
  }, TypeError), Ae("ERR_OUT_OF_RANGE", function(p, a, l) {
    let E = `The value of "${p}" is out of range.`, C = l;
    return Number.isInteger(l) && Math.abs(l) > 2 ** 32 ? C = we(String(l)) : typeof l == "bigint" && (C = String(l), (l > BigInt(2) ** BigInt(32) || l < -(BigInt(2) ** BigInt(32))) && (C = we(C)), C += "n"), E += ` It must be ${a}. Received ${C}`, E;
  }, RangeError);
  function we(p) {
    let a = "", l = p.length, E = p[0] === "-" ? 1 : 0;
    for (; l >= E + 4; l -= 3) a = `_${p.slice(l - 3, l)}${a}`;
    return `${p.slice(0, l)}${a}`;
  }
  function ve(p, a, l) {
    xe(a, "offset"), (p[a] === void 0 || p[a + l] === void 0) && it(a, p.length - (l + 1));
  }
  function Oe(p, a, l, E, C, N) {
    if (p > l || p < a) {
      let F = typeof a == "bigint" ? "n" : "", k;
      throw a === 0 || a === BigInt(0) ? k = `>= 0${F} and < 2${F} ** ${(N + 1) * 8}${F}` : k = `>= -(2${F} ** ${(N + 1) * 8 - 1}${F}) and < 2 ** ${(N + 1) * 8 - 1}${F}`, new ge.ERR_OUT_OF_RANGE("value", k, p);
    }
    ve(E, C, N);
  }
  function xe(p, a) {
    if (typeof p != "number") throw new ge.ERR_INVALID_ARG_TYPE(a, "number", p);
  }
  function it(p, a, l) {
    throw Math.floor(p) !== p ? (xe(p, l), new ge.ERR_OUT_OF_RANGE("offset", "an integer", p)) : a < 0 ? new ge.ERR_BUFFER_OUT_OF_BOUNDS() : new ge.ERR_OUT_OF_RANGE("offset", `>= 0 and <= ${a}`, p);
  }
  let Re = /[^+/0-9A-Za-z-_]/g;
  function Ne(p) {
    if (p = p.split("=")[0], p = p.trim().replace(Re, ""), p.length < 2) return "";
    for (; p.length % 4 !== 0; ) p = p + "=";
    return p;
  }
  function St(p, a) {
    a = a || 1 / 0;
    let l, E = p.length, C = null, N = [];
    for (let F = 0; F < E; ++F) {
      if (l = p.charCodeAt(F), l > 55295 && l < 57344) {
        if (!C) {
          if (l > 56319) {
            (a -= 3) > -1 && N.push(239, 191, 189);
            continue;
          } else if (F + 1 === E) {
            (a -= 3) > -1 && N.push(239, 191, 189);
            continue;
          }
          C = l;
          continue;
        }
        if (l < 56320) {
          (a -= 3) > -1 && N.push(239, 191, 189), C = l;
          continue;
        }
        l = (C - 55296 << 10 | l - 56320) + 65536;
      } else C && (a -= 3) > -1 && N.push(239, 191, 189);
      if (C = null, l < 128) {
        if ((a -= 1) < 0) break;
        N.push(l);
      } else if (l < 2048) {
        if ((a -= 2) < 0) break;
        N.push(l >> 6 | 192, l & 63 | 128);
      } else if (l < 65536) {
        if ((a -= 3) < 0) break;
        N.push(l >> 12 | 224, l >> 6 & 63 | 128, l & 63 | 128);
      } else if (l < 1114112) {
        if ((a -= 4) < 0) break;
        N.push(l >> 18 | 240, l >> 12 & 63 | 128, l >> 6 & 63 | 128, l & 63 | 128);
      } else throw new Error("Invalid code point");
    }
    return N;
  }
  function Et(p) {
    let a = [];
    for (let l = 0; l < p.length; ++l) a.push(p.charCodeAt(l) & 255);
    return a;
  }
  function cn(p, a) {
    let l, E, C, N = [];
    for (let F = 0; F < p.length && !((a -= 2) < 0); ++F) l = p.charCodeAt(F), E = l >> 8, C = l % 256, N.push(C), N.push(E);
    return N;
  }
  function li(p) {
    return t.toByteArray(Ne(p));
  }
  function Rr(p, a, l, E) {
    let C;
    for (C = 0; C < E && !(C + l >= a.length || C >= p.length); ++C) a[C + l] = p[C];
    return C;
  }
  function Xe(p, a) {
    return p instanceof a || p != null && p.constructor != null && p.constructor.name != null && p.constructor.name === a.name;
  }
  function fn(p) {
    return p !== p;
  }
  let vo = function() {
    let p = "0123456789abcdef", a = new Array(256);
    for (let l = 0; l < 16; ++l) {
      let E = l * 16;
      for (let C = 0; C < 16; ++C) a[E + C] = p[l] + p[C];
    }
    return a;
  }();
  function ot(p) {
    return typeof BigInt > "u" ? So : p;
  }
  function So() {
    throw new Error("BigInt not supported");
  }
  return cr;
}
var hn;
var vc;
var gi;
var Sc;
var cr;
var Ec;
var Ic = ze(() => {
  x();
  P();
  T();
  hn = {}, vc = false;
  gi = {}, Sc = false;
  cr = {}, Ec = false;
});
var Le = {};
Mr(Le, { Buffer: () => V, INSPECT_MAX_BYTES: () => My, default: () => Wt, kMaxLength: () => By });
var Wt;
var V;
var My;
var By;
var ke = ze(() => {
  x();
  P();
  T();
  Ic();
  Wt = Ac();
  Wt.Buffer;
  Wt.SlowBuffer;
  Wt.INSPECT_MAX_BYTES;
  Wt.kMaxLength;
  V = Wt.Buffer, My = Wt.INSPECT_MAX_BYTES, By = Wt.kMaxLength;
});
var P = ze(() => {
  ke();
});
var Ee = H((gx, xc) => {
  "use strict";
  x();
  P();
  T();
  var Bo = class extends Error {
    constructor(e) {
      if (!Array.isArray(e)) throw new TypeError(`Expected input to be an Array, got ${typeof e}`);
      let r = "";
      for (let n = 0; n < e.length; n++) r += `    ${e[n].stack}
`;
      super(r), this.name = "AggregateError", this.errors = e;
    }
  };
  xc.exports = { AggregateError: Bo, ArrayIsArray(t) {
    return Array.isArray(t);
  }, ArrayPrototypeIncludes(t, e) {
    return t.includes(e);
  }, ArrayPrototypeIndexOf(t, e) {
    return t.indexOf(e);
  }, ArrayPrototypeJoin(t, e) {
    return t.join(e);
  }, ArrayPrototypeMap(t, e) {
    return t.map(e);
  }, ArrayPrototypePop(t, e) {
    return t.pop(e);
  }, ArrayPrototypePush(t, e) {
    return t.push(e);
  }, ArrayPrototypeSlice(t, e, r) {
    return t.slice(e, r);
  }, Error, FunctionPrototypeCall(t, e, ...r) {
    return t.call(e, ...r);
  }, FunctionPrototypeSymbolHasInstance(t, e) {
    return Function.prototype[Symbol.hasInstance].call(t, e);
  }, MathFloor: Math.floor, Number, NumberIsInteger: Number.isInteger, NumberIsNaN: Number.isNaN, NumberMAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER, NumberMIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER, NumberParseInt: Number.parseInt, ObjectDefineProperties(t, e) {
    return Object.defineProperties(t, e);
  }, ObjectDefineProperty(t, e, r) {
    return Object.defineProperty(t, e, r);
  }, ObjectGetOwnPropertyDescriptor(t, e) {
    return Object.getOwnPropertyDescriptor(t, e);
  }, ObjectKeys(t) {
    return Object.keys(t);
  }, ObjectSetPrototypeOf(t, e) {
    return Object.setPrototypeOf(t, e);
  }, Promise, PromisePrototypeCatch(t, e) {
    return t.catch(e);
  }, PromisePrototypeThen(t, e, r) {
    return t.then(e, r);
  }, PromiseReject(t) {
    return Promise.reject(t);
  }, PromiseResolve(t) {
    return Promise.resolve(t);
  }, ReflectApply: Reflect.apply, RegExpPrototypeTest(t, e) {
    return t.test(e);
  }, SafeSet: Set, String, StringPrototypeSlice(t, e, r) {
    return t.slice(e, r);
  }, StringPrototypeToLowerCase(t) {
    return t.toLowerCase();
  }, StringPrototypeToUpperCase(t) {
    return t.toUpperCase();
  }, StringPrototypeTrim(t) {
    return t.trim();
  }, Symbol, SymbolFor: Symbol.for, SymbolAsyncIterator: Symbol.asyncIterator, SymbolHasInstance: Symbol.hasInstance, SymbolIterator: Symbol.iterator, SymbolDispose: Symbol.dispose || Symbol("Symbol.dispose"), SymbolAsyncDispose: Symbol.asyncDispose || Symbol("Symbol.asyncDispose"), TypedArrayPrototypeSet(t, e, r) {
    return t.set(e, r);
  }, Boolean, Uint8Array };
});
var No = H((xx, Tc) => {
  "use strict";
  x();
  P();
  T();
  Tc.exports = { format(t, ...e) {
    return t.replace(/%([sdifj])/g, function(...[r, n]) {
      let i = e.shift();
      return n === "f" ? i.toFixed(6) : n === "j" ? JSON.stringify(i) : n === "s" && typeof i == "object" ? `${i.constructor !== Object ? i.constructor.name : ""} {}`.trim() : i.toString();
    });
  }, inspect(t) {
    switch (typeof t) {
      case "string":
        if (t.includes("'")) if (t.includes('"')) {
          if (!t.includes("`") && !t.includes("${")) return `\`${t}\``;
        } else return `"${t}"`;
        return `'${t}'`;
      case "number":
        return isNaN(t) ? "NaN" : Object.is(t, -0) ? String(t) : t;
      case "bigint":
        return `${String(t)}n`;
      case "boolean":
      case "undefined":
        return String(t);
      case "object":
        return "{}";
    }
  } };
});
var Ue = H((Lx, Rc) => {
  "use strict";
  x();
  P();
  T();
  var { format: Ny, inspect: yi } = No(), { AggregateError: Ly } = Ee(), qy = globalThis.AggregateError || Ly, Dy = Symbol("kIsNodeError"), Uy = ["string", "function", "number", "object", "Function", "Object", "boolean", "bigint", "symbol"], Fy = /^([A-Z][a-z0-9]*)+$/, jy = "__node_internal_", bi = {};
  function fr(t, e) {
    if (!t) throw new bi.ERR_INTERNAL_ASSERTION(e);
  }
  function Pc(t) {
    let e = "", r = t.length, n = t[0] === "-" ? 1 : 0;
    for (; r >= n + 4; r -= 3) e = `_${t.slice(r - 3, r)}${e}`;
    return `${t.slice(0, r)}${e}`;
  }
  function $y(t, e, r) {
    if (typeof e == "function") return fr(e.length <= r.length, `Code: ${t}; The provided arguments length (${r.length}) does not match the required ones (${e.length}).`), e(...r);
    let n = (e.match(/%[dfijoOs]/g) || []).length;
    return fr(n === r.length, `Code: ${t}; The provided arguments length (${r.length}) does not match the required ones (${n}).`), r.length === 0 ? e : Ny(e, ...r);
  }
  function qe(t, e, r) {
    r || (r = Error);
    class n extends r {
      constructor(...s) {
        super($y(t, e, s));
      }
      toString() {
        return `${this.name} [${t}]: ${this.message}`;
      }
    }
    Object.defineProperties(n.prototype, { name: { value: r.name, writable: true, enumerable: false, configurable: true }, toString: { value() {
      return `${this.name} [${t}]: ${this.message}`;
    }, writable: true, enumerable: false, configurable: true } }), n.prototype.code = t, n.prototype[Dy] = true, bi[t] = n;
  }
  function Oc(t) {
    let e = jy + t.name;
    return Object.defineProperty(t, "name", { value: e }), t;
  }
  function Wy(t, e) {
    if (t && e && t !== e) {
      if (Array.isArray(e.errors)) return e.errors.push(t), e;
      let r = new qy([e, t], e.message);
      return r.code = e.code, r;
    }
    return t || e;
  }
  var Lo = class extends Error {
    constructor(e = "The operation was aborted", r = void 0) {
      if (r !== void 0 && typeof r != "object") throw new bi.ERR_INVALID_ARG_TYPE("options", "Object", r);
      super(e, r), this.code = "ABORT_ERR", this.name = "AbortError";
    }
  };
  qe("ERR_ASSERTION", "%s", Error);
  qe("ERR_INVALID_ARG_TYPE", (t, e, r) => {
    fr(typeof t == "string", "'name' must be a string"), Array.isArray(e) || (e = [e]);
    let n = "The ";
    t.endsWith(" argument") ? n += `${t} ` : n += `"${t}" ${t.includes(".") ? "property" : "argument"} `, n += "must be ";
    let i = [], s = [], o = [];
    for (let c of e) fr(typeof c == "string", "All expected entries have to be of type string"), Uy.includes(c) ? i.push(c.toLowerCase()) : Fy.test(c) ? s.push(c) : (fr(c !== "object", 'The value "object" should be written as "Object"'), o.push(c));
    if (s.length > 0) {
      let c = i.indexOf("object");
      c !== -1 && (i.splice(i, c, 1), s.push("Object"));
    }
    if (i.length > 0) {
      switch (i.length) {
        case 1:
          n += `of type ${i[0]}`;
          break;
        case 2:
          n += `one of type ${i[0]} or ${i[1]}`;
          break;
        default: {
          let c = i.pop();
          n += `one of type ${i.join(", ")}, or ${c}`;
        }
      }
      (s.length > 0 || o.length > 0) && (n += " or ");
    }
    if (s.length > 0) {
      switch (s.length) {
        case 1:
          n += `an instance of ${s[0]}`;
          break;
        case 2:
          n += `an instance of ${s[0]} or ${s[1]}`;
          break;
        default: {
          let c = s.pop();
          n += `an instance of ${s.join(", ")}, or ${c}`;
        }
      }
      o.length > 0 && (n += " or ");
    }
    switch (o.length) {
      case 0:
        break;
      case 1:
        o[0].toLowerCase() !== o[0] && (n += "an "), n += `${o[0]}`;
        break;
      case 2:
        n += `one of ${o[0]} or ${o[1]}`;
        break;
      default: {
        let c = o.pop();
        n += `one of ${o.join(", ")}, or ${c}`;
      }
    }
    if (r == null) n += `. Received ${r}`;
    else if (typeof r == "function" && r.name) n += `. Received function ${r.name}`;
    else if (typeof r == "object") {
      var u;
      if ((u = r.constructor) !== null && u !== void 0 && u.name) n += `. Received an instance of ${r.constructor.name}`;
      else {
        let c = yi(r, { depth: -1 });
        n += `. Received ${c}`;
      }
    } else {
      let c = yi(r, { colors: false });
      c.length > 25 && (c = `${c.slice(0, 25)}...`), n += `. Received type ${typeof r} (${c})`;
    }
    return n;
  }, TypeError);
  qe("ERR_INVALID_ARG_VALUE", (t, e, r = "is invalid") => {
    let n = yi(e);
    return n.length > 128 && (n = n.slice(0, 128) + "..."), `The ${t.includes(".") ? "property" : "argument"} '${t}' ${r}. Received ${n}`;
  }, TypeError);
  qe("ERR_INVALID_RETURN_VALUE", (t, e, r) => {
    var n;
    let i = r != null && (n = r.constructor) !== null && n !== void 0 && n.name ? `instance of ${r.constructor.name}` : `type ${typeof r}`;
    return `Expected ${t} to be returned from the "${e}" function but got ${i}.`;
  }, TypeError);
  qe("ERR_MISSING_ARGS", (...t) => {
    fr(t.length > 0, "At least one arg needs to be specified");
    let e, r = t.length;
    switch (t = (Array.isArray(t) ? t : [t]).map((n) => `"${n}"`).join(" or "), r) {
      case 1:
        e += `The ${t[0]} argument`;
        break;
      case 2:
        e += `The ${t[0]} and ${t[1]} arguments`;
        break;
      default:
        {
          let n = t.pop();
          e += `The ${t.join(", ")}, and ${n} arguments`;
        }
        break;
    }
    return `${e} must be specified`;
  }, TypeError);
  qe("ERR_OUT_OF_RANGE", (t, e, r) => {
    fr(e, 'Missing "range" argument');
    let n;
    if (Number.isInteger(r) && Math.abs(r) > 2 ** 32) n = Pc(String(r));
    else if (typeof r == "bigint") {
      n = String(r);
      let i = BigInt(2) ** BigInt(32);
      (r > i || r < -i) && (n = Pc(n)), n += "n";
    } else n = yi(r);
    return `The value of "${t}" is out of range. It must be ${e}. Received ${n}`;
  }, RangeError);
  qe("ERR_MULTIPLE_CALLBACK", "Callback called multiple times", Error);
  qe("ERR_METHOD_NOT_IMPLEMENTED", "The %s method is not implemented", Error);
  qe("ERR_STREAM_ALREADY_FINISHED", "Cannot call %s after a stream was finished", Error);
  qe("ERR_STREAM_CANNOT_PIPE", "Cannot pipe, not readable", Error);
  qe("ERR_STREAM_DESTROYED", "Cannot call %s after a stream was destroyed", Error);
  qe("ERR_STREAM_NULL_VALUES", "May not write null values to stream", TypeError);
  qe("ERR_STREAM_PREMATURE_CLOSE", "Premature close", Error);
  qe("ERR_STREAM_PUSH_AFTER_EOF", "stream.push() after EOF", Error);
  qe("ERR_STREAM_UNSHIFT_AFTER_END_EVENT", "stream.unshift() after end event", Error);
  qe("ERR_STREAM_WRITE_AFTER_END", "write after end", Error);
  qe("ERR_UNKNOWN_ENCODING", "Unknown encoding: %s", TypeError);
  Rc.exports = { AbortError: Lo, aggregateTwoErrors: Oc(Wy), hideStackFrames: Oc, codes: bi };
});
var Nr = H((zx, mi) => {
  "use strict";
  x();
  P();
  T();
  var { AbortController: kc, AbortSignal: Vy } = typeof self < "u" ? self : typeof window < "u" ? window : void 0;
  mi.exports = kc;
  mi.exports.AbortSignal = Vy;
  mi.exports.default = kc;
});
var Vt = {};
Mr(Vt, { EventEmitter: () => zy, default: () => pn, defaultMaxListeners: () => Gy, init: () => Qy, listenerCount: () => Ky, on: () => Yy, once: () => Jy });
function Hy() {
  if (Cc) return _i;
  Cc = true;
  var t = typeof Reflect == "object" ? Reflect : null, e = t && typeof t.apply == "function" ? t.apply : function(g, O, v) {
    return Function.prototype.apply.call(g, O, v);
  }, r;
  t && typeof t.ownKeys == "function" ? r = t.ownKeys : Object.getOwnPropertySymbols ? r = function(g) {
    return Object.getOwnPropertyNames(g).concat(Object.getOwnPropertySymbols(g));
  } : r = function(g) {
    return Object.getOwnPropertyNames(g);
  };
  function n(A) {
    console && console.warn && console.warn(A);
  }
  var i = Number.isNaN || function(g) {
    return g !== g;
  };
  function s() {
    s.init.call(this);
  }
  _i = s, _i.once = m, s.EventEmitter = s, s.prototype._events = void 0, s.prototype._eventsCount = 0, s.prototype._maxListeners = void 0;
  var o = 10;
  function u(A) {
    if (typeof A != "function") throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof A);
  }
  Object.defineProperty(s, "defaultMaxListeners", { enumerable: true, get: function() {
    return o;
  }, set: function(A) {
    if (typeof A != "number" || A < 0 || i(A)) throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + A + ".");
    o = A;
  } }), s.init = function() {
    (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) && (this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0), this._maxListeners = this._maxListeners || void 0;
  }, s.prototype.setMaxListeners = function(g) {
    if (typeof g != "number" || g < 0 || i(g)) throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + g + ".");
    return this._maxListeners = g, this;
  };
  function c(A) {
    return A._maxListeners === void 0 ? s.defaultMaxListeners : A._maxListeners;
  }
  s.prototype.getMaxListeners = function() {
    return c(this);
  }, s.prototype.emit = function(g) {
    for (var O = [], v = 1; v < arguments.length; v++) O.push(arguments[v]);
    var B = g === "error", D = this._events;
    if (D !== void 0) B = B && D.error === void 0;
    else if (!B) return false;
    if (B) {
      var L;
      if (O.length > 0 && (L = O[0]), L instanceof Error) throw L;
      var K = new Error("Unhandled error." + (L ? " (" + L.message + ")" : ""));
      throw K.context = L, K;
    }
    var U = D[g];
    if (U === void 0) return false;
    if (typeof U == "function") e(U, this, O);
    else for (var $ = U.length, G = I(U, $), v = 0; v < $; ++v) e(G[v], this, O);
    return true;
  };
  function f(A, g, O, v) {
    var B, D, L;
    if (u(O), D = A._events, D === void 0 ? (D = A._events = /* @__PURE__ */ Object.create(null), A._eventsCount = 0) : (D.newListener !== void 0 && (A.emit("newListener", g, O.listener ? O.listener : O), D = A._events), L = D[g]), L === void 0) L = D[g] = O, ++A._eventsCount;
    else if (typeof L == "function" ? L = D[g] = v ? [O, L] : [L, O] : v ? L.unshift(O) : L.push(O), B = c(A), B > 0 && L.length > B && !L.warned) {
      L.warned = true;
      var K = new Error("Possible EventEmitter memory leak detected. " + L.length + " " + String(g) + " listeners added. Use emitter.setMaxListeners() to increase limit");
      K.name = "MaxListenersExceededWarning", K.emitter = A, K.type = g, K.count = L.length, n(K);
    }
    return A;
  }
  s.prototype.addListener = function(g, O) {
    return f(this, g, O, false);
  }, s.prototype.on = s.prototype.addListener, s.prototype.prependListener = function(g, O) {
    return f(this, g, O, true);
  };
  function d() {
    if (!this.fired) return this.target.removeListener(this.type, this.wrapFn), this.fired = true, arguments.length === 0 ? this.listener.call(this.target) : this.listener.apply(this.target, arguments);
  }
  function h(A, g, O) {
    var v = { fired: false, wrapFn: void 0, target: A, type: g, listener: O }, B = d.bind(v);
    return B.listener = O, v.wrapFn = B, B;
  }
  s.prototype.once = function(g, O) {
    return u(O), this.on(g, h(this, g, O)), this;
  }, s.prototype.prependOnceListener = function(g, O) {
    return u(O), this.prependListener(g, h(this, g, O)), this;
  }, s.prototype.removeListener = function(g, O) {
    var v, B, D, L, K;
    if (u(O), B = this._events, B === void 0) return this;
    if (v = B[g], v === void 0) return this;
    if (v === O || v.listener === O) --this._eventsCount === 0 ? this._events = /* @__PURE__ */ Object.create(null) : (delete B[g], B.removeListener && this.emit("removeListener", g, v.listener || O));
    else if (typeof v != "function") {
      for (D = -1, L = v.length - 1; L >= 0; L--) if (v[L] === O || v[L].listener === O) {
        K = v[L].listener, D = L;
        break;
      }
      if (D < 0) return this;
      D === 0 ? v.shift() : S(v, D), v.length === 1 && (B[g] = v[0]), B.removeListener !== void 0 && this.emit("removeListener", g, K || O);
    }
    return this;
  }, s.prototype.off = s.prototype.removeListener, s.prototype.removeAllListeners = function(g) {
    var O, v, B;
    if (v = this._events, v === void 0) return this;
    if (v.removeListener === void 0) return arguments.length === 0 ? (this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0) : v[g] !== void 0 && (--this._eventsCount === 0 ? this._events = /* @__PURE__ */ Object.create(null) : delete v[g]), this;
    if (arguments.length === 0) {
      var D = Object.keys(v), L;
      for (B = 0; B < D.length; ++B) L = D[B], L !== "removeListener" && this.removeAllListeners(L);
      return this.removeAllListeners("removeListener"), this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0, this;
    }
    if (O = v[g], typeof O == "function") this.removeListener(g, O);
    else if (O !== void 0) for (B = O.length - 1; B >= 0; B--) this.removeListener(g, O[B]);
    return this;
  };
  function _(A, g, O) {
    var v = A._events;
    if (v === void 0) return [];
    var B = v[g];
    return B === void 0 ? [] : typeof B == "function" ? O ? [B.listener || B] : [B] : O ? b(B) : I(B, B.length);
  }
  s.prototype.listeners = function(g) {
    return _(this, g, true);
  }, s.prototype.rawListeners = function(g) {
    return _(this, g, false);
  }, s.listenerCount = function(A, g) {
    return typeof A.listenerCount == "function" ? A.listenerCount(g) : y.call(A, g);
  }, s.prototype.listenerCount = y;
  function y(A) {
    var g = this._events;
    if (g !== void 0) {
      var O = g[A];
      if (typeof O == "function") return 1;
      if (O !== void 0) return O.length;
    }
    return 0;
  }
  s.prototype.eventNames = function() {
    return this._eventsCount > 0 ? r(this._events) : [];
  };
  function I(A, g) {
    for (var O = new Array(g), v = 0; v < g; ++v) O[v] = A[v];
    return O;
  }
  function S(A, g) {
    for (; g + 1 < A.length; g++) A[g] = A[g + 1];
    A.pop();
  }
  function b(A) {
    for (var g = new Array(A.length), O = 0; O < g.length; ++O) g[O] = A[O].listener || A[O];
    return g;
  }
  function m(A, g) {
    return new Promise(function(O, v) {
      function B(L) {
        A.removeListener(g, D), v(L);
      }
      function D() {
        typeof A.removeListener == "function" && A.removeListener("error", B), O([].slice.call(arguments));
      }
      R(A, g, D, { once: true }), g !== "error" && w(A, B, { once: true });
    });
  }
  function w(A, g, O) {
    typeof A.on == "function" && R(A, "error", g, O);
  }
  function R(A, g, O, v) {
    if (typeof A.on == "function") v.once ? A.once(g, O) : A.on(g, O);
    else if (typeof A.addEventListener == "function") A.addEventListener(g, function B(D) {
      v.once && A.removeEventListener(g, B), O(D);
    });
    else throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof A);
  }
  return _i;
}
var _i;
var Cc;
var pn;
var zy;
var Gy;
var Qy;
var Ky;
var Yy;
var Jy;
var Ht = ze(() => {
  x();
  P();
  T();
  _i = {}, Cc = false;
  pn = Hy();
  pn.once;
  pn.once = function(t, e) {
    return new Promise((r, n) => {
      function i(...o) {
        s !== void 0 && t.removeListener("error", s), r(o);
      }
      let s;
      e !== "error" && (s = (o) => {
        t.removeListener(name, i), n(o);
      }, t.once("error", s)), t.once(e, i);
    });
  };
  pn.on = function(t, e) {
    let r = [], n = [], i = null, s = false, o = { async next() {
      let f = r.shift();
      if (f) return createIterResult(f, false);
      if (i) {
        let d = Promise.reject(i);
        return i = null, d;
      }
      return s ? createIterResult(void 0, true) : new Promise((d, h) => n.push({ resolve: d, reject: h }));
    }, async return() {
      t.removeListener(e, u), t.removeListener("error", c), s = true;
      for (let f of n) f.resolve(createIterResult(void 0, true));
      return createIterResult(void 0, true);
    }, throw(f) {
      i = f, t.removeListener(e, u), t.removeListener("error", c);
    }, [Symbol.asyncIterator]() {
      return this;
    } };
    return t.on(e, u), t.on("error", c), o;
    function u(...f) {
      let d = n.shift();
      d ? d.resolve(createIterResult(f, false)) : r.push(f);
    }
    function c(f) {
      s = true;
      let d = n.shift();
      d ? d.reject(f) : i = f, o.return();
    }
  };
  ({ EventEmitter: zy, defaultMaxListeners: Gy, init: Qy, listenerCount: Ky, on: Yy, once: Jy } = pn);
});
var We = H((fT, Do) => {
  "use strict";
  x();
  P();
  T();
  var Xy = (ke(), _e(Le)), { format: Zy, inspect: eb } = No(), { codes: { ERR_INVALID_ARG_TYPE: qo } } = Ue(), { kResistStopPropagation: tb, AggregateError: rb, SymbolDispose: nb } = Ee(), ib = globalThis.AbortSignal || Nr().AbortSignal, ob = globalThis.AbortController || Nr().AbortController, sb = Object.getPrototypeOf(async function() {
  }).constructor, Mc = globalThis.Blob || Xy.Blob, ab = typeof Mc < "u" ? function(e) {
    return e instanceof Mc;
  } : function(e) {
    return false;
  }, Bc = (t, e) => {
    if (t !== void 0 && (t === null || typeof t != "object" || !("aborted" in t))) throw new qo(e, "AbortSignal", t);
  }, ub = (t, e) => {
    if (typeof t != "function") throw new qo(e, "Function", t);
  };
  Do.exports = { AggregateError: rb, kEmptyObject: Object.freeze({}), once(t) {
    let e = false;
    return function(...r) {
      e || (e = true, t.apply(this, r));
    };
  }, createDeferredPromise: function() {
    let t, e;
    return { promise: new Promise((n, i) => {
      t = n, e = i;
    }), resolve: t, reject: e };
  }, promisify(t) {
    return new Promise((e, r) => {
      t((n, ...i) => n ? r(n) : e(...i));
    });
  }, debuglog() {
    return function() {
    };
  }, format: Zy, inspect: eb, types: { isAsyncFunction(t) {
    return t instanceof sb;
  }, isArrayBufferView(t) {
    return ArrayBuffer.isView(t);
  } }, isBlob: ab, deprecate(t, e) {
    return t;
  }, addAbortListener: (Ht(), _e(Vt)).addAbortListener || function(e, r) {
    if (e === void 0) throw new qo("signal", "AbortSignal", e);
    Bc(e, "signal"), ub(r, "listener");
    let n;
    return e.aborted ? queueMicrotask(() => r()) : (e.addEventListener("abort", r, { __proto__: null, once: true, [tb]: true }), n = () => {
      e.removeEventListener("abort", r);
    }), { __proto__: null, [nb]() {
      var i;
      (i = n) === null || i === void 0 || i();
    } };
  }, AbortSignalAny: ib.any || function(e) {
    if (e.length === 1) return e[0];
    let r = new ob(), n = () => r.abort();
    return e.forEach((i) => {
      Bc(i, "signals"), i.addEventListener("abort", n, { once: true });
    }), r.signal.addEventListener("abort", () => {
      e.forEach((i) => i.removeEventListener("abort", n));
    }, { once: true }), r.signal;
  } };
  Do.exports.promisify.custom = Symbol.for("nodejs.util.promisify.custom");
});
var qr = H((vT, Vc) => {
  "use strict";
  x();
  P();
  T();
  var { ArrayIsArray: Fo, ArrayPrototypeIncludes: Dc, ArrayPrototypeJoin: Uc, ArrayPrototypeMap: lb, NumberIsInteger: jo, NumberIsNaN: cb, NumberMAX_SAFE_INTEGER: fb, NumberMIN_SAFE_INTEGER: db, NumberParseInt: hb, ObjectPrototypeHasOwnProperty: pb, RegExpPrototypeExec: Fc, String: gb, StringPrototypeToUpperCase: yb, StringPrototypeTrim: bb } = Ee(), { hideStackFrames: Ze, codes: { ERR_SOCKET_BAD_PORT: mb, ERR_INVALID_ARG_TYPE: Fe, ERR_INVALID_ARG_VALUE: Lr, ERR_OUT_OF_RANGE: dr, ERR_UNKNOWN_SIGNAL: Nc } } = Ue(), { normalizeEncoding: _b } = We(), { isAsyncFunction: wb, isArrayBufferView: vb } = We().types, Lc = {};
  function Sb(t) {
    return t === (t | 0);
  }
  function Eb(t) {
    return t === t >>> 0;
  }
  var Ab = /^[0-7]+$/, Ib = "must be a 32-bit unsigned integer or an octal string";
  function xb(t, e, r) {
    if (typeof t > "u" && (t = r), typeof t == "string") {
      if (Fc(Ab, t) === null) throw new Lr(e, t, Ib);
      t = hb(t, 8);
    }
    return jc(t, e), t;
  }
  var Tb = Ze((t, e, r = db, n = fb) => {
    if (typeof t != "number") throw new Fe(e, "number", t);
    if (!jo(t)) throw new dr(e, "an integer", t);
    if (t < r || t > n) throw new dr(e, `>= ${r} && <= ${n}`, t);
  }), Pb = Ze((t, e, r = -2147483648, n = 2147483647) => {
    if (typeof t != "number") throw new Fe(e, "number", t);
    if (!jo(t)) throw new dr(e, "an integer", t);
    if (t < r || t > n) throw new dr(e, `>= ${r} && <= ${n}`, t);
  }), jc = Ze((t, e, r = false) => {
    if (typeof t != "number") throw new Fe(e, "number", t);
    if (!jo(t)) throw new dr(e, "an integer", t);
    let n = r ? 1 : 0, i = 4294967295;
    if (t < n || t > i) throw new dr(e, `>= ${n} && <= ${i}`, t);
  });
  function $o(t, e) {
    if (typeof t != "string") throw new Fe(e, "string", t);
  }
  function Ob(t, e, r = void 0, n) {
    if (typeof t != "number") throw new Fe(e, "number", t);
    if (r != null && t < r || n != null && t > n || (r != null || n != null) && cb(t)) throw new dr(e, `${r != null ? `>= ${r}` : ""}${r != null && n != null ? " && " : ""}${n != null ? `<= ${n}` : ""}`, t);
  }
  var Rb = Ze((t, e, r) => {
    if (!Dc(r, t)) {
      let i = "must be one of: " + Uc(lb(r, (s) => typeof s == "string" ? `'${s}'` : gb(s)), ", ");
      throw new Lr(e, t, i);
    }
  });
  function $c(t, e) {
    if (typeof t != "boolean") throw new Fe(e, "boolean", t);
  }
  function Uo(t, e, r) {
    return t == null || !pb(t, e) ? r : t[e];
  }
  var kb = Ze((t, e, r = null) => {
    let n = Uo(r, "allowArray", false), i = Uo(r, "allowFunction", false);
    if (!Uo(r, "nullable", false) && t === null || !n && Fo(t) || typeof t != "object" && (!i || typeof t != "function")) throw new Fe(e, "Object", t);
  }), Cb = Ze((t, e) => {
    if (t != null && typeof t != "object" && typeof t != "function") throw new Fe(e, "a dictionary", t);
  }), wi = Ze((t, e, r = 0) => {
    if (!Fo(t)) throw new Fe(e, "Array", t);
    if (t.length < r) {
      let n = `must be longer than ${r}`;
      throw new Lr(e, t, n);
    }
  });
  function Mb(t, e) {
    wi(t, e);
    for (let r = 0; r < t.length; r++) $o(t[r], `${e}[${r}]`);
  }
  function Bb(t, e) {
    wi(t, e);
    for (let r = 0; r < t.length; r++) $c(t[r], `${e}[${r}]`);
  }
  function Nb(t, e) {
    wi(t, e);
    for (let r = 0; r < t.length; r++) {
      let n = t[r], i = `${e}[${r}]`;
      if (n == null) throw new Fe(i, "AbortSignal", n);
      Wc(n, i);
    }
  }
  function Lb(t, e = "signal") {
    if ($o(t, e), Lc[t] === void 0) throw Lc[yb(t)] !== void 0 ? new Nc(t + " (signals must use all capital letters)") : new Nc(t);
  }
  var qb = Ze((t, e = "buffer") => {
    if (!vb(t)) throw new Fe(e, ["Buffer", "TypedArray", "DataView"], t);
  });
  function Db(t, e) {
    let r = _b(e), n = t.length;
    if (r === "hex" && n % 2 !== 0) throw new Lr("encoding", e, `is invalid for data of length ${n}`);
  }
  function Ub(t, e = "Port", r = true) {
    if (typeof t != "number" && typeof t != "string" || typeof t == "string" && bb(t).length === 0 || +t !== +t >>> 0 || t > 65535 || t === 0 && !r) throw new mb(e, t, r);
    return t | 0;
  }
  var Wc = Ze((t, e) => {
    if (t !== void 0 && (t === null || typeof t != "object" || !("aborted" in t))) throw new Fe(e, "AbortSignal", t);
  }), Fb = Ze((t, e) => {
    if (typeof t != "function") throw new Fe(e, "Function", t);
  }), jb = Ze((t, e) => {
    if (typeof t != "function" || wb(t)) throw new Fe(e, "Function", t);
  }), $b = Ze((t, e) => {
    if (t !== void 0) throw new Fe(e, "undefined", t);
  });
  function Wb(t, e, r) {
    if (!Dc(r, t)) throw new Fe(e, `('${Uc(r, "|")}')`, t);
  }
  var Vb = /^(?:<[^>]*>)(?:\s*;\s*[^;"\s]+(?:=(")?[^;"\s]*\1)?)*$/;
  function qc(t, e) {
    if (typeof t > "u" || !Fc(Vb, t)) throw new Lr(e, t, 'must be an array or string of format "</styles.css>; rel=preload; as=style"');
  }
  function Hb(t) {
    if (typeof t == "string") return qc(t, "hints"), t;
    if (Fo(t)) {
      let e = t.length, r = "";
      if (e === 0) return r;
      for (let n = 0; n < e; n++) {
        let i = t[n];
        qc(i, "hints"), r += i, n !== e - 1 && (r += ", ");
      }
      return r;
    }
    throw new Lr("hints", t, 'must be an array or string of format "</styles.css>; rel=preload; as=style"');
  }
  Vc.exports = { isInt32: Sb, isUint32: Eb, parseFileMode: xb, validateArray: wi, validateStringArray: Mb, validateBooleanArray: Bb, validateAbortSignalArray: Nb, validateBoolean: $c, validateBuffer: qb, validateDictionary: Cb, validateEncoding: Db, validateFunction: Fb, validateInt32: Pb, validateInteger: Tb, validateNumber: Ob, validateObject: kb, validateOneOf: Rb, validatePlainFunction: jb, validatePort: Ub, validateSignalName: Lb, validateString: $o, validateUint32: jc, validateUndefined: $b, validateUnion: Wb, validateAbortSignal: Wc, validateLinkHeaderValue: Hb };
});
var zt = H((kT, Qc) => {
  x();
  P();
  T();
  var Te = Qc.exports = {}, dt, ht;
  function Wo() {
    throw new Error("setTimeout has not been defined");
  }
  function Vo() {
    throw new Error("clearTimeout has not been defined");
  }
  (function() {
    try {
      typeof setTimeout == "function" ? dt = setTimeout : dt = Wo;
    } catch {
      dt = Wo;
    }
    try {
      typeof clearTimeout == "function" ? ht = clearTimeout : ht = Vo;
    } catch {
      ht = Vo;
    }
  })();
  function Hc(t) {
    if (dt === setTimeout) return setTimeout(t, 0);
    if ((dt === Wo || !dt) && setTimeout) return dt = setTimeout, setTimeout(t, 0);
    try {
      return dt(t, 0);
    } catch {
      try {
        return dt.call(null, t, 0);
      } catch {
        return dt.call(this, t, 0);
      }
    }
  }
  function zb(t) {
    if (ht === clearTimeout) return clearTimeout(t);
    if ((ht === Vo || !ht) && clearTimeout) return ht = clearTimeout, clearTimeout(t);
    try {
      return ht(t);
    } catch {
      try {
        return ht.call(null, t);
      } catch {
        return ht.call(this, t);
      }
    }
  }
  var xt = [], Dr = false, hr, vi = -1;
  function Gb() {
    !Dr || !hr || (Dr = false, hr.length ? xt = hr.concat(xt) : vi = -1, xt.length && zc());
  }
  function zc() {
    if (!Dr) {
      var t = Hc(Gb);
      Dr = true;
      for (var e = xt.length; e; ) {
        for (hr = xt, xt = []; ++vi < e; ) hr && hr[vi].run();
        vi = -1, e = xt.length;
      }
      hr = null, Dr = false, zb(t);
    }
  }
  Te.nextTick = function(t) {
    var e = new Array(arguments.length - 1);
    if (arguments.length > 1) for (var r = 1; r < arguments.length; r++) e[r - 1] = arguments[r];
    xt.push(new Gc(t, e)), xt.length === 1 && !Dr && Hc(zc);
  };
  function Gc(t, e) {
    this.fun = t, this.array = e;
  }
  Gc.prototype.run = function() {
    this.fun.apply(null, this.array);
  };
  Te.title = "browser";
  Te.browser = true;
  Te.env = {};
  Te.argv = [];
  Te.version = "";
  Te.versions = {};
  function Tt() {
  }
  Te.on = Tt;
  Te.addListener = Tt;
  Te.once = Tt;
  Te.off = Tt;
  Te.removeListener = Tt;
  Te.removeAllListeners = Tt;
  Te.emit = Tt;
  Te.prependListener = Tt;
  Te.prependOnceListener = Tt;
  Te.listeners = function(t) {
    return [];
  };
  Te.binding = function(t) {
    throw new Error("process.binding is not supported");
  };
  Te.cwd = function() {
    return "/";
  };
  Te.chdir = function(t) {
    throw new Error("process.chdir is not supported");
  };
  Te.umask = function() {
    return 0;
  };
});
var gt = H((jT, cf) => {
  "use strict";
  x();
  P();
  T();
  var { SymbolAsyncIterator: Kc, SymbolIterator: Yc, SymbolFor: pr } = Ee(), Jc = pr("nodejs.stream.destroyed"), Xc = pr("nodejs.stream.errored"), Ho = pr("nodejs.stream.readable"), zo = pr("nodejs.stream.writable"), Zc = pr("nodejs.stream.disturbed"), Qb = pr("nodejs.webstream.isClosedPromise"), Kb = pr("nodejs.webstream.controllerErrorFunction");
  function Si(t, e = false) {
    var r;
    return !!(t && typeof t.pipe == "function" && typeof t.on == "function" && (!e || typeof t.pause == "function" && typeof t.resume == "function") && (!t._writableState || ((r = t._readableState) === null || r === void 0 ? void 0 : r.readable) !== false) && (!t._writableState || t._readableState));
  }
  function Ei(t) {
    var e;
    return !!(t && typeof t.write == "function" && typeof t.on == "function" && (!t._readableState || ((e = t._writableState) === null || e === void 0 ? void 0 : e.writable) !== false));
  }
  function Yb(t) {
    return !!(t && typeof t.pipe == "function" && t._readableState && typeof t.on == "function" && typeof t.write == "function");
  }
  function pt(t) {
    return t && (t._readableState || t._writableState || typeof t.write == "function" && typeof t.on == "function" || typeof t.pipe == "function" && typeof t.on == "function");
  }
  function ef(t) {
    return !!(t && !pt(t) && typeof t.pipeThrough == "function" && typeof t.getReader == "function" && typeof t.cancel == "function");
  }
  function tf(t) {
    return !!(t && !pt(t) && typeof t.getWriter == "function" && typeof t.abort == "function");
  }
  function rf(t) {
    return !!(t && !pt(t) && typeof t.readable == "object" && typeof t.writable == "object");
  }
  function Jb(t) {
    return ef(t) || tf(t) || rf(t);
  }
  function Xb(t, e) {
    return t == null ? false : e === true ? typeof t[Kc] == "function" : e === false ? typeof t[Yc] == "function" : typeof t[Kc] == "function" || typeof t[Yc] == "function";
  }
  function Ai(t) {
    if (!pt(t)) return null;
    let e = t._writableState, r = t._readableState, n = e || r;
    return !!(t.destroyed || t[Jc] || n != null && n.destroyed);
  }
  function nf(t) {
    if (!Ei(t)) return null;
    if (t.writableEnded === true) return true;
    let e = t._writableState;
    return e != null && e.errored ? false : typeof (e == null ? void 0 : e.ended) != "boolean" ? null : e.ended;
  }
  function Zb(t, e) {
    if (!Ei(t)) return null;
    if (t.writableFinished === true) return true;
    let r = t._writableState;
    return r != null && r.errored ? false : typeof (r == null ? void 0 : r.finished) != "boolean" ? null : !!(r.finished || e === false && r.ended === true && r.length === 0);
  }
  function em(t) {
    if (!Si(t)) return null;
    if (t.readableEnded === true) return true;
    let e = t._readableState;
    return !e || e.errored ? false : typeof (e == null ? void 0 : e.ended) != "boolean" ? null : e.ended;
  }
  function of(t, e) {
    if (!Si(t)) return null;
    let r = t._readableState;
    return r != null && r.errored ? false : typeof (r == null ? void 0 : r.endEmitted) != "boolean" ? null : !!(r.endEmitted || e === false && r.ended === true && r.length === 0);
  }
  function sf(t) {
    return t && t[Ho] != null ? t[Ho] : typeof (t == null ? void 0 : t.readable) != "boolean" ? null : Ai(t) ? false : Si(t) && t.readable && !of(t);
  }
  function af(t) {
    return t && t[zo] != null ? t[zo] : typeof (t == null ? void 0 : t.writable) != "boolean" ? null : Ai(t) ? false : Ei(t) && t.writable && !nf(t);
  }
  function tm(t, e) {
    return pt(t) ? Ai(t) ? true : !((e == null ? void 0 : e.readable) !== false && sf(t) || (e == null ? void 0 : e.writable) !== false && af(t)) : null;
  }
  function rm(t) {
    var e, r;
    return pt(t) ? t.writableErrored ? t.writableErrored : (e = (r = t._writableState) === null || r === void 0 ? void 0 : r.errored) !== null && e !== void 0 ? e : null : null;
  }
  function nm(t) {
    var e, r;
    return pt(t) ? t.readableErrored ? t.readableErrored : (e = (r = t._readableState) === null || r === void 0 ? void 0 : r.errored) !== null && e !== void 0 ? e : null : null;
  }
  function im(t) {
    if (!pt(t)) return null;
    if (typeof t.closed == "boolean") return t.closed;
    let e = t._writableState, r = t._readableState;
    return typeof (e == null ? void 0 : e.closed) == "boolean" || typeof (r == null ? void 0 : r.closed) == "boolean" ? (e == null ? void 0 : e.closed) || (r == null ? void 0 : r.closed) : typeof t._closed == "boolean" && uf(t) ? t._closed : null;
  }
  function uf(t) {
    return typeof t._closed == "boolean" && typeof t._defaultKeepAlive == "boolean" && typeof t._removedConnection == "boolean" && typeof t._removedContLen == "boolean";
  }
  function lf(t) {
    return typeof t._sent100 == "boolean" && uf(t);
  }
  function om(t) {
    var e;
    return typeof t._consuming == "boolean" && typeof t._dumped == "boolean" && ((e = t.req) === null || e === void 0 ? void 0 : e.upgradeOrConnect) === void 0;
  }
  function sm(t) {
    if (!pt(t)) return null;
    let e = t._writableState, r = t._readableState, n = e || r;
    return !n && lf(t) || !!(n && n.autoDestroy && n.emitClose && n.closed === false);
  }
  function am(t) {
    var e;
    return !!(t && ((e = t[Zc]) !== null && e !== void 0 ? e : t.readableDidRead || t.readableAborted));
  }
  function um(t) {
    var e, r, n, i, s, o, u, c, f, d;
    return !!(t && ((e = (r = (n = (i = (s = (o = t[Xc]) !== null && o !== void 0 ? o : t.readableErrored) !== null && s !== void 0 ? s : t.writableErrored) !== null && i !== void 0 ? i : (u = t._readableState) === null || u === void 0 ? void 0 : u.errorEmitted) !== null && n !== void 0 ? n : (c = t._writableState) === null || c === void 0 ? void 0 : c.errorEmitted) !== null && r !== void 0 ? r : (f = t._readableState) === null || f === void 0 ? void 0 : f.errored) !== null && e !== void 0 ? e : !((d = t._writableState) === null || d === void 0) && d.errored));
  }
  cf.exports = { isDestroyed: Ai, kIsDestroyed: Jc, isDisturbed: am, kIsDisturbed: Zc, isErrored: um, kIsErrored: Xc, isReadable: sf, kIsReadable: Ho, kIsClosedPromise: Qb, kControllerErrorFunction: Kb, kIsWritable: zo, isClosed: im, isDuplexNodeStream: Yb, isFinished: tm, isIterable: Xb, isReadableNodeStream: Si, isReadableStream: ef, isReadableEnded: em, isReadableFinished: of, isReadableErrored: nm, isNodeStream: pt, isWebStream: Jb, isWritable: af, isWritableNodeStream: Ei, isWritableStream: tf, isWritableEnded: nf, isWritableFinished: Zb, isWritableErrored: rm, isServerRequest: om, isServerResponse: lf, willEmitClose: sm, isTransformStream: rf };
});
var Pt = H((JT, Jo) => {
  "use strict";
  x();
  P();
  T();
  var Gt = zt(), { AbortError: _f, codes: lm } = Ue(), { ERR_INVALID_ARG_TYPE: cm, ERR_STREAM_PREMATURE_CLOSE: ff } = lm, { kEmptyObject: Qo, once: Ko } = We(), { validateAbortSignal: fm, validateFunction: dm, validateObject: hm, validateBoolean: pm } = qr(), { Promise: gm, PromisePrototypeThen: ym, SymbolDispose: wf } = Ee(), { isClosed: bm, isReadable: df, isReadableNodeStream: Go, isReadableStream: mm, isReadableFinished: hf, isReadableErrored: pf, isWritable: gf, isWritableNodeStream: yf, isWritableStream: _m, isWritableFinished: bf, isWritableErrored: mf, isNodeStream: wm, willEmitClose: vm, kIsClosedPromise: Sm } = gt(), Ur;
  function Em(t) {
    return t.setHeader && typeof t.abort == "function";
  }
  var Yo = () => {
  };
  function vf(t, e, r) {
    var n, i;
    if (arguments.length === 2 ? (r = e, e = Qo) : e == null ? e = Qo : hm(e, "options"), dm(r, "callback"), fm(e.signal, "options.signal"), r = Ko(r), mm(t) || _m(t)) return Am(t, e, r);
    if (!wm(t)) throw new cm("stream", ["ReadableStream", "WritableStream", "Stream"], t);
    let s = (n = e.readable) !== null && n !== void 0 ? n : Go(t), o = (i = e.writable) !== null && i !== void 0 ? i : yf(t), u = t._writableState, c = t._readableState, f = () => {
      t.writable || _();
    }, d = vm(t) && Go(t) === s && yf(t) === o, h = bf(t, false), _ = () => {
      h = true, t.destroyed && (d = false), !(d && (!t.readable || s)) && (!s || y) && r.call(t);
    }, y = hf(t, false), I = () => {
      y = true, t.destroyed && (d = false), !(d && (!t.writable || o)) && (!o || h) && r.call(t);
    }, S = (g) => {
      r.call(t, g);
    }, b = bm(t), m = () => {
      b = true;
      let g = mf(t) || pf(t);
      if (g && typeof g != "boolean") return r.call(t, g);
      if (s && !y && Go(t, true) && !hf(t, false)) return r.call(t, new ff());
      if (o && !h && !bf(t, false)) return r.call(t, new ff());
      r.call(t);
    }, w = () => {
      b = true;
      let g = mf(t) || pf(t);
      if (g && typeof g != "boolean") return r.call(t, g);
      r.call(t);
    }, R = () => {
      t.req.on("finish", _);
    };
    Em(t) ? (t.on("complete", _), d || t.on("abort", m), t.req ? R() : t.on("request", R)) : o && !u && (t.on("end", f), t.on("close", f)), !d && typeof t.aborted == "boolean" && t.on("aborted", m), t.on("end", I), t.on("finish", _), e.error !== false && t.on("error", S), t.on("close", m), b ? Gt.nextTick(m) : u != null && u.errorEmitted || c != null && c.errorEmitted ? d || Gt.nextTick(w) : (!s && (!d || df(t)) && (h || gf(t) === false) || !o && (!d || gf(t)) && (y || df(t) === false) || c && t.req && t.aborted) && Gt.nextTick(w);
    let A = () => {
      r = Yo, t.removeListener("aborted", m), t.removeListener("complete", _), t.removeListener("abort", m), t.removeListener("request", R), t.req && t.req.removeListener("finish", _), t.removeListener("end", f), t.removeListener("close", f), t.removeListener("finish", _), t.removeListener("end", I), t.removeListener("error", S), t.removeListener("close", m);
    };
    if (e.signal && !b) {
      let g = () => {
        let O = r;
        A(), O.call(t, new _f(void 0, { cause: e.signal.reason }));
      };
      if (e.signal.aborted) Gt.nextTick(g);
      else {
        Ur = Ur || We().addAbortListener;
        let O = Ur(e.signal, g), v = r;
        r = Ko((...B) => {
          O[wf](), v.apply(t, B);
        });
      }
    }
    return A;
  }
  function Am(t, e, r) {
    let n = false, i = Yo;
    if (e.signal) if (i = () => {
      n = true, r.call(t, new _f(void 0, { cause: e.signal.reason }));
    }, e.signal.aborted) Gt.nextTick(i);
    else {
      Ur = Ur || We().addAbortListener;
      let o = Ur(e.signal, i), u = r;
      r = Ko((...c) => {
        o[wf](), u.apply(t, c);
      });
    }
    let s = (...o) => {
      n || Gt.nextTick(() => r.apply(t, o));
    };
    return ym(t[Sm].promise, s, s), Yo;
  }
  function Im(t, e) {
    var r;
    let n = false;
    return e === null && (e = Qo), (r = e) !== null && r !== void 0 && r.cleanup && (pm(e.cleanup, "cleanup"), n = e.cleanup), new gm((i, s) => {
      let o = vf(t, e, (u) => {
        n && o(), u ? s(u) : i();
      });
    });
  }
  Jo.exports = vf;
  Jo.exports.finished = Im;
});
var gr = H((aP, Of) => {
  "use strict";
  x();
  P();
  T();
  var yt = zt(), { aggregateTwoErrors: xm, codes: { ERR_MULTIPLE_CALLBACK: Tm }, AbortError: Pm } = Ue(), { Symbol: Af } = Ee(), { kIsDestroyed: Om, isDestroyed: Rm, isFinished: km, isServerRequest: Cm } = gt(), If = Af("kDestroy"), Xo = Af("kConstruct");
  function xf(t, e, r) {
    t && (t.stack, e && !e.errored && (e.errored = t), r && !r.errored && (r.errored = t));
  }
  function Mm(t, e) {
    let r = this._readableState, n = this._writableState, i = n || r;
    return n != null && n.destroyed || r != null && r.destroyed ? (typeof e == "function" && e(), this) : (xf(t, n, r), n && (n.destroyed = true), r && (r.destroyed = true), i.constructed ? Sf(this, t, e) : this.once(If, function(s) {
      Sf(this, xm(s, t), e);
    }), this);
  }
  function Sf(t, e, r) {
    let n = false;
    function i(s) {
      if (n) return;
      n = true;
      let o = t._readableState, u = t._writableState;
      xf(s, u, o), u && (u.closed = true), o && (o.closed = true), typeof r == "function" && r(s), s ? yt.nextTick(Bm, t, s) : yt.nextTick(Tf, t);
    }
    try {
      t._destroy(e || null, i);
    } catch (s) {
      i(s);
    }
  }
  function Bm(t, e) {
    Zo(t, e), Tf(t);
  }
  function Tf(t) {
    let e = t._readableState, r = t._writableState;
    r && (r.closeEmitted = true), e && (e.closeEmitted = true), (r != null && r.emitClose || e != null && e.emitClose) && t.emit("close");
  }
  function Zo(t, e) {
    let r = t._readableState, n = t._writableState;
    n != null && n.errorEmitted || r != null && r.errorEmitted || (n && (n.errorEmitted = true), r && (r.errorEmitted = true), t.emit("error", e));
  }
  function Nm() {
    let t = this._readableState, e = this._writableState;
    t && (t.constructed = true, t.closed = false, t.closeEmitted = false, t.destroyed = false, t.errored = null, t.errorEmitted = false, t.reading = false, t.ended = t.readable === false, t.endEmitted = t.readable === false), e && (e.constructed = true, e.destroyed = false, e.closed = false, e.closeEmitted = false, e.errored = null, e.errorEmitted = false, e.finalCalled = false, e.prefinished = false, e.ended = e.writable === false, e.ending = e.writable === false, e.finished = e.writable === false);
  }
  function es(t, e, r) {
    let n = t._readableState, i = t._writableState;
    if (i != null && i.destroyed || n != null && n.destroyed) return this;
    n != null && n.autoDestroy || i != null && i.autoDestroy ? t.destroy(e) : e && (e.stack, i && !i.errored && (i.errored = e), n && !n.errored && (n.errored = e), r ? yt.nextTick(Zo, t, e) : Zo(t, e));
  }
  function Lm(t, e) {
    if (typeof t._construct != "function") return;
    let r = t._readableState, n = t._writableState;
    r && (r.constructed = false), n && (n.constructed = false), t.once(Xo, e), !(t.listenerCount(Xo) > 1) && yt.nextTick(qm, t);
  }
  function qm(t) {
    let e = false;
    function r(n) {
      if (e) {
        es(t, n ?? new Tm());
        return;
      }
      e = true;
      let i = t._readableState, s = t._writableState, o = s || i;
      i && (i.constructed = true), s && (s.constructed = true), o.destroyed ? t.emit(If, n) : n ? es(t, n, true) : yt.nextTick(Dm, t);
    }
    try {
      t._construct((n) => {
        yt.nextTick(r, n);
      });
    } catch (n) {
      yt.nextTick(r, n);
    }
  }
  function Dm(t) {
    t.emit(Xo);
  }
  function Ef(t) {
    return (t == null ? void 0 : t.setHeader) && typeof t.abort == "function";
  }
  function Pf(t) {
    t.emit("close");
  }
  function Um(t, e) {
    t.emit("error", e), yt.nextTick(Pf, t);
  }
  function Fm(t, e) {
    !t || Rm(t) || (!e && !km(t) && (e = new Pm()), Cm(t) ? (t.socket = null, t.destroy(e)) : Ef(t) ? t.abort() : Ef(t.req) ? t.req.abort() : typeof t.destroy == "function" ? t.destroy(e) : typeof t.close == "function" ? t.close() : e ? yt.nextTick(Um, t, e) : yt.nextTick(Pf, t), t.destroyed || (t[Om] = true));
  }
  Of.exports = { construct: Lm, destroyer: Fm, destroy: Mm, undestroy: Nm, errorOrDestroy: es };
});
var Ti = H((bP, kf) => {
  "use strict";
  x();
  P();
  T();
  var { ArrayIsArray: jm, ObjectSetPrototypeOf: Rf } = Ee(), { EventEmitter: Ii } = (Ht(), _e(Vt));
  function xi(t) {
    Ii.call(this, t);
  }
  Rf(xi.prototype, Ii.prototype);
  Rf(xi, Ii);
  xi.prototype.pipe = function(t, e) {
    let r = this;
    function n(d) {
      t.writable && t.write(d) === false && r.pause && r.pause();
    }
    r.on("data", n);
    function i() {
      r.readable && r.resume && r.resume();
    }
    t.on("drain", i), !t._isStdio && (!e || e.end !== false) && (r.on("end", o), r.on("close", u));
    let s = false;
    function o() {
      s || (s = true, t.end());
    }
    function u() {
      s || (s = true, typeof t.destroy == "function" && t.destroy());
    }
    function c(d) {
      f(), Ii.listenerCount(this, "error") === 0 && this.emit("error", d);
    }
    ts(r, "error", c), ts(t, "error", c);
    function f() {
      r.removeListener("data", n), t.removeListener("drain", i), r.removeListener("end", o), r.removeListener("close", u), r.removeListener("error", c), t.removeListener("error", c), r.removeListener("end", f), r.removeListener("close", f), t.removeListener("close", f);
    }
    return r.on("end", f), r.on("close", f), t.on("close", f), t.emit("pipe", r), t;
  };
  function ts(t, e, r) {
    if (typeof t.prependListener == "function") return t.prependListener(e, r);
    !t._events || !t._events[e] ? t.on(e, r) : jm(t._events[e]) ? t._events[e].unshift(r) : t._events[e] = [r, t._events[e]];
  }
  kf.exports = { Stream: xi, prependListener: ts };
});
var gn = H((TP, Pi) => {
  "use strict";
  x();
  P();
  T();
  var { SymbolDispose: $m } = Ee(), { AbortError: Cf, codes: Wm } = Ue(), { isNodeStream: Mf, isWebStream: Vm, kControllerErrorFunction: Hm } = gt(), zm = Pt(), { ERR_INVALID_ARG_TYPE: Bf } = Wm, rs, Gm = (t, e) => {
    if (typeof t != "object" || !("aborted" in t)) throw new Bf(e, "AbortSignal", t);
  };
  Pi.exports.addAbortSignal = function(e, r) {
    if (Gm(e, "signal"), !Mf(r) && !Vm(r)) throw new Bf("stream", ["ReadableStream", "WritableStream", "Stream"], r);
    return Pi.exports.addAbortSignalNoValidate(e, r);
  };
  Pi.exports.addAbortSignalNoValidate = function(t, e) {
    if (typeof t != "object" || !("aborted" in t)) return e;
    let r = Mf(e) ? () => {
      e.destroy(new Cf(void 0, { cause: t.reason }));
    } : () => {
      e[Hm](new Cf(void 0, { cause: t.reason }));
    };
    if (t.aborted) r();
    else {
      rs = rs || We().addAbortListener;
      let n = rs(t, r);
      zm(e, n[$m]);
    }
    return e;
  };
});
var qf = H((DP, Lf) => {
  "use strict";
  x();
  P();
  T();
  var { StringPrototypeSlice: Nf, SymbolIterator: Qm, TypedArrayPrototypeSet: Oi, Uint8Array: Km } = Ee(), { Buffer: ns } = (ke(), _e(Le)), { inspect: Ym } = We();
  Lf.exports = class {
    constructor() {
      this.head = null, this.tail = null, this.length = 0;
    }
    push(e) {
      let r = { data: e, next: null };
      this.length > 0 ? this.tail.next = r : this.head = r, this.tail = r, ++this.length;
    }
    unshift(e) {
      let r = { data: e, next: this.head };
      this.length === 0 && (this.tail = r), this.head = r, ++this.length;
    }
    shift() {
      if (this.length === 0) return;
      let e = this.head.data;
      return this.length === 1 ? this.head = this.tail = null : this.head = this.head.next, --this.length, e;
    }
    clear() {
      this.head = this.tail = null, this.length = 0;
    }
    join(e) {
      if (this.length === 0) return "";
      let r = this.head, n = "" + r.data;
      for (; (r = r.next) !== null; ) n += e + r.data;
      return n;
    }
    concat(e) {
      if (this.length === 0) return ns.alloc(0);
      let r = ns.allocUnsafe(e >>> 0), n = this.head, i = 0;
      for (; n; ) Oi(r, n.data, i), i += n.data.length, n = n.next;
      return r;
    }
    consume(e, r) {
      let n = this.head.data;
      if (e < n.length) {
        let i = n.slice(0, e);
        return this.head.data = n.slice(e), i;
      }
      return e === n.length ? this.shift() : r ? this._getString(e) : this._getBuffer(e);
    }
    first() {
      return this.head.data;
    }
    *[Qm]() {
      for (let e = this.head; e; e = e.next) yield e.data;
    }
    _getString(e) {
      let r = "", n = this.head, i = 0;
      do {
        let s = n.data;
        if (e > s.length) r += s, e -= s.length;
        else {
          e === s.length ? (r += s, ++i, n.next ? this.head = n.next : this.head = this.tail = null) : (r += Nf(s, 0, e), this.head = n, n.data = Nf(s, e));
          break;
        }
        ++i;
      } while ((n = n.next) !== null);
      return this.length -= i, r;
    }
    _getBuffer(e) {
      let r = ns.allocUnsafe(e), n = e, i = this.head, s = 0;
      do {
        let o = i.data;
        if (e > o.length) Oi(r, o, n - e), e -= o.length;
        else {
          e === o.length ? (Oi(r, o, n - e), ++s, i.next ? this.head = i.next : this.head = this.tail = null) : (Oi(r, new Km(o.buffer, o.byteOffset, e), n - e), this.head = i, i.data = o.slice(e));
          break;
        }
        ++s;
      } while ((i = i.next) !== null);
      return this.length -= s, r;
    }
    [Symbol.for("nodejs.util.inspect.custom")](e, r) {
      return Ym(this, { ...r, depth: 0, customInspect: false });
    }
  };
});
var yn = H((QP, jf) => {
  "use strict";
  x();
  P();
  T();
  var { MathFloor: Jm, NumberIsInteger: Xm } = Ee(), { validateInteger: Zm } = qr(), { ERR_INVALID_ARG_VALUE: e_ } = Ue().codes, Df = 16 * 1024, Uf = 16;
  function t_(t, e, r) {
    return t.highWaterMark != null ? t.highWaterMark : e ? t[r] : null;
  }
  function Ff(t) {
    return t ? Uf : Df;
  }
  function r_(t, e) {
    Zm(e, "value", 0), t ? Uf = e : Df = e;
  }
  function n_(t, e, r, n) {
    let i = t_(e, n, r);
    if (i != null) {
      if (!Xm(i) || i < 0) {
        let s = n ? `options.${r}` : "options.highWaterMark";
        throw new e_(s, i);
      }
      return Jm(i);
    }
    return Ff(t.objectMode);
  }
  jf.exports = { getHighWaterMark: n_, getDefaultHighWaterMark: Ff, setDefaultHighWaterMark: r_ };
});
var Vf = H((is, Wf) => {
  x();
  P();
  T();
  var Ri = (ke(), _e(Le)), bt = Ri.Buffer;
  function $f(t, e) {
    for (var r in t) e[r] = t[r];
  }
  bt.from && bt.alloc && bt.allocUnsafe && bt.allocUnsafeSlow ? Wf.exports = Ri : ($f(Ri, is), is.Buffer = yr);
  function yr(t, e, r) {
    return bt(t, e, r);
  }
  yr.prototype = Object.create(bt.prototype);
  $f(bt, yr);
  yr.from = function(t, e, r) {
    if (typeof t == "number") throw new TypeError("Argument must not be a number");
    return bt(t, e, r);
  };
  yr.alloc = function(t, e, r) {
    if (typeof t != "number") throw new TypeError("Argument must be a number");
    var n = bt(t);
    return e !== void 0 ? typeof r == "string" ? n.fill(e, r) : n.fill(e) : n.fill(0), n;
  };
  yr.allocUnsafe = function(t) {
    if (typeof t != "number") throw new TypeError("Argument must be a number");
    return bt(t);
  };
  yr.allocUnsafeSlow = function(t) {
    if (typeof t != "number") throw new TypeError("Argument must be a number");
    return Ri.SlowBuffer(t);
  };
});
var Gf = H((zf) => {
  "use strict";
  x();
  P();
  T();
  var ss = Vf().Buffer, Hf = ss.isEncoding || function(t) {
    switch (t = "" + t, t && t.toLowerCase()) {
      case "hex":
      case "utf8":
      case "utf-8":
      case "ascii":
      case "binary":
      case "base64":
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
      case "raw":
        return true;
      default:
        return false;
    }
  };
  function i_(t) {
    if (!t) return "utf8";
    for (var e; ; ) switch (t) {
      case "utf8":
      case "utf-8":
        return "utf8";
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
        return "utf16le";
      case "latin1":
      case "binary":
        return "latin1";
      case "base64":
      case "ascii":
      case "hex":
        return t;
      default:
        if (e) return;
        t = ("" + t).toLowerCase(), e = true;
    }
  }
  function o_(t) {
    var e = i_(t);
    if (typeof e != "string" && (ss.isEncoding === Hf || !Hf(t))) throw new Error("Unknown encoding: " + t);
    return e || t;
  }
  zf.StringDecoder = bn;
  function bn(t) {
    this.encoding = o_(t);
    var e;
    switch (this.encoding) {
      case "utf16le":
        this.text = f_, this.end = d_, e = 4;
        break;
      case "utf8":
        this.fillLast = u_, e = 4;
        break;
      case "base64":
        this.text = h_, this.end = p_, e = 3;
        break;
      default:
        this.write = g_, this.end = y_;
        return;
    }
    this.lastNeed = 0, this.lastTotal = 0, this.lastChar = ss.allocUnsafe(e);
  }
  bn.prototype.write = function(t) {
    if (t.length === 0) return "";
    var e, r;
    if (this.lastNeed) {
      if (e = this.fillLast(t), e === void 0) return "";
      r = this.lastNeed, this.lastNeed = 0;
    } else r = 0;
    return r < t.length ? e ? e + this.text(t, r) : this.text(t, r) : e || "";
  };
  bn.prototype.end = c_;
  bn.prototype.text = l_;
  bn.prototype.fillLast = function(t) {
    if (this.lastNeed <= t.length) return t.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed), this.lastChar.toString(this.encoding, 0, this.lastTotal);
    t.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, t.length), this.lastNeed -= t.length;
  };
  function os(t) {
    return t <= 127 ? 0 : t >> 5 === 6 ? 2 : t >> 4 === 14 ? 3 : t >> 3 === 30 ? 4 : t >> 6 === 2 ? -1 : -2;
  }
  function s_(t, e, r) {
    var n = e.length - 1;
    if (n < r) return 0;
    var i = os(e[n]);
    return i >= 0 ? (i > 0 && (t.lastNeed = i - 1), i) : --n < r || i === -2 ? 0 : (i = os(e[n]), i >= 0 ? (i > 0 && (t.lastNeed = i - 2), i) : --n < r || i === -2 ? 0 : (i = os(e[n]), i >= 0 ? (i > 0 && (i === 2 ? i = 0 : t.lastNeed = i - 3), i) : 0));
  }
  function a_(t, e, r) {
    if ((e[0] & 192) !== 128) return t.lastNeed = 0, "�";
    if (t.lastNeed > 1 && e.length > 1) {
      if ((e[1] & 192) !== 128) return t.lastNeed = 1, "�";
      if (t.lastNeed > 2 && e.length > 2 && (e[2] & 192) !== 128) return t.lastNeed = 2, "�";
    }
  }
  function u_(t) {
    var e = this.lastTotal - this.lastNeed, r = a_(this, t, e);
    if (r !== void 0) return r;
    if (this.lastNeed <= t.length) return t.copy(this.lastChar, e, 0, this.lastNeed), this.lastChar.toString(this.encoding, 0, this.lastTotal);
    t.copy(this.lastChar, e, 0, t.length), this.lastNeed -= t.length;
  }
  function l_(t, e) {
    var r = s_(this, t, e);
    if (!this.lastNeed) return t.toString("utf8", e);
    this.lastTotal = r;
    var n = t.length - (r - this.lastNeed);
    return t.copy(this.lastChar, 0, n), t.toString("utf8", e, n);
  }
  function c_(t) {
    var e = t && t.length ? this.write(t) : "";
    return this.lastNeed ? e + "�" : e;
  }
  function f_(t, e) {
    if ((t.length - e) % 2 === 0) {
      var r = t.toString("utf16le", e);
      if (r) {
        var n = r.charCodeAt(r.length - 1);
        if (n >= 55296 && n <= 56319) return this.lastNeed = 2, this.lastTotal = 4, this.lastChar[0] = t[t.length - 2], this.lastChar[1] = t[t.length - 1], r.slice(0, -1);
      }
      return r;
    }
    return this.lastNeed = 1, this.lastTotal = 2, this.lastChar[0] = t[t.length - 1], t.toString("utf16le", e, t.length - 1);
  }
  function d_(t) {
    var e = t && t.length ? this.write(t) : "";
    if (this.lastNeed) {
      var r = this.lastTotal - this.lastNeed;
      return e + this.lastChar.toString("utf16le", 0, r);
    }
    return e;
  }
  function h_(t, e) {
    var r = (t.length - e) % 3;
    return r === 0 ? t.toString("base64", e) : (this.lastNeed = 3 - r, this.lastTotal = 3, r === 1 ? this.lastChar[0] = t[t.length - 1] : (this.lastChar[0] = t[t.length - 2], this.lastChar[1] = t[t.length - 1]), t.toString("base64", e, t.length - r));
  }
  function p_(t) {
    var e = t && t.length ? this.write(t) : "";
    return this.lastNeed ? e + this.lastChar.toString("base64", 0, 3 - this.lastNeed) : e;
  }
  function g_(t) {
    return t.toString(this.encoding);
  }
  function y_(t) {
    return t && t.length ? this.write(t) : "";
  }
});
var as = H((EO, Jf) => {
  "use strict";
  x();
  P();
  T();
  var Qf = zt(), { PromisePrototypeThen: b_, SymbolAsyncIterator: Kf, SymbolIterator: Yf } = Ee(), { Buffer: m_ } = (ke(), _e(Le)), { ERR_INVALID_ARG_TYPE: __, ERR_STREAM_NULL_VALUES: w_ } = Ue().codes;
  function v_(t, e, r) {
    let n;
    if (typeof e == "string" || e instanceof m_) return new t({ objectMode: true, ...r, read() {
      this.push(e), this.push(null);
    } });
    let i;
    if (e && e[Kf]) i = true, n = e[Kf]();
    else if (e && e[Yf]) i = false, n = e[Yf]();
    else throw new __("iterable", ["Iterable"], e);
    let s = new t({ objectMode: true, highWaterMark: 1, ...r }), o = false;
    s._read = function() {
      o || (o = true, c());
    }, s._destroy = function(f, d) {
      b_(u(f), () => Qf.nextTick(d, f), (h) => Qf.nextTick(d, h || f));
    };
    async function u(f) {
      let d = f != null, h = typeof n.throw == "function";
      if (d && h) {
        let { value: _, done: y } = await n.throw(f);
        if (await _, y) return;
      }
      if (typeof n.return == "function") {
        let { value: _ } = await n.return();
        await _;
      }
    }
    async function c() {
      for (; ; ) {
        try {
          let { value: f, done: d } = i ? await n.next() : n.next();
          if (d) s.push(null);
          else {
            let h = f && typeof f.then == "function" ? await f : f;
            if (h === null) throw o = false, new w_();
            if (s.push(h)) continue;
            o = false;
          }
        } catch (f) {
          s.destroy(f);
        }
        break;
      }
    }
    return s;
  }
  Jf.exports = v_;
});
var _n = H((MO, gd) => {
  "use strict";
  x();
  P();
  T();
  var at = zt(), { ArrayPrototypeIndexOf: S_, NumberIsInteger: E_, NumberIsNaN: A_, NumberParseInt: I_, ObjectDefineProperties: gs, ObjectKeys: x_, ObjectSetPrototypeOf: ed, Promise: td, SafeSet: T_, SymbolAsyncDispose: P_, SymbolAsyncIterator: O_, Symbol: R_ } = Ee();
  gd.exports = le;
  le.ReadableState = Bi;
  var { EventEmitter: k_ } = (Ht(), _e(Vt)), { Stream: Qt, prependListener: C_ } = Ti(), { Buffer: us } = (ke(), _e(Le)), { addAbortSignal: M_ } = gn(), rd = Pt(), he = We().debuglog("stream", (t) => {
    he = t;
  }), B_ = qf(), $r = gr(), { getHighWaterMark: N_, getDefaultHighWaterMark: L_ } = yn(), { aggregateTwoErrors: Xf, codes: { ERR_INVALID_ARG_TYPE: q_, ERR_METHOD_NOT_IMPLEMENTED: D_, ERR_OUT_OF_RANGE: U_, ERR_STREAM_PUSH_AFTER_EOF: F_, ERR_STREAM_UNSHIFT_AFTER_END_EVENT: j_ }, AbortError: $_ } = Ue(), { validateObject: W_ } = qr(), br = R_("kPaused"), { StringDecoder: nd } = Gf(), V_ = as();
  ed(le.prototype, Qt.prototype);
  ed(le, Qt);
  var ls = () => {
  }, { errorOrDestroy: Fr } = $r, jr = 1, H_ = 2, id = 4, mn = 8, od = 16, ki = 32, Ci = 64, sd = 128, z_ = 256, G_ = 512, Q_ = 1024, hs = 2048, ps = 4096, K_ = 8192, Y_ = 16384, J_ = 32768, ad = 65536, X_ = 1 << 17, Z_ = 1 << 18;
  function Ce(t) {
    return { enumerable: false, get() {
      return (this.state & t) !== 0;
    }, set(e) {
      e ? this.state |= t : this.state &= ~t;
    } };
  }
  gs(Bi.prototype, { objectMode: Ce(jr), ended: Ce(H_), endEmitted: Ce(id), reading: Ce(mn), constructed: Ce(od), sync: Ce(ki), needReadable: Ce(Ci), emittedReadable: Ce(sd), readableListening: Ce(z_), resumeScheduled: Ce(G_), errorEmitted: Ce(Q_), emitClose: Ce(hs), autoDestroy: Ce(ps), destroyed: Ce(K_), closed: Ce(Y_), closeEmitted: Ce(J_), multiAwaitDrain: Ce(ad), readingMore: Ce(X_), dataEmitted: Ce(Z_) });
  function Bi(t, e, r) {
    typeof r != "boolean" && (r = e instanceof mt()), this.state = hs | ps | od | ki, t && t.objectMode && (this.state |= jr), r && t && t.readableObjectMode && (this.state |= jr), this.highWaterMark = t ? N_(this, t, "readableHighWaterMark", r) : L_(false), this.buffer = new B_(), this.length = 0, this.pipes = [], this.flowing = null, this[br] = null, t && t.emitClose === false && (this.state &= ~hs), t && t.autoDestroy === false && (this.state &= ~ps), this.errored = null, this.defaultEncoding = t && t.defaultEncoding || "utf8", this.awaitDrainWriters = null, this.decoder = null, this.encoding = null, t && t.encoding && (this.decoder = new nd(t.encoding), this.encoding = t.encoding);
  }
  function le(t) {
    if (!(this instanceof le)) return new le(t);
    let e = this instanceof mt();
    this._readableState = new Bi(t, this, e), t && (typeof t.read == "function" && (this._read = t.read), typeof t.destroy == "function" && (this._destroy = t.destroy), typeof t.construct == "function" && (this._construct = t.construct), t.signal && !e && M_(t.signal, this)), Qt.call(this, t), $r.construct(this, () => {
      this._readableState.needReadable && Mi(this, this._readableState);
    });
  }
  le.prototype.destroy = $r.destroy;
  le.prototype._undestroy = $r.undestroy;
  le.prototype._destroy = function(t, e) {
    e(t);
  };
  le.prototype[k_.captureRejectionSymbol] = function(t) {
    this.destroy(t);
  };
  le.prototype[P_] = function() {
    let t;
    return this.destroyed || (t = this.readableEnded ? null : new $_(), this.destroy(t)), new td((e, r) => rd(this, (n) => n && n !== t ? r(n) : e(null)));
  };
  le.prototype.push = function(t, e) {
    return ud(this, t, e, false);
  };
  le.prototype.unshift = function(t, e) {
    return ud(this, t, e, true);
  };
  function ud(t, e, r, n) {
    he("readableAddChunk", e);
    let i = t._readableState, s;
    if ((i.state & jr) === 0 && (typeof e == "string" ? (r = r || i.defaultEncoding, i.encoding !== r && (n && i.encoding ? e = us.from(e, r).toString(i.encoding) : (e = us.from(e, r), r = ""))) : e instanceof us ? r = "" : Qt._isUint8Array(e) ? (e = Qt._uint8ArrayToBuffer(e), r = "") : e != null && (s = new q_("chunk", ["string", "Buffer", "Uint8Array"], e))), s) Fr(t, s);
    else if (e === null) i.state &= ~mn, rw(t, i);
    else if ((i.state & jr) !== 0 || e && e.length > 0) if (n) if ((i.state & id) !== 0) Fr(t, new j_());
    else {
      if (i.destroyed || i.errored) return false;
      cs(t, i, e, true);
    }
    else if (i.ended) Fr(t, new F_());
    else {
      if (i.destroyed || i.errored) return false;
      i.state &= ~mn, i.decoder && !r ? (e = i.decoder.write(e), i.objectMode || e.length !== 0 ? cs(t, i, e, false) : Mi(t, i)) : cs(t, i, e, false);
    }
    else n || (i.state &= ~mn, Mi(t, i));
    return !i.ended && (i.length < i.highWaterMark || i.length === 0);
  }
  function cs(t, e, r, n) {
    e.flowing && e.length === 0 && !e.sync && t.listenerCount("data") > 0 ? ((e.state & ad) !== 0 ? e.awaitDrainWriters.clear() : e.awaitDrainWriters = null, e.dataEmitted = true, t.emit("data", r)) : (e.length += e.objectMode ? 1 : r.length, n ? e.buffer.unshift(r) : e.buffer.push(r), (e.state & Ci) !== 0 && Ni(t)), Mi(t, e);
  }
  le.prototype.isPaused = function() {
    let t = this._readableState;
    return t[br] === true || t.flowing === false;
  };
  le.prototype.setEncoding = function(t) {
    let e = new nd(t);
    this._readableState.decoder = e, this._readableState.encoding = this._readableState.decoder.encoding;
    let r = this._readableState.buffer, n = "";
    for (let i of r) n += e.write(i);
    return r.clear(), n !== "" && r.push(n), this._readableState.length = n.length, this;
  };
  var ew = 1073741824;
  function tw(t) {
    if (t > ew) throw new U_("size", "<= 1GiB", t);
    return t--, t |= t >>> 1, t |= t >>> 2, t |= t >>> 4, t |= t >>> 8, t |= t >>> 16, t++, t;
  }
  function Zf(t, e) {
    return t <= 0 || e.length === 0 && e.ended ? 0 : (e.state & jr) !== 0 ? 1 : A_(t) ? e.flowing && e.length ? e.buffer.first().length : e.length : t <= e.length ? t : e.ended ? e.length : 0;
  }
  le.prototype.read = function(t) {
    he("read", t), t === void 0 ? t = NaN : E_(t) || (t = I_(t, 10));
    let e = this._readableState, r = t;
    if (t > e.highWaterMark && (e.highWaterMark = tw(t)), t !== 0 && (e.state &= ~sd), t === 0 && e.needReadable && ((e.highWaterMark !== 0 ? e.length >= e.highWaterMark : e.length > 0) || e.ended)) return he("read: emitReadable", e.length, e.ended), e.length === 0 && e.ended ? fs(this) : Ni(this), null;
    if (t = Zf(t, e), t === 0 && e.ended) return e.length === 0 && fs(this), null;
    let n = (e.state & Ci) !== 0;
    if (he("need readable", n), (e.length === 0 || e.length - t < e.highWaterMark) && (n = true, he("length less than watermark", n)), e.ended || e.reading || e.destroyed || e.errored || !e.constructed) n = false, he("reading, ended or constructing", n);
    else if (n) {
      he("do read"), e.state |= mn | ki, e.length === 0 && (e.state |= Ci);
      try {
        this._read(e.highWaterMark);
      } catch (s) {
        Fr(this, s);
      }
      e.state &= ~ki, e.reading || (t = Zf(r, e));
    }
    let i;
    return t > 0 ? i = hd(t, e) : i = null, i === null ? (e.needReadable = e.length <= e.highWaterMark, t = 0) : (e.length -= t, e.multiAwaitDrain ? e.awaitDrainWriters.clear() : e.awaitDrainWriters = null), e.length === 0 && (e.ended || (e.needReadable = true), r !== t && e.ended && fs(this)), i !== null && !e.errorEmitted && !e.closeEmitted && (e.dataEmitted = true, this.emit("data", i)), i;
  };
  function rw(t, e) {
    if (he("onEofChunk"), !e.ended) {
      if (e.decoder) {
        let r = e.decoder.end();
        r && r.length && (e.buffer.push(r), e.length += e.objectMode ? 1 : r.length);
      }
      e.ended = true, e.sync ? Ni(t) : (e.needReadable = false, e.emittedReadable = true, ld(t));
    }
  }
  function Ni(t) {
    let e = t._readableState;
    he("emitReadable", e.needReadable, e.emittedReadable), e.needReadable = false, e.emittedReadable || (he("emitReadable", e.flowing), e.emittedReadable = true, at.nextTick(ld, t));
  }
  function ld(t) {
    let e = t._readableState;
    he("emitReadable_", e.destroyed, e.length, e.ended), !e.destroyed && !e.errored && (e.length || e.ended) && (t.emit("readable"), e.emittedReadable = false), e.needReadable = !e.flowing && !e.ended && e.length <= e.highWaterMark, fd(t);
  }
  function Mi(t, e) {
    !e.readingMore && e.constructed && (e.readingMore = true, at.nextTick(nw, t, e));
  }
  function nw(t, e) {
    for (; !e.reading && !e.ended && (e.length < e.highWaterMark || e.flowing && e.length === 0); ) {
      let r = e.length;
      if (he("maybeReadMore read 0"), t.read(0), r === e.length) break;
    }
    e.readingMore = false;
  }
  le.prototype._read = function(t) {
    throw new D_("_read()");
  };
  le.prototype.pipe = function(t, e) {
    let r = this, n = this._readableState;
    n.pipes.length === 1 && (n.multiAwaitDrain || (n.multiAwaitDrain = true, n.awaitDrainWriters = new T_(n.awaitDrainWriters ? [n.awaitDrainWriters] : []))), n.pipes.push(t), he("pipe count=%d opts=%j", n.pipes.length, e);
    let s = (!e || e.end !== false) && t !== at.stdout && t !== at.stderr ? u : b;
    n.endEmitted ? at.nextTick(s) : r.once("end", s), t.on("unpipe", o);
    function o(m, w) {
      he("onunpipe"), m === r && w && w.hasUnpiped === false && (w.hasUnpiped = true, d());
    }
    function u() {
      he("onend"), t.end();
    }
    let c, f = false;
    function d() {
      he("cleanup"), t.removeListener("close", I), t.removeListener("finish", S), c && t.removeListener("drain", c), t.removeListener("error", y), t.removeListener("unpipe", o), r.removeListener("end", u), r.removeListener("end", b), r.removeListener("data", _), f = true, c && n.awaitDrainWriters && (!t._writableState || t._writableState.needDrain) && c();
    }
    function h() {
      f || (n.pipes.length === 1 && n.pipes[0] === t ? (he("false write response, pause", 0), n.awaitDrainWriters = t, n.multiAwaitDrain = false) : n.pipes.length > 1 && n.pipes.includes(t) && (he("false write response, pause", n.awaitDrainWriters.size), n.awaitDrainWriters.add(t)), r.pause()), c || (c = iw(r, t), t.on("drain", c));
    }
    r.on("data", _);
    function _(m) {
      he("ondata");
      let w = t.write(m);
      he("dest.write", w), w === false && h();
    }
    function y(m) {
      if (he("onerror", m), b(), t.removeListener("error", y), t.listenerCount("error") === 0) {
        let w = t._writableState || t._readableState;
        w && !w.errorEmitted ? Fr(t, m) : t.emit("error", m);
      }
    }
    C_(t, "error", y);
    function I() {
      t.removeListener("finish", S), b();
    }
    t.once("close", I);
    function S() {
      he("onfinish"), t.removeListener("close", I), b();
    }
    t.once("finish", S);
    function b() {
      he("unpipe"), r.unpipe(t);
    }
    return t.emit("pipe", r), t.writableNeedDrain === true ? h() : n.flowing || (he("pipe resume"), r.resume()), t;
  };
  function iw(t, e) {
    return function() {
      let n = t._readableState;
      n.awaitDrainWriters === e ? (he("pipeOnDrain", 1), n.awaitDrainWriters = null) : n.multiAwaitDrain && (he("pipeOnDrain", n.awaitDrainWriters.size), n.awaitDrainWriters.delete(e)), (!n.awaitDrainWriters || n.awaitDrainWriters.size === 0) && t.listenerCount("data") && t.resume();
    };
  }
  le.prototype.unpipe = function(t) {
    let e = this._readableState, r = { hasUnpiped: false };
    if (e.pipes.length === 0) return this;
    if (!t) {
      let i = e.pipes;
      e.pipes = [], this.pause();
      for (let s = 0; s < i.length; s++) i[s].emit("unpipe", this, { hasUnpiped: false });
      return this;
    }
    let n = S_(e.pipes, t);
    return n === -1 ? this : (e.pipes.splice(n, 1), e.pipes.length === 0 && this.pause(), t.emit("unpipe", this, r), this);
  };
  le.prototype.on = function(t, e) {
    let r = Qt.prototype.on.call(this, t, e), n = this._readableState;
    return t === "data" ? (n.readableListening = this.listenerCount("readable") > 0, n.flowing !== false && this.resume()) : t === "readable" && !n.endEmitted && !n.readableListening && (n.readableListening = n.needReadable = true, n.flowing = false, n.emittedReadable = false, he("on readable", n.length, n.reading), n.length ? Ni(this) : n.reading || at.nextTick(ow, this)), r;
  };
  le.prototype.addListener = le.prototype.on;
  le.prototype.removeListener = function(t, e) {
    let r = Qt.prototype.removeListener.call(this, t, e);
    return t === "readable" && at.nextTick(cd, this), r;
  };
  le.prototype.off = le.prototype.removeListener;
  le.prototype.removeAllListeners = function(t) {
    let e = Qt.prototype.removeAllListeners.apply(this, arguments);
    return (t === "readable" || t === void 0) && at.nextTick(cd, this), e;
  };
  function cd(t) {
    let e = t._readableState;
    e.readableListening = t.listenerCount("readable") > 0, e.resumeScheduled && e[br] === false ? e.flowing = true : t.listenerCount("data") > 0 ? t.resume() : e.readableListening || (e.flowing = null);
  }
  function ow(t) {
    he("readable nexttick read 0"), t.read(0);
  }
  le.prototype.resume = function() {
    let t = this._readableState;
    return t.flowing || (he("resume"), t.flowing = !t.readableListening, sw(this, t)), t[br] = false, this;
  };
  function sw(t, e) {
    e.resumeScheduled || (e.resumeScheduled = true, at.nextTick(aw, t, e));
  }
  function aw(t, e) {
    he("resume", e.reading), e.reading || t.read(0), e.resumeScheduled = false, t.emit("resume"), fd(t), e.flowing && !e.reading && t.read(0);
  }
  le.prototype.pause = function() {
    return he("call pause flowing=%j", this._readableState.flowing), this._readableState.flowing !== false && (he("pause"), this._readableState.flowing = false, this.emit("pause")), this._readableState[br] = true, this;
  };
  function fd(t) {
    let e = t._readableState;
    for (he("flow", e.flowing); e.flowing && t.read() !== null; ) ;
  }
  le.prototype.wrap = function(t) {
    let e = false;
    t.on("data", (n) => {
      !this.push(n) && t.pause && (e = true, t.pause());
    }), t.on("end", () => {
      this.push(null);
    }), t.on("error", (n) => {
      Fr(this, n);
    }), t.on("close", () => {
      this.destroy();
    }), t.on("destroy", () => {
      this.destroy();
    }), this._read = () => {
      e && t.resume && (e = false, t.resume());
    };
    let r = x_(t);
    for (let n = 1; n < r.length; n++) {
      let i = r[n];
      this[i] === void 0 && typeof t[i] == "function" && (this[i] = t[i].bind(t));
    }
    return this;
  };
  le.prototype[O_] = function() {
    return dd(this);
  };
  le.prototype.iterator = function(t) {
    return t !== void 0 && W_(t, "options"), dd(this, t);
  };
  function dd(t, e) {
    typeof t.read != "function" && (t = le.wrap(t, { objectMode: true }));
    let r = uw(t, e);
    return r.stream = t, r;
  }
  async function* uw(t, e) {
    let r = ls;
    function n(o) {
      this === t ? (r(), r = ls) : r = o;
    }
    t.on("readable", n);
    let i, s = rd(t, { writable: false }, (o) => {
      i = o ? Xf(i, o) : null, r(), r = ls;
    });
    try {
      for (; ; ) {
        let o = t.destroyed ? null : t.read();
        if (o !== null) yield o;
        else {
          if (i) throw i;
          if (i === null) return;
          await new td(n);
        }
      }
    } catch (o) {
      throw i = Xf(i, o), i;
    } finally {
      (i || (e == null ? void 0 : e.destroyOnReturn) !== false) && (i === void 0 || t._readableState.autoDestroy) ? $r.destroyer(t, null) : (t.off("readable", n), s());
    }
  }
  gs(le.prototype, { readable: { __proto__: null, get() {
    let t = this._readableState;
    return !!t && t.readable !== false && !t.destroyed && !t.errorEmitted && !t.endEmitted;
  }, set(t) {
    this._readableState && (this._readableState.readable = !!t);
  } }, readableDidRead: { __proto__: null, enumerable: false, get: function() {
    return this._readableState.dataEmitted;
  } }, readableAborted: { __proto__: null, enumerable: false, get: function() {
    return !!(this._readableState.readable !== false && (this._readableState.destroyed || this._readableState.errored) && !this._readableState.endEmitted);
  } }, readableHighWaterMark: { __proto__: null, enumerable: false, get: function() {
    return this._readableState.highWaterMark;
  } }, readableBuffer: { __proto__: null, enumerable: false, get: function() {
    return this._readableState && this._readableState.buffer;
  } }, readableFlowing: { __proto__: null, enumerable: false, get: function() {
    return this._readableState.flowing;
  }, set: function(t) {
    this._readableState && (this._readableState.flowing = t);
  } }, readableLength: { __proto__: null, enumerable: false, get() {
    return this._readableState.length;
  } }, readableObjectMode: { __proto__: null, enumerable: false, get() {
    return this._readableState ? this._readableState.objectMode : false;
  } }, readableEncoding: { __proto__: null, enumerable: false, get() {
    return this._readableState ? this._readableState.encoding : null;
  } }, errored: { __proto__: null, enumerable: false, get() {
    return this._readableState ? this._readableState.errored : null;
  } }, closed: { __proto__: null, get() {
    return this._readableState ? this._readableState.closed : false;
  } }, destroyed: { __proto__: null, enumerable: false, get() {
    return this._readableState ? this._readableState.destroyed : false;
  }, set(t) {
    this._readableState && (this._readableState.destroyed = t);
  } }, readableEnded: { __proto__: null, enumerable: false, get() {
    return this._readableState ? this._readableState.endEmitted : false;
  } } });
  gs(Bi.prototype, { pipesCount: { __proto__: null, get() {
    return this.pipes.length;
  } }, paused: { __proto__: null, get() {
    return this[br] !== false;
  }, set(t) {
    this[br] = !!t;
  } } });
  le._fromList = hd;
  function hd(t, e) {
    if (e.length === 0) return null;
    let r;
    return e.objectMode ? r = e.buffer.shift() : !t || t >= e.length ? (e.decoder ? r = e.buffer.join("") : e.buffer.length === 1 ? r = e.buffer.first() : r = e.buffer.concat(e.length), e.buffer.clear()) : r = e.buffer.consume(t, e.decoder), r;
  }
  function fs(t) {
    let e = t._readableState;
    he("endReadable", e.endEmitted), e.endEmitted || (e.ended = true, at.nextTick(lw, e, t));
  }
  function lw(t, e) {
    if (he("endReadableNT", t.endEmitted, t.length), !t.errored && !t.closeEmitted && !t.endEmitted && t.length === 0) {
      if (t.endEmitted = true, e.emit("end"), e.writable && e.allowHalfOpen === false) at.nextTick(cw, e);
      else if (t.autoDestroy) {
        let r = e._writableState;
        (!r || r.autoDestroy && (r.finished || r.writable === false)) && e.destroy();
      }
    }
  }
  function cw(t) {
    t.writable && !t.writableEnded && !t.destroyed && t.end();
  }
  le.from = function(t, e) {
    return V_(le, t, e);
  };
  var ds;
  function pd() {
    return ds === void 0 && (ds = {}), ds;
  }
  le.fromWeb = function(t, e) {
    return pd().newStreamReadableFromReadableStream(t, e);
  };
  le.toWeb = function(t, e) {
    return pd().newReadableStreamFromStreamReadable(t, e);
  };
  le.wrap = function(t, e) {
    var r, n;
    return new le({ objectMode: (r = (n = t.readableObjectMode) !== null && n !== void 0 ? n : t.objectMode) !== null && r !== void 0 ? r : true, ...e, destroy(i, s) {
      $r.destroyer(t, i), s(i);
    } }).wrap(t);
  };
});
var Fi = H((WO, Td) => {
  "use strict";
  x();
  P();
  T();
  var mr = zt(), { ArrayPrototypeSlice: md, Error: fw, FunctionPrototypeSymbolHasInstance: _d, ObjectDefineProperty: wd, ObjectDefineProperties: dw, ObjectSetPrototypeOf: vd, StringPrototypeToLowerCase: hw, Symbol: pw, SymbolHasInstance: gw } = Ee();
  Td.exports = Ie;
  Ie.WritableState = Sn;
  var { EventEmitter: yw } = (Ht(), _e(Vt)), wn = Ti().Stream, { Buffer: Li } = (ke(), _e(Le)), Ui = gr(), { addAbortSignal: bw } = gn(), { getHighWaterMark: mw, getDefaultHighWaterMark: _w } = yn(), { ERR_INVALID_ARG_TYPE: ww, ERR_METHOD_NOT_IMPLEMENTED: vw, ERR_MULTIPLE_CALLBACK: Sd, ERR_STREAM_CANNOT_PIPE: Sw, ERR_STREAM_DESTROYED: vn, ERR_STREAM_ALREADY_FINISHED: Ew, ERR_STREAM_NULL_VALUES: Aw, ERR_STREAM_WRITE_AFTER_END: Iw, ERR_UNKNOWN_ENCODING: Ed } = Ue().codes, { errorOrDestroy: Wr } = Ui;
  vd(Ie.prototype, wn.prototype);
  vd(Ie, wn);
  function ms() {
  }
  var Vr = pw("kOnFinished");
  function Sn(t, e, r) {
    typeof r != "boolean" && (r = e instanceof mt()), this.objectMode = !!(t && t.objectMode), r && (this.objectMode = this.objectMode || !!(t && t.writableObjectMode)), this.highWaterMark = t ? mw(this, t, "writableHighWaterMark", r) : _w(false), this.finalCalled = false, this.needDrain = false, this.ending = false, this.ended = false, this.finished = false, this.destroyed = false;
    let n = !!(t && t.decodeStrings === false);
    this.decodeStrings = !n, this.defaultEncoding = t && t.defaultEncoding || "utf8", this.length = 0, this.writing = false, this.corked = 0, this.sync = true, this.bufferProcessing = false, this.onwrite = Tw.bind(void 0, e), this.writecb = null, this.writelen = 0, this.afterWriteTickInfo = null, Di(this), this.pendingcb = 0, this.constructed = true, this.prefinished = false, this.errorEmitted = false, this.emitClose = !t || t.emitClose !== false, this.autoDestroy = !t || t.autoDestroy !== false, this.errored = null, this.closed = false, this.closeEmitted = false, this[Vr] = [];
  }
  function Di(t) {
    t.buffered = [], t.bufferedIndex = 0, t.allBuffers = true, t.allNoop = true;
  }
  Sn.prototype.getBuffer = function() {
    return md(this.buffered, this.bufferedIndex);
  };
  wd(Sn.prototype, "bufferedRequestCount", { __proto__: null, get() {
    return this.buffered.length - this.bufferedIndex;
  } });
  function Ie(t) {
    let e = this instanceof mt();
    if (!e && !_d(Ie, this)) return new Ie(t);
    this._writableState = new Sn(t, this, e), t && (typeof t.write == "function" && (this._write = t.write), typeof t.writev == "function" && (this._writev = t.writev), typeof t.destroy == "function" && (this._destroy = t.destroy), typeof t.final == "function" && (this._final = t.final), typeof t.construct == "function" && (this._construct = t.construct), t.signal && bw(t.signal, this)), wn.call(this, t), Ui.construct(this, () => {
      let r = this._writableState;
      r.writing || ws(this, r), vs(this, r);
    });
  }
  wd(Ie, gw, { __proto__: null, value: function(t) {
    return _d(this, t) ? true : this !== Ie ? false : t && t._writableState instanceof Sn;
  } });
  Ie.prototype.pipe = function() {
    Wr(this, new Sw());
  };
  function Ad(t, e, r, n) {
    let i = t._writableState;
    if (typeof r == "function") n = r, r = i.defaultEncoding;
    else {
      if (!r) r = i.defaultEncoding;
      else if (r !== "buffer" && !Li.isEncoding(r)) throw new Ed(r);
      typeof n != "function" && (n = ms);
    }
    if (e === null) throw new Aw();
    if (!i.objectMode) if (typeof e == "string") i.decodeStrings !== false && (e = Li.from(e, r), r = "buffer");
    else if (e instanceof Li) r = "buffer";
    else if (wn._isUint8Array(e)) e = wn._uint8ArrayToBuffer(e), r = "buffer";
    else throw new ww("chunk", ["string", "Buffer", "Uint8Array"], e);
    let s;
    return i.ending ? s = new Iw() : i.destroyed && (s = new vn("write")), s ? (mr.nextTick(n, s), Wr(t, s, true), s) : (i.pendingcb++, xw(t, i, e, r, n));
  }
  Ie.prototype.write = function(t, e, r) {
    return Ad(this, t, e, r) === true;
  };
  Ie.prototype.cork = function() {
    this._writableState.corked++;
  };
  Ie.prototype.uncork = function() {
    let t = this._writableState;
    t.corked && (t.corked--, t.writing || ws(this, t));
  };
  Ie.prototype.setDefaultEncoding = function(e) {
    if (typeof e == "string" && (e = hw(e)), !Li.isEncoding(e)) throw new Ed(e);
    return this._writableState.defaultEncoding = e, this;
  };
  function xw(t, e, r, n, i) {
    let s = e.objectMode ? 1 : r.length;
    e.length += s;
    let o = e.length < e.highWaterMark;
    return o || (e.needDrain = true), e.writing || e.corked || e.errored || !e.constructed ? (e.buffered.push({ chunk: r, encoding: n, callback: i }), e.allBuffers && n !== "buffer" && (e.allBuffers = false), e.allNoop && i !== ms && (e.allNoop = false)) : (e.writelen = s, e.writecb = i, e.writing = true, e.sync = true, t._write(r, n, e.onwrite), e.sync = false), o && !e.errored && !e.destroyed;
  }
  function yd(t, e, r, n, i, s, o) {
    e.writelen = n, e.writecb = o, e.writing = true, e.sync = true, e.destroyed ? e.onwrite(new vn("write")) : r ? t._writev(i, e.onwrite) : t._write(i, s, e.onwrite), e.sync = false;
  }
  function bd(t, e, r, n) {
    --e.pendingcb, n(r), _s(e), Wr(t, r);
  }
  function Tw(t, e) {
    let r = t._writableState, n = r.sync, i = r.writecb;
    if (typeof i != "function") {
      Wr(t, new Sd());
      return;
    }
    r.writing = false, r.writecb = null, r.length -= r.writelen, r.writelen = 0, e ? (e.stack, r.errored || (r.errored = e), t._readableState && !t._readableState.errored && (t._readableState.errored = e), n ? mr.nextTick(bd, t, r, e, i) : bd(t, r, e, i)) : (r.buffered.length > r.bufferedIndex && ws(t, r), n ? r.afterWriteTickInfo !== null && r.afterWriteTickInfo.cb === i ? r.afterWriteTickInfo.count++ : (r.afterWriteTickInfo = { count: 1, cb: i, stream: t, state: r }, mr.nextTick(Pw, r.afterWriteTickInfo)) : Id(t, r, 1, i));
  }
  function Pw({ stream: t, state: e, count: r, cb: n }) {
    return e.afterWriteTickInfo = null, Id(t, e, r, n);
  }
  function Id(t, e, r, n) {
    for (!e.ending && !t.destroyed && e.length === 0 && e.needDrain && (e.needDrain = false, t.emit("drain")); r-- > 0; ) e.pendingcb--, n();
    e.destroyed && _s(e), vs(t, e);
  }
  function _s(t) {
    if (t.writing) return;
    for (let i = t.bufferedIndex; i < t.buffered.length; ++i) {
      var e;
      let { chunk: s, callback: o } = t.buffered[i], u = t.objectMode ? 1 : s.length;
      t.length -= u, o((e = t.errored) !== null && e !== void 0 ? e : new vn("write"));
    }
    let r = t[Vr].splice(0);
    for (let i = 0; i < r.length; i++) {
      var n;
      r[i]((n = t.errored) !== null && n !== void 0 ? n : new vn("end"));
    }
    Di(t);
  }
  function ws(t, e) {
    if (e.corked || e.bufferProcessing || e.destroyed || !e.constructed) return;
    let { buffered: r, bufferedIndex: n, objectMode: i } = e, s = r.length - n;
    if (!s) return;
    let o = n;
    if (e.bufferProcessing = true, s > 1 && t._writev) {
      e.pendingcb -= s - 1;
      let u = e.allNoop ? ms : (f) => {
        for (let d = o; d < r.length; ++d) r[d].callback(f);
      }, c = e.allNoop && o === 0 ? r : md(r, o);
      c.allBuffers = e.allBuffers, yd(t, e, true, e.length, c, "", u), Di(e);
    } else {
      do {
        let { chunk: u, encoding: c, callback: f } = r[o];
        r[o++] = null;
        let d = i ? 1 : u.length;
        yd(t, e, false, d, u, c, f);
      } while (o < r.length && !e.writing);
      o === r.length ? Di(e) : o > 256 ? (r.splice(0, o), e.bufferedIndex = 0) : e.bufferedIndex = o;
    }
    e.bufferProcessing = false;
  }
  Ie.prototype._write = function(t, e, r) {
    if (this._writev) this._writev([{ chunk: t, encoding: e }], r);
    else throw new vw("_write()");
  };
  Ie.prototype._writev = null;
  Ie.prototype.end = function(t, e, r) {
    let n = this._writableState;
    typeof t == "function" ? (r = t, t = null, e = null) : typeof e == "function" && (r = e, e = null);
    let i;
    if (t != null) {
      let s = Ad(this, t, e);
      s instanceof fw && (i = s);
    }
    return n.corked && (n.corked = 1, this.uncork()), i || (!n.errored && !n.ending ? (n.ending = true, vs(this, n, true), n.ended = true) : n.finished ? i = new Ew("end") : n.destroyed && (i = new vn("end"))), typeof r == "function" && (i || n.finished ? mr.nextTick(r, i) : n[Vr].push(r)), this;
  };
  function qi(t) {
    return t.ending && !t.destroyed && t.constructed && t.length === 0 && !t.errored && t.buffered.length === 0 && !t.finished && !t.writing && !t.errorEmitted && !t.closeEmitted;
  }
  function Ow(t, e) {
    let r = false;
    function n(i) {
      if (r) {
        Wr(t, i ?? Sd());
        return;
      }
      if (r = true, e.pendingcb--, i) {
        let s = e[Vr].splice(0);
        for (let o = 0; o < s.length; o++) s[o](i);
        Wr(t, i, e.sync);
      } else qi(e) && (e.prefinished = true, t.emit("prefinish"), e.pendingcb++, mr.nextTick(bs, t, e));
    }
    e.sync = true, e.pendingcb++;
    try {
      t._final(n);
    } catch (i) {
      n(i);
    }
    e.sync = false;
  }
  function Rw(t, e) {
    !e.prefinished && !e.finalCalled && (typeof t._final == "function" && !e.destroyed ? (e.finalCalled = true, Ow(t, e)) : (e.prefinished = true, t.emit("prefinish")));
  }
  function vs(t, e, r) {
    qi(e) && (Rw(t, e), e.pendingcb === 0 && (r ? (e.pendingcb++, mr.nextTick((n, i) => {
      qi(i) ? bs(n, i) : i.pendingcb--;
    }, t, e)) : qi(e) && (e.pendingcb++, bs(t, e))));
  }
  function bs(t, e) {
    e.pendingcb--, e.finished = true;
    let r = e[Vr].splice(0);
    for (let n = 0; n < r.length; n++) r[n]();
    if (t.emit("finish"), e.autoDestroy) {
      let n = t._readableState;
      (!n || n.autoDestroy && (n.endEmitted || n.readable === false)) && t.destroy();
    }
  }
  dw(Ie.prototype, { closed: { __proto__: null, get() {
    return this._writableState ? this._writableState.closed : false;
  } }, destroyed: { __proto__: null, get() {
    return this._writableState ? this._writableState.destroyed : false;
  }, set(t) {
    this._writableState && (this._writableState.destroyed = t);
  } }, writable: { __proto__: null, get() {
    let t = this._writableState;
    return !!t && t.writable !== false && !t.destroyed && !t.errored && !t.ending && !t.ended;
  }, set(t) {
    this._writableState && (this._writableState.writable = !!t);
  } }, writableFinished: { __proto__: null, get() {
    return this._writableState ? this._writableState.finished : false;
  } }, writableObjectMode: { __proto__: null, get() {
    return this._writableState ? this._writableState.objectMode : false;
  } }, writableBuffer: { __proto__: null, get() {
    return this._writableState && this._writableState.getBuffer();
  } }, writableEnded: { __proto__: null, get() {
    return this._writableState ? this._writableState.ending : false;
  } }, writableNeedDrain: { __proto__: null, get() {
    let t = this._writableState;
    return t ? !t.destroyed && !t.ending && t.needDrain : false;
  } }, writableHighWaterMark: { __proto__: null, get() {
    return this._writableState && this._writableState.highWaterMark;
  } }, writableCorked: { __proto__: null, get() {
    return this._writableState ? this._writableState.corked : 0;
  } }, writableLength: { __proto__: null, get() {
    return this._writableState && this._writableState.length;
  } }, errored: { __proto__: null, enumerable: false, get() {
    return this._writableState ? this._writableState.errored : null;
  } }, writableAborted: { __proto__: null, enumerable: false, get: function() {
    return !!(this._writableState.writable !== false && (this._writableState.destroyed || this._writableState.errored) && !this._writableState.finished);
  } } });
  var kw = Ui.destroy;
  Ie.prototype.destroy = function(t, e) {
    let r = this._writableState;
    return !r.destroyed && (r.bufferedIndex < r.buffered.length || r[Vr].length) && mr.nextTick(_s, r), kw.call(this, t, e), this;
  };
  Ie.prototype._undestroy = Ui.undestroy;
  Ie.prototype._destroy = function(t, e) {
    e(t);
  };
  Ie.prototype[yw.captureRejectionSymbol] = function(t) {
    this.destroy(t);
  };
  var ys;
  function xd() {
    return ys === void 0 && (ys = {}), ys;
  }
  Ie.fromWeb = function(t, e) {
    return xd().newStreamWritableFromWritableStream(t, e);
  };
  Ie.toWeb = function(t) {
    return xd().newWritableStreamFromStreamWritable(t);
  };
});
var $d = H((ZO, jd) => {
  x();
  P();
  T();
  var Ss = zt(), Cw = (ke(), _e(Le)), { isReadable: Mw, isWritable: Bw, isIterable: Pd, isNodeStream: Nw, isReadableNodeStream: Od, isWritableNodeStream: Rd, isDuplexNodeStream: Lw, isReadableStream: kd, isWritableStream: Cd } = gt(), Md = Pt(), { AbortError: Ud, codes: { ERR_INVALID_ARG_TYPE: qw, ERR_INVALID_RETURN_VALUE: Bd } } = Ue(), { destroyer: zr } = gr(), Dw = mt(), Fd = _n(), Uw = Fi(), { createDeferredPromise: Nd } = We(), Ld = as(), qd = globalThis.Blob || Cw.Blob, Fw = typeof qd < "u" ? function(e) {
    return e instanceof qd;
  } : function(e) {
    return false;
  }, jw = globalThis.AbortController || Nr().AbortController, { FunctionPrototypeCall: Dd } = Ee(), Kt = class extends Dw {
    constructor(e) {
      super(e), (e == null ? void 0 : e.readable) === false && (this._readableState.readable = false, this._readableState.ended = true, this._readableState.endEmitted = true), (e == null ? void 0 : e.writable) === false && (this._writableState.writable = false, this._writableState.ending = true, this._writableState.ended = true, this._writableState.finished = true);
    }
  };
  jd.exports = function t(e, r) {
    if (Lw(e)) return e;
    if (Od(e)) return Hr({ readable: e });
    if (Rd(e)) return Hr({ writable: e });
    if (Nw(e)) return Hr({ writable: false, readable: false });
    if (kd(e)) return Hr({ readable: Fd.fromWeb(e) });
    if (Cd(e)) return Hr({ writable: Uw.fromWeb(e) });
    if (typeof e == "function") {
      let { value: i, write: s, final: o, destroy: u } = $w(e);
      if (Pd(i)) return Ld(Kt, i, { objectMode: true, write: s, final: o, destroy: u });
      let c = i == null ? void 0 : i.then;
      if (typeof c == "function") {
        let f, d = Dd(c, i, (h) => {
          if (h != null) throw new Bd("nully", "body", h);
        }, (h) => {
          zr(f, h);
        });
        return f = new Kt({ objectMode: true, readable: false, write: s, final(h) {
          o(async () => {
            try {
              await d, Ss.nextTick(h, null);
            } catch (_) {
              Ss.nextTick(h, _);
            }
          });
        }, destroy: u });
      }
      throw new Bd("Iterable, AsyncIterable or AsyncFunction", r, i);
    }
    if (Fw(e)) return t(e.arrayBuffer());
    if (Pd(e)) return Ld(Kt, e, { objectMode: true, writable: false });
    if (kd(e == null ? void 0 : e.readable) && Cd(e == null ? void 0 : e.writable)) return Kt.fromWeb(e);
    if (typeof (e == null ? void 0 : e.writable) == "object" || typeof (e == null ? void 0 : e.readable) == "object") {
      let i = e != null && e.readable ? Od(e == null ? void 0 : e.readable) ? e == null ? void 0 : e.readable : t(e.readable) : void 0, s = e != null && e.writable ? Rd(e == null ? void 0 : e.writable) ? e == null ? void 0 : e.writable : t(e.writable) : void 0;
      return Hr({ readable: i, writable: s });
    }
    let n = e == null ? void 0 : e.then;
    if (typeof n == "function") {
      let i;
      return Dd(n, e, (s) => {
        s != null && i.push(s), i.push(null);
      }, (s) => {
        zr(i, s);
      }), i = new Kt({ objectMode: true, writable: false, read() {
      } });
    }
    throw new qw(r, ["Blob", "ReadableStream", "WritableStream", "Stream", "Iterable", "AsyncIterable", "Function", "{ readable, writable } pair", "Promise"], e);
  };
  function $w(t) {
    let { promise: e, resolve: r } = Nd(), n = new jw(), i = n.signal;
    return { value: t(async function* () {
      for (; ; ) {
        let o = e;
        e = null;
        let { chunk: u, done: c, cb: f } = await o;
        if (Ss.nextTick(f), c) return;
        if (i.aborted) throw new Ud(void 0, { cause: i.reason });
        ({ promise: e, resolve: r } = Nd()), yield u;
      }
    }(), { signal: i }), write(o, u, c) {
      let f = r;
      r = null, f({ chunk: o, done: false, cb: c });
    }, final(o) {
      let u = r;
      r = null, u({ done: true, cb: o });
    }, destroy(o, u) {
      n.abort(), u(o);
    } };
  }
  function Hr(t) {
    let e = t.readable && typeof t.readable.read != "function" ? Fd.wrap(t.readable) : t.readable, r = t.writable, n = !!Mw(e), i = !!Bw(r), s, o, u, c, f;
    function d(h) {
      let _ = c;
      c = null, _ ? _(h) : h && f.destroy(h);
    }
    return f = new Kt({ readableObjectMode: !!(e != null && e.readableObjectMode), writableObjectMode: !!(r != null && r.writableObjectMode), readable: n, writable: i }), i && (Md(r, (h) => {
      i = false, h && zr(e, h), d(h);
    }), f._write = function(h, _, y) {
      r.write(h, _) ? y() : s = y;
    }, f._final = function(h) {
      r.end(), o = h;
    }, r.on("drain", function() {
      if (s) {
        let h = s;
        s = null, h();
      }
    }), r.on("finish", function() {
      if (o) {
        let h = o;
        o = null, h();
      }
    })), n && (Md(e, (h) => {
      n = false, h && zr(e, h), d(h);
    }), e.on("readable", function() {
      if (u) {
        let h = u;
        u = null, h();
      }
    }), e.on("end", function() {
      f.push(null);
    }), f._read = function() {
      for (; ; ) {
        let h = e.read();
        if (h === null) {
          u = f._read;
          return;
        }
        if (!f.push(h)) return;
      }
    }), f._destroy = function(h, _) {
      !h && c !== null && (h = new Ud()), u = null, s = null, o = null, c === null ? _(h) : (c = _, zr(r, h), zr(e, h));
    }, f;
  }
});
var mt = H((lR, Hd) => {
  "use strict";
  x();
  P();
  T();
  var { ObjectDefineProperties: Ww, ObjectGetOwnPropertyDescriptor: Ot, ObjectKeys: Vw, ObjectSetPrototypeOf: Wd } = Ee();
  Hd.exports = ut;
  var Is = _n(), et = Fi();
  Wd(ut.prototype, Is.prototype);
  Wd(ut, Is);
  {
    let t = Vw(et.prototype);
    for (let e = 0; e < t.length; e++) {
      let r = t[e];
      ut.prototype[r] || (ut.prototype[r] = et.prototype[r]);
    }
  }
  function ut(t) {
    if (!(this instanceof ut)) return new ut(t);
    Is.call(this, t), et.call(this, t), t ? (this.allowHalfOpen = t.allowHalfOpen !== false, t.readable === false && (this._readableState.readable = false, this._readableState.ended = true, this._readableState.endEmitted = true), t.writable === false && (this._writableState.writable = false, this._writableState.ending = true, this._writableState.ended = true, this._writableState.finished = true)) : this.allowHalfOpen = true;
  }
  Ww(ut.prototype, { writable: { __proto__: null, ...Ot(et.prototype, "writable") }, writableHighWaterMark: { __proto__: null, ...Ot(et.prototype, "writableHighWaterMark") }, writableObjectMode: { __proto__: null, ...Ot(et.prototype, "writableObjectMode") }, writableBuffer: { __proto__: null, ...Ot(et.prototype, "writableBuffer") }, writableLength: { __proto__: null, ...Ot(et.prototype, "writableLength") }, writableFinished: { __proto__: null, ...Ot(et.prototype, "writableFinished") }, writableCorked: { __proto__: null, ...Ot(et.prototype, "writableCorked") }, writableEnded: { __proto__: null, ...Ot(et.prototype, "writableEnded") }, writableNeedDrain: { __proto__: null, ...Ot(et.prototype, "writableNeedDrain") }, destroyed: { __proto__: null, get() {
    return this._readableState === void 0 || this._writableState === void 0 ? false : this._readableState.destroyed && this._writableState.destroyed;
  }, set(t) {
    this._readableState && this._writableState && (this._readableState.destroyed = t, this._writableState.destroyed = t);
  } } });
  var Es;
  function Vd() {
    return Es === void 0 && (Es = {}), Es;
  }
  ut.fromWeb = function(t, e) {
    return Vd().newStreamDuplexFromReadableWritablePair(t, e);
  };
  ut.toWeb = function(t) {
    return Vd().newReadableWritablePairFromDuplex(t);
  };
  var As;
  ut.from = function(t) {
    return As || (As = $d()), As(t, "body");
  };
});
var Ps = H((_R, Gd) => {
  "use strict";
  x();
  P();
  T();
  var { ObjectSetPrototypeOf: zd, Symbol: Hw } = Ee();
  Gd.exports = Rt;
  var { ERR_METHOD_NOT_IMPLEMENTED: zw } = Ue().codes, Ts = mt(), { getHighWaterMark: Gw } = yn();
  zd(Rt.prototype, Ts.prototype);
  zd(Rt, Ts);
  var En = Hw("kCallback");
  function Rt(t) {
    if (!(this instanceof Rt)) return new Rt(t);
    let e = t ? Gw(this, t, "readableHighWaterMark", true) : null;
    e === 0 && (t = { ...t, highWaterMark: null, readableHighWaterMark: e, writableHighWaterMark: t.writableHighWaterMark || 0 }), Ts.call(this, t), this._readableState.sync = false, this[En] = null, t && (typeof t.transform == "function" && (this._transform = t.transform), typeof t.flush == "function" && (this._flush = t.flush)), this.on("prefinish", Qw);
  }
  function xs(t) {
    typeof this._flush == "function" && !this.destroyed ? this._flush((e, r) => {
      if (e) {
        t ? t(e) : this.destroy(e);
        return;
      }
      r != null && this.push(r), this.push(null), t && t();
    }) : (this.push(null), t && t());
  }
  function Qw() {
    this._final !== xs && xs.call(this);
  }
  Rt.prototype._final = xs;
  Rt.prototype._transform = function(t, e, r) {
    throw new zw("_transform()");
  };
  Rt.prototype._write = function(t, e, r) {
    let n = this._readableState, i = this._writableState, s = n.length;
    this._transform(t, e, (o, u) => {
      if (o) {
        r(o);
        return;
      }
      u != null && this.push(u), i.ended || s === n.length || n.length < n.highWaterMark ? r() : this[En] = r;
    });
  };
  Rt.prototype._read = function() {
    if (this[En]) {
      let t = this[En];
      this[En] = null, t();
    }
  };
});
var Rs = H((OR, Kd) => {
  "use strict";
  x();
  P();
  T();
  var { ObjectSetPrototypeOf: Qd } = Ee();
  Kd.exports = Gr;
  var Os = Ps();
  Qd(Gr.prototype, Os.prototype);
  Qd(Gr, Os);
  function Gr(t) {
    if (!(this instanceof Gr)) return new Gr(t);
    Os.call(this, t);
  }
  Gr.prototype._transform = function(t, e, r) {
    r(null, t);
  };
});
var Vi = H((UR, eh) => {
  x();
  P();
  T();
  var An = zt(), { ArrayIsArray: Kw, Promise: Yw, SymbolAsyncIterator: Jw, SymbolDispose: Xw } = Ee(), Wi = Pt(), { once: Zw } = We(), ev = gr(), Yd = mt(), { aggregateTwoErrors: tv, codes: { ERR_INVALID_ARG_TYPE: Us, ERR_INVALID_RETURN_VALUE: ks, ERR_MISSING_ARGS: rv, ERR_STREAM_DESTROYED: nv, ERR_STREAM_PREMATURE_CLOSE: iv }, AbortError: ov } = Ue(), { validateFunction: sv, validateAbortSignal: av } = qr(), { isIterable: _r, isReadable: Cs, isReadableNodeStream: $i, isNodeStream: Jd, isTransformStream: Qr, isWebStream: uv, isReadableStream: Ms, isReadableFinished: lv } = gt(), cv = globalThis.AbortController || Nr().AbortController, Bs, Ns, Ls;
  function Xd(t, e, r) {
    let n = false;
    t.on("close", () => {
      n = true;
    });
    let i = Wi(t, { readable: e, writable: r }, (s) => {
      n = !s;
    });
    return { destroy: (s) => {
      n || (n = true, ev.destroyer(t, s || new nv("pipe")));
    }, cleanup: i };
  }
  function fv(t) {
    return sv(t[t.length - 1], "streams[stream.length - 1]"), t.pop();
  }
  function qs(t) {
    if (_r(t)) return t;
    if ($i(t)) return dv(t);
    throw new Us("val", ["Readable", "Iterable", "AsyncIterable"], t);
  }
  async function* dv(t) {
    Ns || (Ns = _n()), yield* Ns.prototype[Jw].call(t);
  }
  async function ji(t, e, r, { end: n }) {
    let i, s = null, o = (f) => {
      if (f && (i = f), s) {
        let d = s;
        s = null, d();
      }
    }, u = () => new Yw((f, d) => {
      i ? d(i) : s = () => {
        i ? d(i) : f();
      };
    });
    e.on("drain", o);
    let c = Wi(e, { readable: false }, o);
    try {
      e.writableNeedDrain && await u();
      for await (let f of t) e.write(f) || await u();
      n && (e.end(), await u()), r();
    } catch (f) {
      r(i !== f ? tv(i, f) : f);
    } finally {
      c(), e.off("drain", o);
    }
  }
  async function Ds(t, e, r, { end: n }) {
    Qr(e) && (e = e.writable);
    let i = e.getWriter();
    try {
      for await (let s of t) await i.ready, i.write(s).catch(() => {
      });
      await i.ready, n && await i.close(), r();
    } catch (s) {
      try {
        await i.abort(s), r(s);
      } catch (o) {
        r(o);
      }
    }
  }
  function hv(...t) {
    return Zd(t, Zw(fv(t)));
  }
  function Zd(t, e, r) {
    if (t.length === 1 && Kw(t[0]) && (t = t[0]), t.length < 2) throw new rv("streams");
    let n = new cv(), i = n.signal, s = r == null ? void 0 : r.signal, o = [];
    av(s, "options.signal");
    function u() {
      I(new ov());
    }
    Ls = Ls || We().addAbortListener;
    let c;
    s && (c = Ls(s, u));
    let f, d, h = [], _ = 0;
    function y(R) {
      I(R, --_ === 0);
    }
    function I(R, A) {
      var g;
      if (R && (!f || f.code === "ERR_STREAM_PREMATURE_CLOSE") && (f = R), !(!f && !A)) {
        for (; h.length; ) h.shift()(f);
        (g = c) === null || g === void 0 || g[Xw](), n.abort(), A && (f || o.forEach((O) => O()), An.nextTick(e, f, d));
      }
    }
    let S;
    for (let R = 0; R < t.length; R++) {
      let A = t[R], g = R < t.length - 1, O = R > 0, v = g || (r == null ? void 0 : r.end) !== false, B = R === t.length - 1;
      if (Jd(A)) {
        let D = function(L) {
          L && L.name !== "AbortError" && L.code !== "ERR_STREAM_PREMATURE_CLOSE" && y(L);
        };
        var w = D;
        if (v) {
          let { destroy: L, cleanup: K } = Xd(A, g, O);
          h.push(L), Cs(A) && B && o.push(K);
        }
        A.on("error", D), Cs(A) && B && o.push(() => {
          A.removeListener("error", D);
        });
      }
      if (R === 0) if (typeof A == "function") {
        if (S = A({ signal: i }), !_r(S)) throw new ks("Iterable, AsyncIterable or Stream", "source", S);
      } else _r(A) || $i(A) || Qr(A) ? S = A : S = Yd.from(A);
      else if (typeof A == "function") {
        if (Qr(S)) {
          var b;
          S = qs((b = S) === null || b === void 0 ? void 0 : b.readable);
        } else S = qs(S);
        if (S = A(S, { signal: i }), g) {
          if (!_r(S, true)) throw new ks("AsyncIterable", `transform[${R - 1}]`, S);
        } else {
          var m;
          Bs || (Bs = Rs());
          let D = new Bs({ objectMode: true }), L = (m = S) === null || m === void 0 ? void 0 : m.then;
          if (typeof L == "function") _++, L.call(S, ($) => {
            d = $, $ != null && D.write($), v && D.end(), An.nextTick(y);
          }, ($) => {
            D.destroy($), An.nextTick(y, $);
          });
          else if (_r(S, true)) _++, ji(S, D, y, { end: v });
          else if (Ms(S) || Qr(S)) {
            let $ = S.readable || S;
            _++, ji($, D, y, { end: v });
          } else throw new ks("AsyncIterable or Promise", "destination", S);
          S = D;
          let { destroy: K, cleanup: U } = Xd(S, false, true);
          h.push(K), B && o.push(U);
        }
      } else if (Jd(A)) {
        if ($i(S)) {
          _ += 2;
          let D = pv(S, A, y, { end: v });
          Cs(A) && B && o.push(D);
        } else if (Qr(S) || Ms(S)) {
          let D = S.readable || S;
          _++, ji(D, A, y, { end: v });
        } else if (_r(S)) _++, ji(S, A, y, { end: v });
        else throw new Us("val", ["Readable", "Iterable", "AsyncIterable", "ReadableStream", "TransformStream"], S);
        S = A;
      } else if (uv(A)) {
        if ($i(S)) _++, Ds(qs(S), A, y, { end: v });
        else if (Ms(S) || _r(S)) _++, Ds(S, A, y, { end: v });
        else if (Qr(S)) _++, Ds(S.readable, A, y, { end: v });
        else throw new Us("val", ["Readable", "Iterable", "AsyncIterable", "ReadableStream", "TransformStream"], S);
        S = A;
      } else S = Yd.from(A);
    }
    return (i != null && i.aborted || s != null && s.aborted) && An.nextTick(u), S;
  }
  function pv(t, e, r, { end: n }) {
    let i = false;
    if (e.on("close", () => {
      i || r(new iv());
    }), t.pipe(e, { end: false }), n) {
      let o = function() {
        i = true, e.end();
      };
      var s = o;
      lv(t) ? An.nextTick(o) : t.once("end", o);
    } else r();
    return Wi(t, { readable: true, writable: false }, (o) => {
      let u = t._readableState;
      o && o.code === "ERR_STREAM_PREMATURE_CLOSE" && u && u.ended && !u.errored && !u.errorEmitted ? t.once("end", r).once("error", r) : r(o);
    }), Wi(e, { readable: false, writable: true }, r);
  }
  eh.exports = { pipelineImpl: Zd, pipeline: hv };
});
var js = H((KR, sh) => {
  "use strict";
  x();
  P();
  T();
  var { pipeline: gv } = Vi(), Hi = mt(), { destroyer: yv } = gr(), { isNodeStream: zi, isReadable: th, isWritable: rh, isWebStream: Fs, isTransformStream: wr, isWritableStream: nh, isReadableStream: ih } = gt(), { AbortError: bv, codes: { ERR_INVALID_ARG_VALUE: oh, ERR_MISSING_ARGS: mv } } = Ue(), _v = Pt();
  sh.exports = function(...e) {
    if (e.length === 0) throw new mv("streams");
    if (e.length === 1) return Hi.from(e[0]);
    let r = [...e];
    if (typeof e[0] == "function" && (e[0] = Hi.from(e[0])), typeof e[e.length - 1] == "function") {
      let y = e.length - 1;
      e[y] = Hi.from(e[y]);
    }
    for (let y = 0; y < e.length; ++y) if (!(!zi(e[y]) && !Fs(e[y]))) {
      if (y < e.length - 1 && !(th(e[y]) || ih(e[y]) || wr(e[y]))) throw new oh(`streams[${y}]`, r[y], "must be readable");
      if (y > 0 && !(rh(e[y]) || nh(e[y]) || wr(e[y]))) throw new oh(`streams[${y}]`, r[y], "must be writable");
    }
    let n, i, s, o, u;
    function c(y) {
      let I = o;
      o = null, I ? I(y) : y ? u.destroy(y) : !_ && !h && u.destroy();
    }
    let f = e[0], d = gv(e, c), h = !!(rh(f) || nh(f) || wr(f)), _ = !!(th(d) || ih(d) || wr(d));
    if (u = new Hi({ writableObjectMode: !!(f != null && f.writableObjectMode), readableObjectMode: !!(d != null && d.readableObjectMode), writable: h, readable: _ }), h) {
      if (zi(f)) u._write = function(I, S, b) {
        f.write(I, S) ? b() : n = b;
      }, u._final = function(I) {
        f.end(), i = I;
      }, f.on("drain", function() {
        if (n) {
          let I = n;
          n = null, I();
        }
      });
      else if (Fs(f)) {
        let S = (wr(f) ? f.writable : f).getWriter();
        u._write = async function(b, m, w) {
          try {
            await S.ready, S.write(b).catch(() => {
            }), w();
          } catch (R) {
            w(R);
          }
        }, u._final = async function(b) {
          try {
            await S.ready, S.close().catch(() => {
            }), i = b;
          } catch (m) {
            b(m);
          }
        };
      }
      let y = wr(d) ? d.readable : d;
      _v(y, () => {
        if (i) {
          let I = i;
          i = null, I();
        }
      });
    }
    if (_) {
      if (zi(d)) d.on("readable", function() {
        if (s) {
          let y = s;
          s = null, y();
        }
      }), d.on("end", function() {
        u.push(null);
      }), u._read = function() {
        for (; ; ) {
          let y = d.read();
          if (y === null) {
            s = u._read;
            return;
          }
          if (!u.push(y)) return;
        }
      };
      else if (Fs(d)) {
        let I = (wr(d) ? d.readable : d).getReader();
        u._read = async function() {
          for (; ; ) try {
            let { value: S, done: b } = await I.read();
            if (!u.push(S)) return;
            if (b) {
              u.push(null);
              return;
            }
          } catch {
            return;
          }
        };
      }
    }
    return u._destroy = function(y, I) {
      !y && o !== null && (y = new bv()), s = null, n = null, i = null, o === null ? I(y) : (o = I, zi(d) && yv(d, y));
    }, u;
  };
});
var yh = H((ok, Vs) => {
  "use strict";
  x();
  P();
  T();
  var wv = globalThis.AbortController || Nr().AbortController, { codes: { ERR_INVALID_ARG_VALUE: vv, ERR_INVALID_ARG_TYPE: In, ERR_MISSING_ARGS: Sv, ERR_OUT_OF_RANGE: Ev }, AbortError: _t } = Ue(), { validateAbortSignal: vr, validateInteger: ah, validateObject: Sr } = qr(), Av = Ee().Symbol("kWeak"), Iv = Ee().Symbol("kResistStopPropagation"), { finished: xv } = Pt(), Tv = js(), { addAbortSignalNoValidate: Pv } = gn(), { isWritable: Ov, isNodeStream: Rv } = gt(), { deprecate: kv } = We(), { ArrayPrototypePush: Cv, Boolean: Mv, MathFloor: uh, Number: Bv, NumberIsNaN: Nv, Promise: lh, PromiseReject: ch, PromiseResolve: Lv, PromisePrototypeThen: fh, Symbol: hh } = Ee(), Gi = hh("kEmpty"), dh = hh("kEof");
  function qv(t, e) {
    if (e != null && Sr(e, "options"), (e == null ? void 0 : e.signal) != null && vr(e.signal, "options.signal"), Rv(t) && !Ov(t)) throw new vv("stream", t, "must be writable");
    let r = Tv(this, t);
    return e != null && e.signal && Pv(e.signal, r), r;
  }
  function Qi(t, e) {
    if (typeof t != "function") throw new In("fn", ["Function", "AsyncFunction"], t);
    e != null && Sr(e, "options"), (e == null ? void 0 : e.signal) != null && vr(e.signal, "options.signal");
    let r = 1;
    (e == null ? void 0 : e.concurrency) != null && (r = uh(e.concurrency));
    let n = r - 1;
    return (e == null ? void 0 : e.highWaterMark) != null && (n = uh(e.highWaterMark)), ah(r, "options.concurrency", 1), ah(n, "options.highWaterMark", 0), n += r, (async function* () {
      let s = We().AbortSignalAny([e == null ? void 0 : e.signal].filter(Mv)), o = this, u = [], c = { signal: s }, f, d, h = false, _ = 0;
      function y() {
        h = true, I();
      }
      function I() {
        _ -= 1, S();
      }
      function S() {
        d && !h && _ < r && u.length < n && (d(), d = null);
      }
      async function b() {
        try {
          for await (let m of o) {
            if (h) return;
            if (s.aborted) throw new _t();
            try {
              if (m = t(m, c), m === Gi) continue;
              m = Lv(m);
            } catch (w) {
              m = ch(w);
            }
            _ += 1, fh(m, I, y), u.push(m), f && (f(), f = null), !h && (u.length >= n || _ >= r) && await new lh((w) => {
              d = w;
            });
          }
          u.push(dh);
        } catch (m) {
          let w = ch(m);
          fh(w, I, y), u.push(w);
        } finally {
          h = true, f && (f(), f = null);
        }
      }
      b();
      try {
        for (; ; ) {
          for (; u.length > 0; ) {
            let m = await u[0];
            if (m === dh) return;
            if (s.aborted) throw new _t();
            m !== Gi && (yield m), u.shift(), S();
          }
          await new lh((m) => {
            f = m;
          });
        }
      } finally {
        h = true, d && (d(), d = null);
      }
    }).call(this);
  }
  function Dv(t = void 0) {
    return t != null && Sr(t, "options"), (t == null ? void 0 : t.signal) != null && vr(t.signal, "options.signal"), (async function* () {
      let r = 0;
      for await (let i of this) {
        var n;
        if (t != null && (n = t.signal) !== null && n !== void 0 && n.aborted) throw new _t({ cause: t.signal.reason });
        yield [r++, i];
      }
    }).call(this);
  }
  async function ph(t, e = void 0) {
    for await (let r of Ws.call(this, t, e)) return true;
    return false;
  }
  async function Uv(t, e = void 0) {
    if (typeof t != "function") throw new In("fn", ["Function", "AsyncFunction"], t);
    return !await ph.call(this, async (...r) => !await t(...r), e);
  }
  async function Fv(t, e) {
    for await (let r of Ws.call(this, t, e)) return r;
  }
  async function jv(t, e) {
    if (typeof t != "function") throw new In("fn", ["Function", "AsyncFunction"], t);
    async function r(n, i) {
      return await t(n, i), Gi;
    }
    for await (let n of Qi.call(this, r, e)) ;
  }
  function Ws(t, e) {
    if (typeof t != "function") throw new In("fn", ["Function", "AsyncFunction"], t);
    async function r(n, i) {
      return await t(n, i) ? n : Gi;
    }
    return Qi.call(this, r, e);
  }
  var $s = class extends Sv {
    constructor() {
      super("reduce"), this.message = "Reduce of an empty stream requires an initial value";
    }
  };
  async function $v(t, e, r) {
    var n;
    if (typeof t != "function") throw new In("reducer", ["Function", "AsyncFunction"], t);
    r != null && Sr(r, "options"), (r == null ? void 0 : r.signal) != null && vr(r.signal, "options.signal");
    let i = arguments.length > 1;
    if (r != null && (n = r.signal) !== null && n !== void 0 && n.aborted) {
      let f = new _t(void 0, { cause: r.signal.reason });
      throw this.once("error", () => {
      }), await xv(this.destroy(f)), f;
    }
    let s = new wv(), o = s.signal;
    if (r != null && r.signal) {
      let f = { once: true, [Av]: this, [Iv]: true };
      r.signal.addEventListener("abort", () => s.abort(), f);
    }
    let u = false;
    try {
      for await (let f of this) {
        var c;
        if (u = true, r != null && (c = r.signal) !== null && c !== void 0 && c.aborted) throw new _t();
        i ? e = await t(e, f, { signal: o }) : (e = f, i = true);
      }
      if (!u && !i) throw new $s();
    } finally {
      s.abort();
    }
    return e;
  }
  async function Wv(t) {
    t != null && Sr(t, "options"), (t == null ? void 0 : t.signal) != null && vr(t.signal, "options.signal");
    let e = [];
    for await (let n of this) {
      var r;
      if (t != null && (r = t.signal) !== null && r !== void 0 && r.aborted) throw new _t(void 0, { cause: t.signal.reason });
      Cv(e, n);
    }
    return e;
  }
  function Vv(t, e) {
    let r = Qi.call(this, t, e);
    return (async function* () {
      for await (let i of r) yield* i;
    }).call(this);
  }
  function gh(t) {
    if (t = Bv(t), Nv(t)) return 0;
    if (t < 0) throw new Ev("number", ">= 0", t);
    return t;
  }
  function Hv(t, e = void 0) {
    return e != null && Sr(e, "options"), (e == null ? void 0 : e.signal) != null && vr(e.signal, "options.signal"), t = gh(t), (async function* () {
      var n;
      if (e != null && (n = e.signal) !== null && n !== void 0 && n.aborted) throw new _t();
      for await (let s of this) {
        var i;
        if (e != null && (i = e.signal) !== null && i !== void 0 && i.aborted) throw new _t();
        t-- <= 0 && (yield s);
      }
    }).call(this);
  }
  function zv(t, e = void 0) {
    return e != null && Sr(e, "options"), (e == null ? void 0 : e.signal) != null && vr(e.signal, "options.signal"), t = gh(t), (async function* () {
      var n;
      if (e != null && (n = e.signal) !== null && n !== void 0 && n.aborted) throw new _t();
      for await (let s of this) {
        var i;
        if (e != null && (i = e.signal) !== null && i !== void 0 && i.aborted) throw new _t();
        if (t-- > 0 && (yield s), t <= 0) return;
      }
    }).call(this);
  }
  Vs.exports.streamReturningOperators = { asIndexedPairs: kv(Dv, "readable.asIndexedPairs will be removed in a future version."), drop: Hv, filter: Ws, flatMap: Vv, map: Qi, take: zv, compose: qv };
  Vs.exports.promiseReturningOperators = { every: Uv, forEach: jv, reduce: $v, toArray: Wv, some: ph, find: Fv };
});
var Hs = H((gk, bh) => {
  "use strict";
  x();
  P();
  T();
  var { ArrayPrototypePop: Gv, Promise: Qv } = Ee(), { isIterable: Kv, isNodeStream: Yv, isWebStream: Jv } = gt(), { pipelineImpl: Xv } = Vi(), { finished: Zv } = Pt();
  zs();
  function e0(...t) {
    return new Qv((e, r) => {
      let n, i, s = t[t.length - 1];
      if (s && typeof s == "object" && !Yv(s) && !Kv(s) && !Jv(s)) {
        let o = Gv(t);
        n = o.signal, i = o.end;
      }
      Xv(t, (o, u) => {
        o ? r(o) : e(u);
      }, { signal: n, end: i });
    });
  }
  bh.exports = { finished: Zv, pipeline: e0 };
});
var zs = H((Ik, xh) => {
  "use strict";
  x();
  P();
  T();
  var { Buffer: t0 } = (ke(), _e(Le)), { ObjectDefineProperty: kt, ObjectKeys: wh, ReflectApply: vh } = Ee(), { promisify: { custom: Sh } } = We(), { streamReturningOperators: mh, promiseReturningOperators: _h } = yh(), { codes: { ERR_ILLEGAL_CONSTRUCTOR: Eh } } = Ue(), r0 = js(), { setDefaultHighWaterMark: n0, getDefaultHighWaterMark: i0 } = yn(), { pipeline: Ah } = Vi(), { destroyer: o0 } = gr(), Ih = Pt(), Gs = Hs(), xn = gt(), Se = xh.exports = Ti().Stream;
  Se.isDestroyed = xn.isDestroyed;
  Se.isDisturbed = xn.isDisturbed;
  Se.isErrored = xn.isErrored;
  Se.isReadable = xn.isReadable;
  Se.isWritable = xn.isWritable;
  Se.Readable = _n();
  for (let t of wh(mh)) {
    let r = function(...n) {
      if (new.target) throw Eh();
      return Se.Readable.from(vh(e, this, n));
    }, e = mh[t];
    kt(r, "name", { __proto__: null, value: e.name }), kt(r, "length", { __proto__: null, value: e.length }), kt(Se.Readable.prototype, t, { __proto__: null, value: r, enumerable: false, configurable: true, writable: true });
  }
  for (let t of wh(_h)) {
    let r = function(...n) {
      if (new.target) throw Eh();
      return vh(e, this, n);
    }, e = _h[t];
    kt(r, "name", { __proto__: null, value: e.name }), kt(r, "length", { __proto__: null, value: e.length }), kt(Se.Readable.prototype, t, { __proto__: null, value: r, enumerable: false, configurable: true, writable: true });
  }
  Se.Writable = Fi();
  Se.Duplex = mt();
  Se.Transform = Ps();
  Se.PassThrough = Rs();
  Se.pipeline = Ah;
  var { addAbortSignal: s0 } = gn();
  Se.addAbortSignal = s0;
  Se.finished = Ih;
  Se.destroy = o0;
  Se.compose = r0;
  Se.setDefaultHighWaterMark = n0;
  Se.getDefaultHighWaterMark = i0;
  kt(Se, "promises", { __proto__: null, configurable: true, enumerable: true, get() {
    return Gs;
  } });
  kt(Ah, Sh, { __proto__: null, enumerable: true, get() {
    return Gs.pipeline;
  } });
  kt(Ih, Sh, { __proto__: null, enumerable: true, get() {
    return Gs.finished;
  } });
  Se.Stream = Se;
  Se._isUint8Array = function(e) {
    return e instanceof Uint8Array;
  };
  Se._uint8ArrayToBuffer = function(e) {
    return t0.from(e.buffer, e.byteOffset, e.byteLength);
  };
});
var Yt = H((Nk, Pe) => {
  "use strict";
  x();
  P();
  T();
  var Me = zs(), a0 = Hs(), u0 = Me.Readable.destroy;
  Pe.exports = Me.Readable;
  Pe.exports._uint8ArrayToBuffer = Me._uint8ArrayToBuffer;
  Pe.exports._isUint8Array = Me._isUint8Array;
  Pe.exports.isDisturbed = Me.isDisturbed;
  Pe.exports.isErrored = Me.isErrored;
  Pe.exports.isReadable = Me.isReadable;
  Pe.exports.Readable = Me.Readable;
  Pe.exports.Writable = Me.Writable;
  Pe.exports.Duplex = Me.Duplex;
  Pe.exports.Transform = Me.Transform;
  Pe.exports.PassThrough = Me.PassThrough;
  Pe.exports.addAbortSignal = Me.addAbortSignal;
  Pe.exports.finished = Me.finished;
  Pe.exports.destroy = Me.destroy;
  Pe.exports.destroy = u0;
  Pe.exports.pipeline = Me.pipeline;
  Pe.exports.compose = Me.compose;
  Object.defineProperty(Me, "promises", { configurable: true, enumerable: true, get() {
    return a0;
  } });
  Pe.exports.Stream = Me.Stream;
  Pe.exports.default = Pe.exports;
});
var Th = H((Hk, Qs) => {
  x();
  P();
  T();
  typeof Object.create == "function" ? Qs.exports = function(e, r) {
    r && (e.super_ = r, e.prototype = Object.create(r.prototype, { constructor: { value: e, enumerable: false, writable: true, configurable: true } }));
  } : Qs.exports = function(e, r) {
    if (r) {
      e.super_ = r;
      var n = function() {
      };
      n.prototype = r.prototype, e.prototype = new n(), e.prototype.constructor = e;
    }
  };
});
var Rh = H((tC, Oh) => {
  "use strict";
  x();
  P();
  T();
  var { Buffer: lt } = (ke(), _e(Le)), Ph = Symbol.for("BufferList");
  function me(t) {
    if (!(this instanceof me)) return new me(t);
    me._init.call(this, t);
  }
  me._init = function(e) {
    Object.defineProperty(this, Ph, { value: true }), this._bufs = [], this.length = 0, e && this.append(e);
  };
  me.prototype._new = function(e) {
    return new me(e);
  };
  me.prototype._offset = function(e) {
    if (e === 0) return [0, 0];
    let r = 0;
    for (let n = 0; n < this._bufs.length; n++) {
      let i = r + this._bufs[n].length;
      if (e < i || n === this._bufs.length - 1) return [n, e - r];
      r = i;
    }
  };
  me.prototype._reverseOffset = function(t) {
    let e = t[0], r = t[1];
    for (let n = 0; n < e; n++) r += this._bufs[n].length;
    return r;
  };
  me.prototype.getBuffers = function() {
    return this._bufs;
  };
  me.prototype.get = function(e) {
    if (e > this.length || e < 0) return;
    let r = this._offset(e);
    return this._bufs[r[0]][r[1]];
  };
  me.prototype.slice = function(e, r) {
    return typeof e == "number" && e < 0 && (e += this.length), typeof r == "number" && r < 0 && (r += this.length), this.copy(null, 0, e, r);
  };
  me.prototype.copy = function(e, r, n, i) {
    if ((typeof n != "number" || n < 0) && (n = 0), (typeof i != "number" || i > this.length) && (i = this.length), n >= this.length || i <= 0) return e || lt.alloc(0);
    let s = !!e, o = this._offset(n), u = i - n, c = u, f = s && r || 0, d = o[1];
    if (n === 0 && i === this.length) {
      if (!s) return this._bufs.length === 1 ? this._bufs[0] : lt.concat(this._bufs, this.length);
      for (let h = 0; h < this._bufs.length; h++) this._bufs[h].copy(e, f), f += this._bufs[h].length;
      return e;
    }
    if (c <= this._bufs[o[0]].length - d) return s ? this._bufs[o[0]].copy(e, r, d, d + c) : this._bufs[o[0]].slice(d, d + c);
    s || (e = lt.allocUnsafe(u));
    for (let h = o[0]; h < this._bufs.length; h++) {
      let _ = this._bufs[h].length - d;
      if (c > _) this._bufs[h].copy(e, f, d), f += _;
      else {
        this._bufs[h].copy(e, f, d, d + c), f += _;
        break;
      }
      c -= _, d && (d = 0);
    }
    return e.length > f ? e.slice(0, f) : e;
  };
  me.prototype.shallowSlice = function(e, r) {
    if (e = e || 0, r = typeof r != "number" ? this.length : r, e < 0 && (e += this.length), r < 0 && (r += this.length), e === r) return this._new();
    let n = this._offset(e), i = this._offset(r), s = this._bufs.slice(n[0], i[0] + 1);
    return i[1] === 0 ? s.pop() : s[s.length - 1] = s[s.length - 1].slice(0, i[1]), n[1] !== 0 && (s[0] = s[0].slice(n[1])), this._new(s);
  };
  me.prototype.toString = function(e, r, n) {
    return this.slice(r, n).toString(e);
  };
  me.prototype.consume = function(e) {
    if (e = Math.trunc(e), Number.isNaN(e) || e <= 0) return this;
    for (; this._bufs.length; ) if (e >= this._bufs[0].length) e -= this._bufs[0].length, this.length -= this._bufs[0].length, this._bufs.shift();
    else {
      this._bufs[0] = this._bufs[0].slice(e), this.length -= e;
      break;
    }
    return this;
  };
  me.prototype.duplicate = function() {
    let e = this._new();
    for (let r = 0; r < this._bufs.length; r++) e.append(this._bufs[r]);
    return e;
  };
  me.prototype.append = function(e) {
    return this._attach(e, me.prototype._appendBuffer);
  };
  me.prototype.prepend = function(e) {
    return this._attach(e, me.prototype._prependBuffer, true);
  };
  me.prototype._attach = function(e, r, n) {
    if (e == null) return this;
    if (e.buffer) r.call(this, lt.from(e.buffer, e.byteOffset, e.byteLength));
    else if (Array.isArray(e)) {
      let [i, s] = n ? [e.length - 1, -1] : [0, 1];
      for (let o = i; o >= 0 && o < e.length; o += s) this._attach(e[o], r, n);
    } else if (this._isBufferList(e)) {
      let [i, s] = n ? [e._bufs.length - 1, -1] : [0, 1];
      for (let o = i; o >= 0 && o < e._bufs.length; o += s) this._attach(e._bufs[o], r, n);
    } else typeof e == "number" && (e = e.toString()), r.call(this, lt.from(e));
    return this;
  };
  me.prototype._appendBuffer = function(e) {
    this._bufs.push(e), this.length += e.length;
  };
  me.prototype._prependBuffer = function(e) {
    this._bufs.unshift(e), this.length += e.length;
  };
  me.prototype.indexOf = function(t, e, r) {
    if (r === void 0 && typeof e == "string" && (r = e, e = void 0), typeof t == "function" || Array.isArray(t)) throw new TypeError('The "value" argument must be one of type string, Buffer, BufferList, or Uint8Array.');
    if (typeof t == "number" ? t = lt.from([t]) : typeof t == "string" ? t = lt.from(t, r) : this._isBufferList(t) ? t = t.slice() : Array.isArray(t.buffer) ? t = lt.from(t.buffer, t.byteOffset, t.byteLength) : lt.isBuffer(t) || (t = lt.from(t)), e = Number(e || 0), isNaN(e) && (e = 0), e < 0 && (e = this.length + e), e < 0 && (e = 0), t.length === 0) return e > this.length ? this.length : e;
    let n = this._offset(e), i = n[0], s = n[1];
    for (; i < this._bufs.length; i++) {
      let o = this._bufs[i];
      for (; s < o.length; ) if (o.length - s >= t.length) {
        let c = o.indexOf(t, s);
        if (c !== -1) return this._reverseOffset([i, c]);
        s = o.length - t.length + 1;
      } else {
        let c = this._reverseOffset([i, s]);
        if (this._match(c, t)) return c;
        s++;
      }
      s = 0;
    }
    return -1;
  };
  me.prototype._match = function(t, e) {
    if (this.length - t < e.length) return false;
    for (let r = 0; r < e.length; r++) if (this.get(t + r) !== e[r]) return false;
    return true;
  };
  (function() {
    let t = { readDoubleBE: 8, readDoubleLE: 8, readFloatBE: 4, readFloatLE: 4, readBigInt64BE: 8, readBigInt64LE: 8, readBigUInt64BE: 8, readBigUInt64LE: 8, readInt32BE: 4, readInt32LE: 4, readUInt32BE: 4, readUInt32LE: 4, readInt16BE: 2, readInt16LE: 2, readUInt16BE: 2, readUInt16LE: 2, readInt8: 1, readUInt8: 1, readIntBE: null, readIntLE: null, readUIntBE: null, readUIntLE: null };
    for (let e in t) (function(r) {
      t[r] === null ? me.prototype[r] = function(n, i) {
        return this.slice(n, n + i)[r](0, i);
      } : me.prototype[r] = function(n = 0) {
        return this.slice(n, n + t[r])[r](0);
      };
    })(e);
  })();
  me.prototype._isBufferList = function(e) {
    return e instanceof me || me.isBufferList(e);
  };
  me.isBufferList = function(e) {
    return e != null && e[Ph];
  };
  Oh.exports = me;
});
var kh = H((fC, Ki) => {
  "use strict";
  x();
  P();
  T();
  var Ks = Yt().Duplex, l0 = Th(), Tn = Rh();
  function je(t) {
    if (!(this instanceof je)) return new je(t);
    if (typeof t == "function") {
      this._callback = t;
      let e = (function(n) {
        this._callback && (this._callback(n), this._callback = null);
      }).bind(this);
      this.on("pipe", function(n) {
        n.on("error", e);
      }), this.on("unpipe", function(n) {
        n.removeListener("error", e);
      }), t = null;
    }
    Tn._init.call(this, t), Ks.call(this);
  }
  l0(je, Ks);
  Object.assign(je.prototype, Tn.prototype);
  je.prototype._new = function(e) {
    return new je(e);
  };
  je.prototype._write = function(e, r, n) {
    this._appendBuffer(e), typeof n == "function" && n();
  };
  je.prototype._read = function(e) {
    if (!this.length) return this.push(null);
    e = Math.min(e, this.length), this.push(this.slice(0, e)), this.consume(e);
  };
  je.prototype.end = function(e) {
    Ks.prototype.end.call(this, e), this._callback && (this._callback(null, this.slice()), this._callback = null);
  };
  je.prototype._destroy = function(e, r) {
    this._bufs.length = 0, this.length = 0, r(e);
  };
  je.prototype._isBufferList = function(e) {
    return e instanceof je || e instanceof Tn || je.isBufferList(e);
  };
  je.isBufferList = Tn.isBufferList;
  Ki.exports = je;
  Ki.exports.BufferListStream = je;
  Ki.exports.BufferList = Tn;
});
var Mh = H((vC, Ch) => {
  x();
  P();
  T();
  var Ys = class {
    constructor() {
      this.cmd = null, this.retain = false, this.qos = 0, this.dup = false, this.length = -1, this.topic = null, this.payload = null;
    }
  };
  Ch.exports = Ys;
});
var Js = H((kC, Bh) => {
  x();
  P();
  T();
  var Q = Bh.exports, { Buffer: Ge } = (ke(), _e(Le));
  Q.types = { 0: "reserved", 1: "connect", 2: "connack", 3: "publish", 4: "puback", 5: "pubrec", 6: "pubrel", 7: "pubcomp", 8: "subscribe", 9: "suback", 10: "unsubscribe", 11: "unsuback", 12: "pingreq", 13: "pingresp", 14: "disconnect", 15: "auth" };
  Q.requiredHeaderFlags = { 1: 0, 2: 0, 4: 0, 5: 0, 6: 2, 7: 0, 8: 2, 9: 0, 10: 2, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0 };
  Q.requiredHeaderFlagsErrors = {};
  for (let t in Q.requiredHeaderFlags) {
    let e = Q.requiredHeaderFlags[t];
    Q.requiredHeaderFlagsErrors[t] = "Invalid header flag bits, must be 0x" + e.toString(16) + " for " + Q.types[t] + " packet";
  }
  Q.codes = {};
  for (let t in Q.types) {
    let e = Q.types[t];
    Q.codes[e] = t;
  }
  Q.CMD_SHIFT = 4;
  Q.CMD_MASK = 240;
  Q.DUP_MASK = 8;
  Q.QOS_MASK = 3;
  Q.QOS_SHIFT = 1;
  Q.RETAIN_MASK = 1;
  Q.VARBYTEINT_MASK = 127;
  Q.VARBYTEINT_FIN_MASK = 128;
  Q.VARBYTEINT_MAX = 268435455;
  Q.SESSIONPRESENT_MASK = 1;
  Q.SESSIONPRESENT_HEADER = Ge.from([Q.SESSIONPRESENT_MASK]);
  Q.CONNACK_HEADER = Ge.from([Q.codes.connack << Q.CMD_SHIFT]);
  Q.USERNAME_MASK = 128;
  Q.PASSWORD_MASK = 64;
  Q.WILL_RETAIN_MASK = 32;
  Q.WILL_QOS_MASK = 24;
  Q.WILL_QOS_SHIFT = 3;
  Q.WILL_FLAG_MASK = 4;
  Q.CLEAN_SESSION_MASK = 2;
  Q.CONNECT_HEADER = Ge.from([Q.codes.connect << Q.CMD_SHIFT]);
  Q.properties = { sessionExpiryInterval: 17, willDelayInterval: 24, receiveMaximum: 33, maximumPacketSize: 39, topicAliasMaximum: 34, requestResponseInformation: 25, requestProblemInformation: 23, userProperties: 38, authenticationMethod: 21, authenticationData: 22, payloadFormatIndicator: 1, messageExpiryInterval: 2, contentType: 3, responseTopic: 8, correlationData: 9, maximumQoS: 36, retainAvailable: 37, assignedClientIdentifier: 18, reasonString: 31, wildcardSubscriptionAvailable: 40, subscriptionIdentifiersAvailable: 41, sharedSubscriptionAvailable: 42, serverKeepAlive: 19, responseInformation: 26, serverReference: 28, topicAlias: 35, subscriptionIdentifier: 11 };
  Q.propertiesCodes = {};
  for (let t in Q.properties) {
    let e = Q.properties[t];
    Q.propertiesCodes[e] = t;
  }
  Q.propertiesTypes = { sessionExpiryInterval: "int32", willDelayInterval: "int32", receiveMaximum: "int16", maximumPacketSize: "int32", topicAliasMaximum: "int16", requestResponseInformation: "byte", requestProblemInformation: "byte", userProperties: "pair", authenticationMethod: "string", authenticationData: "binary", payloadFormatIndicator: "byte", messageExpiryInterval: "int32", contentType: "string", responseTopic: "string", correlationData: "binary", maximumQoS: "int8", retainAvailable: "byte", assignedClientIdentifier: "string", reasonString: "string", wildcardSubscriptionAvailable: "byte", subscriptionIdentifiersAvailable: "byte", sharedSubscriptionAvailable: "byte", serverKeepAlive: "int16", responseInformation: "string", serverReference: "string", topicAlias: "int16", subscriptionIdentifier: "var" };
  function Jt(t) {
    return [0, 1, 2].map((e) => [0, 1].map((r) => [0, 1].map((n) => {
      let i = Ge.alloc(1);
      return i.writeUInt8(Q.codes[t] << Q.CMD_SHIFT | (r ? Q.DUP_MASK : 0) | e << Q.QOS_SHIFT | n, 0, true), i;
    })));
  }
  Q.PUBLISH_HEADER = Jt("publish");
  Q.SUBSCRIBE_HEADER = Jt("subscribe");
  Q.SUBSCRIBE_OPTIONS_QOS_MASK = 3;
  Q.SUBSCRIBE_OPTIONS_NL_MASK = 1;
  Q.SUBSCRIBE_OPTIONS_NL_SHIFT = 2;
  Q.SUBSCRIBE_OPTIONS_RAP_MASK = 1;
  Q.SUBSCRIBE_OPTIONS_RAP_SHIFT = 3;
  Q.SUBSCRIBE_OPTIONS_RH_MASK = 3;
  Q.SUBSCRIBE_OPTIONS_RH_SHIFT = 4;
  Q.SUBSCRIBE_OPTIONS_RH = [0, 16, 32];
  Q.SUBSCRIBE_OPTIONS_NL = 4;
  Q.SUBSCRIBE_OPTIONS_RAP = 8;
  Q.SUBSCRIBE_OPTIONS_QOS = [0, 1, 2];
  Q.UNSUBSCRIBE_HEADER = Jt("unsubscribe");
  Q.ACKS = { unsuback: Jt("unsuback"), puback: Jt("puback"), pubcomp: Jt("pubcomp"), pubrel: Jt("pubrel"), pubrec: Jt("pubrec") };
  Q.SUBACK_HEADER = Ge.from([Q.codes.suback << Q.CMD_SHIFT]);
  Q.VERSION3 = Ge.from([3]);
  Q.VERSION4 = Ge.from([4]);
  Q.VERSION5 = Ge.from([5]);
  Q.VERSION131 = Ge.from([131]);
  Q.VERSION132 = Ge.from([132]);
  Q.QOS = [0, 1, 2].map((t) => Ge.from([t]));
  Q.EMPTY = { pingreq: Ge.from([Q.codes.pingreq << 4, 0]), pingresp: Ge.from([Q.codes.pingresp << 4, 0]), disconnect: Ge.from([Q.codes.disconnect << 4, 0]) };
  Q.MQTT5_PUBACK_PUBREC_CODES = { 0: "Success", 16: "No matching subscribers", 128: "Unspecified error", 131: "Implementation specific error", 135: "Not authorized", 144: "Topic Name invalid", 145: "Packet identifier in use", 151: "Quota exceeded", 153: "Payload format invalid" };
  Q.MQTT5_PUBREL_PUBCOMP_CODES = { 0: "Success", 146: "Packet Identifier not found" };
  Q.MQTT5_SUBACK_CODES = { 0: "Granted QoS 0", 1: "Granted QoS 1", 2: "Granted QoS 2", 128: "Unspecified error", 131: "Implementation specific error", 135: "Not authorized", 143: "Topic Filter invalid", 145: "Packet Identifier in use", 151: "Quota exceeded", 158: "Shared Subscriptions not supported", 161: "Subscription Identifiers not supported", 162: "Wildcard Subscriptions not supported" };
  Q.MQTT5_UNSUBACK_CODES = { 0: "Success", 17: "No subscription existed", 128: "Unspecified error", 131: "Implementation specific error", 135: "Not authorized", 143: "Topic Filter invalid", 145: "Packet Identifier in use" };
  Q.MQTT5_DISCONNECT_CODES = { 0: "Normal disconnection", 4: "Disconnect with Will Message", 128: "Unspecified error", 129: "Malformed Packet", 130: "Protocol Error", 131: "Implementation specific error", 135: "Not authorized", 137: "Server busy", 139: "Server shutting down", 141: "Keep Alive timeout", 142: "Session taken over", 143: "Topic Filter invalid", 144: "Topic Name invalid", 147: "Receive Maximum exceeded", 148: "Topic Alias invalid", 149: "Packet too large", 150: "Message rate too high", 151: "Quota exceeded", 152: "Administrative action", 153: "Payload format invalid", 154: "Retain not supported", 155: "QoS not supported", 156: "Use another server", 157: "Server moved", 158: "Shared Subscriptions not supported", 159: "Connection rate exceeded", 160: "Maximum connect time", 161: "Subscription Identifiers not supported", 162: "Wildcard Subscriptions not supported" };
  Q.MQTT5_AUTH_CODES = { 0: "Success", 24: "Continue authentication", 25: "Re-authenticate" };
});
var Lh = H((jC, Nh) => {
  x();
  P();
  T();
  var Kr = 1e3, Yr = Kr * 60, Jr = Yr * 60, Er = Jr * 24, c0 = Er * 7, f0 = Er * 365.25;
  Nh.exports = function(t, e) {
    e = e || {};
    var r = typeof t;
    if (r === "string" && t.length > 0) return d0(t);
    if (r === "number" && isFinite(t)) return e.long ? p0(t) : h0(t);
    throw new Error("val is not a non-empty string or a valid number. val=" + JSON.stringify(t));
  };
  function d0(t) {
    if (t = String(t), !(t.length > 100)) {
      var e = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(t);
      if (e) {
        var r = parseFloat(e[1]), n = (e[2] || "ms").toLowerCase();
        switch (n) {
          case "years":
          case "year":
          case "yrs":
          case "yr":
          case "y":
            return r * f0;
          case "weeks":
          case "week":
          case "w":
            return r * c0;
          case "days":
          case "day":
          case "d":
            return r * Er;
          case "hours":
          case "hour":
          case "hrs":
          case "hr":
          case "h":
            return r * Jr;
          case "minutes":
          case "minute":
          case "mins":
          case "min":
          case "m":
            return r * Yr;
          case "seconds":
          case "second":
          case "secs":
          case "sec":
          case "s":
            return r * Kr;
          case "milliseconds":
          case "millisecond":
          case "msecs":
          case "msec":
          case "ms":
            return r;
          default:
            return;
        }
      }
    }
  }
  function h0(t) {
    var e = Math.abs(t);
    return e >= Er ? Math.round(t / Er) + "d" : e >= Jr ? Math.round(t / Jr) + "h" : e >= Yr ? Math.round(t / Yr) + "m" : e >= Kr ? Math.round(t / Kr) + "s" : t + "ms";
  }
  function p0(t) {
    var e = Math.abs(t);
    return e >= Er ? Yi(t, e, Er, "day") : e >= Jr ? Yi(t, e, Jr, "hour") : e >= Yr ? Yi(t, e, Yr, "minute") : e >= Kr ? Yi(t, e, Kr, "second") : t + " ms";
  }
  function Yi(t, e, r, n) {
    var i = e >= r * 1.5;
    return Math.round(t / r) + " " + n + (i ? "s" : "");
  }
});
var Dh = H((JC, qh) => {
  x();
  P();
  T();
  function g0(t) {
    r.debug = r, r.default = r, r.coerce = c, r.disable = o, r.enable = i, r.enabled = u, r.humanize = Lh(), r.destroy = f, Object.keys(t).forEach((d) => {
      r[d] = t[d];
    }), r.names = [], r.skips = [], r.formatters = {};
    function e(d) {
      let h = 0;
      for (let _ = 0; _ < d.length; _++) h = (h << 5) - h + d.charCodeAt(_), h |= 0;
      return r.colors[Math.abs(h) % r.colors.length];
    }
    r.selectColor = e;
    function r(d) {
      let h, _ = null, y, I;
      function S(...b) {
        if (!S.enabled) return;
        let m = S, w = Number(/* @__PURE__ */ new Date()), R = w - (h || w);
        m.diff = R, m.prev = h, m.curr = w, h = w, b[0] = r.coerce(b[0]), typeof b[0] != "string" && b.unshift("%O");
        let A = 0;
        b[0] = b[0].replace(/%([a-zA-Z%])/g, (O, v) => {
          if (O === "%%") return "%";
          A++;
          let B = r.formatters[v];
          if (typeof B == "function") {
            let D = b[A];
            O = B.call(m, D), b.splice(A, 1), A--;
          }
          return O;
        }), r.formatArgs.call(m, b), (m.log || r.log).apply(m, b);
      }
      return S.namespace = d, S.useColors = r.useColors(), S.color = r.selectColor(d), S.extend = n, S.destroy = r.destroy, Object.defineProperty(S, "enabled", { enumerable: true, configurable: false, get: () => _ !== null ? _ : (y !== r.namespaces && (y = r.namespaces, I = r.enabled(d)), I), set: (b) => {
        _ = b;
      } }), typeof r.init == "function" && r.init(S), S;
    }
    function n(d, h) {
      let _ = r(this.namespace + (typeof h > "u" ? ":" : h) + d);
      return _.log = this.log, _;
    }
    function i(d) {
      r.save(d), r.namespaces = d, r.names = [], r.skips = [];
      let h = (typeof d == "string" ? d : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (let _ of h) _[0] === "-" ? r.skips.push(_.slice(1)) : r.names.push(_);
    }
    function s(d, h) {
      let _ = 0, y = 0, I = -1, S = 0;
      for (; _ < d.length; ) if (y < h.length && (h[y] === d[_] || h[y] === "*")) h[y] === "*" ? (I = y, S = _, y++) : (_++, y++);
      else if (I !== -1) y = I + 1, S++, _ = S;
      else return false;
      for (; y < h.length && h[y] === "*"; ) y++;
      return y === h.length;
    }
    function o() {
      let d = [...r.names, ...r.skips.map((h) => "-" + h)].join(",");
      return r.enable(""), d;
    }
    function u(d) {
      for (let h of r.skips) if (s(d, h)) return false;
      for (let h of r.names) if (s(d, h)) return true;
      return false;
    }
    function c(d) {
      return d instanceof Error ? d.stack || d.message : d;
    }
    function f() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    return r.enable(r.load()), r;
  }
  qh.exports = g0;
});
var Xt = H((Qe, Ji) => {
  x();
  P();
  T();
  Qe.formatArgs = b0;
  Qe.save = m0;
  Qe.load = _0;
  Qe.useColors = y0;
  Qe.storage = w0();
  Qe.destroy = /* @__PURE__ */ (() => {
    let t = false;
    return () => {
      t || (t = true, console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."));
    };
  })();
  Qe.colors = ["#0000CC", "#0000FF", "#0033CC", "#0033FF", "#0066CC", "#0066FF", "#0099CC", "#0099FF", "#00CC00", "#00CC33", "#00CC66", "#00CC99", "#00CCCC", "#00CCFF", "#3300CC", "#3300FF", "#3333CC", "#3333FF", "#3366CC", "#3366FF", "#3399CC", "#3399FF", "#33CC00", "#33CC33", "#33CC66", "#33CC99", "#33CCCC", "#33CCFF", "#6600CC", "#6600FF", "#6633CC", "#6633FF", "#66CC00", "#66CC33", "#9900CC", "#9900FF", "#9933CC", "#9933FF", "#99CC00", "#99CC33", "#CC0000", "#CC0033", "#CC0066", "#CC0099", "#CC00CC", "#CC00FF", "#CC3300", "#CC3333", "#CC3366", "#CC3399", "#CC33CC", "#CC33FF", "#CC6600", "#CC6633", "#CC9900", "#CC9933", "#CCCC00", "#CCCC33", "#FF0000", "#FF0033", "#FF0066", "#FF0099", "#FF00CC", "#FF00FF", "#FF3300", "#FF3333", "#FF3366", "#FF3399", "#FF33CC", "#FF33FF", "#FF6600", "#FF6633", "#FF9900", "#FF9933", "#FFCC00", "#FFCC33"];
  function y0() {
    if (typeof window < "u" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) return true;
    if (typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) return false;
    let t;
    return typeof document < "u" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || typeof window < "u" && window.console && (window.console.firebug || window.console.exception && window.console.table) || typeof navigator < "u" && navigator.userAgent && (t = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(t[1], 10) >= 31 || typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
  }
  function b0(t) {
    if (t[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + t[0] + (this.useColors ? "%c " : " ") + "+" + Ji.exports.humanize(this.diff), !this.useColors) return;
    let e = "color: " + this.color;
    t.splice(1, 0, e, "color: inherit");
    let r = 0, n = 0;
    t[0].replace(/%[a-zA-Z%]/g, (i) => {
      i !== "%%" && (r++, i === "%c" && (n = r));
    }), t.splice(n, 0, e);
  }
  Qe.log = console.debug || console.log || (() => {
  });
  function m0(t) {
    try {
      t ? Qe.storage.setItem("debug", t) : Qe.storage.removeItem("debug");
    } catch {
    }
  }
  function _0() {
    let t;
    try {
      t = Qe.storage.getItem("debug") || Qe.storage.getItem("DEBUG");
    } catch {
    }
    return !t && typeof q < "u" && "env" in q && (t = q.env.DEBUG), t;
  }
  function w0() {
    try {
      return localStorage;
    } catch {
    }
  }
  Ji.exports = Dh()(Qe);
  var { formatters: v0 } = Ji.exports;
  v0.j = function(t) {
    try {
      return JSON.stringify(t);
    } catch (e) {
      return "[UnexpectedJSONParseError]: " + e.message;
    }
  };
});
var jh = H((yM, Fh) => {
  x();
  P();
  T();
  var S0 = kh(), { EventEmitter: E0 } = (Ht(), _e(Vt)), Uh = Mh(), pe = Js(), ae = Xt()("mqtt-packet:parser"), Xs = class t extends E0 {
    constructor() {
      super(), this.parser = this.constructor.parser;
    }
    static parser(e) {
      return this instanceof t ? (this.settings = e || {}, this._states = ["_parseHeader", "_parseLength", "_parsePayload", "_newPacket"], this._resetState(), this) : new t().parser(e);
    }
    _resetState() {
      ae("_resetState: resetting packet, error, _list, and _stateCounter"), this.packet = new Uh(), this.error = null, this._list = S0(), this._stateCounter = 0;
    }
    parse(e) {
      for (this.error && this._resetState(), this._list.append(e), ae("parse: current state: %s", this._states[this._stateCounter]); (this.packet.length !== -1 || this._list.length > 0) && this[this._states[this._stateCounter]]() && !this.error; ) this._stateCounter++, ae("parse: state complete. _stateCounter is now: %d", this._stateCounter), ae("parse: packet.length: %d, buffer list length: %d", this.packet.length, this._list.length), this._stateCounter >= this._states.length && (this._stateCounter = 0);
      return ae("parse: exited while loop. packet: %d, buffer list length: %d", this.packet.length, this._list.length), this._list.length;
    }
    _parseHeader() {
      let e = this._list.readUInt8(0), r = e >> pe.CMD_SHIFT;
      this.packet.cmd = pe.types[r];
      let n = e & 15, i = pe.requiredHeaderFlags[r];
      return i != null && n !== i ? this._emitError(new Error(pe.requiredHeaderFlagsErrors[r])) : (this.packet.retain = (e & pe.RETAIN_MASK) !== 0, this.packet.qos = e >> pe.QOS_SHIFT & pe.QOS_MASK, this.packet.qos > 2 ? this._emitError(new Error("Packet must not have both QoS bits set to 1")) : (this.packet.dup = (e & pe.DUP_MASK) !== 0, ae("_parseHeader: packet: %o", this.packet), this._list.consume(1), true));
    }
    _parseLength() {
      let e = this._parseVarByteNum(true);
      return e && (this.packet.length = e.value, this._list.consume(e.bytes)), ae("_parseLength %d", e.value), !!e;
    }
    _parsePayload() {
      ae("_parsePayload: payload %O", this._list);
      let e = false;
      if (this.packet.length === 0 || this._list.length >= this.packet.length) {
        switch (this._pos = 0, this.packet.cmd) {
          case "connect":
            this._parseConnect();
            break;
          case "connack":
            this._parseConnack();
            break;
          case "publish":
            this._parsePublish();
            break;
          case "puback":
          case "pubrec":
          case "pubrel":
          case "pubcomp":
            this._parseConfirmation();
            break;
          case "subscribe":
            this._parseSubscribe();
            break;
          case "suback":
            this._parseSuback();
            break;
          case "unsubscribe":
            this._parseUnsubscribe();
            break;
          case "unsuback":
            this._parseUnsuback();
            break;
          case "pingreq":
          case "pingresp":
            break;
          case "disconnect":
            this._parseDisconnect();
            break;
          case "auth":
            this._parseAuth();
            break;
          default:
            this._emitError(new Error("Not supported"));
        }
        e = true;
      }
      return ae("_parsePayload complete result: %s", e), e;
    }
    _parseConnect() {
      ae("_parseConnect");
      let e, r, n, i, s = {}, o = this.packet, u = this._parseString();
      if (u === null) return this._emitError(new Error("Cannot parse protocolId"));
      if (u !== "MQTT" && u !== "MQIsdp") return this._emitError(new Error("Invalid protocolId"));
      if (o.protocolId = u, this._pos >= this._list.length) return this._emitError(new Error("Packet too short"));
      if (o.protocolVersion = this._list.readUInt8(this._pos), o.protocolVersion >= 128 && (o.bridgeMode = true, o.protocolVersion = o.protocolVersion - 128), o.protocolVersion !== 3 && o.protocolVersion !== 4 && o.protocolVersion !== 5) return this._emitError(new Error("Invalid protocol version"));
      if (this._pos++, this._pos >= this._list.length) return this._emitError(new Error("Packet too short"));
      if (this._list.readUInt8(this._pos) & 1) return this._emitError(new Error("Connect flag bit 0 must be 0, but got 1"));
      s.username = this._list.readUInt8(this._pos) & pe.USERNAME_MASK, s.password = this._list.readUInt8(this._pos) & pe.PASSWORD_MASK, s.will = this._list.readUInt8(this._pos) & pe.WILL_FLAG_MASK;
      let c = !!(this._list.readUInt8(this._pos) & pe.WILL_RETAIN_MASK), f = (this._list.readUInt8(this._pos) & pe.WILL_QOS_MASK) >> pe.WILL_QOS_SHIFT;
      if (s.will) o.will = {}, o.will.retain = c, o.will.qos = f;
      else {
        if (c) return this._emitError(new Error("Will Retain Flag must be set to zero when Will Flag is set to 0"));
        if (f) return this._emitError(new Error("Will QoS must be set to zero when Will Flag is set to 0"));
      }
      if (o.clean = (this._list.readUInt8(this._pos) & pe.CLEAN_SESSION_MASK) !== 0, this._pos++, o.keepalive = this._parseNum(), o.keepalive === -1) return this._emitError(new Error("Packet too short"));
      if (o.protocolVersion === 5) {
        let h = this._parseProperties();
        Object.getOwnPropertyNames(h).length && (o.properties = h);
      }
      let d = this._parseString();
      if (d === null) return this._emitError(new Error("Packet too short"));
      if (o.clientId = d, ae("_parseConnect: packet.clientId: %s", o.clientId), s.will) {
        if (o.protocolVersion === 5) {
          let h = this._parseProperties();
          Object.getOwnPropertyNames(h).length && (o.will.properties = h);
        }
        if (e = this._parseString(), e === null) return this._emitError(new Error("Cannot parse will topic"));
        if (o.will.topic = e, ae("_parseConnect: packet.will.topic: %s", o.will.topic), r = this._parseBuffer(), r === null) return this._emitError(new Error("Cannot parse will payload"));
        o.will.payload = r, ae("_parseConnect: packet.will.paylaod: %s", o.will.payload);
      }
      if (s.username) {
        if (i = this._parseString(), i === null) return this._emitError(new Error("Cannot parse username"));
        o.username = i, ae("_parseConnect: packet.username: %s", o.username);
      }
      if (s.password) {
        if (n = this._parseBuffer(), n === null) return this._emitError(new Error("Cannot parse password"));
        o.password = n;
      }
      return this.settings = o, ae("_parseConnect: complete"), o;
    }
    _parseConnack() {
      ae("_parseConnack");
      let e = this.packet;
      if (this._list.length < 1) return null;
      let r = this._list.readUInt8(this._pos++);
      if (r > 1) return this._emitError(new Error("Invalid connack flags, bits 7-1 must be set to 0"));
      if (e.sessionPresent = !!(r & pe.SESSIONPRESENT_MASK), this.settings.protocolVersion === 5) this._list.length >= 2 ? e.reasonCode = this._list.readUInt8(this._pos++) : e.reasonCode = 0;
      else {
        if (this._list.length < 2) return null;
        e.returnCode = this._list.readUInt8(this._pos++);
      }
      if (e.returnCode === -1 || e.reasonCode === -1) return this._emitError(new Error("Cannot parse return code"));
      if (this.settings.protocolVersion === 5) {
        let n = this._parseProperties();
        Object.getOwnPropertyNames(n).length && (e.properties = n);
      }
      ae("_parseConnack: complete");
    }
    _parsePublish() {
      ae("_parsePublish");
      let e = this.packet;
      if (e.topic = this._parseString(), e.topic === null) return this._emitError(new Error("Cannot parse topic"));
      if (!(e.qos > 0 && !this._parseMessageId())) {
        if (this.settings.protocolVersion === 5) {
          let r = this._parseProperties();
          Object.getOwnPropertyNames(r).length && (e.properties = r);
        }
        e.payload = this._list.slice(this._pos, e.length), ae("_parsePublish: payload from buffer list: %o", e.payload);
      }
    }
    _parseSubscribe() {
      ae("_parseSubscribe");
      let e = this.packet, r, n, i, s, o, u, c;
      if (e.subscriptions = [], !!this._parseMessageId()) {
        if (this.settings.protocolVersion === 5) {
          let f = this._parseProperties();
          Object.getOwnPropertyNames(f).length && (e.properties = f);
        }
        if (e.length <= 0) return this._emitError(new Error("Malformed subscribe, no payload specified"));
        for (; this._pos < e.length; ) {
          if (r = this._parseString(), r === null) return this._emitError(new Error("Cannot parse topic"));
          if (this._pos >= e.length) return this._emitError(new Error("Malformed Subscribe Payload"));
          if (n = this._parseByte(), this.settings.protocolVersion === 5) {
            if (n & 192) return this._emitError(new Error("Invalid subscribe topic flag bits, bits 7-6 must be 0"));
          } else if (n & 252) return this._emitError(new Error("Invalid subscribe topic flag bits, bits 7-2 must be 0"));
          if (i = n & pe.SUBSCRIBE_OPTIONS_QOS_MASK, i > 2) return this._emitError(new Error("Invalid subscribe QoS, must be <= 2"));
          if (u = (n >> pe.SUBSCRIBE_OPTIONS_NL_SHIFT & pe.SUBSCRIBE_OPTIONS_NL_MASK) !== 0, o = (n >> pe.SUBSCRIBE_OPTIONS_RAP_SHIFT & pe.SUBSCRIBE_OPTIONS_RAP_MASK) !== 0, s = n >> pe.SUBSCRIBE_OPTIONS_RH_SHIFT & pe.SUBSCRIBE_OPTIONS_RH_MASK, s > 2) return this._emitError(new Error("Invalid retain handling, must be <= 2"));
          c = { topic: r, qos: i }, this.settings.protocolVersion === 5 ? (c.nl = u, c.rap = o, c.rh = s) : this.settings.bridgeMode && (c.rh = 0, c.rap = true, c.nl = true), ae("_parseSubscribe: push subscription `%s` to subscription", c), e.subscriptions.push(c);
        }
      }
    }
    _parseSuback() {
      ae("_parseSuback");
      let e = this.packet;
      if (this.packet.granted = [], !!this._parseMessageId()) {
        if (this.settings.protocolVersion === 5) {
          let r = this._parseProperties();
          Object.getOwnPropertyNames(r).length && (e.properties = r);
        }
        if (e.length <= 0) return this._emitError(new Error("Malformed suback, no payload specified"));
        for (; this._pos < this.packet.length; ) {
          let r = this._list.readUInt8(this._pos++);
          if (this.settings.protocolVersion === 5) {
            if (!pe.MQTT5_SUBACK_CODES[r]) return this._emitError(new Error("Invalid suback code"));
          } else if (r > 2 && r !== 128) return this._emitError(new Error("Invalid suback QoS, must be 0, 1, 2 or 128"));
          this.packet.granted.push(r);
        }
      }
    }
    _parseUnsubscribe() {
      ae("_parseUnsubscribe");
      let e = this.packet;
      if (e.unsubscriptions = [], !!this._parseMessageId()) {
        if (this.settings.protocolVersion === 5) {
          let r = this._parseProperties();
          Object.getOwnPropertyNames(r).length && (e.properties = r);
        }
        if (e.length <= 0) return this._emitError(new Error("Malformed unsubscribe, no payload specified"));
        for (; this._pos < e.length; ) {
          let r = this._parseString();
          if (r === null) return this._emitError(new Error("Cannot parse topic"));
          ae("_parseUnsubscribe: push topic `%s` to unsubscriptions", r), e.unsubscriptions.push(r);
        }
      }
    }
    _parseUnsuback() {
      ae("_parseUnsuback");
      let e = this.packet;
      if (!this._parseMessageId()) return this._emitError(new Error("Cannot parse messageId"));
      if ((this.settings.protocolVersion === 3 || this.settings.protocolVersion === 4) && e.length !== 2) return this._emitError(new Error("Malformed unsuback, payload length must be 2"));
      if (e.length <= 0) return this._emitError(new Error("Malformed unsuback, no payload specified"));
      if (this.settings.protocolVersion === 5) {
        let r = this._parseProperties();
        for (Object.getOwnPropertyNames(r).length && (e.properties = r), e.granted = []; this._pos < this.packet.length; ) {
          let n = this._list.readUInt8(this._pos++);
          if (!pe.MQTT5_UNSUBACK_CODES[n]) return this._emitError(new Error("Invalid unsuback code"));
          this.packet.granted.push(n);
        }
      }
    }
    _parseConfirmation() {
      ae("_parseConfirmation: packet.cmd: `%s`", this.packet.cmd);
      let e = this.packet;
      if (this._parseMessageId(), this.settings.protocolVersion === 5) {
        if (e.length > 2) {
          switch (e.reasonCode = this._parseByte(), this.packet.cmd) {
            case "puback":
            case "pubrec":
              if (!pe.MQTT5_PUBACK_PUBREC_CODES[e.reasonCode]) return this._emitError(new Error("Invalid " + this.packet.cmd + " reason code"));
              break;
            case "pubrel":
            case "pubcomp":
              if (!pe.MQTT5_PUBREL_PUBCOMP_CODES[e.reasonCode]) return this._emitError(new Error("Invalid " + this.packet.cmd + " reason code"));
              break;
          }
          ae("_parseConfirmation: packet.reasonCode `%d`", e.reasonCode);
        } else e.reasonCode = 0;
        if (e.length > 3) {
          let r = this._parseProperties();
          Object.getOwnPropertyNames(r).length && (e.properties = r);
        }
      }
      return true;
    }
    _parseDisconnect() {
      let e = this.packet;
      if (ae("_parseDisconnect"), this.settings.protocolVersion === 5) {
        this._list.length > 0 ? (e.reasonCode = this._parseByte(), pe.MQTT5_DISCONNECT_CODES[e.reasonCode] || this._emitError(new Error("Invalid disconnect reason code"))) : e.reasonCode = 0;
        let r = this._parseProperties();
        Object.getOwnPropertyNames(r).length && (e.properties = r);
      }
      return ae("_parseDisconnect result: true"), true;
    }
    _parseAuth() {
      ae("_parseAuth");
      let e = this.packet;
      if (this.settings.protocolVersion !== 5) return this._emitError(new Error("Not supported auth packet for this version MQTT"));
      if (e.reasonCode = this._parseByte(), !pe.MQTT5_AUTH_CODES[e.reasonCode]) return this._emitError(new Error("Invalid auth reason code"));
      let r = this._parseProperties();
      return Object.getOwnPropertyNames(r).length && (e.properties = r), ae("_parseAuth: result: true"), true;
    }
    _parseMessageId() {
      let e = this.packet;
      return e.messageId = this._parseNum(), e.messageId === null ? (this._emitError(new Error("Cannot parse messageId")), false) : (ae("_parseMessageId: packet.messageId %d", e.messageId), true);
    }
    _parseString(e) {
      let r = this._parseNum(), n = r + this._pos;
      if (r === -1 || n > this._list.length || n > this.packet.length) return null;
      let i = this._list.toString("utf8", this._pos, n);
      return this._pos += r, ae("_parseString: result: %s", i), i;
    }
    _parseStringPair() {
      return ae("_parseStringPair"), { name: this._parseString(), value: this._parseString() };
    }
    _parseBuffer() {
      let e = this._parseNum(), r = e + this._pos;
      if (e === -1 || r > this._list.length || r > this.packet.length) return null;
      let n = this._list.slice(this._pos, r);
      return this._pos += e, ae("_parseBuffer: result: %o", n), n;
    }
    _parseNum() {
      if (this._list.length - this._pos < 2) return -1;
      let e = this._list.readUInt16BE(this._pos);
      return this._pos += 2, ae("_parseNum: result: %s", e), e;
    }
    _parse4ByteNum() {
      if (this._list.length - this._pos < 4) return -1;
      let e = this._list.readUInt32BE(this._pos);
      return this._pos += 4, ae("_parse4ByteNum: result: %s", e), e;
    }
    _parseVarByteNum(e) {
      ae("_parseVarByteNum");
      let r = 4, n = 0, i = 1, s = 0, o = false, u, c = this._pos ? this._pos : 0;
      for (; n < r && c + n < this._list.length; ) {
        if (u = this._list.readUInt8(c + n++), s += i * (u & pe.VARBYTEINT_MASK), i *= 128, (u & pe.VARBYTEINT_FIN_MASK) === 0) {
          o = true;
          break;
        }
        if (this._list.length <= n) break;
      }
      return !o && n === r && this._list.length >= n && this._emitError(new Error("Invalid variable byte integer")), c && (this._pos += n), o ? e ? o = { bytes: n, value: s } : o = s : o = false, ae("_parseVarByteNum: result: %o", o), o;
    }
    _parseByte() {
      let e;
      return this._pos < this._list.length && (e = this._list.readUInt8(this._pos), this._pos++), ae("_parseByte: result: %o", e), e;
    }
    _parseByType(e) {
      switch (ae("_parseByType: type: %s", e), e) {
        case "byte":
          return this._parseByte() !== 0;
        case "int8":
          return this._parseByte();
        case "int16":
          return this._parseNum();
        case "int32":
          return this._parse4ByteNum();
        case "var":
          return this._parseVarByteNum();
        case "string":
          return this._parseString();
        case "pair":
          return this._parseStringPair();
        case "binary":
          return this._parseBuffer();
      }
    }
    _parseProperties() {
      ae("_parseProperties");
      let e = this._parseVarByteNum(), n = this._pos + e, i = {};
      for (; this._pos < n; ) {
        let s = this._parseByte();
        if (!s) return this._emitError(new Error("Cannot parse property code type")), false;
        let o = pe.propertiesCodes[s];
        if (!o) return this._emitError(new Error("Unknown property")), false;
        if (o === "userProperties") {
          i[o] || (i[o] = /* @__PURE__ */ Object.create(null));
          let u = this._parseByType(pe.propertiesTypes[o]);
          if (i[o][u.name]) if (Array.isArray(i[o][u.name])) i[o][u.name].push(u.value);
          else {
            let c = i[o][u.name];
            i[o][u.name] = [c], i[o][u.name].push(u.value);
          }
          else i[o][u.name] = u.value;
          continue;
        }
        i[o] ? Array.isArray(i[o]) ? i[o].push(this._parseByType(pe.propertiesTypes[o])) : (i[o] = [i[o]], i[o].push(this._parseByType(pe.propertiesTypes[o]))) : i[o] = this._parseByType(pe.propertiesTypes[o]);
      }
      return i;
    }
    _newPacket() {
      return ae("_newPacket"), this.packet && (this._list.consume(this.packet.length), ae("_newPacket: parser emit packet: packet.cmd: %s, packet.payload: %s, packet.length: %d", this.packet.cmd, this.packet.payload, this.packet.length), this.emit("packet", this.packet)), ae("_newPacket: new packet"), this.packet = new Uh(), this._pos = 0, true;
    }
    _emitError(e) {
      ae("_emitError", e), this.error = e, this.emit("error", e);
    }
  };
  Fh.exports = Xs;
});
var Hh = H((xM, Vh) => {
  x();
  P();
  T();
  var { Buffer: Pn } = (ke(), _e(Le)), A0 = 65536, $h = {}, I0 = Pn.isBuffer(Pn.from([1, 2]).subarray(0, 1));
  function Wh(t) {
    let e = Pn.allocUnsafe(2);
    return e.writeUInt8(t >> 8, 0), e.writeUInt8(t & 255, 1), e;
  }
  function x0() {
    for (let t = 0; t < A0; t++) $h[t] = Wh(t);
  }
  function T0(t) {
    let r = 0, n = 0, i = Pn.allocUnsafe(4);
    do
      r = t % 128 | 0, t = t / 128 | 0, t > 0 && (r = r | 128), i.writeUInt8(r, n++);
    while (t > 0 && n < 4);
    return t > 0 && (n = 0), I0 ? i.subarray(0, n) : i.slice(0, n);
  }
  function P0(t) {
    let e = Pn.allocUnsafe(4);
    return e.writeUInt32BE(t, 0), e;
  }
  Vh.exports = { cache: $h, generateCache: x0, generateNumber: Wh, genBufVariableByteInt: T0, generate4ByteBuffer: P0 };
});
var zh = H((LM, Zs) => {
  "use strict";
  x();
  P();
  T();
  typeof q > "u" || !q.version || q.version.indexOf("v0.") === 0 || q.version.indexOf("v1.") === 0 && q.version.indexOf("v1.8.") !== 0 ? Zs.exports = { nextTick: O0 } : Zs.exports = q;
  function O0(t, e, r, n) {
    if (typeof t != "function") throw new TypeError('"callback" argument must be a function');
    var i = arguments.length, s, o;
    switch (i) {
      case 0:
      case 1:
        return q.nextTick(t);
      case 2:
        return q.nextTick(function() {
          t.call(null, e);
        });
      case 3:
        return q.nextTick(function() {
          t.call(null, e, r);
        });
      case 4:
        return q.nextTick(function() {
          t.call(null, e, r, n);
        });
      default:
        for (s = new Array(i - 1), o = 0; o < s.length; ) s[o++] = arguments[o];
        return q.nextTick(function() {
          t.apply(null, s);
        });
    }
  }
});
var ra = H((zM, ep) => {
  x();
  P();
  T();
  var ue = Js(), { Buffer: se } = (ke(), _e(Le)), R0 = se.allocUnsafe(0), k0 = se.from([0]), On = Hh(), C0 = zh().nextTick, tt = Xt()("mqtt-packet:writeToStream"), Xi = On.cache, M0 = On.generateNumber, B0 = On.generateCache, ea = On.genBufVariableByteInt, N0 = On.generate4ByteBuffer, Ve = ta, Zi = true;
  function Xh(t, e, r) {
    switch (tt("generate called"), e.cork && (e.cork(), C0(L0, e)), Zi && (Zi = false, B0()), tt("generate: packet.cmd: %s", t.cmd), t.cmd) {
      case "connect":
        return q0(t, e, r);
      case "connack":
        return D0(t, e, r);
      case "publish":
        return U0(t, e, r);
      case "puback":
      case "pubrec":
      case "pubrel":
      case "pubcomp":
        return F0(t, e, r);
      case "subscribe":
        return j0(t, e, r);
      case "suback":
        return $0(t, e, r);
      case "unsubscribe":
        return W0(t, e, r);
      case "unsuback":
        return V0(t, e, r);
      case "pingreq":
      case "pingresp":
        return H0(t, e, r);
      case "disconnect":
        return z0(t, e, r);
      case "auth":
        return G0(t, e, r);
      default:
        return e.destroy(new Error("Unknown command")), false;
    }
  }
  Object.defineProperty(Xh, "cacheNumbers", { get() {
    return Ve === ta;
  }, set(t) {
    t ? ((!Xi || Object.keys(Xi).length === 0) && (Zi = true), Ve = ta) : (Zi = false, Ve = Q0);
  } });
  function L0(t) {
    t.uncork();
  }
  function q0(t, e, r) {
    let n = t || {}, i = n.protocolId || "MQTT", s = n.protocolVersion || 4, o = n.will, u = n.clean, c = n.keepalive || 0, f = n.clientId || "", d = n.username, h = n.password, _ = n.properties;
    u === void 0 && (u = true);
    let y = 0;
    if (!i || typeof i != "string" && !se.isBuffer(i)) return e.destroy(new Error("Invalid protocolId")), false;
    if (y += i.length + 2, s !== 3 && s !== 4 && s !== 5) return e.destroy(new Error("Invalid protocol version")), false;
    if (y += 1, (typeof f == "string" || se.isBuffer(f)) && (f || s >= 4) && (f || u)) y += se.byteLength(f) + 2;
    else {
      if (s < 4) return e.destroy(new Error("clientId must be supplied before 3.1.1")), false;
      if (u * 1 === 0) return e.destroy(new Error("clientId must be given if cleanSession set to 0")), false;
    }
    if (typeof c != "number" || c < 0 || c > 65535 || c % 1 !== 0) return e.destroy(new Error("Invalid keepalive")), false;
    y += 2, y += 1;
    let I, S;
    if (s === 5) {
      if (I = Zt(e, _), !I) return false;
      y += I.length;
    }
    if (o) {
      if (typeof o != "object") return e.destroy(new Error("Invalid will")), false;
      if (!o.topic || typeof o.topic != "string") return e.destroy(new Error("Invalid will topic")), false;
      if (y += se.byteLength(o.topic) + 2, y += 2, o.payload) if (o.payload.length >= 0) typeof o.payload == "string" ? y += se.byteLength(o.payload) : y += o.payload.length;
      else return e.destroy(new Error("Invalid will payload")), false;
      if (S = {}, s === 5) {
        if (S = Zt(e, o.properties), !S) return false;
        y += S.length;
      }
    }
    let b = false;
    if (d != null) if (Jh(d)) b = true, y += se.byteLength(d) + 2;
    else return e.destroy(new Error("Invalid username")), false;
    if (h != null) {
      if (!b) return e.destroy(new Error("Username is required to use password")), false;
      if (Jh(h)) y += Zh(h) + 2;
      else return e.destroy(new Error("Invalid password")), false;
    }
    e.write(ue.CONNECT_HEADER), rt(e, y), Xr(e, i), n.bridgeMode && (s += 128), e.write(s === 131 ? ue.VERSION131 : s === 132 ? ue.VERSION132 : s === 4 ? ue.VERSION4 : s === 5 ? ue.VERSION5 : ue.VERSION3);
    let m = 0;
    return m |= d != null ? ue.USERNAME_MASK : 0, m |= h != null ? ue.PASSWORD_MASK : 0, m |= o && o.retain ? ue.WILL_RETAIN_MASK : 0, m |= o && o.qos ? o.qos << ue.WILL_QOS_SHIFT : 0, m |= o ? ue.WILL_FLAG_MASK : 0, m |= u ? ue.CLEAN_SESSION_MASK : 0, e.write(se.from([m])), Ve(e, c), s === 5 && I.write(), Xr(e, f), o && (s === 5 && S.write(), Ar(e, o.topic), Xr(e, o.payload)), d != null && Xr(e, d), h != null && Xr(e, h), true;
  }
  function D0(t, e, r) {
    let n = r ? r.protocolVersion : 4, i = t || {}, s = n === 5 ? i.reasonCode : i.returnCode, o = i.properties, u = 2;
    if (typeof s != "number") return e.destroy(new Error("Invalid return code")), false;
    let c = null;
    if (n === 5) {
      if (c = Zt(e, o), !c) return false;
      u += c.length;
    }
    return e.write(ue.CONNACK_HEADER), rt(e, u), e.write(i.sessionPresent ? ue.SESSIONPRESENT_HEADER : k0), e.write(se.from([s])), c == null ? void 0 : c.write(), true;
  }
  function U0(t, e, r) {
    tt("publish: packet: %o", t);
    let n = r ? r.protocolVersion : 4, i = t || {}, s = i.qos || 0, o = i.retain ? ue.RETAIN_MASK : 0, u = i.topic, c = i.payload || R0, f = i.messageId, d = i.properties, h = 0;
    if (typeof u == "string") h += se.byteLength(u) + 2;
    else if (se.isBuffer(u)) h += u.length + 2;
    else return e.destroy(new Error("Invalid topic")), false;
    if (se.isBuffer(c) ? h += c.length : h += se.byteLength(c), s && typeof f != "number") return e.destroy(new Error("Invalid messageId")), false;
    s && (h += 2);
    let _ = null;
    if (n === 5) {
      if (_ = Zt(e, d), !_) return false;
      h += _.length;
    }
    return e.write(ue.PUBLISH_HEADER[s][i.dup ? 1 : 0][o ? 1 : 0]), rt(e, h), Ve(e, Zh(u)), e.write(u), s > 0 && Ve(e, f), _ == null ? void 0 : _.write(), tt("publish: payload: %o", c), e.write(c);
  }
  function F0(t, e, r) {
    let n = r ? r.protocolVersion : 4, i = t || {}, s = i.cmd || "puback", o = i.messageId, u = i.dup && s === "pubrel" ? ue.DUP_MASK : 0, c = 0, f = i.reasonCode, d = i.properties, h = n === 5 ? 3 : 2;
    if (s === "pubrel" && (c = 1), typeof o != "number") return e.destroy(new Error("Invalid messageId")), false;
    let _ = null;
    if (n === 5 && typeof d == "object") {
      if (_ = Rn(e, d, r, h), !_) return false;
      h += _.length;
    }
    return e.write(ue.ACKS[s][c][u][0]), h === 3 && (h += f !== 0 ? 1 : -1), rt(e, h), Ve(e, o), n === 5 && h !== 2 && e.write(se.from([f])), _ !== null ? _.write() : h === 4 && e.write(se.from([0])), true;
  }
  function j0(t, e, r) {
    tt("subscribe: packet: ");
    let n = r ? r.protocolVersion : 4, i = t || {}, s = i.dup ? ue.DUP_MASK : 0, o = i.messageId, u = i.subscriptions, c = i.properties, f = 0;
    if (typeof o != "number") return e.destroy(new Error("Invalid messageId")), false;
    f += 2;
    let d = null;
    if (n === 5) {
      if (d = Zt(e, c), !d) return false;
      f += d.length;
    }
    if (typeof u == "object" && u.length) for (let _ = 0; _ < u.length; _ += 1) {
      let y = u[_].topic, I = u[_].qos;
      if (typeof y != "string") return e.destroy(new Error("Invalid subscriptions - invalid topic")), false;
      if (typeof I != "number") return e.destroy(new Error("Invalid subscriptions - invalid qos")), false;
      if (n === 5) {
        if (typeof (u[_].nl || false) != "boolean") return e.destroy(new Error("Invalid subscriptions - invalid No Local")), false;
        if (typeof (u[_].rap || false) != "boolean") return e.destroy(new Error("Invalid subscriptions - invalid Retain as Published")), false;
        let m = u[_].rh || 0;
        if (typeof m != "number" || m > 2) return e.destroy(new Error("Invalid subscriptions - invalid Retain Handling")), false;
      }
      f += se.byteLength(y) + 2 + 1;
    }
    else return e.destroy(new Error("Invalid subscriptions")), false;
    tt("subscribe: writing to stream: %o", ue.SUBSCRIBE_HEADER), e.write(ue.SUBSCRIBE_HEADER[1][s ? 1 : 0][0]), rt(e, f), Ve(e, o), d !== null && d.write();
    let h = true;
    for (let _ of u) {
      let y = _.topic, I = _.qos, S = +_.nl, b = +_.rap, m = _.rh, w;
      Ar(e, y), w = ue.SUBSCRIBE_OPTIONS_QOS[I], n === 5 && (w |= S ? ue.SUBSCRIBE_OPTIONS_NL : 0, w |= b ? ue.SUBSCRIBE_OPTIONS_RAP : 0, w |= m ? ue.SUBSCRIBE_OPTIONS_RH[m] : 0), h = e.write(se.from([w]));
    }
    return h;
  }
  function $0(t, e, r) {
    let n = r ? r.protocolVersion : 4, i = t || {}, s = i.messageId, o = i.granted, u = i.properties, c = 0;
    if (typeof s != "number") return e.destroy(new Error("Invalid messageId")), false;
    if (c += 2, typeof o == "object" && o.length) for (let d = 0; d < o.length; d += 1) {
      if (typeof o[d] != "number") return e.destroy(new Error("Invalid qos vector")), false;
      c += 1;
    }
    else return e.destroy(new Error("Invalid qos vector")), false;
    let f = null;
    if (n === 5) {
      if (f = Rn(e, u, r, c), !f) return false;
      c += f.length;
    }
    return e.write(ue.SUBACK_HEADER), rt(e, c), Ve(e, s), f !== null && f.write(), e.write(se.from(o));
  }
  function W0(t, e, r) {
    let n = r ? r.protocolVersion : 4, i = t || {}, s = i.messageId, o = i.dup ? ue.DUP_MASK : 0, u = i.unsubscriptions, c = i.properties, f = 0;
    if (typeof s != "number") return e.destroy(new Error("Invalid messageId")), false;
    if (f += 2, typeof u == "object" && u.length) for (let _ = 0; _ < u.length; _ += 1) {
      if (typeof u[_] != "string") return e.destroy(new Error("Invalid unsubscriptions")), false;
      f += se.byteLength(u[_]) + 2;
    }
    else return e.destroy(new Error("Invalid unsubscriptions")), false;
    let d = null;
    if (n === 5) {
      if (d = Zt(e, c), !d) return false;
      f += d.length;
    }
    e.write(ue.UNSUBSCRIBE_HEADER[1][o ? 1 : 0][0]), rt(e, f), Ve(e, s), d !== null && d.write();
    let h = true;
    for (let _ = 0; _ < u.length; _++) h = Ar(e, u[_]);
    return h;
  }
  function V0(t, e, r) {
    let n = r ? r.protocolVersion : 4, i = t || {}, s = i.messageId, o = i.dup ? ue.DUP_MASK : 0, u = i.granted, c = i.properties, f = i.cmd, d = 0, h = 2;
    if (typeof s != "number") return e.destroy(new Error("Invalid messageId")), false;
    if (n === 5) if (typeof u == "object" && u.length) for (let y = 0; y < u.length; y += 1) {
      if (typeof u[y] != "number") return e.destroy(new Error("Invalid qos vector")), false;
      h += 1;
    }
    else return e.destroy(new Error("Invalid qos vector")), false;
    let _ = null;
    if (n === 5) {
      if (_ = Rn(e, c, r, h), !_) return false;
      h += _.length;
    }
    return e.write(ue.ACKS[f][d][o][0]), rt(e, h), Ve(e, s), _ !== null && _.write(), n === 5 && e.write(se.from(u)), true;
  }
  function H0(t, e, r) {
    return e.write(ue.EMPTY[t.cmd]);
  }
  function z0(t, e, r) {
    let n = r ? r.protocolVersion : 4, i = t || {}, s = i.reasonCode, o = i.properties, u = n === 5 ? 1 : 0, c = null;
    if (n === 5) {
      if (c = Rn(e, o, r, u), !c) return false;
      u += c.length;
    }
    return e.write(se.from([ue.codes.disconnect << 4])), rt(e, u), n === 5 && e.write(se.from([s])), c !== null && c.write(), true;
  }
  function G0(t, e, r) {
    let n = r ? r.protocolVersion : 4, i = t || {}, s = i.reasonCode, o = i.properties, u = n === 5 ? 1 : 0;
    n !== 5 && e.destroy(new Error("Invalid mqtt version for auth packet"));
    let c = Rn(e, o, r, u);
    return c ? (u += c.length, e.write(se.from([ue.codes.auth << 4])), rt(e, u), e.write(se.from([s])), c !== null && c.write(), true) : false;
  }
  var Gh = {};
  function rt(t, e) {
    if (e > ue.VARBYTEINT_MAX) return t.destroy(new Error(`Invalid variable byte integer: ${e}`)), false;
    let r = Gh[e];
    return r || (r = ea(e), e < 16384 && (Gh[e] = r)), tt("writeVarByteInt: writing to stream: %o", r), t.write(r);
  }
  function Ar(t, e) {
    let r = se.byteLength(e);
    return Ve(t, r), tt("writeString: %s", e), t.write(e, "utf8");
  }
  function Qh(t, e, r) {
    Ar(t, e), Ar(t, r);
  }
  function ta(t, e) {
    return tt("writeNumberCached: number: %d", e), tt("writeNumberCached: %o", Xi[e]), t.write(Xi[e]);
  }
  function Q0(t, e) {
    let r = M0(e);
    return tt("writeNumberGenerated: %o", r), t.write(r);
  }
  function K0(t, e) {
    let r = N0(e);
    return tt("write4ByteNumber: %o", r), t.write(r);
  }
  function Xr(t, e) {
    typeof e == "string" ? Ar(t, e) : e ? (Ve(t, e.length), t.write(e)) : Ve(t, 0);
  }
  function Zt(t, e) {
    if (typeof e != "object" || e.length != null) return { length: 1, write() {
      Yh(t, {}, 0);
    } };
    let r = 0;
    function n(s, o) {
      let u = ue.propertiesTypes[s], c = 0;
      switch (u) {
        case "byte": {
          if (typeof o != "boolean") return t.destroy(new Error(`Invalid ${s}: ${o}`)), false;
          c += 2;
          break;
        }
        case "int8": {
          if (typeof o != "number" || o < 0 || o > 255) return t.destroy(new Error(`Invalid ${s}: ${o}`)), false;
          c += 2;
          break;
        }
        case "binary": {
          if (o && o === null) return t.destroy(new Error(`Invalid ${s}: ${o}`)), false;
          c += 1 + se.byteLength(o) + 2;
          break;
        }
        case "int16": {
          if (typeof o != "number" || o < 0 || o > 65535) return t.destroy(new Error(`Invalid ${s}: ${o}`)), false;
          c += 3;
          break;
        }
        case "int32": {
          if (typeof o != "number" || o < 0 || o > 4294967295) return t.destroy(new Error(`Invalid ${s}: ${o}`)), false;
          c += 5;
          break;
        }
        case "var": {
          if (typeof o != "number" || o < 0 || o > 268435455) return t.destroy(new Error(`Invalid ${s}: ${o}`)), false;
          c += 1 + se.byteLength(ea(o));
          break;
        }
        case "string": {
          if (typeof o != "string") return t.destroy(new Error(`Invalid ${s}: ${o}`)), false;
          c += 3 + se.byteLength(o.toString());
          break;
        }
        case "pair": {
          if (typeof o != "object") return t.destroy(new Error(`Invalid ${s}: ${o}`)), false;
          c += Object.getOwnPropertyNames(o).reduce((f, d) => {
            let h = o[d];
            return Array.isArray(h) ? f += h.reduce((_, y) => (_ += 3 + se.byteLength(d.toString()) + 2 + se.byteLength(y.toString()), _), 0) : f += 3 + se.byteLength(d.toString()) + 2 + se.byteLength(o[d].toString()), f;
          }, 0);
          break;
        }
        default:
          return t.destroy(new Error(`Invalid property ${s}: ${o}`)), false;
      }
      return c;
    }
    if (e) for (let s in e) {
      let o = 0, u = 0, c = e[s];
      if (c !== void 0) {
        if (Array.isArray(c)) for (let f = 0; f < c.length; f++) {
          if (u = n(s, c[f]), !u) return false;
          o += u;
        }
        else {
          if (u = n(s, c), !u) return false;
          o = u;
        }
        if (!o) return false;
        r += o;
      }
    }
    return { length: se.byteLength(ea(r)) + r, write() {
      Yh(t, e, r);
    } };
  }
  function Rn(t, e, r, n) {
    let i = ["reasonString", "userProperties"], s = r && r.properties && r.properties.maximumPacketSize ? r.properties.maximumPacketSize : 0, o = Zt(t, e);
    if (s) for (; n + o.length > s; ) {
      let u = i.shift();
      if (u && e[u]) delete e[u], o = Zt(t, e);
      else return false;
    }
    return o;
  }
  function Kh(t, e, r) {
    switch (ue.propertiesTypes[e]) {
      case "byte": {
        t.write(se.from([ue.properties[e]])), t.write(se.from([+r]));
        break;
      }
      case "int8": {
        t.write(se.from([ue.properties[e]])), t.write(se.from([r]));
        break;
      }
      case "binary": {
        t.write(se.from([ue.properties[e]])), Xr(t, r);
        break;
      }
      case "int16": {
        t.write(se.from([ue.properties[e]])), Ve(t, r);
        break;
      }
      case "int32": {
        t.write(se.from([ue.properties[e]])), K0(t, r);
        break;
      }
      case "var": {
        t.write(se.from([ue.properties[e]])), rt(t, r);
        break;
      }
      case "string": {
        t.write(se.from([ue.properties[e]])), Ar(t, r);
        break;
      }
      case "pair": {
        Object.getOwnPropertyNames(r).forEach((i) => {
          let s = r[i];
          Array.isArray(s) ? s.forEach((o) => {
            t.write(se.from([ue.properties[e]])), Qh(t, i.toString(), o.toString());
          }) : (t.write(se.from([ue.properties[e]])), Qh(t, i.toString(), s.toString()));
        });
        break;
      }
      default:
        return t.destroy(new Error(`Invalid property ${e} value: ${r}`)), false;
    }
  }
  function Yh(t, e, r) {
    rt(t, r);
    for (let n in e) if (Object.prototype.hasOwnProperty.call(e, n) && e[n] != null) {
      let i = e[n];
      if (Array.isArray(i)) for (let s = 0; s < i.length; s++) Kh(t, n, i[s]);
      else Kh(t, n, i);
    }
  }
  function Zh(t) {
    return t ? t instanceof se ? t.length : se.byteLength(t) : 0;
  }
  function Jh(t) {
    return typeof t == "string" || t instanceof se;
  }
  ep.exports = Xh;
});
var np = H((r2, rp) => {
  x();
  P();
  T();
  var Y0 = ra(), { EventEmitter: J0 } = (Ht(), _e(Vt)), { Buffer: tp } = (ke(), _e(Le));
  function X0(t, e) {
    let r = new na();
    return Y0(t, r, e), r.concat();
  }
  var na = class extends J0 {
    constructor() {
      super(), this._array = new Array(20), this._i = 0;
    }
    write(e) {
      return this._array[this._i++] = e, true;
    }
    concat() {
      let e = 0, r = new Array(this._array.length), n = this._array, i = 0, s;
      for (s = 0; s < n.length && n[s] !== void 0; s++) typeof n[s] != "string" ? r[s] = n[s].length : r[s] = tp.byteLength(n[s]), e += r[s];
      let o = tp.allocUnsafe(e);
      for (s = 0; s < n.length && n[s] !== void 0; s++) typeof n[s] != "string" ? (n[s].copy(o, i), i += r[s]) : (o.write(n[s], i), i += r[s]);
      return o;
    }
    destroy(e) {
      e && this.emit("error", e);
    }
  };
  rp.exports = X0;
});
var ip = H((eo) => {
  x();
  P();
  T();
  eo.parser = jh().parser;
  eo.generate = np();
  eo.writeToStream = ra();
});
var sp = H((S2, op) => {
  "use strict";
  x();
  P();
  T();
  op.exports = Z0;
  function Zr(t) {
    return t instanceof V ? V.from(t) : new t.constructor(t.buffer.slice(), t.byteOffset, t.length);
  }
  function Z0(t) {
    if (t = t || {}, t.circles) return eS(t);
    let e = /* @__PURE__ */ new Map();
    if (e.set(Date, (o) => new Date(o)), e.set(Map, (o, u) => new Map(n(Array.from(o), u))), e.set(Set, (o, u) => new Set(n(Array.from(o), u))), t.constructorHandlers) for (let o of t.constructorHandlers) e.set(o[0], o[1]);
    let r = null;
    return t.proto ? s : i;
    function n(o, u) {
      let c = Object.keys(o), f = new Array(c.length);
      for (let d = 0; d < c.length; d++) {
        let h = c[d], _ = o[h];
        typeof _ != "object" || _ === null ? f[h] = _ : _.constructor !== Object && (r = e.get(_.constructor)) ? f[h] = r(_, u) : ArrayBuffer.isView(_) ? f[h] = Zr(_) : f[h] = u(_);
      }
      return f;
    }
    function i(o) {
      if (typeof o != "object" || o === null) return o;
      if (Array.isArray(o)) return n(o, i);
      if (o.constructor !== Object && (r = e.get(o.constructor))) return r(o, i);
      let u = {};
      for (let c in o) {
        if (Object.hasOwnProperty.call(o, c) === false) continue;
        let f = o[c];
        typeof f != "object" || f === null ? u[c] = f : f.constructor !== Object && (r = e.get(f.constructor)) ? u[c] = r(f, i) : ArrayBuffer.isView(f) ? u[c] = Zr(f) : u[c] = i(f);
      }
      return u;
    }
    function s(o) {
      if (typeof o != "object" || o === null) return o;
      if (Array.isArray(o)) return n(o, s);
      if (o.constructor !== Object && (r = e.get(o.constructor))) return r(o, s);
      let u = {};
      for (let c in o) {
        let f = o[c];
        typeof f != "object" || f === null ? u[c] = f : f.constructor !== Object && (r = e.get(f.constructor)) ? u[c] = r(f, s) : ArrayBuffer.isView(f) ? u[c] = Zr(f) : u[c] = s(f);
      }
      return u;
    }
  }
  function eS(t) {
    let e = [], r = [], n = /* @__PURE__ */ new Map();
    if (n.set(Date, (c) => new Date(c)), n.set(Map, (c, f) => new Map(s(Array.from(c), f))), n.set(Set, (c, f) => new Set(s(Array.from(c), f))), t.constructorHandlers) for (let c of t.constructorHandlers) n.set(c[0], c[1]);
    let i = null;
    return t.proto ? u : o;
    function s(c, f) {
      let d = Object.keys(c), h = new Array(d.length);
      for (let _ = 0; _ < d.length; _++) {
        let y = d[_], I = c[y];
        if (typeof I != "object" || I === null) h[y] = I;
        else if (I.constructor !== Object && (i = n.get(I.constructor))) h[y] = i(I, f);
        else if (ArrayBuffer.isView(I)) h[y] = Zr(I);
        else {
          let S = e.indexOf(I);
          S !== -1 ? h[y] = r[S] : h[y] = f(I);
        }
      }
      return h;
    }
    function o(c) {
      if (typeof c != "object" || c === null) return c;
      if (Array.isArray(c)) return s(c, o);
      if (c.constructor !== Object && (i = n.get(c.constructor))) return i(c, o);
      let f = {};
      e.push(c), r.push(f);
      for (let d in c) {
        if (Object.hasOwnProperty.call(c, d) === false) continue;
        let h = c[d];
        if (typeof h != "object" || h === null) f[d] = h;
        else if (h.constructor !== Object && (i = n.get(h.constructor))) f[d] = i(h, o);
        else if (ArrayBuffer.isView(h)) f[d] = Zr(h);
        else {
          let _ = e.indexOf(h);
          _ !== -1 ? f[d] = r[_] : f[d] = o(h);
        }
      }
      return e.pop(), r.pop(), f;
    }
    function u(c) {
      if (typeof c != "object" || c === null) return c;
      if (Array.isArray(c)) return s(c, u);
      if (c.constructor !== Object && (i = n.get(c.constructor))) return i(c, u);
      let f = {};
      e.push(c), r.push(f);
      for (let d in c) {
        let h = c[d];
        if (typeof h != "object" || h === null) f[d] = h;
        else if (h.constructor !== Object && (i = n.get(h.constructor))) f[d] = i(h, u);
        else if (ArrayBuffer.isView(h)) f[d] = Zr(h);
        else {
          let _ = e.indexOf(h);
          _ !== -1 ? f[d] = r[_] : f[d] = u(h);
        }
      }
      return e.pop(), r.pop(), f;
    }
  }
});
var up = H((C2, ap) => {
  "use strict";
  x();
  P();
  T();
  ap.exports = sp()();
});
var ia = H((to) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(to, "__esModule", { value: true });
  to.validateTopic = lp;
  to.validateTopics = tS;
  function lp(t) {
    let e = t.split("/");
    for (let r = 0; r < e.length; r++) if (e[r] !== "+") {
      if (e[r] === "#") return r === e.length - 1;
      if (e[r].indexOf("+") !== -1 || e[r].indexOf("#") !== -1) return false;
    }
    return true;
  }
  function tS(t) {
    if (t.length === 0) return "empty_topic_list";
    for (let e = 0; e < t.length; e++) if (!lp(t[e])) return t[e];
    return null;
  }
});
var aa = H((sa) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(sa, "__esModule", { value: true });
  var rS = Yt(), nS = { objectMode: true }, iS = { clean: true }, oa = class {
    constructor(e) {
      __publicField(this, "options");
      __publicField(this, "_inflights");
      this.options = e || {}, this.options = { ...iS, ...e }, this._inflights = /* @__PURE__ */ new Map();
    }
    put(e, r) {
      return this._inflights.set(e.messageId, e), r && r(), this;
    }
    createStream() {
      let e = new rS.Readable(nS), r = [], n = false, i = 0;
      return this._inflights.forEach((s, o) => {
        r.push(s);
      }), e._read = () => {
        !n && i < r.length ? e.push(r[i++]) : e.push(null);
      }, e.destroy = (s) => {
        if (!n) return n = true, setTimeout(() => {
          e.emit("close");
        }, 0), e;
      }, e;
    }
    del(e, r) {
      let n = this._inflights.get(e.messageId);
      return n ? (this._inflights.delete(e.messageId), r(null, n)) : r && r(new Error("missing packet")), this;
    }
    get(e, r) {
      let n = this._inflights.get(e.messageId);
      return n ? r(null, n) : r && r(new Error("missing packet")), this;
    }
    close(e) {
      this.options.clean && (this._inflights = null), e && e();
    }
  };
  sa.default = oa;
});
var cp = H((uB, oS) => {
  oS.exports = { version: "5.16.0" };
});
var Ct = H((ct) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(ct, "__esModule", { value: true });
  ct.MQTTJS_VERSION = ct.nextTick = ct.ErrorWithSubackPacket = ct.ErrorWithReasonCode = void 0;
  ct.applyMixin = sS;
  var ua = class t extends Error {
    constructor(e, r) {
      super(e);
      __publicField(this, "code");
      this.code = r, Object.setPrototypeOf(this, t.prototype), Object.getPrototypeOf(this).name = "ErrorWithReasonCode";
    }
  };
  ct.ErrorWithReasonCode = ua;
  var la = class t extends Error {
    constructor(e, r) {
      super(e);
      __publicField(this, "packet");
      this.packet = r, Object.setPrototypeOf(this, t.prototype), Object.getPrototypeOf(this).name = "ErrorWithSubackPacket";
    }
  };
  ct.ErrorWithSubackPacket = la;
  function sS(t, e, r = false) {
    let n = [e];
    for (; ; ) {
      let i = n[0], s = Object.getPrototypeOf(i);
      if (s == null ? void 0 : s.prototype) n.unshift(s);
      else break;
    }
    for (let i of n) for (let s of Object.getOwnPropertyNames(i.prototype)) (r || s !== "constructor") && Object.defineProperty(t.prototype, s, Object.getOwnPropertyDescriptor(i.prototype, s) ?? /* @__PURE__ */ Object.create(null));
  }
  ct.nextTick = typeof (q == null ? void 0 : q.nextTick) == "function" ? q.nextTick : (t) => {
    setTimeout(t, 0);
  };
  ct.MQTTJS_VERSION = cp().version;
});
var dp = H((ca) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(ca, "__esModule", { value: true });
  var aS = Ct(), fp = [0, 16, 128, 131, 135, 144, 145, 151, 153], uS = 148, lS = 130, ro = (t, e, r, n, i = uS) => {
    n == null ? void 0 : n.discardParsedPackets(), (!n || n.isCurrent()) && t._cleanUp(true), r(), t.emit("error", new aS.ErrorWithReasonCode(e, i));
  }, no = (t, e, r) => {
    r(), t.emit("error", e);
  }, cS = (t, e, r, n) => {
    t.log("handlePublish: packet %o", e), r = typeof r < "u" ? r : t.noop;
    let i = e.topic.toString(), s = e.payload, { qos: o } = e, { messageId: u } = e, { options: c } = t;
    if (t.options.protocolVersion === 5) {
      let f;
      if (e.properties && (f = e.properties.topicAlias), typeof f < "u") {
        let d = t.topicAliasRecv;
        if (!d) {
          t.log("handlePublish :: received unexpected topic alias. alias: %d", f), ro(t, "Received a PUBLISH Topic Alias but no Topic Alias Maximum was advertised", r, n);
          return;
        }
        if (i.length === 0) if (f > 0 && f <= 65535) {
          let h = d.getTopicByAlias(f);
          if (h) i = h, t.log("handlePublish :: topic complemented by alias. topic: %s - alias: %d", i, f);
          else {
            t.log("handlePublish :: unregistered topic alias. alias: %d", f), ro(t, "Received unregistered Topic Alias", r, n, lS);
            return;
          }
        } else {
          t.log("handlePublish :: topic alias out of range. alias: %d", f), ro(t, `Received Topic Alias ${f} is outside the valid range 1-65535`, r, n);
          return;
        }
        else if (d.put(i, f)) t.log("handlePublish :: registered topic: %s - alias: %d", i, f);
        else {
          t.log("handlePublish :: topic alias outside the advertised maximum. alias: %d - max: %d", f, d.max), ro(t, `Received Topic Alias ${f} is outside the advertised Topic Alias Maximum range 1-${d.max}`, r, n);
          return;
        }
      }
    }
    switch (t.log("handlePublish: qos %d", o), o) {
      case 2: {
        c.customHandleAcks(i, s, e, (f, d) => {
          if (typeof f == "number" && (d = f, f = null), f) return no(t, f, r);
          if (fp.indexOf(d) === -1) return no(t, new Error("Wrong reason code for pubrec"), r);
          if (d) t._sendPacket({ cmd: "pubrec", messageId: u, reasonCode: d }, r);
          else {
            if (!t._trackIncomingQoS2Publish(u, r, n)) return;
            t.incomingStore.put(e, () => {
              t._sendPacket({ cmd: "pubrec", messageId: u }, r);
            });
          }
        });
        break;
      }
      case 1: {
        c.customHandleAcks(i, s, e, (f, d) => {
          if (typeof f == "number" && (d = f, f = null), f) return no(t, f, r);
          if (fp.indexOf(d) === -1) return no(t, new Error("Wrong reason code for puback"), r);
          d || t.emit("message", i, s, e), t.handleMessage(e, (h) => {
            if (h) return r && r(h);
            t._sendPacket({ cmd: "puback", messageId: u, reasonCode: d }, r);
          });
        });
        break;
      }
      case 0:
        t.emit("message", i, s, e), t.handleMessage(e, r);
        break;
      default:
        t.log("handlePublish: unknown QoS. Doing nothing.");
        break;
    }
  };
  ca.default = cS;
});
var hp = H((fa) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(fa, "__esModule", { value: true });
  var kn = Ct(), Cn = 130, en = (t, e, r) => {
    t.log("handleAuth :: %s", e.message), r == null ? void 0 : r.discardParsedPackets(), (!r || r.isCurrent()) && t._cleanUp(true), t.emit("error", e);
  }, fS = (t, e, r) => {
    var _a;
    let { options: n } = t, i = n.protocolVersion, s = i === 5 ? e.reasonCode : e.returnCode;
    if (i !== 5) {
      en(t, new kn.ErrorWithReasonCode(`Protocol error: Auth packets are only supported in MQTT 5. Your version:${i}`, Cn), r);
      return;
    }
    let o = t._authenticationMethod;
    if (!o) {
      en(t, new kn.ErrorWithReasonCode("Protocol error: Auth packet received but enhanced authentication was not requested", Cn), r);
      return;
    }
    if (((_a = e.properties) == null ? void 0 : _a.authenticationMethod) !== o) {
      en(t, new kn.ErrorWithReasonCode(`Protocol error: Auth packet Authentication Method does not match the "${o}" sent in CONNECT`, Cn), r);
      return;
    }
    t.handleAuth(e, (u, c) => {
      if (u) {
        en(t, u, r);
        return;
      }
      if (s === 0) {
        t.log("handleAuth :: authentication exchange completed successfully");
        return;
      }
      if (s === 24) {
        if (!c) {
          en(t, new kn.ErrorWithReasonCode("Protocol error: No auth packet to continue the authentication exchange", Cn), r);
          return;
        }
        t.reconnecting = false, t._sendPacket(c);
        return;
      }
      en(t, new kn.ErrorWithReasonCode(`Protocol error: Auth packet reason code ${s} is not one a broker may send`, Cn), r);
    });
  };
  fa.default = fS;
});
var Mn = H((er) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(er, "__esModule", { value: true });
  er.ReasonCodes = void 0;
  var pp = Ct();
  er.ReasonCodes = { 0: "", 1: "Unacceptable protocol version", 2: "Identifier rejected", 3: "Server unavailable", 4: "Bad username or password", 5: "Not authorized", 16: "No matching subscribers", 17: "No subscription existed", 128: "Unspecified error", 129: "Malformed Packet", 130: "Protocol Error", 131: "Implementation specific error", 132: "Unsupported Protocol Version", 133: "Client Identifier not valid", 134: "Bad User Name or Password", 135: "Not authorized", 136: "Server unavailable", 137: "Server busy", 138: "Banned", 139: "Server shutting down", 140: "Bad authentication method", 141: "Keep Alive timeout", 142: "Session taken over", 143: "Topic Filter invalid", 144: "Topic Name invalid", 145: "Packet identifier in use", 146: "Packet Identifier not found", 147: "Receive Maximum exceeded", 148: "Topic Alias invalid", 149: "Packet too large", 150: "Message rate too high", 151: "Quota exceeded", 152: "Administrative action", 153: "Payload format invalid", 154: "Retain not supported", 155: "QoS not supported", 156: "Use another server", 157: "Server moved", 158: "Shared Subscriptions not supported", 159: "Connection rate exceeded", 160: "Maximum connect time", 161: "Subscription Identifiers not supported", 162: "Wildcard Subscriptions not supported" };
  var dS = { publish: ["puback", "pubrec", "pubcomp"], pubrel: ["pubcomp"], subscribe: ["suback"], unsubscribe: ["unsuback"] }, hS = (t, e) => {
    var _a;
    let { messageId: r } = e, n = e.cmd, i = null, s = t.outgoing[r], o = s ? s.cb : null, u = null;
    if (!o) {
      t.log("_handleAck :: Server sent an ack in error. Ignoring.");
      return;
    }
    if (!((_a = dS[s.cmd]) == null ? void 0 : _a.includes(n))) {
      t.log("_handleAck :: %s does not answer the pending %s on message id %d. Ignoring.", n, s.cmd, r), t.emit("error", new Error(`Protocol error: ${n} does not answer the ${s.cmd} pending on message id ${r}`));
      return;
    }
    switch (t.log("_handleAck :: packet type", n), n) {
      case "pubcomp":
      case "puback": {
        let c = e.reasonCode;
        c && c > 0 && c !== 16 ? (u = new pp.ErrorWithReasonCode(`Publish error: ${er.ReasonCodes[c]}`, c), t._removeOutgoingAndStoreMessage(r, () => {
          o(u, e);
        })) : t._removeOutgoingAndStoreMessage(r, o);
        break;
      }
      case "pubrec": {
        i = { cmd: "pubrel", qos: 2, messageId: r };
        let c = e.reasonCode;
        c && c > 0 && c !== 16 ? (u = new pp.ErrorWithReasonCode(`Publish error: ${er.ReasonCodes[c]}`, c), t._removeOutgoingAndStoreMessage(r, () => {
          o(u, e);
        })) : t._sendPacket(i);
        break;
      }
      case "suback": {
        delete t.outgoing[r], t.messageIdProvider.deallocate(r);
        let c = e.granted;
        for (let f = 0; f < c.length; f++) {
          let d = c[f];
          if ((d & 128) !== 0) {
            u = new Error(`Subscribe error: ${er.ReasonCodes[d]}`), u.code = d;
            let h = t.messageIdToTopic[r];
            h && h.forEach((_) => {
              delete t._resubscribeTopics[_];
            });
          }
        }
        delete t.messageIdToTopic[r], t._invokeStoreProcessingQueue(), o(u, e);
        break;
      }
      case "unsuback": {
        delete t.outgoing[r], t.messageIdProvider.deallocate(r), t._invokeStoreProcessingQueue(), o(null, e);
        break;
      }
      default:
        t.emit("error", new Error("unrecognized packet type"));
    }
    t.disconnecting && Object.keys(t.outgoing).length === 0 && t.emit("outgoingEmpty");
  };
  er.default = hS;
});
var _p = H((oo) => {
  "use strict";
  var _a, _b, _u2, _c2, _d, _u3, _f, _g2, _y2, _R, _k, _i2, _b2, _n2, _r, _e2, _l2, _d2, _a2, _o, _m, _s, __, _w, _h, _v, _x, _c3, _t_instances, N_fn, _T, _I, _L, _p2, j_fn, _P, _C, _q, S_fn, E_fn, D_fn, M_fn, B_fn, t_fn, U_fn, O_fn, A_fn, F_fn, _e3;
  x();
  P();
  T();
  Object.defineProperty(oo, "__esModule", { value: true });
  oo.LRUCache = void 0;
  var tn = typeof performance == "object" && performance && typeof performance.now == "function" ? performance : Date, yp = /* @__PURE__ */ new Set(), da = typeof q == "object" && q ? q : {}, bp = (t, e, r, n) => {
    typeof da.emitWarning == "function" ? da.emitWarning(t, e, r, n) : console.error(`[${r}] ${e}: ${t}`);
  }, io = globalThis.AbortController, gp = globalThis.AbortSignal;
  if (typeof io > "u") {
    gp = class {
      constructor() {
        __publicField(this, "onabort");
        __publicField(this, "_onabort", []);
        __publicField(this, "reason");
        __publicField(this, "aborted", false);
      }
      addEventListener(n, i) {
        this._onabort.push(i);
      }
    }, io = class {
      constructor() {
        __publicField(this, "signal", new gp());
        e();
      }
      abort(n) {
        var _a3, _b3;
        if (!this.signal.aborted) {
          this.signal.reason = n, this.signal.aborted = true;
          for (let i of this.signal._onabort) i(n);
          (_b3 = (_a3 = this.signal).onabort) == null ? void 0 : _b3.call(_a3, n);
        }
      }
    };
    let t = ((_a = da.env) == null ? void 0 : _a.LRU_CACHE_IGNORE_AC_WARNING) !== "1", e = () => {
      t && (t = false, bp("AbortController is not defined. If using lru-cache in node 14, load an AbortController polyfill from the `node-abort-controller` package. A minimal polyfill is provided for use by LRUCache.fetch(), but it should not be relied upon in other contexts (eg, passing it to other APIs that use AbortController/AbortSignal might have undesirable effects). You may disable this with LRU_CACHE_IGNORE_AC_WARNING=1 in the env.", "NO_ABORT_CONTROLLER", "ENOTSUP", e));
    };
  }
  var pS = (t) => !yp.has(t), JB = Symbol("type"), tr = (t) => t && t === Math.floor(t) && t > 0 && isFinite(t), mp = (t) => tr(t) ? t <= Math.pow(2, 8) ? Uint8Array : t <= Math.pow(2, 16) ? Uint16Array : t <= Math.pow(2, 32) ? Uint32Array : t <= Number.MAX_SAFE_INTEGER ? rn : null : null, rn = class extends Array {
    constructor(e) {
      super(e), this.fill(0);
    }
  }, ha = (_b = class {
    constructor(e, r) {
      __publicField(this, "heap");
      __publicField(this, "length");
      if (!__privateGet(_b, _u2)) throw new TypeError("instantiate Stack using Stack.create(n)");
      this.heap = new r(e), this.length = 0;
    }
    static create(e) {
      let r = mp(e);
      if (!r) return [];
      __privateSet(_b, _u2, true);
      let n = new _b(e, r);
      return __privateSet(_b, _u2, false), n;
    }
    push(e) {
      this.heap[this.length++] = e;
    }
    pop() {
      return this.heap[--this.length];
    }
  }, _u2 = new WeakMap(), __privateAdd(_b, _u2, false), _b), pa = (_e3 = class {
    constructor(e) {
      __privateAdd(this, _t_instances);
      __privateAdd(this, _u3);
      __privateAdd(this, _f);
      __privateAdd(this, _g2);
      __privateAdd(this, _y2);
      __privateAdd(this, _R);
      __privateAdd(this, _k);
      __publicField(this, "ttl");
      __publicField(this, "ttlResolution");
      __publicField(this, "ttlAutopurge");
      __publicField(this, "updateAgeOnGet");
      __publicField(this, "updateAgeOnHas");
      __publicField(this, "allowStale");
      __publicField(this, "noDisposeOnSet");
      __publicField(this, "noUpdateTTL");
      __publicField(this, "maxEntrySize");
      __publicField(this, "sizeCalculation");
      __publicField(this, "noDeleteOnFetchRejection");
      __publicField(this, "noDeleteOnStaleGet");
      __publicField(this, "allowStaleOnFetchAbort");
      __publicField(this, "allowStaleOnFetchRejection");
      __publicField(this, "ignoreFetchAbort");
      __privateAdd(this, _i2);
      __privateAdd(this, _b2);
      __privateAdd(this, _n2);
      __privateAdd(this, _r);
      __privateAdd(this, _e2);
      __privateAdd(this, _l2);
      __privateAdd(this, _d2);
      __privateAdd(this, _a2);
      __privateAdd(this, _o);
      __privateAdd(this, _m);
      __privateAdd(this, _s);
      __privateAdd(this, __);
      __privateAdd(this, _w);
      __privateAdd(this, _h);
      __privateAdd(this, _v);
      __privateAdd(this, _x);
      __privateAdd(this, _c3);
      __privateAdd(this, _T, () => {
      });
      __privateAdd(this, _I, () => {
      });
      __privateAdd(this, _L, () => {
      });
      __privateAdd(this, _p2, () => false);
      __privateAdd(this, _P, (e) => {
      });
      __privateAdd(this, _C, (e, r, n) => {
      });
      __privateAdd(this, _q, (e, r, n, i) => {
        if (n || i) throw new TypeError("cannot set size without setting maxSize or maxEntrySize on cache");
        return 0;
      });
      __publicField(this, _c2, "LRUCache");
      let { max: r = 0, ttl: n, ttlResolution: i = 1, ttlAutopurge: s, updateAgeOnGet: o, updateAgeOnHas: u, allowStale: c, dispose: f, disposeAfter: d, noDisposeOnSet: h, noUpdateTTL: _, maxSize: y = 0, maxEntrySize: I = 0, sizeCalculation: S, fetchMethod: b, memoMethod: m, noDeleteOnFetchRejection: w, noDeleteOnStaleGet: R, allowStaleOnFetchRejection: A, allowStaleOnFetchAbort: g, ignoreFetchAbort: O } = e;
      if (r !== 0 && !tr(r)) throw new TypeError("max option must be a nonnegative integer");
      let v = r ? mp(r) : Array;
      if (!v) throw new Error("invalid max value: " + r);
      if (__privateSet(this, _u3, r), __privateSet(this, _f, y), this.maxEntrySize = I || __privateGet(this, _f), this.sizeCalculation = S, this.sizeCalculation) {
        if (!__privateGet(this, _f) && !this.maxEntrySize) throw new TypeError("cannot set sizeCalculation without setting maxSize or maxEntrySize");
        if (typeof this.sizeCalculation != "function") throw new TypeError("sizeCalculation set to non-function");
      }
      if (m !== void 0 && typeof m != "function") throw new TypeError("memoMethod must be a function if defined");
      if (__privateSet(this, _k, m), b !== void 0 && typeof b != "function") throw new TypeError("fetchMethod must be a function if specified");
      if (__privateSet(this, _R, b), __privateSet(this, _x, !!b), __privateSet(this, _n2, /* @__PURE__ */ new Map()), __privateSet(this, _r, new Array(r).fill(void 0)), __privateSet(this, _e2, new Array(r).fill(void 0)), __privateSet(this, _l2, new v(r)), __privateSet(this, _d2, new v(r)), __privateSet(this, _a2, 0), __privateSet(this, _o, 0), __privateSet(this, _m, ha.create(r)), __privateSet(this, _i2, 0), __privateSet(this, _b2, 0), typeof f == "function" && __privateSet(this, _g2, f), typeof d == "function" ? (__privateSet(this, _y2, d), __privateSet(this, _s, [])) : (__privateSet(this, _y2, void 0), __privateSet(this, _s, void 0)), __privateSet(this, _v, !!__privateGet(this, _g2)), __privateSet(this, _c3, !!__privateGet(this, _y2)), this.noDisposeOnSet = !!h, this.noUpdateTTL = !!_, this.noDeleteOnFetchRejection = !!w, this.allowStaleOnFetchRejection = !!A, this.allowStaleOnFetchAbort = !!g, this.ignoreFetchAbort = !!O, this.maxEntrySize !== 0) {
        if (__privateGet(this, _f) !== 0 && !tr(__privateGet(this, _f))) throw new TypeError("maxSize must be a positive integer if specified");
        if (!tr(this.maxEntrySize)) throw new TypeError("maxEntrySize must be a positive integer if specified");
        __privateMethod(this, _t_instances, j_fn).call(this);
      }
      if (this.allowStale = !!c, this.noDeleteOnStaleGet = !!R, this.updateAgeOnGet = !!o, this.updateAgeOnHas = !!u, this.ttlResolution = tr(i) || i === 0 ? i : 1, this.ttlAutopurge = !!s, this.ttl = n || 0, this.ttl) {
        if (!tr(this.ttl)) throw new TypeError("ttl must be a positive integer if specified");
        __privateMethod(this, _t_instances, N_fn).call(this);
      }
      if (__privateGet(this, _u3) === 0 && this.ttl === 0 && __privateGet(this, _f) === 0) throw new TypeError("At least one of max, maxSize, or ttl is required");
      if (!this.ttlAutopurge && !__privateGet(this, _u3) && !__privateGet(this, _f)) {
        let B = "LRU_CACHE_UNBOUNDED";
        pS(B) && (yp.add(B), bp("TTL caching without ttlAutopurge, max, or maxSize can result in unbounded memory consumption.", "UnboundedCacheWarning", B, _e3));
      }
    }
    static unsafeExposeInternals(e) {
      return { starts: __privateGet(e, _w), ttls: __privateGet(e, _h), sizes: __privateGet(e, __), keyMap: __privateGet(e, _n2), keyList: __privateGet(e, _r), valList: __privateGet(e, _e2), next: __privateGet(e, _l2), prev: __privateGet(e, _d2), get head() {
        return __privateGet(e, _a2);
      }, get tail() {
        return __privateGet(e, _o);
      }, free: __privateGet(e, _m), isBackgroundFetch: (r) => {
        var _a3;
        return __privateMethod(_a3 = e, _t_instances, t_fn).call(_a3, r);
      }, backgroundFetch: (r, n, i, s) => {
        var _a3;
        return __privateMethod(_a3 = e, _t_instances, B_fn).call(_a3, r, n, i, s);
      }, moveToTail: (r) => {
        var _a3;
        return __privateMethod(_a3 = e, _t_instances, O_fn).call(_a3, r);
      }, indexes: (r) => {
        var _a3;
        return __privateMethod(_a3 = e, _t_instances, S_fn).call(_a3, r);
      }, rindexes: (r) => {
        var _a3;
        return __privateMethod(_a3 = e, _t_instances, E_fn).call(_a3, r);
      }, isStale: (r) => {
        var _a3;
        return __privateGet(_a3 = e, _p2).call(_a3, r);
      } };
    }
    get max() {
      return __privateGet(this, _u3);
    }
    get maxSize() {
      return __privateGet(this, _f);
    }
    get calculatedSize() {
      return __privateGet(this, _b2);
    }
    get size() {
      return __privateGet(this, _i2);
    }
    get fetchMethod() {
      return __privateGet(this, _R);
    }
    get memoMethod() {
      return __privateGet(this, _k);
    }
    get dispose() {
      return __privateGet(this, _g2);
    }
    get disposeAfter() {
      return __privateGet(this, _y2);
    }
    getRemainingTTL(e) {
      return __privateGet(this, _n2).has(e) ? 1 / 0 : 0;
    }
    *entries() {
      for (let e of __privateMethod(this, _t_instances, S_fn).call(this)) __privateGet(this, _e2)[e] !== void 0 && __privateGet(this, _r)[e] !== void 0 && !__privateMethod(this, _t_instances, t_fn).call(this, __privateGet(this, _e2)[e]) && (yield [__privateGet(this, _r)[e], __privateGet(this, _e2)[e]]);
    }
    *rentries() {
      for (let e of __privateMethod(this, _t_instances, E_fn).call(this)) __privateGet(this, _e2)[e] !== void 0 && __privateGet(this, _r)[e] !== void 0 && !__privateMethod(this, _t_instances, t_fn).call(this, __privateGet(this, _e2)[e]) && (yield [__privateGet(this, _r)[e], __privateGet(this, _e2)[e]]);
    }
    *keys() {
      for (let e of __privateMethod(this, _t_instances, S_fn).call(this)) {
        let r = __privateGet(this, _r)[e];
        r !== void 0 && !__privateMethod(this, _t_instances, t_fn).call(this, __privateGet(this, _e2)[e]) && (yield r);
      }
    }
    *rkeys() {
      for (let e of __privateMethod(this, _t_instances, E_fn).call(this)) {
        let r = __privateGet(this, _r)[e];
        r !== void 0 && !__privateMethod(this, _t_instances, t_fn).call(this, __privateGet(this, _e2)[e]) && (yield r);
      }
    }
    *values() {
      for (let e of __privateMethod(this, _t_instances, S_fn).call(this)) __privateGet(this, _e2)[e] !== void 0 && !__privateMethod(this, _t_instances, t_fn).call(this, __privateGet(this, _e2)[e]) && (yield __privateGet(this, _e2)[e]);
    }
    *rvalues() {
      for (let e of __privateMethod(this, _t_instances, E_fn).call(this)) __privateGet(this, _e2)[e] !== void 0 && !__privateMethod(this, _t_instances, t_fn).call(this, __privateGet(this, _e2)[e]) && (yield __privateGet(this, _e2)[e]);
    }
    [(_d = Symbol.iterator, _c2 = Symbol.toStringTag, _d)]() {
      return this.entries();
    }
    find(e, r = {}) {
      for (let n of __privateMethod(this, _t_instances, S_fn).call(this)) {
        let i = __privateGet(this, _e2)[n], s = __privateMethod(this, _t_instances, t_fn).call(this, i) ? i.__staleWhileFetching : i;
        if (s !== void 0 && e(s, __privateGet(this, _r)[n], this)) return this.get(__privateGet(this, _r)[n], r);
      }
    }
    forEach(e, r = this) {
      for (let n of __privateMethod(this, _t_instances, S_fn).call(this)) {
        let i = __privateGet(this, _e2)[n], s = __privateMethod(this, _t_instances, t_fn).call(this, i) ? i.__staleWhileFetching : i;
        s !== void 0 && e.call(r, s, __privateGet(this, _r)[n], this);
      }
    }
    rforEach(e, r = this) {
      for (let n of __privateMethod(this, _t_instances, E_fn).call(this)) {
        let i = __privateGet(this, _e2)[n], s = __privateMethod(this, _t_instances, t_fn).call(this, i) ? i.__staleWhileFetching : i;
        s !== void 0 && e.call(r, s, __privateGet(this, _r)[n], this);
      }
    }
    purgeStale() {
      let e = false;
      for (let r of __privateMethod(this, _t_instances, E_fn).call(this, { allowStale: true })) __privateGet(this, _p2).call(this, r) && (__privateMethod(this, _t_instances, A_fn).call(this, __privateGet(this, _r)[r], "expire"), e = true);
      return e;
    }
    info(e) {
      let r = __privateGet(this, _n2).get(e);
      if (r === void 0) return;
      let n = __privateGet(this, _e2)[r], i = __privateMethod(this, _t_instances, t_fn).call(this, n) ? n.__staleWhileFetching : n;
      if (i === void 0) return;
      let s = { value: i };
      if (__privateGet(this, _h) && __privateGet(this, _w)) {
        let o = __privateGet(this, _h)[r], u = __privateGet(this, _w)[r];
        if (o && u) {
          let c = o - (tn.now() - u);
          s.ttl = c, s.start = Date.now();
        }
      }
      return __privateGet(this, __) && (s.size = __privateGet(this, __)[r]), s;
    }
    dump() {
      let e = [];
      for (let r of __privateMethod(this, _t_instances, S_fn).call(this, { allowStale: true })) {
        let n = __privateGet(this, _r)[r], i = __privateGet(this, _e2)[r], s = __privateMethod(this, _t_instances, t_fn).call(this, i) ? i.__staleWhileFetching : i;
        if (s === void 0 || n === void 0) continue;
        let o = { value: s };
        if (__privateGet(this, _h) && __privateGet(this, _w)) {
          o.ttl = __privateGet(this, _h)[r];
          let u = tn.now() - __privateGet(this, _w)[r];
          o.start = Math.floor(Date.now() - u);
        }
        __privateGet(this, __) && (o.size = __privateGet(this, __)[r]), e.unshift([n, o]);
      }
      return e;
    }
    load(e) {
      this.clear();
      for (let [r, n] of e) {
        if (n.start) {
          let i = Date.now() - n.start;
          n.start = tn.now() - i;
        }
        this.set(r, n.value, n);
      }
    }
    set(e, r, n = {}) {
      var _a3, _b3, _c4, _d3, _e4;
      if (r === void 0) return this.delete(e), this;
      let { ttl: i = this.ttl, start: s, noDisposeOnSet: o = this.noDisposeOnSet, sizeCalculation: u = this.sizeCalculation, status: c } = n, { noUpdateTTL: f = this.noUpdateTTL } = n, d = __privateGet(this, _q).call(this, e, r, n.size || 0, u);
      if (this.maxEntrySize && d > this.maxEntrySize) return c && (c.set = "miss", c.maxEntrySizeExceeded = true), __privateMethod(this, _t_instances, A_fn).call(this, e, "set"), this;
      let h = __privateGet(this, _i2) === 0 ? void 0 : __privateGet(this, _n2).get(e);
      if (h === void 0) h = __privateGet(this, _i2) === 0 ? __privateGet(this, _o) : __privateGet(this, _m).length !== 0 ? __privateGet(this, _m).pop() : __privateGet(this, _i2) === __privateGet(this, _u3) ? __privateMethod(this, _t_instances, M_fn).call(this, false) : __privateGet(this, _i2), __privateGet(this, _r)[h] = e, __privateGet(this, _e2)[h] = r, __privateGet(this, _n2).set(e, h), __privateGet(this, _l2)[__privateGet(this, _o)] = h, __privateGet(this, _d2)[h] = __privateGet(this, _o), __privateSet(this, _o, h), __privateWrapper(this, _i2)._++, __privateGet(this, _C).call(this, h, d, c), c && (c.set = "add"), f = false;
      else {
        __privateMethod(this, _t_instances, O_fn).call(this, h);
        let _ = __privateGet(this, _e2)[h];
        if (r !== _) {
          if (__privateGet(this, _x) && __privateMethod(this, _t_instances, t_fn).call(this, _)) {
            _.__abortController.abort(new Error("replaced"));
            let { __staleWhileFetching: y } = _;
            y !== void 0 && !o && (__privateGet(this, _v) && ((_a3 = __privateGet(this, _g2)) == null ? void 0 : _a3.call(this, y, e, "set")), __privateGet(this, _c3) && ((_b3 = __privateGet(this, _s)) == null ? void 0 : _b3.push([y, e, "set"])));
          } else o || (__privateGet(this, _v) && ((_c4 = __privateGet(this, _g2)) == null ? void 0 : _c4.call(this, _, e, "set")), __privateGet(this, _c3) && ((_d3 = __privateGet(this, _s)) == null ? void 0 : _d3.push([_, e, "set"])));
          if (__privateGet(this, _P).call(this, h), __privateGet(this, _C).call(this, h, d, c), __privateGet(this, _e2)[h] = r, c) {
            c.set = "replace";
            let y = _ && __privateMethod(this, _t_instances, t_fn).call(this, _) ? _.__staleWhileFetching : _;
            y !== void 0 && (c.oldValue = y);
          }
        } else c && (c.set = "update");
      }
      if (i !== 0 && !__privateGet(this, _h) && __privateMethod(this, _t_instances, N_fn).call(this), __privateGet(this, _h) && (f || __privateGet(this, _L).call(this, h, i, s), c && __privateGet(this, _I).call(this, c, h)), !o && __privateGet(this, _c3) && __privateGet(this, _s)) {
        let _ = __privateGet(this, _s), y;
        for (; y = _ == null ? void 0 : _.shift(); ) (_e4 = __privateGet(this, _y2)) == null ? void 0 : _e4.call(this, ...y);
      }
      return this;
    }
    pop() {
      var _a3;
      try {
        for (; __privateGet(this, _i2); ) {
          let e = __privateGet(this, _e2)[__privateGet(this, _a2)];
          if (__privateMethod(this, _t_instances, M_fn).call(this, true), __privateMethod(this, _t_instances, t_fn).call(this, e)) {
            if (e.__staleWhileFetching) return e.__staleWhileFetching;
          } else if (e !== void 0) return e;
        }
      } finally {
        if (__privateGet(this, _c3) && __privateGet(this, _s)) {
          let e = __privateGet(this, _s), r;
          for (; r = e == null ? void 0 : e.shift(); ) (_a3 = __privateGet(this, _y2)) == null ? void 0 : _a3.call(this, ...r);
        }
      }
    }
    has(e, r = {}) {
      let { updateAgeOnHas: n = this.updateAgeOnHas, status: i } = r, s = __privateGet(this, _n2).get(e);
      if (s !== void 0) {
        let o = __privateGet(this, _e2)[s];
        if (__privateMethod(this, _t_instances, t_fn).call(this, o) && o.__staleWhileFetching === void 0) return false;
        if (__privateGet(this, _p2).call(this, s)) i && (i.has = "stale", __privateGet(this, _I).call(this, i, s));
        else return n && __privateGet(this, _T).call(this, s), i && (i.has = "hit", __privateGet(this, _I).call(this, i, s)), true;
      } else i && (i.has = "miss");
      return false;
    }
    peek(e, r = {}) {
      let { allowStale: n = this.allowStale } = r, i = __privateGet(this, _n2).get(e);
      if (i === void 0 || !n && __privateGet(this, _p2).call(this, i)) return;
      let s = __privateGet(this, _e2)[i];
      return __privateMethod(this, _t_instances, t_fn).call(this, s) ? s.__staleWhileFetching : s;
    }
    async fetch(e, r = {}) {
      let { allowStale: n = this.allowStale, updateAgeOnGet: i = this.updateAgeOnGet, noDeleteOnStaleGet: s = this.noDeleteOnStaleGet, ttl: o = this.ttl, noDisposeOnSet: u = this.noDisposeOnSet, size: c = 0, sizeCalculation: f = this.sizeCalculation, noUpdateTTL: d = this.noUpdateTTL, noDeleteOnFetchRejection: h = this.noDeleteOnFetchRejection, allowStaleOnFetchRejection: _ = this.allowStaleOnFetchRejection, ignoreFetchAbort: y = this.ignoreFetchAbort, allowStaleOnFetchAbort: I = this.allowStaleOnFetchAbort, context: S, forceRefresh: b = false, status: m, signal: w } = r;
      if (!__privateGet(this, _x)) return m && (m.fetch = "get"), this.get(e, { allowStale: n, updateAgeOnGet: i, noDeleteOnStaleGet: s, status: m });
      let R = { allowStale: n, updateAgeOnGet: i, noDeleteOnStaleGet: s, ttl: o, noDisposeOnSet: u, size: c, sizeCalculation: f, noUpdateTTL: d, noDeleteOnFetchRejection: h, allowStaleOnFetchRejection: _, allowStaleOnFetchAbort: I, ignoreFetchAbort: y, status: m, signal: w }, A = __privateGet(this, _n2).get(e);
      if (A === void 0) {
        m && (m.fetch = "miss");
        let g = __privateMethod(this, _t_instances, B_fn).call(this, e, A, R, S);
        return g.__returned = g;
      } else {
        let g = __privateGet(this, _e2)[A];
        if (__privateMethod(this, _t_instances, t_fn).call(this, g)) {
          let L = n && g.__staleWhileFetching !== void 0;
          return m && (m.fetch = "inflight", L && (m.returnedStale = true)), L ? g.__staleWhileFetching : g.__returned = g;
        }
        let O = __privateGet(this, _p2).call(this, A);
        if (!b && !O) return m && (m.fetch = "hit"), __privateMethod(this, _t_instances, O_fn).call(this, A), i && __privateGet(this, _T).call(this, A), m && __privateGet(this, _I).call(this, m, A), g;
        let v = __privateMethod(this, _t_instances, B_fn).call(this, e, A, R, S), D = v.__staleWhileFetching !== void 0 && n;
        return m && (m.fetch = O ? "stale" : "refresh", D && O && (m.returnedStale = true)), D ? v.__staleWhileFetching : v.__returned = v;
      }
    }
    async forceFetch(e, r = {}) {
      let n = await this.fetch(e, r);
      if (n === void 0) throw new Error("fetch() returned undefined");
      return n;
    }
    memo(e, r = {}) {
      let n = __privateGet(this, _k);
      if (!n) throw new Error("no memoMethod provided to constructor");
      let { context: i, forceRefresh: s, ...o } = r, u = this.get(e, o);
      if (!s && u !== void 0) return u;
      let c = n(e, u, { options: o, context: i });
      return this.set(e, c, o), c;
    }
    get(e, r = {}) {
      let { allowStale: n = this.allowStale, updateAgeOnGet: i = this.updateAgeOnGet, noDeleteOnStaleGet: s = this.noDeleteOnStaleGet, status: o } = r, u = __privateGet(this, _n2).get(e);
      if (u !== void 0) {
        let c = __privateGet(this, _e2)[u], f = __privateMethod(this, _t_instances, t_fn).call(this, c);
        return o && __privateGet(this, _I).call(this, o, u), __privateGet(this, _p2).call(this, u) ? (o && (o.get = "stale"), f ? (o && n && c.__staleWhileFetching !== void 0 && (o.returnedStale = true), n ? c.__staleWhileFetching : void 0) : (s || __privateMethod(this, _t_instances, A_fn).call(this, e, "expire"), o && n && (o.returnedStale = true), n ? c : void 0)) : (o && (o.get = "hit"), f ? c.__staleWhileFetching : (__privateMethod(this, _t_instances, O_fn).call(this, u), i && __privateGet(this, _T).call(this, u), c));
      } else o && (o.get = "miss");
    }
    delete(e) {
      return __privateMethod(this, _t_instances, A_fn).call(this, e, "delete");
    }
    clear() {
      return __privateMethod(this, _t_instances, F_fn).call(this, "delete");
    }
  }, _u3 = new WeakMap(), _f = new WeakMap(), _g2 = new WeakMap(), _y2 = new WeakMap(), _R = new WeakMap(), _k = new WeakMap(), _i2 = new WeakMap(), _b2 = new WeakMap(), _n2 = new WeakMap(), _r = new WeakMap(), _e2 = new WeakMap(), _l2 = new WeakMap(), _d2 = new WeakMap(), _a2 = new WeakMap(), _o = new WeakMap(), _m = new WeakMap(), _s = new WeakMap(), __ = new WeakMap(), _w = new WeakMap(), _h = new WeakMap(), _v = new WeakMap(), _x = new WeakMap(), _c3 = new WeakMap(), _t_instances = new WeakSet(), N_fn = function() {
    let e = new rn(__privateGet(this, _u3)), r = new rn(__privateGet(this, _u3));
    __privateSet(this, _h, e), __privateSet(this, _w, r), __privateSet(this, _L, (s, o, u = tn.now()) => {
      if (r[s] = o !== 0 ? u : 0, e[s] = o, o !== 0 && this.ttlAutopurge) {
        let c = setTimeout(() => {
          __privateGet(this, _p2).call(this, s) && __privateMethod(this, _t_instances, A_fn).call(this, __privateGet(this, _r)[s], "expire");
        }, o + 1);
        c.unref && c.unref();
      }
    }), __privateSet(this, _T, (s) => {
      r[s] = e[s] !== 0 ? tn.now() : 0;
    }), __privateSet(this, _I, (s, o) => {
      if (e[o]) {
        let u = e[o], c = r[o];
        if (!u || !c) return;
        s.ttl = u, s.start = c, s.now = n || i();
        let f = s.now - c;
        s.remainingTTL = u - f;
      }
    });
    let n = 0, i = () => {
      let s = tn.now();
      if (this.ttlResolution > 0) {
        n = s;
        let o = setTimeout(() => n = 0, this.ttlResolution);
        o.unref && o.unref();
      }
      return s;
    };
    this.getRemainingTTL = (s) => {
      let o = __privateGet(this, _n2).get(s);
      if (o === void 0) return 0;
      let u = e[o], c = r[o];
      if (!u || !c) return 1 / 0;
      let f = (n || i()) - c;
      return u - f;
    }, __privateSet(this, _p2, (s) => {
      let o = r[s], u = e[s];
      return !!u && !!o && (n || i()) - o > u;
    });
  }, _T = new WeakMap(), _I = new WeakMap(), _L = new WeakMap(), _p2 = new WeakMap(), j_fn = function() {
    let e = new rn(__privateGet(this, _u3));
    __privateSet(this, _b2, 0), __privateSet(this, __, e), __privateSet(this, _P, (r) => {
      __privateSet(this, _b2, __privateGet(this, _b2) - e[r]), e[r] = 0;
    }), __privateSet(this, _q, (r, n, i, s) => {
      if (__privateMethod(this, _t_instances, t_fn).call(this, n)) return 0;
      if (!tr(i)) if (s) {
        if (typeof s != "function") throw new TypeError("sizeCalculation must be a function");
        if (i = s(n, r), !tr(i)) throw new TypeError("sizeCalculation return invalid (expect positive integer)");
      } else throw new TypeError("invalid size value (must be positive integer). When maxSize or maxEntrySize is used, sizeCalculation or size must be set.");
      return i;
    }), __privateSet(this, _C, (r, n, i) => {
      if (e[r] = n, __privateGet(this, _f)) {
        let s = __privateGet(this, _f) - e[r];
        for (; __privateGet(this, _b2) > s; ) __privateMethod(this, _t_instances, M_fn).call(this, true);
      }
      __privateSet(this, _b2, __privateGet(this, _b2) + e[r]), i && (i.entrySize = n, i.totalCalculatedSize = __privateGet(this, _b2));
    });
  }, _P = new WeakMap(), _C = new WeakMap(), _q = new WeakMap(), S_fn = function* ({ allowStale: e = this.allowStale } = {}) {
    if (__privateGet(this, _i2)) for (let r = __privateGet(this, _o); !(!__privateMethod(this, _t_instances, D_fn).call(this, r) || ((e || !__privateGet(this, _p2).call(this, r)) && (yield r), r === __privateGet(this, _a2))); ) r = __privateGet(this, _d2)[r];
  }, E_fn = function* ({ allowStale: e = this.allowStale } = {}) {
    if (__privateGet(this, _i2)) for (let r = __privateGet(this, _a2); !(!__privateMethod(this, _t_instances, D_fn).call(this, r) || ((e || !__privateGet(this, _p2).call(this, r)) && (yield r), r === __privateGet(this, _o))); ) r = __privateGet(this, _l2)[r];
  }, D_fn = function(e) {
    return e !== void 0 && __privateGet(this, _n2).get(__privateGet(this, _r)[e]) === e;
  }, M_fn = function(e) {
    var _a3, _b3;
    let r = __privateGet(this, _a2), n = __privateGet(this, _r)[r], i = __privateGet(this, _e2)[r];
    return __privateGet(this, _x) && __privateMethod(this, _t_instances, t_fn).call(this, i) ? i.__abortController.abort(new Error("evicted")) : (__privateGet(this, _v) || __privateGet(this, _c3)) && (__privateGet(this, _v) && ((_a3 = __privateGet(this, _g2)) == null ? void 0 : _a3.call(this, i, n, "evict")), __privateGet(this, _c3) && ((_b3 = __privateGet(this, _s)) == null ? void 0 : _b3.push([i, n, "evict"]))), __privateGet(this, _P).call(this, r), e && (__privateGet(this, _r)[r] = void 0, __privateGet(this, _e2)[r] = void 0, __privateGet(this, _m).push(r)), __privateGet(this, _i2) === 1 ? (__privateSet(this, _a2, __privateSet(this, _o, 0)), __privateGet(this, _m).length = 0) : __privateSet(this, _a2, __privateGet(this, _l2)[r]), __privateGet(this, _n2).delete(n), __privateWrapper(this, _i2)._--, r;
  }, B_fn = function(e, r, n, i) {
    let s = r === void 0 ? void 0 : __privateGet(this, _e2)[r];
    if (__privateMethod(this, _t_instances, t_fn).call(this, s)) return s;
    let o = new io(), { signal: u } = n;
    u == null ? void 0 : u.addEventListener("abort", () => o.abort(u.reason), { signal: o.signal });
    let c = { signal: o.signal, options: n, context: i }, f = (S, b = false) => {
      let { aborted: m } = o.signal, w = n.ignoreFetchAbort && S !== void 0;
      if (n.status && (m && !b ? (n.status.fetchAborted = true, n.status.fetchError = o.signal.reason, w && (n.status.fetchAbortIgnored = true)) : n.status.fetchResolved = true), m && !w && !b) return h(o.signal.reason);
      let R = y;
      return __privateGet(this, _e2)[r] === y && (S === void 0 ? R.__staleWhileFetching ? __privateGet(this, _e2)[r] = R.__staleWhileFetching : __privateMethod(this, _t_instances, A_fn).call(this, e, "fetch") : (n.status && (n.status.fetchUpdated = true), this.set(e, S, c.options))), S;
    }, d = (S) => (n.status && (n.status.fetchRejected = true, n.status.fetchError = S), h(S)), h = (S) => {
      let { aborted: b } = o.signal, m = b && n.allowStaleOnFetchAbort, w = m || n.allowStaleOnFetchRejection, R = w || n.noDeleteOnFetchRejection, A = y;
      if (__privateGet(this, _e2)[r] === y && (!R || A.__staleWhileFetching === void 0 ? __privateMethod(this, _t_instances, A_fn).call(this, e, "fetch") : m || (__privateGet(this, _e2)[r] = A.__staleWhileFetching)), w) return n.status && A.__staleWhileFetching !== void 0 && (n.status.returnedStale = true), A.__staleWhileFetching;
      if (A.__returned === A) throw S;
    }, _ = (S, b) => {
      var _a3;
      let m = (_a3 = __privateGet(this, _R)) == null ? void 0 : _a3.call(this, e, s, c);
      m && m instanceof Promise && m.then((w) => S(w === void 0 ? void 0 : w), b), o.signal.addEventListener("abort", () => {
        (!n.ignoreFetchAbort || n.allowStaleOnFetchAbort) && (S(void 0), n.allowStaleOnFetchAbort && (S = (w) => f(w, true)));
      });
    };
    n.status && (n.status.fetchDispatched = true);
    let y = new Promise(_).then(f, d), I = Object.assign(y, { __abortController: o, __staleWhileFetching: s, __returned: void 0 });
    return r === void 0 ? (this.set(e, I, { ...c.options, status: void 0 }), r = __privateGet(this, _n2).get(e)) : __privateGet(this, _e2)[r] = I, I;
  }, t_fn = function(e) {
    if (!__privateGet(this, _x)) return false;
    let r = e;
    return !!r && r instanceof Promise && r.hasOwnProperty("__staleWhileFetching") && r.__abortController instanceof io;
  }, U_fn = function(e, r) {
    __privateGet(this, _d2)[r] = e, __privateGet(this, _l2)[e] = r;
  }, O_fn = function(e) {
    e !== __privateGet(this, _o) && (e === __privateGet(this, _a2) ? __privateSet(this, _a2, __privateGet(this, _l2)[e]) : __privateMethod(this, _t_instances, U_fn).call(this, __privateGet(this, _d2)[e], __privateGet(this, _l2)[e]), __privateMethod(this, _t_instances, U_fn).call(this, __privateGet(this, _o), e), __privateSet(this, _o, e));
  }, A_fn = function(e, r) {
    var _a3, _b3, _c4, _d3;
    let n = false;
    if (__privateGet(this, _i2) !== 0) {
      let i = __privateGet(this, _n2).get(e);
      if (i !== void 0) if (n = true, __privateGet(this, _i2) === 1) __privateMethod(this, _t_instances, F_fn).call(this, r);
      else {
        __privateGet(this, _P).call(this, i);
        let s = __privateGet(this, _e2)[i];
        if (__privateMethod(this, _t_instances, t_fn).call(this, s) ? s.__abortController.abort(new Error("deleted")) : (__privateGet(this, _v) || __privateGet(this, _c3)) && (__privateGet(this, _v) && ((_a3 = __privateGet(this, _g2)) == null ? void 0 : _a3.call(this, s, e, r)), __privateGet(this, _c3) && ((_b3 = __privateGet(this, _s)) == null ? void 0 : _b3.push([s, e, r]))), __privateGet(this, _n2).delete(e), __privateGet(this, _r)[i] = void 0, __privateGet(this, _e2)[i] = void 0, i === __privateGet(this, _o)) __privateSet(this, _o, __privateGet(this, _d2)[i]);
        else if (i === __privateGet(this, _a2)) __privateSet(this, _a2, __privateGet(this, _l2)[i]);
        else {
          let o = __privateGet(this, _d2)[i];
          __privateGet(this, _l2)[o] = __privateGet(this, _l2)[i];
          let u = __privateGet(this, _l2)[i];
          __privateGet(this, _d2)[u] = __privateGet(this, _d2)[i];
        }
        __privateWrapper(this, _i2)._--, __privateGet(this, _m).push(i);
      }
    }
    if (__privateGet(this, _c3) && ((_c4 = __privateGet(this, _s)) == null ? void 0 : _c4.length)) {
      let i = __privateGet(this, _s), s;
      for (; s = i == null ? void 0 : i.shift(); ) (_d3 = __privateGet(this, _y2)) == null ? void 0 : _d3.call(this, ...s);
    }
    return n;
  }, F_fn = function(e) {
    var _a3, _b3, _c4;
    for (let r of __privateMethod(this, _t_instances, E_fn).call(this, { allowStale: true })) {
      let n = __privateGet(this, _e2)[r];
      if (__privateMethod(this, _t_instances, t_fn).call(this, n)) n.__abortController.abort(new Error("deleted"));
      else {
        let i = __privateGet(this, _r)[r];
        __privateGet(this, _v) && ((_a3 = __privateGet(this, _g2)) == null ? void 0 : _a3.call(this, n, i, e)), __privateGet(this, _c3) && ((_b3 = __privateGet(this, _s)) == null ? void 0 : _b3.push([n, i, e]));
      }
    }
    if (__privateGet(this, _n2).clear(), __privateGet(this, _e2).fill(void 0), __privateGet(this, _r).fill(void 0), __privateGet(this, _h) && __privateGet(this, _w) && (__privateGet(this, _h).fill(0), __privateGet(this, _w).fill(0)), __privateGet(this, __) && __privateGet(this, __).fill(0), __privateSet(this, _a2, 0), __privateSet(this, _o, 0), __privateGet(this, _m).length = 0, __privateSet(this, _b2, 0), __privateSet(this, _i2, 0), __privateGet(this, _c3) && __privateGet(this, _s)) {
      let r = __privateGet(this, _s), n;
      for (; n = r == null ? void 0 : r.shift(); ) (_c4 = __privateGet(this, _y2)) == null ? void 0 : _c4.call(this, ...n);
    }
  }, _e3);
  oo.LRUCache = pa;
});
var ya = H((so) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(so, "__esModule", { value: true });
  so.NumberAllocator = void 0;
  var ga = class {
    constructor(e, r) {
      __publicField(this, "used");
      __publicField(this, "min");
      __publicField(this, "max");
      __publicField(this, "lowWaterMark");
      this.min = e, this.max = r, this.used = /* @__PURE__ */ new Set(), this.lowWaterMark = e;
    }
    firstVacant() {
      if (this.used.size === this.max - this.min + 1) return null;
      for (let e = this.lowWaterMark; e <= this.max; e++) if (!this.used.has(e)) return e;
      return null;
    }
    alloc() {
      if (this.used.size === this.max - this.min + 1) return null;
      for (let e = this.lowWaterMark; e <= this.max; e++) if (!this.used.has(e)) return this.used.add(e), this.lowWaterMark = e + 1, e;
      return null;
    }
    use(e) {
      return e < this.min || e > this.max || this.used.has(e) ? false : (this.used.add(e), true);
    }
    free(e) {
      e < this.min || e > this.max || (this.used.delete(e), e < this.lowWaterMark && (this.lowWaterMark = e));
    }
    clear() {
      this.used.clear(), this.lowWaterMark = this.min;
    }
  };
  so.NumberAllocator = ga;
});
var wp = H((ma) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(ma, "__esModule", { value: true });
  var gS = _p(), yS = ya(), ba = class {
    constructor(e) {
      __publicField(this, "aliasToTopic");
      __publicField(this, "topicToAlias");
      __publicField(this, "max");
      __publicField(this, "numberAllocator");
      __publicField(this, "length");
      e > 0 && (this.aliasToTopic = new gS.LRUCache({ max: e }), this.topicToAlias = {}, this.numberAllocator = new yS.NumberAllocator(1, e), this.max = e, this.length = 0);
    }
    put(e, r) {
      if (r === 0 || r > this.max) return false;
      let n = this.aliasToTopic.get(r);
      return n && delete this.topicToAlias[n], this.aliasToTopic.set(r, e), this.topicToAlias[e] = r, this.numberAllocator.use(r), this.length = this.aliasToTopic.size, true;
    }
    getTopicByAlias(e) {
      return this.aliasToTopic.get(e);
    }
    getAliasByTopic(e) {
      let r = this.topicToAlias[e];
      return typeof r < "u" && this.aliasToTopic.get(r), r;
    }
    clear() {
      this.aliasToTopic.clear(), this.topicToAlias = {}, this.numberAllocator.clear(), this.length = 0;
    }
    getLruAlias() {
      let e = this.numberAllocator.firstVacant();
      return e || [...this.aliasToTopic.keys()][this.aliasToTopic.size - 1];
    }
  };
  ma.default = ba;
});
var Sp = H((Bn) => {
  "use strict";
  x();
  P();
  T();
  var bS = Bn && Bn.__importDefault || function(t) {
    return t && t.__esModule ? t : { default: t };
  };
  Object.defineProperty(Bn, "__esModule", { value: true });
  var mS = Mn(), _S = bS(wp()), vp = Ct(), wS = (t, e, r) => {
    t.log("_handleConnack");
    let { options: n } = t, s = n.protocolVersion === 5 ? e.reasonCode : e.returnCode;
    if (t.connackReceived) {
      let o = new vp.ErrorWithReasonCode("Protocol error: duplicate CONNACK on the same network connection", 130);
      r == null ? void 0 : r.discardParsedPackets(), t._cleanUp(true), t.emit("error", o);
      return;
    }
    if (t.connackReceived = true, clearTimeout(t.connackTimer), delete t.topicAliasSend, t._serverProperties = e.properties, e.properties && e.properties.topicAliasMaximum) {
      if (e.properties.topicAliasMaximum > 65535) {
        r == null ? void 0 : r.discardParsedPackets(), t._cleanUp(true), t.emit("error", new Error("topicAliasMaximum from broker is out of range"));
        return;
      }
      e.properties.topicAliasMaximum > 0 && (t.topicAliasSend = new _S.default(e.properties.topicAliasMaximum));
    }
    if (s === 0) t.reconnecting = false, t._onConnect(e);
    else if (s > 0) {
      t.log("_handleConnack :: connection refused with reason code %d", s);
      let o = new vp.ErrorWithReasonCode(`Connection refused: ${mS.ReasonCodes[s]}`, s);
      r == null ? void 0 : r.discardParsedPackets(), t.reconnectSuppressed = true, t._cleanUp(true);
      try {
        t.emit("error", o);
      } finally {
        n.reconnectOnConnackError && (t.reconnectSuppressed = false, t._setupReconnect());
      }
    }
  };
  Bn.default = wS;
});
var Ep = H((_a) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(_a, "__esModule", { value: true });
  var vS = (t, e, r) => {
    t.log("handling pubrel packet");
    let n = typeof r < "u" ? r : t.noop, { messageId: i } = e, s = { cmd: "pubcomp", messageId: i };
    t.incomingStore.get(e, (o, u) => {
      o ? t._sendPacket(s, n) : (t.emit("message", u.topic, u.payload, u), t.handleMessage(u, (c) => {
        if (c) return n(c);
        t.incomingStore.del(u, t.noop), t._releaseIncomingQoS2Publish(i), t._sendPacket(s, n);
      }));
    });
  };
  _a.default = vS;
});
var Ap = H((Nn) => {
  "use strict";
  x();
  P();
  T();
  var Ln = Nn && Nn.__importDefault || function(t) {
    return t && t.__esModule ? t : { default: t };
  };
  Object.defineProperty(Nn, "__esModule", { value: true });
  var SS = Ln(dp()), ES = Ln(hp()), AS = Ln(Sp()), IS = Ln(Mn()), xS = Ln(Ep()), TS = Ct(), PS = (t) => t < 128 ? 1 : t < 16384 ? 2 : t < 2097152 ? 3 : 4, OS = (t) => 1 + PS(t) + t, RS = (t, e, r, n) => {
    var _a;
    let { options: i } = t, s = (_a = i.properties) == null ? void 0 : _a.maximumPacketSize, o = OS(e.length);
    if (i.protocolVersion === 5 && s && s < o) return t.log("_handlePacket :: %s packet of %d bytes exceeds the advertised maximumPacketSize %d", e.cmd, o, s), n == null ? void 0 : n.discardParsedPackets(), t._cleanUp(true), r(), t.emit("error", new TS.ErrorWithReasonCode(`exceeding packets size ${e.cmd}: ${o} bytes, maximumPacketSize is ${s}`, 149)), t;
    switch (t.log("_handlePacket :: emitting packetreceive"), t.emit("packetreceive", e), e.cmd) {
      case "publish":
        (0, SS.default)(t, e, r, n);
        break;
      case "puback":
      case "pubrec":
      case "pubcomp":
      case "suback":
      case "unsuback":
        t.reschedulePing();
        try {
          (0, IS.default)(t, e);
        } finally {
          r();
        }
        break;
      case "pubrel":
        t.reschedulePing(), (0, xS.default)(t, e, r);
        break;
      case "connack":
        try {
          (0, AS.default)(t, e, n);
        } finally {
          r();
        }
        break;
      case "auth":
        t.reschedulePing();
        try {
          (0, ES.default)(t, e, n);
        } finally {
          r();
        }
        break;
      case "pingresp":
        t.log("_handlePacket :: received pingresp"), t.reschedulePing(true), r();
        break;
      case "disconnect":
        t.emit("disconnect", e), r();
        break;
      default:
        t.log("_handlePacket :: unknown command"), r();
        break;
    }
  };
  Nn.default = RS;
});
var Sa = H((va) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(va, "__esModule", { value: true });
  var wa = class {
    constructor() {
      __publicField(this, "nextId");
      this.nextId = Math.max(1, Math.floor(Math.random() * 65535));
    }
    allocate() {
      let e = this.nextId++;
      return this.nextId === 65536 && (this.nextId = 1), e;
    }
    getLastAllocated() {
      return this.nextId === 1 ? 65535 : this.nextId - 1;
    }
    register(e) {
      return true;
    }
    deallocate(e) {
    }
    clear() {
    }
  };
  va.default = wa;
});
var Ip = H((Aa) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(Aa, "__esModule", { value: true });
  var Ea = class {
    constructor(e) {
      __publicField(this, "aliasToTopic");
      __publicField(this, "max");
      __publicField(this, "length");
      this.aliasToTopic = {}, this.max = e;
    }
    put(e, r) {
      return r === 0 || r > this.max ? false : (this.aliasToTopic[r] = e, this.length = Object.keys(this.aliasToTopic).length, true);
    }
    getTopicByAlias(e) {
      return this.aliasToTopic[e];
    }
    clear() {
      this.aliasToTopic = {};
    }
  };
  Aa.default = Ea;
});
var xp = H((nn) => {
  "use strict";
  x();
  P();
  T();
  var kS = nn && nn.__importDefault || function(t) {
    return t && t.__esModule ? t : { default: t };
  };
  Object.defineProperty(nn, "__esModule", { value: true });
  nn.TypedEventEmitter = void 0;
  var CS = kS((Ht(), _e(Vt))), MS = Ct(), ao = class {
  };
  nn.TypedEventEmitter = ao;
  (0, MS.applyMixin)(ao, CS.default);
});
var Ia = H((uo, Tp) => {
  x();
  P();
  T();
  (function(t, e) {
    typeof uo == "object" && typeof Tp < "u" ? e(uo) : typeof define == "function" && define.amd ? define(["exports"], e) : (t = typeof globalThis < "u" ? globalThis : t || self, e(t.fastUniqueNumbers = {}));
  })(uo, function(t) {
    "use strict";
    var e = function(_) {
      return function(y) {
        var I = _(y);
        return y.add(I), I;
      };
    }, r = function(_) {
      return function(y, I) {
        return _.set(y, I), I;
      };
    }, n = Number.MAX_SAFE_INTEGER === void 0 ? 9007199254740991 : Number.MAX_SAFE_INTEGER, i = 536870912, s = i * 2, o = function(_, y) {
      return function(I) {
        var S = y.get(I), b = S === void 0 ? I.size : S < s ? S + 1 : 0;
        if (!I.has(b)) return _(I, b);
        if (I.size < i) {
          for (; I.has(b); ) b = Math.floor(Math.random() * s);
          return _(I, b);
        }
        if (I.size > n) throw new Error("Congratulations, you created a collection of unique numbers which uses all available integers!");
        for (; I.has(b); ) b = Math.floor(Math.random() * n);
        return _(I, b);
      };
    }, u = /* @__PURE__ */ new WeakMap(), c = r(u), f = o(c, u), d = e(f);
    t.addUniqueNumber = d, t.generateUniqueNumber = f;
  });
});
var qn = H((WL, Mt) => {
  x();
  P();
  T();
  function xa(t) {
    "@babel/helpers - typeof";
    return Mt.exports = xa = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
      return typeof e;
    } : function(e) {
      return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
    }, Mt.exports.__esModule = true, Mt.exports.default = Mt.exports, xa(t);
  }
  Mt.exports = xa, Mt.exports.__esModule = true, Mt.exports.default = Mt.exports;
});
var Op = H((ZL, Dn) => {
  x();
  P();
  T();
  var Pp = qn().default;
  function BS(t, e) {
    if (Pp(t) != "object" || !t) return t;
    var r = t[Symbol.toPrimitive];
    if (r !== void 0) {
      var n = r.call(t, e || "default");
      if (Pp(n) != "object") return n;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return (e === "string" ? String : Number)(t);
  }
  Dn.exports = BS, Dn.exports.__esModule = true, Dn.exports.default = Dn.exports;
});
var Rp = H((lq, Un) => {
  x();
  P();
  T();
  var NS = qn().default, LS = Op();
  function qS(t) {
    var e = LS(t, "string");
    return NS(e) == "symbol" ? e : e + "";
  }
  Un.exports = qS, Un.exports.__esModule = true, Un.exports.default = Un.exports;
});
var kp = H((_q, Fn) => {
  x();
  P();
  T();
  var DS = Rp();
  function US(t, e, r) {
    return (e = DS(e)) in t ? Object.defineProperty(t, e, { value: r, enumerable: true, configurable: true, writable: true }) : t[e] = r, t;
  }
  Fn.exports = US, Fn.exports.__esModule = true, Fn.exports.default = Fn.exports;
});
var Cp = H((Oq, jn) => {
  x();
  P();
  T();
  function FS(t) {
    if (Array.isArray(t)) return t;
  }
  jn.exports = FS, jn.exports.__esModule = true, jn.exports.default = jn.exports;
});
var Mp = H((Uq, $n) => {
  x();
  P();
  T();
  function jS(t, e) {
    var r = t == null ? null : typeof Symbol < "u" && t[Symbol.iterator] || t["@@iterator"];
    if (r != null) {
      var n, i, s, o, u = [], c = true, f = false;
      try {
        if (s = (r = r.call(t)).next, e === 0) {
          if (Object(r) !== r) return;
          c = false;
        } else for (; !(c = (n = s.call(r)).done) && (u.push(n.value), u.length !== e); c = true) ;
      } catch (d) {
        f = true, i = d;
      } finally {
        try {
          if (!c && r.return != null && (o = r.return(), Object(o) !== o)) return;
        } finally {
          if (f) throw i;
        }
      }
      return u;
    }
  }
  $n.exports = jS, $n.exports.__esModule = true, $n.exports.default = $n.exports;
});
var Bp = H((Kq, Wn) => {
  x();
  P();
  T();
  function $S(t, e) {
    (e == null || e > t.length) && (e = t.length);
    for (var r = 0, n = Array(e); r < e; r++) n[r] = t[r];
    return n;
  }
  Wn.exports = $S, Wn.exports.__esModule = true, Wn.exports.default = Wn.exports;
});
var Lp = H((oD, Vn) => {
  x();
  P();
  T();
  var Np = Bp();
  function WS(t, e) {
    if (t) {
      if (typeof t == "string") return Np(t, e);
      var r = {}.toString.call(t).slice(8, -1);
      return r === "Object" && t.constructor && (r = t.constructor.name), r === "Map" || r === "Set" ? Array.from(t) : r === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r) ? Np(t, e) : void 0;
    }
  }
  Vn.exports = WS, Vn.exports.__esModule = true, Vn.exports.default = Vn.exports;
});
var qp = H((gD, Hn) => {
  x();
  P();
  T();
  function VS() {
    throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
  }
  Hn.exports = VS, Hn.exports.__esModule = true, Hn.exports.default = Hn.exports;
});
var Dp = H((ID, zn) => {
  x();
  P();
  T();
  var HS = Cp(), zS = Mp(), GS = Lp(), QS = qp();
  function KS(t, e) {
    return HS(t) || zS(t, e) || GS(t, e) || QS();
  }
  zn.exports = KS, zn.exports.__esModule = true, zn.exports.default = zn.exports;
});
var Fp = H((ND, Gn) => {
  x();
  P();
  T();
  function Up(t, e, r, n, i, s, o) {
    try {
      var u = t[s](o), c = u.value;
    } catch (f) {
      return void r(f);
    }
    u.done ? e(c) : Promise.resolve(c).then(n, i);
  }
  function YS(t) {
    return function() {
      var e = this, r = arguments;
      return new Promise(function(n, i) {
        var s = t.apply(e, r);
        function o(c) {
          Up(s, n, i, o, u, "next", c);
        }
        function u(c) {
          Up(s, n, i, o, u, "throw", c);
        }
        o(void 0);
      });
    };
  }
  Gn.exports = YS, Gn.exports.__esModule = true, Gn.exports.default = Gn.exports;
});
var Ta = H((HD, Qn) => {
  x();
  P();
  T();
  function JS(t, e) {
    this.v = t, this.k = e;
  }
  Qn.exports = JS, Qn.exports.__esModule = true, Qn.exports.default = Qn.exports;
});
var Pa = H((tU, Bt) => {
  x();
  P();
  T();
  function lo(t, e, r, n) {
    var i = Object.defineProperty;
    try {
      i({}, "", {});
    } catch {
      i = 0;
    }
    Bt.exports = lo = function(o, u, c, f) {
      function d(h, _) {
        lo(o, h, function(y) {
          return this._invoke(h, _, y);
        });
      }
      u ? i ? i(o, u, { value: c, enumerable: !f, configurable: !f, writable: !f }) : o[u] = c : (d("next", 0), d("throw", 1), d("return", 2));
    }, Bt.exports.__esModule = true, Bt.exports.default = Bt.exports, lo(t, e, r, n);
  }
  Bt.exports = lo, Bt.exports.__esModule = true, Bt.exports.default = Bt.exports;
});
var Oa = H((fU, Nt) => {
  x();
  P();
  T();
  var wt = Pa();
  function jp() {
    var t, e, r = typeof Symbol == "function" ? Symbol : {}, n = r.iterator || "@@iterator", i = r.toStringTag || "@@toStringTag";
    function s(y, I, S, b) {
      var m = I && I.prototype instanceof u ? I : u, w = Object.create(m.prototype);
      return wt(w, "_invoke", function(R, A, g) {
        var O, v, B, D = 0, L = g || [], K = false, U = { p: 0, n: 0, v: t, a: $, f: $.bind(t, 4), d: function(J, ee) {
          return O = J, v = 0, B = t, U.n = ee, o;
        } };
        function $(G, J) {
          for (v = G, B = J, e = 0; !K && D && !ee && e < L.length; e++) {
            var ee, z = L[e], W = U.p, te = z[2];
            G > 3 ? (ee = te === J) && (B = z[(v = z[4]) ? 5 : (v = 3, 3)], z[4] = z[5] = t) : z[0] <= W && ((ee = G < 2 && W < z[1]) ? (v = 0, U.v = J, U.n = z[1]) : W < te && (ee = G < 3 || z[0] > J || J > te) && (z[4] = G, z[5] = J, U.n = te, v = 0));
          }
          if (ee || G > 1) return o;
          throw K = true, J;
        }
        return function(G, J, ee) {
          if (D > 1) throw TypeError("Generator is already running");
          for (K && J === 1 && $(J, ee), v = J, B = ee; (e = v < 2 ? t : B) || !K; ) {
            O || (v ? v < 3 ? (v > 1 && (U.n = -1), $(v, B)) : U.n = B : U.v = B);
            try {
              if (D = 2, O) {
                if (v || (G = "next"), e = O[G]) {
                  if (!(e = e.call(O, B))) throw TypeError("iterator result is not an object");
                  if (!e.done) return e;
                  B = e.value, v < 2 && (v = 0);
                } else v === 1 && (e = O.return) && e.call(O), v < 2 && (B = TypeError("The iterator does not provide a '" + G + "' method"), v = 1);
                O = t;
              } else if ((e = (K = U.n < 0) ? B : R.call(A, U)) !== o) break;
            } catch (z) {
              O = t, v = 1, B = z;
            } finally {
              D = 1;
            }
          }
          return { value: e, done: K };
        };
      }(y, S, b), true), w;
    }
    var o = {};
    function u() {
    }
    function c() {
    }
    function f() {
    }
    e = Object.getPrototypeOf;
    var d = [][n] ? e(e([][n]())) : (wt(e = {}, n, function() {
      return this;
    }), e), h = f.prototype = u.prototype = Object.create(d);
    function _(y) {
      return Object.setPrototypeOf ? Object.setPrototypeOf(y, f) : (y.__proto__ = f, wt(y, i, "GeneratorFunction")), y.prototype = Object.create(h), y;
    }
    return c.prototype = f, wt(h, "constructor", f), wt(f, "constructor", c), c.displayName = "GeneratorFunction", wt(f, i, "GeneratorFunction"), wt(h), wt(h, i, "Generator"), wt(h, n, function() {
      return this;
    }), wt(h, "toString", function() {
      return "[object Generator]";
    }), (Nt.exports = jp = function() {
      return { w: s, m: _ };
    }, Nt.exports.__esModule = true, Nt.exports.default = Nt.exports)();
  }
  Nt.exports = jp, Nt.exports.__esModule = true, Nt.exports.default = Nt.exports;
});
var Ca = H((vU, Kn) => {
  x();
  P();
  T();
  var XS = Ta(), Ra = Pa();
  function ka(t, e) {
    function r(i, s, o, u) {
      try {
        var c = t[i](s), f = c.value;
        return f instanceof XS ? e.resolve(f.v).then(function(d) {
          r("next", d, o, u);
        }, function(d) {
          r("throw", d, o, u);
        }) : e.resolve(f).then(function(d) {
          c.value = d, o(c);
        }, function(d) {
          return r("throw", d, o, u);
        });
      } catch (d) {
        u(d);
      }
    }
    var n;
    this.next || (Ra(ka.prototype), Ra(ka.prototype, typeof Symbol == "function" && Symbol.asyncIterator || "@asyncIterator", function() {
      return this;
    })), Ra(this, "_invoke", function(i, s, o) {
      function u() {
        return new e(function(c, f) {
          r(i, o, c, f);
        });
      }
      return n = n ? n.then(u, u) : u();
    }, true);
  }
  Kn.exports = ka, Kn.exports.__esModule = true, Kn.exports.default = Kn.exports;
});
var Ma = H((kU, Yn) => {
  x();
  P();
  T();
  var ZS = Oa(), eE = Ca();
  function tE(t, e, r, n, i) {
    return new eE(ZS().w(t, e, r, n), i || Promise);
  }
  Yn.exports = tE, Yn.exports.__esModule = true, Yn.exports.default = Yn.exports;
});
var $p = H((jU, Jn) => {
  x();
  P();
  T();
  var rE = Ma();
  function nE(t, e, r, n, i) {
    var s = rE(t, e, r, n, i);
    return s.next().then(function(o) {
      return o.done ? o.value : s.next();
    });
  }
  Jn.exports = nE, Jn.exports.__esModule = true, Jn.exports.default = Jn.exports;
});
var Wp = H((JU, Xn) => {
  x();
  P();
  T();
  function iE(t) {
    var e = Object(t), r = [];
    for (var n in e) r.unshift(n);
    return function i() {
      for (; r.length; ) if ((n = r.pop()) in e) return i.value = n, i.done = false, i;
      return i.done = true, i;
    };
  }
  Xn.exports = iE, Xn.exports.__esModule = true, Xn.exports.default = Xn.exports;
});
var Vp = H((a3, Zn) => {
  x();
  P();
  T();
  var oE = qn().default;
  function sE(t) {
    if (t != null) {
      var e = t[typeof Symbol == "function" && Symbol.iterator || "@@iterator"], r = 0;
      if (e) return e.call(t);
      if (typeof t.next == "function") return t;
      if (!isNaN(t.length)) return { next: function() {
        return t && r >= t.length && (t = void 0), { value: t && t[r++], done: !t };
      } };
    }
    throw new TypeError(oE(t) + " is not iterable");
  }
  Zn.exports = sE, Zn.exports.__esModule = true, Zn.exports.default = Zn.exports;
});
var zp = H((b3, Lt) => {
  x();
  P();
  T();
  var aE = Ta(), uE = Oa(), lE = $p(), cE = Ma(), fE = Ca(), dE = Wp(), Hp = Vp();
  function Ba() {
    "use strict";
    var t = uE(), e = t.m(Ba), r = (Object.getPrototypeOf ? Object.getPrototypeOf(e) : e.__proto__).constructor;
    function n(o) {
      var u = typeof o == "function" && o.constructor;
      return !!u && (u === r || (u.displayName || u.name) === "GeneratorFunction");
    }
    var i = { throw: 1, return: 2, break: 3, continue: 3 };
    function s(o) {
      var u, c;
      return function(f) {
        u || (u = { stop: function() {
          return c(f.a, 2);
        }, catch: function() {
          return f.v;
        }, abrupt: function(h, _) {
          return c(f.a, i[h], _);
        }, delegateYield: function(h, _, y) {
          return u.resultName = _, c(f.d, Hp(h), y);
        }, finish: function(h) {
          return c(f.f, h);
        } }, c = function(h, _, y) {
          f.p = u.prev, f.n = u.next;
          try {
            return h(_, y);
          } finally {
            u.next = f.n;
          }
        }), u.resultName && (u[u.resultName] = f.v, u.resultName = void 0), u.sent = f.v, u.next = f.n;
        try {
          return o.call(this, u);
        } finally {
          f.p = u.prev, f.n = u.next;
        }
      };
    }
    return (Lt.exports = Ba = function() {
      return { wrap: function(c, f, d, h) {
        return t.w(s(c), f, d, h && h.reverse());
      }, isGeneratorFunction: n, mark: t.m, awrap: function(c, f) {
        return new aE(c, f);
      }, AsyncIterator: fE, async: function(c, f, d, h, _) {
        return (n(f) ? cE : lE)(s(c), f, d, h, _);
      }, keys: dE, values: Hp };
    }, Lt.exports.__esModule = true, Lt.exports.default = Lt.exports)();
  }
  Lt.exports = Ba, Lt.exports.__esModule = true, Lt.exports.default = Lt.exports;
});
var Qp = H((T3, Gp) => {
  x();
  P();
  T();
  var co = zp()();
  Gp.exports = co;
  try {
    regeneratorRuntime = co;
  } catch {
    typeof globalThis == "object" ? globalThis.regeneratorRuntime = co : Function("r", "regeneratorRuntime = r")(co);
  }
});
var Yp = H((fo, Kp) => {
  x();
  P();
  T();
  (function(t, e) {
    typeof fo == "object" && typeof Kp < "u" ? e(fo, Ia(), kp(), Dp(), Fp(), Qp()) : typeof define == "function" && define.amd ? define(["exports", "fast-unique-numbers", "@babel/runtime/helpers/defineProperty", "@babel/runtime/helpers/slicedToArray", "@babel/runtime/helpers/asyncToGenerator", "@babel/runtime/regenerator"], e) : (t = typeof globalThis < "u" ? globalThis : t || self, e(t.brokerFactory = {}, t.fastUniqueNumbers, t._defineProperty, t._slicedToArray, t._asyncToGenerator, t._regeneratorRuntime));
  })(fo, function(t, e, r, n, i, s) {
    "use strict";
    function o(S, b) {
      var m = Object.keys(S);
      if (Object.getOwnPropertySymbols) {
        var w = Object.getOwnPropertySymbols(S);
        b && (w = w.filter(function(R) {
          return Object.getOwnPropertyDescriptor(S, R).enumerable;
        })), m.push.apply(m, w);
      }
      return m;
    }
    function u(S) {
      for (var b = 1; b < arguments.length; b++) {
        var m = arguments[b] != null ? arguments[b] : {};
        b % 2 ? o(Object(m), true).forEach(function(w) {
          r(S, w, m[w]);
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(S, Object.getOwnPropertyDescriptors(m)) : o(Object(m)).forEach(function(w) {
          Object.defineProperty(S, w, Object.getOwnPropertyDescriptor(m, w));
        });
      }
      return S;
    }
    var c = function(b, m, w, R) {
      return function(A) {
        var g = m(A);
        return function(O) {
          var v = b(O);
          O.addEventListener("message", function(ee) {
            var z = ee.data, W = z.id;
            if (W !== null && v.has(W)) {
              var te = v.get(W), Y = te.reject, X = te.resolve;
              v.delete(W), z.error === void 0 ? X(z.result) : Y(new Error(z.error.message));
            }
          }), R(O) && O.start();
          for (var B = function(z) {
            var W = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : null, te = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : [];
            return new Promise(function(Y, X) {
              var ce = w(v);
              v.set(ce, { reject: X, resolve: Y }), W === null ? O.postMessage({ id: ce, method: z }, te) : O.postMessage({ id: ce, method: z, params: W }, te);
            });
          }, D = function(z, W) {
            var te = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : [];
            O.postMessage({ id: null, method: z, params: W }, te);
          }, L = {}, K = 0, U = Object.entries(g); K < U.length; K++) {
            var $ = n(U[K], 2), G = $[0], J = $[1];
            L = u(u({}, L), {}, r({}, G, J({ call: B, notify: D })));
          }
          return u({}, L);
        };
      };
    }, f = function(b) {
      return function(m) {
        if (b.has(m)) return b.get(m);
        var w = /* @__PURE__ */ new Map();
        return b.set(m, w), w;
      };
    };
    function d(S, b) {
      var m = Object.keys(S);
      if (Object.getOwnPropertySymbols) {
        var w = Object.getOwnPropertySymbols(S);
        b && (w = w.filter(function(R) {
          return Object.getOwnPropertyDescriptor(S, R).enumerable;
        })), m.push.apply(m, w);
      }
      return m;
    }
    function h(S) {
      for (var b = 1; b < arguments.length; b++) {
        var m = arguments[b] != null ? arguments[b] : {};
        b % 2 ? d(Object(m), true).forEach(function(w) {
          r(S, w, m[w]);
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(S, Object.getOwnPropertyDescriptors(m)) : d(Object(m)).forEach(function(w) {
          Object.defineProperty(S, w, Object.getOwnPropertyDescriptor(m, w));
        });
      }
      return S;
    }
    var _ = function(b) {
      return function(m) {
        return h(h({}, m), {}, { connect: function(R) {
          var A = R.call;
          return i(s.mark(function g() {
            var O, v, B, D;
            return s.wrap(function(L) {
              for (; ; ) switch (L.prev = L.next) {
                case 0:
                  return O = new MessageChannel(), v = O.port1, B = O.port2, L.next = 1, A("connect", { port: v }, [v]);
                case 1:
                  return D = L.sent, b.set(B, D), L.abrupt("return", B);
                case 2:
                case "end":
                  return L.stop();
              }
            }, g);
          }));
        }, disconnect: function(R) {
          var A = R.call;
          return function() {
            var g = i(s.mark(function O(v) {
              var B;
              return s.wrap(function(D) {
                for (; ; ) switch (D.prev = D.next) {
                  case 0:
                    if (B = b.get(v), B !== void 0) {
                      D.next = 1;
                      break;
                    }
                    throw new Error("The given port is not connected.");
                  case 1:
                    return D.next = 2, A("disconnect", { portId: B });
                  case 2:
                  case "end":
                    return D.stop();
                }
              }, O);
            }));
            return function(O) {
              return g.apply(this, arguments);
            };
          }();
        }, isSupported: function(R) {
          var A = R.call;
          return function() {
            return A("isSupported");
          };
        } });
      };
    }, y = function(b) {
      return typeof b.start == "function";
    }, I = c(f(/* @__PURE__ */ new WeakMap()), _(/* @__PURE__ */ new WeakMap()), e.generateUniqueNumber, y);
    t.createBroker = I;
  });
});
var Xp = H((ho, Jp) => {
  x();
  P();
  T();
  (function(t, e) {
    typeof ho == "object" && typeof Jp < "u" ? e(ho, Yp(), Ia(), qn()) : typeof define == "function" && define.amd ? define(["exports", "broker-factory", "fast-unique-numbers", "@babel/runtime/helpers/typeof"], e) : (t = typeof globalThis < "u" ? globalThis : t || self, e(t.workerTimersBroker = {}, t.brokerFactory, t.fastUniqueNumbers, t._typeof));
  })(ho, function(t, e, r, n) {
    "use strict";
    var i = function(m) {
      return function(w) {
        return function(R) {
          n(m.get(R)) === "symbol" && (m.set(R, null), w(R).then(function() {
            m.delete(R);
          }));
        };
      };
    }, s = function(m) {
      return function(w) {
        return function(R) {
          n(m.get(R)) === "symbol" && (m.set(R, null), w(R).then(function() {
            m.delete(R);
          }));
        };
      };
    }, o = function(m, w) {
      return function(R) {
        return function(A) {
          for (var g = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0, O = arguments.length, v = new Array(O > 2 ? O - 2 : 0), B = 2; B < O; B++) v[B - 2] = arguments[B];
          var D = Symbol(), L = m(w);
          w.set(L, D);
          var K = function() {
            return R(g, L).then(function() {
              var $ = w.get(L);
              if ($ === void 0) throw new Error("The timer is in an undefined state.");
              $ === D && (A.apply(void 0, v), w.get(L) === D && K());
            });
          };
          return K(), L;
        };
      };
    }, u = function(m, w) {
      return function(R) {
        return function(A) {
          for (var g = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0, O = arguments.length, v = new Array(O > 2 ? O - 2 : 0), B = 2; B < O; B++) v[B - 2] = arguments[B];
          var D = Symbol(), L = m(w);
          return w.set(L, D), R(g, L).then(function() {
            var K = w.get(L);
            if (K === void 0) throw new Error("The timer is in an undefined state.");
            K === D && (w.delete(L), A.apply(void 0, v));
          }), L;
        };
      };
    }, c = /* @__PURE__ */ new Map([[0, null]]), f = /* @__PURE__ */ new Map([[0, null]]), d = i(c), h = s(f), _ = o(r.generateUniqueNumber, c), y = u(r.generateUniqueNumber, f), I = e.createBroker({ clearInterval: function(m) {
      var w = m.call;
      return d(function(R) {
        return w("clear", { timerId: R, timerType: "interval" });
      });
    }, clearTimeout: function(m) {
      var w = m.call;
      return h(function(R) {
        return w("clear", { timerId: R, timerType: "timeout" });
      });
    }, setInterval: function(m) {
      var w = m.call;
      return _(function(R, A) {
        return w("set", { delay: R, now: performance.timeOrigin + performance.now(), timerId: A, timerType: "interval" });
      });
    }, setTimeout: function(m) {
      var w = m.call;
      return y(function(R, A) {
        return w("set", { delay: R, now: performance.timeOrigin + performance.now(), timerId: A, timerType: "timeout" });
      });
    } }), S = function(m) {
      var w = new Worker(m);
      return I(w);
    };
    t.load = S, t.wrap = I;
  });
});
var eg = H((po, Zp) => {
  x();
  P();
  T();
  (function(t, e) {
    typeof po == "object" && typeof Zp < "u" ? e(po, Xp()) : typeof define == "function" && define.amd ? define(["exports", "worker-timers-broker"], e) : (t = typeof globalThis < "u" ? globalThis : t || self, e(t.workerTimers = {}, t.workerTimersBroker));
  })(po, function(t, e) {
    "use strict";
    var r = function(d, h) {
      var _ = null;
      return function() {
        if (_ !== null) return _;
        var y = new Blob([h], { type: "application/javascript; charset=utf-8" }), I = URL.createObjectURL(y);
        return _ = d(I), setTimeout(function() {
          return URL.revokeObjectURL(I);
        }), _;
      };
    }, n = `(()=>{var e={389(e,t){!function(e){"use strict";var t=function(e){return function(t){var r=e(t);return t.add(r),r}},r=function(e){return function(t,r){return e.set(t,r),r}},n=void 0===Number.MAX_SAFE_INTEGER?9007199254740991:Number.MAX_SAFE_INTEGER,o=536870912,u=2*o,a=function(e,t){return function(r){var a=t.get(r),i=void 0===a?r.size:a<u?a+1:0;if(!r.has(i))return e(r,i);if(r.size<o){for(;r.has(i);)i=Math.floor(Math.random()*u);return e(r,i)}if(r.size>n)throw new Error("Congratulations, you created a collection of unique numbers which uses all available integers!");for(;r.has(i);)i=Math.floor(Math.random()*n);return e(r,i)}},i=new WeakMap,s=r(i),c=a(s,i),f=t(c);e.addUniqueNumber=f,e.generateUniqueNumber=c}(t)},623(e,t,r){!function(e,t,r,n,o){"use strict";var u={INTERNAL_ERROR:-32603,INVALID_PARAMS:-32602,METHOD_NOT_FOUND:-32601},a=function(e,t){return Object.assign(new Error(e),{status:t})},i=function(e){return a('The requested method called "'.concat(e,'" is not supported.'),u.METHOD_NOT_FOUND)},s=function(e){return a('The handler of the method called "'.concat(e,'" returned no required result.'),u.INTERNAL_ERROR)},c=function(e){return a('The handler of the method called "'.concat(e,'" returned an unexpected result.'),u.INTERNAL_ERROR)},f=function(e){return a('The specified parameter called "portId" with the given value "'.concat(e,'" does not identify a port connected to this worker.'),u.INVALID_PARAMS)},l=function(e,n){return function(){var o=t(r.mark(function t(o){var u,a,f,l,p,d,v,x,y,b,h,m,_,g,w;return r.wrap(function(t){for(;;)switch(t.prev=t.next){case 0:if(u=o.data,a=u.id,f=u.method,l=u.params,p=n[f],t.prev=1,void 0!==p){t.next=2;break}throw i(f);case 2:if(void 0!==(d=void 0===l?p():p(l))){t.next=3;break}throw s(f);case 3:if(!(d instanceof Promise)){t.next=5;break}return t.next=4,d;case 4:g=t.sent,t.next=6;break;case 5:g=d;case 6:if(v=g,null!==a){t.next=8;break}if(void 0===v.result){t.next=7;break}throw c(f);case 7:t.next=10;break;case 8:if(void 0!==v.result){t.next=9;break}throw c(f);case 9:x=v.result,y=v.transferables,b=void 0===y?[]:y,e.postMessage({id:a,result:x},b);case 10:t.next=12;break;case 11:t.prev=11,w=t.catch(1),h=w.message,m=w.status,_=void 0===m?-32603:m,e.postMessage({error:{code:_,message:h},id:a});case 12:case"end":return t.stop()}},t,null,[[1,11]])}));return function(e){return o.apply(this,arguments)}}()},p=function(){return new Promise(function(e){var t=new ArrayBuffer(0),r=new MessageChannel,n=r.port1,o=r.port2;n.onmessage=function(t){var r=t.data;return e(null!==r)},o.postMessage(t,[t])})};function d(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),r.push.apply(r,n)}return r}function v(e){for(var t=1;t<arguments.length;t++){var r=null!=arguments[t]?arguments[t]:{};t%2?d(Object(r),!0).forEach(function(t){n(e,t,r[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):d(Object(r)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(r,t))})}return e}var x=new Map,y=function(e,n,u){return v(v({},n),{},{connect:function(t){var r=t.port;r.start();var u=e(r,n),a=o.generateUniqueNumber(x);return x.set(a,function(){u(),r.close(),x.delete(a)}),{result:a}},disconnect:function(e){var t=e.portId,r=x.get(t);if(void 0===r)throw f(t);return r(),{result:null}},isSupported:function(){var e=t(r.mark(function e(){var t,n,o;return r.wrap(function(e){for(;;)switch(e.prev=e.next){case 0:return e.next=1,p();case 1:if(!e.sent){e.next=5;break}if(!((t=u())instanceof Promise)){e.next=3;break}return e.next=2,t;case 2:o=e.sent,e.next=4;break;case 3:o=t;case 4:return n=o,e.abrupt("return",{result:n});case 5:return e.abrupt("return",{result:!1});case 6:case"end":return e.stop()}},e)}));function n(){return e.apply(this,arguments)}return n}()})},b=function(e,t){var r=y(b,t,arguments.length>2&&void 0!==arguments[2]?arguments[2]:function(){return!0}),n=l(e,r);return e.addEventListener("message",n),function(){return e.removeEventListener("message",n)}};e.createWorker=b,e.isSupported=p}(t,r(293),r(756),r(693),r(389))},472(e,t,r){!function(e,t,r,n){"use strict";var o=function(e,t){return function(r){var o=t.get(r);if(void 0===o)return Promise.resolve(!1);var u=n(o,2),a=u[0],i=u[1];return e(a),t.delete(r),i(!1),Promise.resolve(!0)}},u=function(e,t){var r=function(n,o,u,a){var i=n-e.now();i>0?o.set(a,[t(r,i,n,o,u,a),u]):(o.delete(a),u(!0))};return r},a=function(e,t,r,n){return function(o,u,a){var i=o+u-t.timeOrigin,s=i-t.now();return new Promise(function(t){e.set(a,[r(n,s,i,e,t,a),t])})}},i=new Map,s=o(globalThis.clearTimeout,i),c=new Map,f=o(globalThis.clearTimeout,c),l=u(performance,globalThis.setTimeout),p=a(i,performance,globalThis.setTimeout,l),d=a(c,performance,globalThis.setTimeout,l);r.createWorker(self,{clear:function(){var r=e(t.mark(function e(r){var n,o,u;return t.wrap(function(e){for(;;)switch(e.prev=e.next){case 0:return n=r.timerId,o=r.timerType,e.next=1,"interval"===o?s(n):f(n);case 1:return u=e.sent,e.abrupt("return",{result:u});case 2:case"end":return e.stop()}},e)}));function n(e){return r.apply(this,arguments)}return n}(),set:function(){var r=e(t.mark(function e(r){var n,o,u,a,i;return t.wrap(function(e){for(;;)switch(e.prev=e.next){case 0:return n=r.delay,o=r.now,u=r.timerId,a=r.timerType,e.next=1,("interval"===a?p:d)(n,o,u);case 1:return i=e.sent,e.abrupt("return",{result:i});case 2:case"end":return e.stop()}},e)}));function n(e){return r.apply(this,arguments)}return n}()})}(r(293),r(756),r(623),r(715))},172(e){e.exports=function(e,t){this.v=e,this.k=t},e.exports.__esModule=!0,e.exports.default=e.exports},79(e){e.exports=function(e,t){(null==t||t>e.length)&&(t=e.length);for(var r=0,n=Array(t);r<t;r++)n[r]=e[r];return n},e.exports.__esModule=!0,e.exports.default=e.exports},987(e){e.exports=function(e){if(Array.isArray(e))return e},e.exports.__esModule=!0,e.exports.default=e.exports},293(e){function t(e,t,r,n,o,u,a){try{var i=e[u](a),s=i.value}catch(e){return void r(e)}i.done?t(s):Promise.resolve(s).then(n,o)}e.exports=function(e){return function(){var r=this,n=arguments;return new Promise(function(o,u){var a=e.apply(r,n);function i(e){t(a,o,u,i,s,"next",e)}function s(e){t(a,o,u,i,s,"throw",e)}i(void 0)})}},e.exports.__esModule=!0,e.exports.default=e.exports},693(e,t,r){var n=r(736);e.exports=function(e,t,r){return(t=n(t))in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r,e},e.exports.__esModule=!0,e.exports.default=e.exports},156(e){e.exports=function(e,t){var r=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=r){var n,o,u,a,i=[],s=!0,c=!1;try{if(u=(r=r.call(e)).next,0===t){if(Object(r)!==r)return;s=!1}else for(;!(s=(n=u.call(r)).done)&&(i.push(n.value),i.length!==t);s=!0);}catch(e){c=!0,o=e}finally{try{if(!s&&null!=r.return&&(a=r.return(),Object(a)!==a))return}finally{if(c)throw o}}return i}},e.exports.__esModule=!0,e.exports.default=e.exports},752(e){e.exports=function(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")},e.exports.__esModule=!0,e.exports.default=e.exports},993(e,t,r){var n=r(546);function o(){var t,r,u="function"==typeof Symbol?Symbol:{},a=u.iterator||"@@iterator",i=u.toStringTag||"@@toStringTag";function s(e,o,u,a){var i=o&&o.prototype instanceof f?o:f,s=Object.create(i.prototype);return n(s,"_invoke",function(e,n,o){var u,a,i,s=0,f=o||[],l=!1,p={p:0,n:0,v:t,a:d,f:d.bind(t,4),d:function(e,r){return u=e,a=0,i=t,p.n=r,c}};function d(e,n){for(a=e,i=n,r=0;!l&&s&&!o&&r<f.length;r++){var o,u=f[r],d=p.p,v=u[2];e>3?(o=v===n)&&(i=u[(a=u[4])?5:(a=3,3)],u[4]=u[5]=t):u[0]<=d&&((o=e<2&&d<u[1])?(a=0,p.v=n,p.n=u[1]):d<v&&(o=e<3||u[0]>n||n>v)&&(u[4]=e,u[5]=n,p.n=v,a=0))}if(o||e>1)return c;throw l=!0,n}return function(o,f,v){if(s>1)throw TypeError("Generator is already running");for(l&&1===f&&d(f,v),a=f,i=v;(r=a<2?t:i)||!l;){u||(a?a<3?(a>1&&(p.n=-1),d(a,i)):p.n=i:p.v=i);try{if(s=2,u){if(a||(o="next"),r=u[o]){if(!(r=r.call(u,i)))throw TypeError("iterator result is not an object");if(!r.done)return r;i=r.value,a<2&&(a=0)}else 1===a&&(r=u.return)&&r.call(u),a<2&&(i=TypeError("The iterator does not provide a '"+o+"' method"),a=1);u=t}else if((r=(l=p.n<0)?i:e.call(n,p))!==c)break}catch(e){u=t,a=1,i=e}finally{s=1}}return{value:r,done:l}}}(e,u,a),!0),s}var c={};function f(){}function l(){}function p(){}r=Object.getPrototypeOf;var d=[][a]?r(r([][a]())):(n(r={},a,function(){return this}),r),v=p.prototype=f.prototype=Object.create(d);function x(e){return Object.setPrototypeOf?Object.setPrototypeOf(e,p):(e.__proto__=p,n(e,i,"GeneratorFunction")),e.prototype=Object.create(v),e}return l.prototype=p,n(v,"constructor",p),n(p,"constructor",l),l.displayName="GeneratorFunction",n(p,i,"GeneratorFunction"),n(v),n(v,i,"Generator"),n(v,a,function(){return this}),n(v,"toString",function(){return"[object Generator]"}),(e.exports=o=function(){return{w:s,m:x}},e.exports.__esModule=!0,e.exports.default=e.exports)()}e.exports=o,e.exports.__esModule=!0,e.exports.default=e.exports},869(e,t,r){var n=r(887);e.exports=function(e,t,r,o,u){var a=n(e,t,r,o,u);return a.next().then(function(e){return e.done?e.value:a.next()})},e.exports.__esModule=!0,e.exports.default=e.exports},887(e,t,r){var n=r(993),o=r(791);e.exports=function(e,t,r,u,a){return new o(n().w(e,t,r,u),a||Promise)},e.exports.__esModule=!0,e.exports.default=e.exports},791(e,t,r){var n=r(172),o=r(546);e.exports=function e(t,r){function u(e,o,a,i){try{var s=t[e](o),c=s.value;return c instanceof n?r.resolve(c.v).then(function(e){u("next",e,a,i)},function(e){u("throw",e,a,i)}):r.resolve(c).then(function(e){s.value=e,a(s)},function(e){return u("throw",e,a,i)})}catch(e){i(e)}}var a;this.next||(o(e.prototype),o(e.prototype,"function"==typeof Symbol&&Symbol.asyncIterator||"@asyncIterator",function(){return this})),o(this,"_invoke",function(e,t,n){function o(){return new r(function(t,r){u(e,n,t,r)})}return a=a?a.then(o,o):o()},!0)},e.exports.__esModule=!0,e.exports.default=e.exports},546(e){function t(r,n,o,u){var a=Object.defineProperty;try{a({},"",{})}catch(r){a=0}e.exports=t=function(e,r,n,o){function u(r,n){t(e,r,function(e){return this._invoke(r,n,e)})}r?a?a(e,r,{value:n,enumerable:!o,configurable:!o,writable:!o}):e[r]=n:(u("next",0),u("throw",1),u("return",2))},e.exports.__esModule=!0,e.exports.default=e.exports,t(r,n,o,u)}e.exports=t,e.exports.__esModule=!0,e.exports.default=e.exports},373(e){e.exports=function(e){var t=Object(e),r=[];for(var n in t)r.unshift(n);return function e(){for(;r.length;)if((n=r.pop())in t)return e.value=n,e.done=!1,e;return e.done=!0,e}},e.exports.__esModule=!0,e.exports.default=e.exports},633(e,t,r){var n=r(172),o=r(993),u=r(869),a=r(887),i=r(791),s=r(373),c=r(579);function f(){"use strict";var t=o(),r=t.m(f),l=(Object.getPrototypeOf?Object.getPrototypeOf(r):r.__proto__).constructor;function p(e){var t="function"==typeof e&&e.constructor;return!!t&&(t===l||"GeneratorFunction"===(t.displayName||t.name))}var d={throw:1,return:2,break:3,continue:3};function v(e){var t,r;return function(n){t||(t={stop:function(){return r(n.a,2)},catch:function(){return n.v},abrupt:function(e,t){return r(n.a,d[e],t)},delegateYield:function(e,o,u){return t.resultName=o,r(n.d,c(e),u)},finish:function(e){return r(n.f,e)}},r=function(e,r,o){n.p=t.prev,n.n=t.next;try{return e(r,o)}finally{t.next=n.n}}),t.resultName&&(t[t.resultName]=n.v,t.resultName=void 0),t.sent=n.v,t.next=n.n;try{return e.call(this,t)}finally{n.p=t.prev,n.n=t.next}}}return(e.exports=f=function(){return{wrap:function(e,r,n,o){return t.w(v(e),r,n,o&&o.reverse())},isGeneratorFunction:p,mark:t.m,awrap:function(e,t){return new n(e,t)},AsyncIterator:i,async:function(e,t,r,n,o){return(p(t)?a:u)(v(e),t,r,n,o)},keys:s,values:c}},e.exports.__esModule=!0,e.exports.default=e.exports)()}e.exports=f,e.exports.__esModule=!0,e.exports.default=e.exports},579(e,t,r){var n=r(738).default;e.exports=function(e){if(null!=e){var t=e["function"==typeof Symbol&&Symbol.iterator||"@@iterator"],r=0;if(t)return t.call(e);if("function"==typeof e.next)return e;if(!isNaN(e.length))return{next:function(){return e&&r>=e.length&&(e=void 0),{value:e&&e[r++],done:!e}}}}throw new TypeError(n(e)+" is not iterable")},e.exports.__esModule=!0,e.exports.default=e.exports},715(e,t,r){var n=r(987),o=r(156),u=r(122),a=r(752);e.exports=function(e,t){return n(e)||o(e,t)||u(e,t)||a()},e.exports.__esModule=!0,e.exports.default=e.exports},45(e,t,r){var n=r(738).default;e.exports=function(e,t){if("object"!=n(e)||!e)return e;var r=e[Symbol.toPrimitive];if(void 0!==r){var o=r.call(e,t||"default");if("object"!=n(o))return o;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===t?String:Number)(e)},e.exports.__esModule=!0,e.exports.default=e.exports},736(e,t,r){var n=r(738).default,o=r(45);e.exports=function(e){var t=o(e,"string");return"symbol"==n(t)?t:t+""},e.exports.__esModule=!0,e.exports.default=e.exports},738(e){function t(r){return e.exports=t="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},e.exports.__esModule=!0,e.exports.default=e.exports,t(r)}e.exports=t,e.exports.__esModule=!0,e.exports.default=e.exports},122(e,t,r){var n=r(79);e.exports=function(e,t){if(e){if("string"==typeof e)return n(e,t);var r={}.toString.call(e).slice(8,-1);return"Object"===r&&e.constructor&&(r=e.constructor.name),"Map"===r||"Set"===r?Array.from(e):"Arguments"===r||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r)?n(e,t):void 0}},e.exports.__esModule=!0,e.exports.default=e.exports},756(e,t,r){var n=r(633)();e.exports=n;try{regeneratorRuntime=n}catch(e){"object"==typeof globalThis?globalThis.regeneratorRuntime=n:Function("r","regeneratorRuntime = r")(n)}}},t={};function r(n){var o=t[n];if(void 0!==o)return o.exports;var u=t[n]={exports:{}};return e[n].call(u.exports,u,u.exports,r),u.exports}r.n=e=>{var t=e&&e.__esModule?()=>e.default:()=>e;return r.d(t,{a:t}),t},r.d=(e,t)=>{for(var n in t)r.o(t,n)&&!r.o(e,n)&&Object.defineProperty(e,n,{enumerable:!0,get:t[n]})},r.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),(()=>{"use strict";r(472)})()})();`, i = r(e.load, n), s = function(d) {
      return i().clearInterval(d);
    }, o = function(d) {
      return i().clearTimeout(d);
    }, u = function() {
      var d;
      return (d = i()).setInterval.apply(d, arguments);
    }, c = function() {
      var d;
      return (d = i()).setTimeout.apply(d, arguments);
    };
    t.clearInterval = s, t.clearTimeout = o, t.setInterval = u, t.setTimeout = c;
  });
});
var ei = H((Ir) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(Ir, "__esModule", { value: true });
  Ir.isReactNativeBrowser = Ir.isWebWorker = void 0;
  var hE = () => {
    var _a;
    return typeof window < "u" ? typeof navigator < "u" && ((_a = navigator.userAgent) == null ? void 0 : _a.toLowerCase().indexOf(" electron/")) > -1 && (q == null ? void 0 : q.versions) ? !Object.prototype.hasOwnProperty.call(q.versions, "electron") : typeof window.document < "u" : false;
  }, tg = () => {
    var _a, _b;
    return !!(typeof self == "object" && ((_b = (_a = self == null ? void 0 : self.constructor) == null ? void 0 : _a.name) == null ? void 0 : _b.includes("WorkerGlobalScope")) && typeof Deno > "u");
  }, rg = () => typeof navigator < "u" && navigator.product === "ReactNative", pE = hE() || tg() || rg();
  Ir.isWebWorker = tg();
  Ir.isReactNativeBrowser = rg();
  Ir.default = pE;
});
var sg = H((qt) => {
  "use strict";
  x();
  P();
  T();
  var gE = qt && qt.__createBinding || (Object.create ? function(t, e, r, n) {
    n === void 0 && (n = r);
    var i = Object.getOwnPropertyDescriptor(e, r);
    (!i || ("get" in i ? !e.__esModule : i.writable || i.configurable)) && (i = { enumerable: true, get: function() {
      return e[r];
    } }), Object.defineProperty(t, n, i);
  } : function(t, e, r, n) {
    n === void 0 && (n = r), t[n] = e[r];
  }), yE = qt && qt.__setModuleDefault || (Object.create ? function(t, e) {
    Object.defineProperty(t, "default", { enumerable: true, value: e });
  } : function(t, e) {
    t.default = e;
  }), bE = qt && qt.__importStar || /* @__PURE__ */ function() {
    var t = function(e) {
      return t = Object.getOwnPropertyNames || function(r) {
        var n = [];
        for (var i in r) Object.prototype.hasOwnProperty.call(r, i) && (n[n.length] = i);
        return n;
      }, t(e);
    };
    return function(e) {
      if (e && e.__esModule) return e;
      var r = {};
      if (e != null) for (var n = t(e), i = 0; i < n.length; i++) n[i] !== "default" && gE(r, e, n[i]);
      return yE(r, e), r;
    };
  }();
  Object.defineProperty(qt, "__esModule", { value: true });
  var ng = eg(), Na = bE(ei()), ig = { set: ng.setInterval, clear: ng.clearInterval }, og = { set: (t, e) => setInterval(t, e), clear: (t) => clearInterval(t) }, mE = (t) => {
    switch (t) {
      case "native":
        return og;
      case "worker":
        return ig;
      case "auto":
      default:
        return Na.default && !Na.isWebWorker && !Na.isReactNativeBrowser ? ig : og;
    }
  };
  qt.default = mE;
});
var qa = H((ti) => {
  "use strict";
  x();
  P();
  T();
  var _E = ti && ti.__importDefault || function(t) {
    return t && t.__esModule ? t : { default: t };
  };
  Object.defineProperty(ti, "__esModule", { value: true });
  var wE = _E(sg()), La = class {
    constructor(e, r) {
      __publicField(this, "_keepalive");
      __publicField(this, "timerId");
      __publicField(this, "timer");
      __publicField(this, "destroyed", false);
      __publicField(this, "counter");
      __publicField(this, "client");
      __publicField(this, "_keepaliveTimeoutTimestamp");
      __publicField(this, "_intervalEvery");
      this.client = e, this.timer = typeof r == "object" && "set" in r && "clear" in r ? r : (0, wE.default)(r), this.setKeepalive(e.keepalive);
    }
    get keepaliveTimeoutTimestamp() {
      return this._keepaliveTimeoutTimestamp;
    }
    get intervalEvery() {
      return this._intervalEvery;
    }
    get keepalive() {
      return this._keepalive;
    }
    clear() {
      this.timerId && (this.timer.clear(this.timerId), this.timerId = null);
    }
    setKeepalive(e) {
      if (e *= 1e3, isNaN(e) || e <= 0 || e > 2147483647) throw new Error(`Keepalive value must be an integer between 0 and 2147483647. Provided value is ${e}`);
      this._keepalive = e, this.reschedule(), this.client.log(`KeepaliveManager: set keepalive to ${e}ms`);
    }
    destroy() {
      this.clear(), this.destroyed = true;
    }
    reschedule() {
      if (this.destroyed) return;
      this.clear(), this.counter = 0;
      let e = Math.ceil(this._keepalive * 1.5);
      this._keepaliveTimeoutTimestamp = Date.now() + e, this._intervalEvery = Math.ceil(this._keepalive / 2), this.timerId = this.timer.set(() => {
        this.destroyed || (this.counter += 1, this.counter === 2 ? this.client.sendPing() : this.counter > 2 && this.client.onKeepaliveTimeout());
      }, this._intervalEvery);
    }
  };
  ti.default = La;
});
var yo = H((ft) => {
  "use strict";
  var _a;
  x();
  P();
  T();
  var vE = ft && ft.__createBinding || (Object.create ? function(t, e, r, n) {
    n === void 0 && (n = r);
    var i = Object.getOwnPropertyDescriptor(e, r);
    (!i || ("get" in i ? !e.__esModule : i.writable || i.configurable)) && (i = { enumerable: true, get: function() {
      return e[r];
    } }), Object.defineProperty(t, n, i);
  } : function(t, e, r, n) {
    n === void 0 && (n = r), t[n] = e[r];
  }), SE = ft && ft.__setModuleDefault || (Object.create ? function(t, e) {
    Object.defineProperty(t, "default", { enumerable: true, value: e });
  } : function(t, e) {
    t.default = e;
  }), dg = ft && ft.__importStar || /* @__PURE__ */ function() {
    var t = function(e) {
      return t = Object.getOwnPropertyNames || function(r) {
        var n = [];
        for (var i in r) Object.prototype.hasOwnProperty.call(r, i) && (n[n.length] = i);
        return n;
      }, t(e);
    };
    return function(e) {
      if (e && e.__esModule) return e;
      var r = {};
      if (e != null) for (var n = t(e), i = 0; i < n.length; i++) n[i] !== "default" && vE(r, e, n[i]);
      return SE(r, e), r;
    };
  }(), rr = ft && ft.__importDefault || function(t) {
    return t && t.__esModule ? t : { default: t };
  };
  Object.defineProperty(ft, "__esModule", { value: true });
  var Da = rr(ip()), EE = Yt(), ag = rr(up()), AE = rr(Xt()), ug = dg(ia()), on = rr(aa()), IE = rr(Ap()), xE = Mn(), TE = rr(Sa()), PE = rr(Ip()), xr = Ct(), OE = xp(), RE = rr(qa()), lg = dg(ei()), Ua = globalThis.setImmediate || ((...t) => {
    let e = t.shift();
    (0, xr.nextTick)(() => {
      e(...t);
    });
  }), go = 65535, cg = 147, fg = { keepalive: 60, reschedulePings: true, protocolId: "MQTT", protocolVersion: 4, reconnectPeriod: 1e3, connectTimeout: 30 * 1e3, clean: true, resubscribe: true, subscribeBatchSize: null, writeCache: true, timerVariant: "auto" }, Fa = (_a = class extends OE.TypedEventEmitter {
    constructor(e, r) {
      var _a2;
      super();
      __publicField(this, "connected");
      __publicField(this, "disconnecting");
      __publicField(this, "disconnected");
      __publicField(this, "reconnecting");
      __publicField(this, "incomingStore");
      __publicField(this, "outgoingStore");
      __publicField(this, "options");
      __publicField(this, "queueQoSZero");
      __publicField(this, "_reconnectCount");
      __publicField(this, "log");
      __publicField(this, "messageIdProvider");
      __publicField(this, "outgoing");
      __publicField(this, "messageIdToTopic");
      __publicField(this, "noop");
      __publicField(this, "keepaliveManager");
      __publicField(this, "stream");
      __publicField(this, "queue");
      __publicField(this, "streamBuilder");
      __publicField(this, "_resubscribeTopics");
      __publicField(this, "connackTimer");
      __publicField(this, "reconnectTimer");
      __publicField(this, "_storeProcessing");
      __publicField(this, "_packetIdsDuringStoreProcessing");
      __publicField(this, "_storeProcessingQueue");
      __publicField(this, "_firstConnection");
      __publicField(this, "topicAliasRecv");
      __publicField(this, "topicAliasSend");
      __publicField(this, "_incomingQoS2Ids");
      __publicField(this, "_receiveMaximum");
      __publicField(this, "_deferredReconnect");
      __publicField(this, "_currentPump");
      __publicField(this, "connackReceived");
      __publicField(this, "reconnectSuppressed");
      __publicField(this, "_authenticationMethod");
      __publicField(this, "connackPacket");
      __publicField(this, "_serverProperties");
      this.options = r || {};
      for (let i in fg) typeof this.options[i] > "u" ? this.options[i] = fg[i] : this.options[i] = r[i];
      this.log = this.options.log || (0, AE.default)("mqttjs:client"), this.noop = this._noop.bind(this), this.log("MqttClient :: version:", _a.VERSION), lg.isWebWorker ? this.log("MqttClient :: environment", "webworker") : this.log("MqttClient :: environment", lg.default ? "browser" : "node"), this.log("MqttClient :: options.protocol", r.protocol), this.log("MqttClient :: options.protocolVersion", r.protocolVersion), this.log("MqttClient :: options.username", r.username), this.log("MqttClient :: options.keepalive", r.keepalive), this.log("MqttClient :: options.reconnectPeriod", r.reconnectPeriod), this.log("MqttClient :: options.rejectUnauthorized", r.rejectUnauthorized), this.log("MqttClient :: options.properties.topicAliasMaximum", r.properties ? r.properties.topicAliasMaximum : void 0), this.options.clientId = typeof r.clientId == "string" ? r.clientId : _a.defaultId(), this.log("MqttClient :: clientId", this.options.clientId), this.options.customHandleAcks = r.protocolVersion === 5 && r.customHandleAcks ? r.customHandleAcks : (...i) => {
        i[3](null, 0);
      }, this.options.writeCache || (Da.default.writeToStream.cacheNumbers = false), this.streamBuilder = e, this.messageIdProvider = typeof this.options.messageIdProvider > "u" ? new TE.default() : this.options.messageIdProvider, this.outgoingStore = r.outgoingStore || new on.default(), this.incomingStore = r.incomingStore || new on.default(), this._incomingQoS2Ids = /* @__PURE__ */ new Set(), this._receiveMaximum = go;
      let n = (_a2 = r.properties) == null ? void 0 : _a2.receiveMaximum;
      n !== void 0 && (Number.isInteger(n) && n >= 1 && n <= go ? this._receiveMaximum = n : this.log("MqttClient :: options.properties.receiveMaximum %o is not an integer between 1 and %d, enforcing and advertising %d instead", n, go, go)), this.queueQoSZero = r.queueQoSZero === void 0 ? true : r.queueQoSZero, this._resubscribeTopics = {}, this.messageIdToTopic = {}, this.keepaliveManager = null, this.connected = false, this.disconnecting = false, this.reconnecting = false, this.queue = [], this.connackTimer = null, this.connackReceived = false, this.reconnectSuppressed = false, this.reconnectTimer = null, this._storeProcessing = false, this._packetIdsDuringStoreProcessing = {}, this._storeProcessingQueue = [], this.outgoing = {}, this._firstConnection = true, r.properties && r.properties.topicAliasMaximum > 0 && (r.properties.topicAliasMaximum > 65535 ? this.log("MqttClient :: options.properties.topicAliasMaximum is out of range") : this.topicAliasRecv = new PE.default(r.properties.topicAliasMaximum)), this.on("connect", () => {
        let { queue: i } = this, s = () => {
          let o = i.shift();
          this.log("deliver :: entry %o", o);
          let u = null;
          if (!o) {
            this._resubscribe();
            return;
          }
          u = o.packet, this.log("deliver :: call _sendPacket for %o", u);
          let c = true;
          u.messageId && u.messageId !== 0 && (this.messageIdProvider.register(u.messageId) || (c = false)), c ? this._sendPacket(u, (f) => {
            o.cb && o.cb(f), s();
          }) : (this.log("messageId: %d has already used. The message is skipped and removed.", u.messageId), s());
        };
        this.log("connect :: sending queued packets"), s();
      }), this.on("close", () => {
        this.log("close :: connected set to `false`"), this.connected = false, this.log("close :: clearing connackTimer"), clearTimeout(this.connackTimer), this._destroyKeepaliveManager(), this._serverProperties = void 0, this.topicAliasRecv && this.topicAliasRecv.clear(), this.log("close :: calling _setupReconnect"), this._setupReconnect();
      }), this.options.manualConnect || (this.log("MqttClient :: setting up stream"), this.connect());
    }
    static defaultId() {
      return `mqttjs_${Math.random().toString(16).substr(2, 8)}`;
    }
    handleAuth(e, r) {
      r();
    }
    handleMessage(e, r) {
      r();
    }
    _nextId() {
      return this.messageIdProvider.allocate();
    }
    getLastMessageId() {
      return this.messageIdProvider.getLastAllocated();
    }
    _trackIncomingQoS2Publish(e, r, n) {
      return this._incomingQoS2Ids.has(e) ? true : this.options.protocolVersion === 5 && this._incomingQoS2Ids.size >= this._receiveMaximum ? (this.log("_trackIncomingQoS2Publish :: inbound QoS 2 messages exceeded receiveMaximum %d", this._receiveMaximum), n == null ? void 0 : n.discardParsedPackets(), (!n || n.isCurrent()) && this._cleanUp(true), r(), this.emit("error", new xr.ErrorWithReasonCode(`${xE.ReasonCodes[cg]}: ${this._incomingQoS2Ids.size + 1} inbound QoS 2 messages in flight, receiveMaximum is ${this._receiveMaximum}`, cg)), false) : (this._incomingQoS2Ids.add(e), true);
    }
    _releaseIncomingQoS2Publish(e) {
      this._incomingQoS2Ids.delete(e);
    }
    _discardIncomingQoS2State() {
      if (this._incomingQoS2Ids.size !== 0) {
        this.log("_discardIncomingQoS2State :: session not resumed, dropping %d inbound QoS 2 message(s)", this._incomingQoS2Ids.size);
        for (let e of this._incomingQoS2Ids) this.incomingStore.del({ messageId: e }, this.noop);
        this._incomingQoS2Ids.clear();
      }
    }
    connect() {
      var _a2, _b, _c2;
      let e = new EE.Writable(), r = Da.default.parser(this.options), n = null, i = [], s = { discardParsedPackets: () => {
        i.length = 0;
      }, isCurrent: () => this._currentPump === s };
      this._currentPump = s, this.connackReceived = false, this.reconnectSuppressed = false, this.log("connect :: calling method to clear reconnect"), this._clearReconnect(), this._serverProperties = void 0, this.disconnected && !this.reconnecting && (this.incomingStore = this.options.incomingStore || new on.default(), this.outgoingStore = this.options.outgoingStore || new on.default(), this._incomingQoS2Ids.clear(), this.disconnecting = false, this.disconnected = false), this.log("connect :: using streamBuilder provided to client to create stream"), this.stream = this.streamBuilder(this), r.on("packet", (d) => {
        this.log("parser :: on packet push to packets array."), i.push(d);
      });
      let o = () => {
        this.log("work :: getting next packet in queue"), this._currentPump !== s && (this.log("work :: pump superseded, dropping %d queued packets", i.length), i.length = 0);
        let d = i.shift();
        if (d) this.log("work :: packet pulled from queue"), (0, IE.default)(this, d, u, s);
        else {
          this.log("work :: no packets in queue");
          let h = n;
          n = null, this.log("work :: done flag is %s", !!h), h && h();
        }
      }, u = () => {
        if (i.length) (0, xr.nextTick)(o);
        else {
          let d = n;
          n = null, d && d();
        }
      };
      e._write = (d, h, _) => {
        n = _, this.log("writable stream :: parsing buffer"), r.parse(d), o();
      };
      let c = (d) => {
        this.log("streamErrorHandler :: error", d.message), d.code ? (this.log("streamErrorHandler :: emitting error"), this.emit("error", d)) : this.noop(d);
      };
      this.log("connect :: pipe stream to writable stream"), this.stream.pipe(e), this.stream.on("error", c), this.stream.on("close", () => {
        this.log("(%s)stream :: on close", this.options.clientId), this._flushVolatile(), this.log("stream: emit close to MqttClient"), this.emit("close");
      }), this.log("connect: sending packet `connect`");
      let f = { cmd: "connect", protocolId: this.options.protocolId, protocolVersion: this.options.protocolVersion, clean: this.options.clean, clientId: this.options.clientId, keepalive: this.options.keepalive, username: this.options.username, password: this.options.password, properties: this.options.properties ? { ...this.options.properties } : void 0 };
      if (((_a2 = f.properties) == null ? void 0 : _a2.receiveMaximum) !== void 0 && (f.properties.receiveMaximum = this._receiveMaximum), this.options.will && (f.will = { ...this.options.will, payload: (_b = this.options.will) == null ? void 0 : _b.payload }), this.topicAliasRecv && (f.properties || (f.properties = {}), this.topicAliasRecv && (f.properties.topicAliasMaximum = this.topicAliasRecv.max)), this._authenticationMethod = (_c2 = f.properties) == null ? void 0 : _c2.authenticationMethod, this._writePacket(f), r.on("error", this.emit.bind(this, "error")), this.options.properties) {
        if (!this.options.properties.authenticationMethod && this.options.properties.authenticationData) return this.end(() => this.emit("error", new Error("Packet has no Authentication Method"))), this;
        if (this.options.properties.authenticationMethod && this.options.authPacket && typeof this.options.authPacket == "object") {
          let d = { cmd: "auth", reasonCode: 0, ...this.options.authPacket };
          this._writePacket(d);
        }
      }
      return this.stream.setMaxListeners(1e3), clearTimeout(this.connackTimer), this.connackTimer = setTimeout(() => this._onConnackTimeout(), this.options.connectTimeout), this;
    }
    _onConnackTimeout() {
      this.log("!!connectTimeout hit!! Calling _cleanUp with force `true`"), this._cleanUp(true), this.emit("error", new Error("connack timeout"));
    }
    publish(e, r, n, i) {
      this.log("publish :: message `%s` to topic `%s`", r, e);
      let { options: s } = this;
      typeof n == "function" && (i = n, n = null), n = n || {}, n = { ...{ qos: 0, retain: false, dup: false }, ...n };
      let { qos: u, retain: c, dup: f, properties: d, cbStorePut: h } = n;
      if (this._checkDisconnecting(i)) return this;
      let _ = () => {
        let y = 0;
        if ((u === 1 || u === 2) && (y = this._nextId(), y === null)) return this.log("No messageId left"), false;
        let I = { cmd: "publish", topic: e, payload: r, qos: u, retain: c, messageId: y, dup: f };
        switch (s.protocolVersion === 5 && (I.properties = d), this.log("publish :: qos", u), u) {
          case 1:
          case 2:
            this.outgoing[I.messageId] = { volatile: false, cmd: "publish", cb: i || this.noop }, this.log("MqttClient:publish: packet cmd: %s", I.cmd), this._sendPacket(I, void 0, h);
            break;
          default:
            this.log("MqttClient:publish: packet cmd: %s", I.cmd), this._sendPacket(I, i, h);
            break;
        }
        return true;
      };
      return (this._storeProcessing || this._storeProcessingQueue.length > 0 || !_()) && this._storeProcessingQueue.push({ invoke: _, cbStorePut: n.cbStorePut, callback: i }), this;
    }
    publishAsync(e, r, n) {
      return new Promise((i, s) => {
        this.publish(e, r, n, (o, u) => {
          o ? s(o) : i(u);
        });
      });
    }
    subscribe(e, r, n) {
      let i = this.options.protocolVersion;
      typeof r == "function" && (n = r), n = n || this.noop;
      let s = false, o = [];
      typeof e == "string" ? (e = [e], o = e) : Array.isArray(e) ? o = e : typeof e == "object" && (s = e.resubscribe, delete e.resubscribe, o = Object.keys(e));
      let u = ug.validateTopics(o);
      if (u !== null) return Ua(n, new Error(`Invalid topic ${u}`)), this;
      if (this._checkDisconnecting(n)) return this.log("subscribe: discconecting true"), this;
      let c = { qos: 0 };
      i === 5 && (c.nl = false, c.rap = false, c.rh = 0), r = { ...c, ...r };
      let { properties: f } = r, d = [], h = (I, S) => {
        if (S = S || r, !Object.prototype.hasOwnProperty.call(this._resubscribeTopics, I) || this._resubscribeTopics[I].qos < S.qos || s) {
          let b = { topic: I, qos: S.qos };
          i === 5 && (b.nl = S.nl, b.rap = S.rap, b.rh = S.rh, b.properties = f), this.log("subscribe: pushing topic `%s` and qos `%s` to subs list", b.topic, b.qos), d.push(b);
        }
      };
      if (Array.isArray(e) ? e.forEach((I) => {
        this.log("subscribe: array topic %s", I), h(I);
      }) : Object.keys(e).forEach((I) => {
        this.log("subscribe: object topic %s, %o", I, e[I]), h(I, e[I]);
      }), !d.length) return n(null, []), this;
      let _ = (I, S) => {
        let b = { cmd: "subscribe", subscriptions: I, messageId: S };
        if (f && (b.properties = f), this.options.resubscribe) {
          this.log("subscribe :: resubscribe true");
          let w = [];
          I.forEach((R) => {
            if (this.options.reconnectPeriod > 0) {
              let A = { qos: R.qos };
              i === 5 && (A.nl = R.nl || false, A.rap = R.rap || false, A.rh = R.rh || 0, A.properties = R.properties), this._resubscribeTopics[R.topic] = A, w.push(R.topic);
            }
          }), this.messageIdToTopic[b.messageId] = w;
        }
        let m = new Promise((w, R) => {
          this.outgoing[b.messageId] = { volatile: true, cmd: "subscribe", cb: (A, g) => {
            if (A) {
              R(new xr.ErrorWithSubackPacket(A.message, g));
              return;
            }
            let { granted: O } = g;
            if (O.length !== I.length) {
              R(new xr.ErrorWithSubackPacket(`Protocol error: suback granted ${O.length} reason code(s) for ${I.length} subscription(s)`, g)), this._cleanUp(true);
              return;
            }
            for (let v = 0; v < O.length; v += 1) I[v].qos = O[v];
            w(g);
          } };
        });
        return this.log("subscribe :: call _sendPacket"), this._sendPacket(b), m;
      }, y = () => {
        let I = this.options.subscribeBatchSize ?? d.length, S = [];
        for (let b = 0; b < d.length; b += I) {
          let m = d.slice(b, b + I), w = this._nextId();
          if (w === null) return this.log("No messageId left"), false;
          S.push(_(m, w));
        }
        return Promise.all(S).then((b) => {
          n(null, d, b.at(-1));
        }).catch((b) => {
          n(b, d, b.packet);
        }), true;
      };
      return (this._storeProcessing || this._storeProcessingQueue.length > 0 || !y()) && this._storeProcessingQueue.push({ invoke: y, callback: n }), this;
    }
    subscribeAsync(e, r) {
      return new Promise((n, i) => {
        this.subscribe(e, r, (s, o) => {
          s ? i(s) : n(o);
        });
      });
    }
    unsubscribe(e, r, n) {
      typeof e == "string" && (e = [e]), typeof r == "function" && (n = r), n = n || this.noop;
      let i = ug.validateTopics(e);
      if (i !== null) return Ua(n, new Error(`Invalid topic ${i}`)), this;
      if (this._checkDisconnecting(n)) return this;
      let s = () => {
        let o = this._nextId();
        if (o === null) return this.log("No messageId left"), false;
        let u = { cmd: "unsubscribe", messageId: o, unsubscriptions: [] };
        return typeof e == "string" ? u.unsubscriptions = [e] : Array.isArray(e) && (u.unsubscriptions = e), this.options.resubscribe && u.unsubscriptions.forEach((c) => {
          delete this._resubscribeTopics[c];
        }), typeof r == "object" && r.properties && (u.properties = r.properties), this.outgoing[u.messageId] = { volatile: true, cmd: "unsubscribe", cb: n }, this.log("unsubscribe: call _sendPacket"), this._sendPacket(u), true;
      };
      return (this._storeProcessing || this._storeProcessingQueue.length > 0 || !s()) && this._storeProcessingQueue.push({ invoke: s, callback: n }), this;
    }
    unsubscribeAsync(e, r) {
      return new Promise((n, i) => {
        this.unsubscribe(e, r, (s, o) => {
          s ? i(s) : n(o);
        });
      });
    }
    end(e, r, n) {
      this.log("end :: (%s)", this.options.clientId), (e == null || typeof e != "boolean") && (n = n || r, r = e, e = false), typeof r != "object" && (n = n || r, r = null), this.log("end :: cb? %s", !!n), (!n || typeof n != "function") && (n = this.noop);
      let i = () => {
        this.log("end :: closeStores: closing incoming and outgoing stores"), this.disconnected = true, this._incomingQoS2Ids.clear(), this.incomingStore.close((o) => {
          this.outgoingStore.close((u) => {
            if (this.log("end :: closeStores: emitting end"), this.emit("end"), n) {
              let c = o || u;
              this.log("end :: closeStores: invoking callback with args"), n(c);
            }
          });
        }), this._deferredReconnect ? this._deferredReconnect() : (this.options.reconnectPeriod === 0 || this.options.manualConnect) && (this.disconnecting = false);
      }, s = () => {
        this.log("end :: (%s) :: finish :: calling _cleanUp with force %s", this.options.clientId, e), this._cleanUp(e, () => {
          this.log("end :: finish :: calling process.nextTick on closeStores"), (0, xr.nextTick)(i);
        }, r);
      };
      return this.disconnecting ? (n(), this) : (this._clearReconnect(), this.disconnecting = true, !e && Object.keys(this.outgoing).length > 0 ? (this.log("end :: (%s) :: calling finish in 10ms once outgoing is empty", this.options.clientId), this.once("outgoingEmpty", setTimeout.bind(null, s, 10))) : (this.log("end :: (%s) :: immediately calling finish", this.options.clientId), s()), this);
    }
    endAsync(e, r) {
      return new Promise((n, i) => {
        this.end(e, r, (s) => {
          s ? i(s) : n();
        });
      });
    }
    removeOutgoingMessage(e) {
      if (this.outgoing[e]) {
        let { cb: r } = this.outgoing[e];
        this._removeOutgoingAndStoreMessage(e, () => {
          r(new Error("Message removed"));
        });
      }
      return this;
    }
    reconnect(e) {
      this.log("client reconnect");
      let r = () => {
        e ? (this.options.incomingStore = e.incomingStore, this.options.outgoingStore = e.outgoingStore) : (this.options.incomingStore = null, this.options.outgoingStore = null), this.incomingStore = this.options.incomingStore || new on.default(), this.outgoingStore = this.options.outgoingStore || new on.default(), this._incomingQoS2Ids.clear(), this.disconnecting = false, this.disconnected = false, this._deferredReconnect = null, this._reconnect();
      };
      return this.disconnecting && !this.disconnected ? this._deferredReconnect = r : r(), this;
    }
    _flushVolatile() {
      this.outgoing && (this.log("_flushVolatile :: deleting volatile messages from the queue and setting their callbacks as error function"), Object.keys(this.outgoing).forEach((e) => {
        this.outgoing[e].volatile && typeof this.outgoing[e].cb == "function" && (this.outgoing[e].cb(new Error("Connection closed")), delete this.outgoing[e]);
      }));
    }
    _flush() {
      this.outgoing && (this.log("_flush: queue exists? %b", !!this.outgoing), Object.keys(this.outgoing).forEach((e) => {
        typeof this.outgoing[e].cb == "function" && (this.outgoing[e].cb(new Error("Connection closed")), delete this.outgoing[e]);
      }));
    }
    _removeTopicAliasAndRecoverTopicName(e) {
      let r;
      e.properties && (r = e.properties.topicAlias);
      let n = e.topic.toString();
      if (this.log("_removeTopicAliasAndRecoverTopicName :: alias %d, topic %o", r, n), n.length === 0) {
        if (typeof r > "u") return new Error("Unregistered Topic Alias");
        if (n = this.topicAliasSend.getTopicByAlias(r), typeof n > "u") return new Error("Unregistered Topic Alias");
        e.topic = n;
      }
      r && delete e.properties.topicAlias;
    }
    _checkDisconnecting(e) {
      return this.disconnecting && (e && e !== this.noop ? e(new Error("client disconnecting")) : this.emit("error", new Error("client disconnecting"))), this.disconnecting;
    }
    _reconnect() {
      this.log("_reconnect: emitting reconnect to client"), this.emit("reconnect"), this.connected ? (this.end(() => {
        this.connect();
      }), this.log("client already connected. disconnecting first.")) : (this.log("_reconnect: calling connect"), this.connect());
    }
    _setupReconnect() {
      !this.disconnecting && !this.reconnectSuppressed && !this.reconnectTimer && this.options.reconnectPeriod > 0 ? (this.reconnecting || (this.log("_setupReconnect :: emit `offline` state"), this.emit("offline"), this.log("_setupReconnect :: set `reconnecting` to `true`"), this.reconnecting = true), this.log("_setupReconnect :: setting reconnectTimer for %d ms", this.options.reconnectPeriod), this.reconnectTimer = setInterval(() => {
        this.log("reconnectTimer :: reconnect triggered!"), this._reconnect();
      }, this.options.reconnectPeriod)) : this.log("_setupReconnect :: doing nothing...");
    }
    _clearReconnect() {
      this.log("_clearReconnect : clearing reconnect timer"), this.reconnectTimer && (clearInterval(this.reconnectTimer), this.reconnectTimer = null);
    }
    _cleanUp(e, r, n = {}) {
      if (r && (this.log("_cleanUp :: done callback provided for on stream close"), this.stream.on("close", r)), this.log("_cleanUp :: forced? %s", e), e) this.options.reconnectPeriod === 0 && this.options.clean && this._flush(), this.log("_cleanUp :: (%s) :: destroying stream", this.options.clientId), this.stream.destroy();
      else {
        let i = { cmd: "disconnect", ...n };
        this.log("_cleanUp :: (%s) :: call _sendPacket with disconnect packet", this.options.clientId), this._sendPacket(i, () => {
          this.log("_cleanUp :: (%s) :: destroying stream", this.options.clientId), Ua(() => {
            this.stream.end(() => {
              this.log("_cleanUp :: (%s) :: stream destroyed", this.options.clientId);
            });
          });
        });
      }
      !this.disconnecting && !this.reconnecting && (this.log("_cleanUp :: client not disconnecting/reconnecting. Clearing and resetting reconnect."), this._clearReconnect(), this._setupReconnect()), this._destroyKeepaliveManager(), r && !this.connected && (this.log("_cleanUp :: (%s) :: removing stream `done` callback `close` listener", this.options.clientId), this.stream.removeListener("close", r), r());
    }
    _storeAndSend(e, r, n) {
      this.log("storeAndSend :: store packet with cmd %s to outgoingStore", e.cmd);
      let i = e, s;
      if (i.cmd === "publish" && (i = (0, ag.default)(e), s = this._removeTopicAliasAndRecoverTopicName(i), s)) return r && r(s);
      this.outgoingStore.put(i, (o) => {
        if (o) return r && r(o);
        n(), this._writePacket(e, r);
      });
    }
    _applyTopicAlias(e) {
      if (this.options.protocolVersion === 5 && e.cmd === "publish") {
        let r;
        e.properties && (r = e.properties.topicAlias);
        let n = e.topic.toString();
        if (this.topicAliasSend) if (r) {
          if (n.length !== 0 && (this.log("applyTopicAlias :: register topic: %s - alias: %d", n, r), !this.topicAliasSend.put(n, r))) return this.log("applyTopicAlias :: error out of range. topic: %s - alias: %d", n, r), new Error("Sending Topic Alias out of range");
        } else n.length !== 0 && (this.options.autoAssignTopicAlias ? (r = this.topicAliasSend.getAliasByTopic(n), r ? (e.topic = "", e.properties = { ...e.properties, topicAlias: r }, this.log("applyTopicAlias :: auto assign(use) topic: %s - alias: %d", n, r)) : (r = this.topicAliasSend.getLruAlias(), this.topicAliasSend.put(n, r), e.properties = { ...e.properties, topicAlias: r }, this.log("applyTopicAlias :: auto assign topic: %s - alias: %d", n, r))) : this.options.autoUseTopicAlias && (r = this.topicAliasSend.getAliasByTopic(n), r && (e.topic = "", e.properties = { ...e.properties, topicAlias: r }, this.log("applyTopicAlias :: auto use topic: %s - alias: %d", n, r))));
        else if (r) return this.log("applyTopicAlias :: error out of range. topic: %s - alias: %d", n, r), new Error("Sending Topic Alias out of range");
      }
    }
    _noop(e) {
      this.log("noop ::", e);
    }
    _writePacket(e, r) {
      this.log("_writePacket :: packet: %O", e), this.log("_writePacket :: emitting `packetsend`"), this.emit("packetsend", e), this.log("_writePacket :: writing to stream");
      let n = Da.default.writeToStream(e, this.stream, this.options);
      this.log("_writePacket :: writeToStream result %s", n), !n && r && r !== this.noop ? (this.log("_writePacket :: handle events on `drain` once through callback."), this.stream.once("drain", r)) : r && (this.log("_writePacket :: invoking cb"), r());
    }
    _sendPacket(e, r, n, i) {
      this.log("_sendPacket :: (%s) ::  start", this.options.clientId), n = n || this.noop, r = r || this.noop;
      let s = this._applyTopicAlias(e);
      if (s) {
        r(s);
        return;
      }
      if (!this.connected) {
        if (e.cmd === "auth") {
          this._writePacket(e, r);
          return;
        }
        this.log("_sendPacket :: client not connected. Storing packet offline."), this._storePacket(e, r, n);
        return;
      }
      if (i) {
        this._writePacket(e, r);
        return;
      }
      switch (e.cmd) {
        case "publish":
          break;
        case "pubrel":
          this._storeAndSend(e, r, n);
          return;
        default:
          this._writePacket(e, r);
          return;
      }
      switch (e.qos) {
        case 2:
        case 1:
          this._storeAndSend(e, r, n);
          break;
        case 0:
        default:
          this._writePacket(e, r);
          break;
      }
      this.log("_sendPacket :: (%s) ::  end", this.options.clientId);
    }
    _storePacket(e, r, n) {
      this.log("_storePacket :: packet: %o", e), this.log("_storePacket :: cb? %s", !!r), n = n || this.noop;
      let i = e;
      if (i.cmd === "publish") {
        i = (0, ag.default)(e);
        let o = this._removeTopicAliasAndRecoverTopicName(i);
        if (o) return r && r(o);
      }
      let s = i.qos || 0;
      s === 0 && this.queueQoSZero || i.cmd !== "publish" ? this.queue.push({ packet: i, cb: r }) : s > 0 ? (r = this.outgoing[i.messageId] ? this.outgoing[i.messageId].cb : null, this.outgoingStore.put(i, (o) => {
        if (o) return r && r(o);
        n();
      })) : r && r(new Error("No connection to broker"));
    }
    get serverProperties() {
      return this._serverProperties;
    }
    get keepalive() {
      var _a2;
      let e = this.connected ? (_a2 = this._serverProperties) == null ? void 0 : _a2.serverKeepAlive : void 0;
      return e && this.options.keepalive ? e : this.options.keepalive;
    }
    _setupKeepaliveManager() {
      this.log("_setupKeepaliveManager :: keepalive %d (seconds)", this.keepalive), !this.keepaliveManager && this.keepalive && (this.keepaliveManager = new RE.default(this, this.options.timerVariant));
    }
    _destroyKeepaliveManager() {
      this.keepaliveManager && (this.log("_destroyKeepaliveManager :: destroying keepalive manager"), this.keepaliveManager.destroy(), this.keepaliveManager = null);
    }
    reschedulePing(e = false) {
      this.keepaliveManager && this.keepalive && (e || this.options.reschedulePings) && this._reschedulePing();
    }
    _reschedulePing() {
      this.log("_reschedulePing :: rescheduling ping"), this.keepaliveManager.reschedule();
    }
    sendPing() {
      this.log("_sendPing :: sending pingreq"), this._sendPacket({ cmd: "pingreq" });
    }
    onKeepaliveTimeout() {
      this.log("onKeepaliveTimeout :: calling _cleanUp with force true"), this._cleanUp(true), this.emit("error", new Error("Keepalive timeout"));
    }
    _resubscribe() {
      this.log("_resubscribe");
      let e = Object.keys(this._resubscribeTopics);
      if (!this._firstConnection && (this.options.clean || this.options.protocolVersion >= 4 && !this.connackPacket.sessionPresent) && e.length > 0) if (this.options.resubscribe) if (this.options.protocolVersion === 5) {
        this.log("_resubscribe: protocolVersion 5");
        for (let r = 0; r < e.length; r++) {
          let n = {};
          n[e[r]] = this._resubscribeTopics[e[r]], n.resubscribe = true, this.subscribe(n, { properties: n[e[r]].properties });
        }
      } else this._resubscribeTopics.resubscribe = true, this.subscribe(this._resubscribeTopics);
      else this._resubscribeTopics = {};
      this._firstConnection = false;
    }
    _onConnect(e) {
      if (this.disconnected) {
        this.emit("connect", e);
        return;
      }
      this.connackPacket = e, !this.options.clean && (this.options.protocolVersion < 4 || e.sessionPresent === true) || this._discardIncomingQoS2State(), this.messageIdProvider.clear(), this.connected = true, this._setupKeepaliveManager();
      let n = () => {
        let i = this.outgoingStore.createStream(), s = () => {
          i.destroy(), i = null, this._flushStoreProcessingQueue(), o();
        }, o = () => {
          this._storeProcessing = false, this._packetIdsDuringStoreProcessing = {};
        };
        this.once("close", s), i.on("error", (c) => {
          o(), this._flushStoreProcessingQueue(), this.removeListener("close", s), this.emit("error", c);
        });
        let u = () => {
          if (!i) return;
          let c = i.read(1), f;
          if (!c) {
            i.once("readable", u);
            return;
          }
          if (this._storeProcessing = true, this._packetIdsDuringStoreProcessing[c.messageId]) {
            u();
            return;
          }
          !this.disconnecting && !this.reconnectTimer ? (f = this.outgoing[c.messageId] ? this.outgoing[c.messageId].cb : null, this.outgoing[c.messageId] = { volatile: false, cmd: c.cmd, cb(d, h) {
            f && f(d, h), u();
          } }, this._packetIdsDuringStoreProcessing[c.messageId] = true, this.messageIdProvider.register(c.messageId) ? this._sendPacket(c, void 0, void 0, true) : this.log("messageId: %d has already used.", c.messageId)) : i.destroy && i.destroy();
        };
        i.on("end", () => {
          let c = true;
          for (let f in this._packetIdsDuringStoreProcessing) if (!this._packetIdsDuringStoreProcessing[f]) {
            c = false;
            break;
          }
          this.removeListener("close", s), c ? (o(), this._invokeAllStoreProcessingQueue(), this.emit("connect", e)) : n();
        }), u();
      };
      n();
    }
    _invokeStoreProcessingQueue() {
      if (!this._storeProcessing && this._storeProcessingQueue.length > 0) {
        let e = this._storeProcessingQueue[0];
        if (e && e.invoke()) return this._storeProcessingQueue.shift(), true;
      }
      return false;
    }
    _invokeAllStoreProcessingQueue() {
      for (; this._invokeStoreProcessingQueue(); ) ;
    }
    _flushStoreProcessingQueue() {
      for (let e of this._storeProcessingQueue) e.cbStorePut && e.cbStorePut(new Error("Connection closed")), e.callback && e.callback(new Error("Connection closed"));
      this._storeProcessingQueue.splice(0);
    }
    _removeOutgoingAndStoreMessage(e, r) {
      delete this.outgoing[e], this.outgoingStore.del({ messageId: e }, (n, i) => {
        r(n, i), this.messageIdProvider.deallocate(e), this._invokeStoreProcessingQueue();
      });
    }
  }, __publicField(_a, "VERSION", xr.MQTTJS_VERSION), _a);
  ft.default = Fa;
});
var hg = H(($a) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty($a, "__esModule", { value: true });
  var kE = ya(), ja = class {
    constructor() {
      __publicField(this, "numberAllocator");
      __publicField(this, "lastId");
      this.numberAllocator = new kE.NumberAllocator(1, 65535);
    }
    allocate() {
      return this.lastId = this.numberAllocator.alloc(), this.lastId;
    }
    getLastAllocated() {
      return this.lastId;
    }
    register(e) {
      return this.numberAllocator.use(e);
    }
    deallocate(e) {
      this.numberAllocator.free(e);
    }
    clear() {
      this.numberAllocator.clear();
    }
  };
  $a.default = ja;
});
function CE() {
  if (pg) return Wa;
  pg = true;
  let t = 2147483647, e = 36, r = 1, n = 26, i = 38, s = 700, o = 72, u = 128, c = "-", f = /^xn--/, d = /[^\0-\x7F]/, h = /[\x2E\u3002\uFF0E\uFF61]/g, _ = { overflow: "Overflow: input needs wider integers to process", "not-basic": "Illegal input >= 0x80 (not a basic code point)", "invalid-input": "Invalid input" }, y = e - r, I = Math.floor, S = String.fromCharCode;
  function b($) {
    throw new RangeError(_[$]);
  }
  function m($, G) {
    let J = [], ee = $.length;
    for (; ee--; ) J[ee] = G($[ee]);
    return J;
  }
  function w($, G) {
    let J = $.split("@"), ee = "";
    J.length > 1 && (ee = J[0] + "@", $ = J[1]), $ = $.replace(h, ".");
    let z = $.split("."), W = m(z, G).join(".");
    return ee + W;
  }
  function R($) {
    let G = [], J = 0, ee = $.length;
    for (; J < ee; ) {
      let z = $.charCodeAt(J++);
      if (z >= 55296 && z <= 56319 && J < ee) {
        let W = $.charCodeAt(J++);
        (W & 64512) == 56320 ? G.push(((z & 1023) << 10) + (W & 1023) + 65536) : (G.push(z), J--);
      } else G.push(z);
    }
    return G;
  }
  let A = ($) => String.fromCodePoint(...$), g = function($) {
    return $ >= 48 && $ < 58 ? 26 + ($ - 48) : $ >= 65 && $ < 91 ? $ - 65 : $ >= 97 && $ < 123 ? $ - 97 : e;
  }, O = function($, G) {
    return $ + 22 + 75 * ($ < 26) - ((G != 0) << 5);
  }, v = function($, G, J) {
    let ee = 0;
    for ($ = J ? I($ / s) : $ >> 1, $ += I($ / G); $ > y * n >> 1; ee += e) $ = I($ / y);
    return I(ee + (y + 1) * $ / ($ + i));
  }, B = function($) {
    let G = [], J = $.length, ee = 0, z = u, W = o, te = $.lastIndexOf(c);
    te < 0 && (te = 0);
    for (let Y = 0; Y < te; ++Y) $.charCodeAt(Y) >= 128 && b("not-basic"), G.push($.charCodeAt(Y));
    for (let Y = te > 0 ? te + 1 : 0; Y < J; ) {
      let X = ee;
      for (let Z = 1, ne = e; ; ne += e) {
        Y >= J && b("invalid-input");
        let de = g($.charCodeAt(Y++));
        de >= e && b("invalid-input"), de > I((t - ee) / Z) && b("overflow"), ee += de * Z;
        let be = ne <= W ? r : ne >= W + n ? n : ne - W;
        if (de < be) break;
        let ge = e - be;
        Z > I(t / ge) && b("overflow"), Z *= ge;
      }
      let ce = G.length + 1;
      W = v(ee - X, ce, X == 0), I(ee / ce) > t - z && b("overflow"), z += I(ee / ce), ee %= ce, G.splice(ee++, 0, z);
    }
    return String.fromCodePoint(...G);
  }, D = function($) {
    let G = [];
    $ = R($);
    let J = $.length, ee = u, z = 0, W = o;
    for (let X of $) X < 128 && G.push(S(X));
    let te = G.length, Y = te;
    for (te && G.push(c); Y < J; ) {
      let X = t;
      for (let Z of $) Z >= ee && Z < X && (X = Z);
      let ce = Y + 1;
      X - ee > I((t - z) / ce) && b("overflow"), z += (X - ee) * ce, ee = X;
      for (let Z of $) if (Z < ee && ++z > t && b("overflow"), Z === ee) {
        let ne = z;
        for (let de = e; ; de += e) {
          let be = de <= W ? r : de >= W + n ? n : de - W;
          if (ne < be) break;
          let ge = ne - be, Ae = e - be;
          G.push(S(O(be + ge % Ae, 0))), ne = I(ge / Ae);
        }
        G.push(S(O(ne, 0))), W = v(z, ce, Y === te), z = 0, ++Y;
      }
      ++z, ++ee;
    }
    return G.join("");
  };
  return Wa = { version: "2.3.1", ucs2: { decode: R, encode: A }, decode: B, encode: D, toASCII: function($) {
    return w($, function(G) {
      return d.test(G) ? "xn--" + D(G) : G;
    });
  }, toUnicode: function($) {
    return w($, function(G) {
      return f.test(G) ? B(G.slice(4).toLowerCase()) : G;
    });
  } }, Wa;
}
var Wa;
var pg;
var nr;
var s8;
var a8;
var u8;
var l8;
var c8;
var f8;
var gg = ze(() => {
  x();
  P();
  T();
  Wa = {}, pg = false;
  nr = CE(), s8 = nr.decode, a8 = nr.encode, u8 = nr.toASCII, l8 = nr.toUnicode, c8 = nr.ucs2, f8 = nr.version;
});
function ME() {
  return yg || (yg = true, Va = function() {
    if (typeof Symbol != "function" || typeof Object.getOwnPropertySymbols != "function") return false;
    if (typeof Symbol.iterator == "symbol") return true;
    var e = {}, r = Symbol("test"), n = Object(r);
    if (typeof r == "string" || Object.prototype.toString.call(r) !== "[object Symbol]" || Object.prototype.toString.call(n) !== "[object Symbol]") return false;
    var i = 42;
    e[r] = i;
    for (r in e) return false;
    if (typeof Object.keys == "function" && Object.keys(e).length !== 0 || typeof Object.getOwnPropertyNames == "function" && Object.getOwnPropertyNames(e).length !== 0) return false;
    var s = Object.getOwnPropertySymbols(e);
    if (s.length !== 1 || s[0] !== r || !Object.prototype.propertyIsEnumerable.call(e, r)) return false;
    if (typeof Object.getOwnPropertyDescriptor == "function") {
      var o = Object.getOwnPropertyDescriptor(e, r);
      if (o.value !== i || o.enumerable !== true) return false;
    }
    return true;
  }), Va;
}
function BE() {
  return bg || (bg = true, Ha = Error), Ha;
}
function NE() {
  return mg || (mg = true, za = EvalError), za;
}
function LE() {
  return _g || (_g = true, Ga = RangeError), Ga;
}
function qE() {
  return wg || (wg = true, Qa = ReferenceError), Qa;
}
function qg() {
  return vg || (vg = true, Ka = SyntaxError), Ka;
}
function sn() {
  return Sg || (Sg = true, Ya = TypeError), Ya;
}
function DE() {
  return Eg || (Eg = true, Ja = URIError), Ja;
}
function UE() {
  if (Ag) return Xa;
  Ag = true;
  var t = typeof Symbol < "u" && Symbol, e = ME();
  return Xa = function() {
    return typeof t != "function" || typeof Symbol != "function" || typeof t("foo") != "symbol" || typeof Symbol("bar") != "symbol" ? false : e();
  }, Xa;
}
function FE() {
  if (Ig) return Za;
  Ig = true;
  var t = { __proto__: null, foo: {} }, e = Object;
  return Za = function() {
    return { __proto__: t }.foo === t.foo && !(t instanceof e);
  }, Za;
}
function jE() {
  if (xg) return eu;
  xg = true;
  var t = "Function.prototype.bind called on incompatible ", e = Object.prototype.toString, r = Math.max, n = "[object Function]", i = function(c, f) {
    for (var d = [], h = 0; h < c.length; h += 1) d[h] = c[h];
    for (var _ = 0; _ < f.length; _ += 1) d[_ + c.length] = f[_];
    return d;
  }, s = function(c, f) {
    for (var d = [], h = f, _ = 0; h < c.length; h += 1, _ += 1) d[_] = c[h];
    return d;
  }, o = function(u, c) {
    for (var f = "", d = 0; d < u.length; d += 1) f += u[d], d + 1 < u.length && (f += c);
    return f;
  };
  return eu = function(c) {
    var f = this;
    if (typeof f != "function" || e.apply(f) !== n) throw new TypeError(t + f);
    for (var d = s(arguments, 1), h, _ = function() {
      if (this instanceof h) {
        var m = f.apply(this, i(d, arguments));
        return Object(m) === m ? m : this;
      }
      return f.apply(c, i(d, arguments));
    }, y = r(0, f.length - d.length), I = [], S = 0; S < y; S++) I[S] = "$" + S;
    if (h = Function("binder", "return function (" + o(I, ",") + "){ return binder.apply(this,arguments); }")(_), f.prototype) {
      var b = function() {
      };
      b.prototype = f.prototype, h.prototype = new b(), b.prototype = null;
    }
    return h;
  }, eu;
}
function cu() {
  if (Tg) return tu;
  Tg = true;
  var t = jE();
  return tu = Function.prototype.bind || t, tu;
}
function $E() {
  if (Pg) return ru;
  Pg = true;
  var t = Function.prototype.call, e = Object.prototype.hasOwnProperty, r = cu();
  return ru = r.call(t, e), ru;
}
function Tr() {
  if (Og) return nu;
  Og = true;
  var t, e = BE(), r = NE(), n = LE(), i = qE(), s = qg(), o = sn(), u = DE(), c = Function, f = function(z) {
    try {
      return c('"use strict"; return (' + z + ").constructor;")();
    } catch {
    }
  }, d = Object.getOwnPropertyDescriptor;
  if (d) try {
    d({}, "");
  } catch {
    d = null;
  }
  var h = function() {
    throw new o();
  }, _ = d ? function() {
    try {
      return arguments.callee, h;
    } catch {
      try {
        return d(arguments, "callee").get;
      } catch {
        return h;
      }
    }
  }() : h, y = UE()(), I = FE()(), S = Object.getPrototypeOf || (I ? function(z) {
    return z.__proto__;
  } : null), b = {}, m = typeof Uint8Array > "u" || !S ? t : S(Uint8Array), w = { __proto__: null, "%AggregateError%": typeof AggregateError > "u" ? t : AggregateError, "%Array%": Array, "%ArrayBuffer%": typeof ArrayBuffer > "u" ? t : ArrayBuffer, "%ArrayIteratorPrototype%": y && S ? S([][Symbol.iterator]()) : t, "%AsyncFromSyncIteratorPrototype%": t, "%AsyncFunction%": b, "%AsyncGenerator%": b, "%AsyncGeneratorFunction%": b, "%AsyncIteratorPrototype%": b, "%Atomics%": typeof Atomics > "u" ? t : Atomics, "%BigInt%": typeof BigInt > "u" ? t : BigInt, "%BigInt64Array%": typeof BigInt64Array > "u" ? t : BigInt64Array, "%BigUint64Array%": typeof BigUint64Array > "u" ? t : BigUint64Array, "%Boolean%": Boolean, "%DataView%": typeof DataView > "u" ? t : DataView, "%Date%": Date, "%decodeURI%": decodeURI, "%decodeURIComponent%": decodeURIComponent, "%encodeURI%": encodeURI, "%encodeURIComponent%": encodeURIComponent, "%Error%": e, "%eval%": eval, "%EvalError%": r, "%Float32Array%": typeof Float32Array > "u" ? t : Float32Array, "%Float64Array%": typeof Float64Array > "u" ? t : Float64Array, "%FinalizationRegistry%": typeof FinalizationRegistry > "u" ? t : FinalizationRegistry, "%Function%": c, "%GeneratorFunction%": b, "%Int8Array%": typeof Int8Array > "u" ? t : Int8Array, "%Int16Array%": typeof Int16Array > "u" ? t : Int16Array, "%Int32Array%": typeof Int32Array > "u" ? t : Int32Array, "%isFinite%": isFinite, "%isNaN%": isNaN, "%IteratorPrototype%": y && S ? S(S([][Symbol.iterator]())) : t, "%JSON%": typeof JSON == "object" ? JSON : t, "%Map%": typeof Map > "u" ? t : Map, "%MapIteratorPrototype%": typeof Map > "u" || !y || !S ? t : S((/* @__PURE__ */ new Map())[Symbol.iterator]()), "%Math%": Math, "%Number%": Number, "%Object%": Object, "%parseFloat%": parseFloat, "%parseInt%": parseInt, "%Promise%": typeof Promise > "u" ? t : Promise, "%Proxy%": typeof Proxy > "u" ? t : Proxy, "%RangeError%": n, "%ReferenceError%": i, "%Reflect%": typeof Reflect > "u" ? t : Reflect, "%RegExp%": RegExp, "%Set%": typeof Set > "u" ? t : Set, "%SetIteratorPrototype%": typeof Set > "u" || !y || !S ? t : S((/* @__PURE__ */ new Set())[Symbol.iterator]()), "%SharedArrayBuffer%": typeof SharedArrayBuffer > "u" ? t : SharedArrayBuffer, "%String%": String, "%StringIteratorPrototype%": y && S ? S(""[Symbol.iterator]()) : t, "%Symbol%": y ? Symbol : t, "%SyntaxError%": s, "%ThrowTypeError%": _, "%TypedArray%": m, "%TypeError%": o, "%Uint8Array%": typeof Uint8Array > "u" ? t : Uint8Array, "%Uint8ClampedArray%": typeof Uint8ClampedArray > "u" ? t : Uint8ClampedArray, "%Uint16Array%": typeof Uint16Array > "u" ? t : Uint16Array, "%Uint32Array%": typeof Uint32Array > "u" ? t : Uint32Array, "%URIError%": u, "%WeakMap%": typeof WeakMap > "u" ? t : WeakMap, "%WeakRef%": typeof WeakRef > "u" ? t : WeakRef, "%WeakSet%": typeof WeakSet > "u" ? t : WeakSet };
  if (S) try {
    null.error;
  } catch (z) {
    var R = S(S(z));
    w["%Error.prototype%"] = R;
  }
  var A = function z(W) {
    var te;
    if (W === "%AsyncFunction%") te = f("async function () {}");
    else if (W === "%GeneratorFunction%") te = f("function* () {}");
    else if (W === "%AsyncGeneratorFunction%") te = f("async function* () {}");
    else if (W === "%AsyncGenerator%") {
      var Y = z("%AsyncGeneratorFunction%");
      Y && (te = Y.prototype);
    } else if (W === "%AsyncIteratorPrototype%") {
      var X = z("%AsyncGenerator%");
      X && S && (te = S(X.prototype));
    }
    return w[W] = te, te;
  }, g = { __proto__: null, "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"], "%ArrayPrototype%": ["Array", "prototype"], "%ArrayProto_entries%": ["Array", "prototype", "entries"], "%ArrayProto_forEach%": ["Array", "prototype", "forEach"], "%ArrayProto_keys%": ["Array", "prototype", "keys"], "%ArrayProto_values%": ["Array", "prototype", "values"], "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"], "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"], "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"], "%BooleanPrototype%": ["Boolean", "prototype"], "%DataViewPrototype%": ["DataView", "prototype"], "%DatePrototype%": ["Date", "prototype"], "%ErrorPrototype%": ["Error", "prototype"], "%EvalErrorPrototype%": ["EvalError", "prototype"], "%Float32ArrayPrototype%": ["Float32Array", "prototype"], "%Float64ArrayPrototype%": ["Float64Array", "prototype"], "%FunctionPrototype%": ["Function", "prototype"], "%Generator%": ["GeneratorFunction", "prototype"], "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"], "%Int8ArrayPrototype%": ["Int8Array", "prototype"], "%Int16ArrayPrototype%": ["Int16Array", "prototype"], "%Int32ArrayPrototype%": ["Int32Array", "prototype"], "%JSONParse%": ["JSON", "parse"], "%JSONStringify%": ["JSON", "stringify"], "%MapPrototype%": ["Map", "prototype"], "%NumberPrototype%": ["Number", "prototype"], "%ObjectPrototype%": ["Object", "prototype"], "%ObjProto_toString%": ["Object", "prototype", "toString"], "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"], "%PromisePrototype%": ["Promise", "prototype"], "%PromiseProto_then%": ["Promise", "prototype", "then"], "%Promise_all%": ["Promise", "all"], "%Promise_reject%": ["Promise", "reject"], "%Promise_resolve%": ["Promise", "resolve"], "%RangeErrorPrototype%": ["RangeError", "prototype"], "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"], "%RegExpPrototype%": ["RegExp", "prototype"], "%SetPrototype%": ["Set", "prototype"], "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"], "%StringPrototype%": ["String", "prototype"], "%SymbolPrototype%": ["Symbol", "prototype"], "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"], "%TypedArrayPrototype%": ["TypedArray", "prototype"], "%TypeErrorPrototype%": ["TypeError", "prototype"], "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"], "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"], "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"], "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"], "%URIErrorPrototype%": ["URIError", "prototype"], "%WeakMapPrototype%": ["WeakMap", "prototype"], "%WeakSetPrototype%": ["WeakSet", "prototype"] }, O = cu(), v = $E(), B = O.call(Function.call, Array.prototype.concat), D = O.call(Function.apply, Array.prototype.splice), L = O.call(Function.call, String.prototype.replace), K = O.call(Function.call, String.prototype.slice), U = O.call(Function.call, RegExp.prototype.exec), $ = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g, G = /\\(\\)?/g, J = function(W) {
    var te = K(W, 0, 1), Y = K(W, -1);
    if (te === "%" && Y !== "%") throw new s("invalid intrinsic syntax, expected closing `%`");
    if (Y === "%" && te !== "%") throw new s("invalid intrinsic syntax, expected opening `%`");
    var X = [];
    return L(W, $, function(ce, Z, ne, de) {
      X[X.length] = ne ? L(de, G, "$1") : Z || ce;
    }), X;
  }, ee = function(W, te) {
    var Y = W, X;
    if (v(g, Y) && (X = g[Y], Y = "%" + X[0] + "%"), v(w, Y)) {
      var ce = w[Y];
      if (ce === b && (ce = A(Y)), typeof ce > "u" && !te) throw new o("intrinsic " + W + " exists, but is not available. Please file an issue!");
      return { alias: X, name: Y, value: ce };
    }
    throw new s("intrinsic " + W + " does not exist!");
  };
  return nu = function(W, te) {
    if (typeof W != "string" || W.length === 0) throw new o("intrinsic name must be a non-empty string");
    if (arguments.length > 1 && typeof te != "boolean") throw new o('"allowMissing" argument must be a boolean');
    if (U(/^%?[^%]*%?$/, W) === null) throw new s("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
    var Y = J(W), X = Y.length > 0 ? Y[0] : "", ce = ee("%" + X + "%", te), Z = ce.name, ne = ce.value, de = false, be = ce.alias;
    be && (X = be[0], D(Y, B([0, 1], be)));
    for (var ge = 1, Ae = true; ge < Y.length; ge += 1) {
      var we = Y[ge], ve = K(we, 0, 1), Oe = K(we, -1);
      if ((ve === '"' || ve === "'" || ve === "`" || Oe === '"' || Oe === "'" || Oe === "`") && ve !== Oe) throw new s("property names with quotes must have matching quotes");
      if ((we === "constructor" || !Ae) && (de = true), X += "." + we, Z = "%" + X + "%", v(w, Z)) ne = w[Z];
      else if (ne != null) {
        if (!(we in ne)) {
          if (!te) throw new o("base intrinsic for " + W + " exists, but the property is not available.");
          return;
        }
        if (d && ge + 1 >= Y.length) {
          var xe = d(ne, we);
          Ae = !!xe, Ae && "get" in xe && !("originalValue" in xe.get) ? ne = xe.get : ne = ne[we];
        } else Ae = v(ne, we), ne = ne[we];
        Ae && !de && (w[Z] = ne);
      }
    }
    return ne;
  }, nu;
}
function fu() {
  if (Rg) return iu;
  Rg = true;
  var t = Tr(), e = t("%Object.defineProperty%", true) || false;
  if (e) try {
    e({}, "a", { value: 1 });
  } catch {
    e = false;
  }
  return iu = e, iu;
}
function Dg() {
  if (kg) return ou;
  kg = true;
  var t = Tr(), e = t("%Object.getOwnPropertyDescriptor%", true);
  if (e) try {
    e([], "length");
  } catch {
    e = null;
  }
  return ou = e, ou;
}
function WE() {
  if (Cg) return su;
  Cg = true;
  var t = fu(), e = qg(), r = sn(), n = Dg();
  return su = function(s, o, u) {
    if (!s || typeof s != "object" && typeof s != "function") throw new r("`obj` must be an object or a function`");
    if (typeof o != "string" && typeof o != "symbol") throw new r("`property` must be a string or a symbol`");
    if (arguments.length > 3 && typeof arguments[3] != "boolean" && arguments[3] !== null) throw new r("`nonEnumerable`, if provided, must be a boolean or null");
    if (arguments.length > 4 && typeof arguments[4] != "boolean" && arguments[4] !== null) throw new r("`nonWritable`, if provided, must be a boolean or null");
    if (arguments.length > 5 && typeof arguments[5] != "boolean" && arguments[5] !== null) throw new r("`nonConfigurable`, if provided, must be a boolean or null");
    if (arguments.length > 6 && typeof arguments[6] != "boolean") throw new r("`loose`, if provided, must be a boolean");
    var c = arguments.length > 3 ? arguments[3] : null, f = arguments.length > 4 ? arguments[4] : null, d = arguments.length > 5 ? arguments[5] : null, h = arguments.length > 6 ? arguments[6] : false, _ = !!n && n(s, o);
    if (t) t(s, o, { configurable: d === null && _ ? _.configurable : !d, enumerable: c === null && _ ? _.enumerable : !c, value: u, writable: f === null && _ ? _.writable : !f });
    else if (h || !c && !f && !d) s[o] = u;
    else throw new e("This environment does not support defining a property as non-configurable, non-writable, or non-enumerable.");
  }, su;
}
function VE() {
  if (Mg) return au;
  Mg = true;
  var t = fu(), e = function() {
    return !!t;
  };
  return e.hasArrayLengthDefineBug = function() {
    if (!t) return null;
    try {
      return t([], "length", { value: 1 }).length !== 1;
    } catch {
      return true;
    }
  }, au = e, au;
}
function HE() {
  if (Bg) return uu;
  Bg = true;
  var t = Tr(), e = WE(), r = VE()(), n = Dg(), i = sn(), s = t("%Math.floor%");
  return uu = function(u, c) {
    if (typeof u != "function") throw new i("`fn` is not a function");
    if (typeof c != "number" || c < 0 || c > 4294967295 || s(c) !== c) throw new i("`length` must be a positive 32-bit integer");
    var f = arguments.length > 2 && !!arguments[2], d = true, h = true;
    if ("length" in u && n) {
      var _ = n(u, "length");
      _ && !_.configurable && (d = false), _ && !_.writable && (h = false);
    }
    return (d || h || !f) && (r ? e(u, "length", c, true, true) : e(u, "length", c)), u;
  }, uu;
}
function zE() {
  if (Ng) return ri;
  Ng = true;
  var t = cu(), e = Tr(), r = HE(), n = sn(), i = e("%Function.prototype.apply%"), s = e("%Function.prototype.call%"), o = e("%Reflect.apply%", true) || t.call(s, i), u = fu(), c = e("%Math.max%");
  ri = function(h) {
    if (typeof h != "function") throw new n("a function is required");
    var _ = o(t, s, arguments);
    return r(_, 1 + c(0, h.length - (arguments.length - 1)), true);
  };
  var f = function() {
    return o(t, i, arguments);
  };
  return u ? u(ri, "apply", { value: f }) : ri.apply = f, ri;
}
function Ug() {
  if (Lg) return lu;
  Lg = true;
  var t = Tr(), e = zE(), r = e(t("String.prototype.indexOf"));
  return lu = function(i, s) {
    var o = t(i, !!s);
    return typeof o == "function" && r(i, ".prototype.") > -1 ? e(o) : o;
  }, lu;
}
var Va;
var yg;
var Ha;
var bg;
var za;
var mg;
var Ga;
var _g;
var Qa;
var wg;
var Ka;
var vg;
var Ya;
var Sg;
var Ja;
var Eg;
var Xa;
var Ag;
var Za;
var Ig;
var eu;
var xg;
var tu;
var Tg;
var ru;
var Pg;
var nu;
var Og;
var iu;
var Rg;
var ou;
var kg;
var su;
var Cg;
var au;
var Mg;
var uu;
var Bg;
var ri;
var Ng;
var lu;
var Lg;
var Fg = ze(() => {
  x();
  P();
  T();
  Va = {}, yg = false;
  Ha = {}, bg = false;
  za = {}, mg = false;
  Ga = {}, _g = false;
  Qa = {}, wg = false;
  Ka = {}, vg = false;
  Ya = {}, Sg = false;
  Ja = {}, Eg = false;
  Xa = {}, Ag = false;
  Za = {}, Ig = false;
  eu = {}, xg = false;
  tu = {}, Tg = false;
  ru = {}, Pg = false;
  nu = {}, Og = false;
  iu = {}, Rg = false;
  ou = {}, kg = false;
  su = {}, Cg = false;
  au = {}, Mg = false;
  uu = {}, Bg = false;
  ri = {}, Ng = false;
  lu = {}, Lg = false;
});
function gu(t) {
  throw new Error("Node.js process " + t + " is not supported by JSPM core outside of Node.js");
}
function GE() {
  !an || !Pr || (an = false, Pr.length ? Dt = Pr.concat(Dt) : bo = -1, Dt.length && jg());
}
function jg() {
  if (!an) {
    var t = setTimeout(GE, 0);
    an = true;
    for (var e = Dt.length; e; ) {
      for (Pr = Dt, Dt = []; ++bo < e; ) Pr && Pr[bo].run();
      bo = -1, e = Dt.length;
    }
    Pr = null, an = false, clearTimeout(t);
  }
}
function QE(t) {
  var e = new Array(arguments.length - 1);
  if (arguments.length > 1) for (var r = 1; r < arguments.length; r++) e[r - 1] = arguments[r];
  Dt.push(new $g(t, e)), Dt.length === 1 && !an && setTimeout(jg, 0);
}
function $g(t, e) {
  this.fun = t, this.array = e;
}
function $e() {
}
function f1(t) {
  gu("_linkedBinding");
}
function g1(t) {
  gu("dlopen");
}
function y1() {
  return [];
}
function b1() {
  return [];
}
function x1(t, e) {
  if (!t) throw new Error(e || "assertion error");
}
function R1() {
  return false;
}
function G1() {
  return ir.now() / 1e3;
}
function pu(t) {
  var e = Math.floor((Date.now() - ir.now()) * 1e-3), r = ir.now() * 1e-3, n = Math.floor(r) + e, i = Math.floor(r % 1 * 1e9);
  return t && (n = n - t[0], i = i - t[1], i < 0 && (n--, i += hu)), [n, i];
}
function or() {
  return bu;
}
function oA(t) {
  return [];
}
var Dt;
var an;
var Pr;
var bo;
var KE;
var YE;
var JE;
var XE;
var ZE;
var e1;
var t1;
var r1;
var n1;
var i1;
var o1;
var s1;
var a1;
var u1;
var l1;
var c1;
var d1;
var h1;
var p1;
var m1;
var _1;
var yu;
var w1;
var v1;
var S1;
var E1;
var A1;
var I1;
var T1;
var P1;
var O1;
var k1;
var C1;
var M1;
var B1;
var N1;
var L1;
var q1;
var D1;
var U1;
var F1;
var j1;
var $1;
var W1;
var V1;
var H1;
var z1;
var ir;
var du;
var hu;
var Q1;
var K1;
var Y1;
var J1;
var X1;
var Z1;
var eA;
var tA;
var rA;
var nA;
var iA;
var bu;
var mu = ze(() => {
  x();
  P();
  T();
  Dt = [], an = false, bo = -1;
  $g.prototype.run = function() {
    this.fun.apply(null, this.array);
  };
  KE = "browser", YE = "x64", JE = "browser", XE = { PATH: "/usr/bin", LANG: navigator.language + ".UTF-8", PWD: "/", HOME: "/home", TMP: "/tmp" }, ZE = ["/usr/bin/node"], e1 = [], t1 = "v16.8.0", r1 = {}, n1 = function(t, e) {
    console.warn((e ? e + ": " : "") + t);
  }, i1 = function(t) {
    gu("binding");
  }, o1 = function(t) {
    return 0;
  }, s1 = function() {
    return "/";
  }, a1 = function(t) {
  }, u1 = { name: "node", sourceUrl: "", headersUrl: "", libUrl: "" };
  l1 = $e, c1 = [];
  d1 = {}, h1 = false, p1 = {};
  m1 = $e, _1 = $e, yu = function() {
    return {};
  }, w1 = yu, v1 = yu, S1 = $e, E1 = $e, A1 = $e, I1 = {};
  T1 = { inspector: false, debug: false, uv: false, ipv6: false, tls_alpn: false, tls_sni: false, tls_ocsp: false, tls: false, cached_builtins: true }, P1 = $e, O1 = $e;
  k1 = $e, C1 = $e, M1 = $e, B1 = $e, N1 = $e, L1 = void 0, q1 = void 0, D1 = void 0, U1 = $e, F1 = 2, j1 = 1, $1 = "/bin/usr/node", W1 = 9229, V1 = "node", H1 = [], z1 = $e, ir = { now: typeof performance < "u" ? performance.now.bind(performance) : void 0, timing: typeof performance < "u" ? performance.timing : void 0 };
  ir.now === void 0 && (du = Date.now(), ir.timing && ir.timing.navigationStart && (du = ir.timing.navigationStart), ir.now = () => Date.now() - du);
  hu = 1e9;
  pu.bigint = function(t) {
    var e = pu(t);
    return typeof BigInt > "u" ? e[0] * hu + e[1] : BigInt(e[0] * hu) + BigInt(e[1]);
  };
  Q1 = 10, K1 = {}, Y1 = 0;
  J1 = or, X1 = or, Z1 = or, eA = or, tA = or, rA = $e, nA = or, iA = or;
  bu = { version: t1, versions: r1, arch: YE, platform: JE, release: u1, _rawDebug: l1, moduleLoadList: c1, binding: i1, _linkedBinding: f1, _events: K1, _eventsCount: Y1, _maxListeners: Q1, on: or, addListener: J1, once: X1, off: Z1, removeListener: eA, removeAllListeners: tA, emit: rA, prependListener: nA, prependOnceListener: iA, listeners: oA, domain: d1, _exiting: h1, config: p1, dlopen: g1, uptime: G1, _getActiveRequests: y1, _getActiveHandles: b1, reallyExit: m1, _kill: _1, cpuUsage: yu, resourceUsage: w1, memoryUsage: v1, kill: S1, exit: E1, openStdin: A1, allowedNodeEnvironmentFlags: I1, assert: x1, features: T1, _fatalExceptions: P1, setUncaughtExceptionCaptureCallback: O1, hasUncaughtExceptionCaptureCallback: R1, emitWarning: n1, nextTick: QE, _tickCallback: k1, _debugProcess: C1, _debugEnd: M1, _startProfilerIdleNotifier: B1, _stopProfilerIdleNotifier: N1, stdout: L1, stdin: D1, stderr: q1, abort: U1, umask: o1, chdir: a1, cwd: s1, env: XE, title: KE, argv: ZE, execArgv: e1, pid: F1, ppid: j1, execPath: $1, debugPort: W1, hrtime: pu, argv0: V1, _preload_modules: H1, setSourceMapsEnabled: z1 };
});
function sA() {
  if (Wg) return _u;
  Wg = true;
  var t = bu;
  function e(s) {
    if (typeof s != "string") throw new TypeError("Path must be a string. Received " + JSON.stringify(s));
  }
  function r(s, o) {
    for (var u = "", c = 0, f = -1, d = 0, h, _ = 0; _ <= s.length; ++_) {
      if (_ < s.length) h = s.charCodeAt(_);
      else {
        if (h === 47) break;
        h = 47;
      }
      if (h === 47) {
        if (!(f === _ - 1 || d === 1)) if (f !== _ - 1 && d === 2) {
          if (u.length < 2 || c !== 2 || u.charCodeAt(u.length - 1) !== 46 || u.charCodeAt(u.length - 2) !== 46) {
            if (u.length > 2) {
              var y = u.lastIndexOf("/");
              if (y !== u.length - 1) {
                y === -1 ? (u = "", c = 0) : (u = u.slice(0, y), c = u.length - 1 - u.lastIndexOf("/")), f = _, d = 0;
                continue;
              }
            } else if (u.length === 2 || u.length === 1) {
              u = "", c = 0, f = _, d = 0;
              continue;
            }
          }
          o && (u.length > 0 ? u += "/.." : u = "..", c = 2);
        } else u.length > 0 ? u += "/" + s.slice(f + 1, _) : u = s.slice(f + 1, _), c = _ - f - 1;
        f = _, d = 0;
      } else h === 46 && d !== -1 ? ++d : d = -1;
    }
    return u;
  }
  function n(s, o) {
    var u = o.dir || o.root, c = o.base || (o.name || "") + (o.ext || "");
    return u ? u === o.root ? u + c : u + s + c : c;
  }
  var i = { resolve: function() {
    for (var o = "", u = false, c, f = arguments.length - 1; f >= -1 && !u; f--) {
      var d;
      f >= 0 ? d = arguments[f] : (c === void 0 && (c = t.cwd()), d = c), e(d), d.length !== 0 && (o = d + "/" + o, u = d.charCodeAt(0) === 47);
    }
    return o = r(o, !u), u ? o.length > 0 ? "/" + o : "/" : o.length > 0 ? o : ".";
  }, normalize: function(o) {
    if (e(o), o.length === 0) return ".";
    var u = o.charCodeAt(0) === 47, c = o.charCodeAt(o.length - 1) === 47;
    return o = r(o, !u), o.length === 0 && !u && (o = "."), o.length > 0 && c && (o += "/"), u ? "/" + o : o;
  }, isAbsolute: function(o) {
    return e(o), o.length > 0 && o.charCodeAt(0) === 47;
  }, join: function() {
    if (arguments.length === 0) return ".";
    for (var o, u = 0; u < arguments.length; ++u) {
      var c = arguments[u];
      e(c), c.length > 0 && (o === void 0 ? o = c : o += "/" + c);
    }
    return o === void 0 ? "." : i.normalize(o);
  }, relative: function(o, u) {
    if (e(o), e(u), o === u || (o = i.resolve(o), u = i.resolve(u), o === u)) return "";
    for (var c = 1; c < o.length && o.charCodeAt(c) === 47; ++c) ;
    for (var f = o.length, d = f - c, h = 1; h < u.length && u.charCodeAt(h) === 47; ++h) ;
    for (var _ = u.length, y = _ - h, I = d < y ? d : y, S = -1, b = 0; b <= I; ++b) {
      if (b === I) {
        if (y > I) {
          if (u.charCodeAt(h + b) === 47) return u.slice(h + b + 1);
          if (b === 0) return u.slice(h + b);
        } else d > I && (o.charCodeAt(c + b) === 47 ? S = b : b === 0 && (S = 0));
        break;
      }
      var m = o.charCodeAt(c + b), w = u.charCodeAt(h + b);
      if (m !== w) break;
      m === 47 && (S = b);
    }
    var R = "";
    for (b = c + S + 1; b <= f; ++b) (b === f || o.charCodeAt(b) === 47) && (R.length === 0 ? R += ".." : R += "/..");
    return R.length > 0 ? R + u.slice(h + S) : (h += S, u.charCodeAt(h) === 47 && ++h, u.slice(h));
  }, _makeLong: function(o) {
    return o;
  }, dirname: function(o) {
    if (e(o), o.length === 0) return ".";
    for (var u = o.charCodeAt(0), c = u === 47, f = -1, d = true, h = o.length - 1; h >= 1; --h) if (u = o.charCodeAt(h), u === 47) {
      if (!d) {
        f = h;
        break;
      }
    } else d = false;
    return f === -1 ? c ? "/" : "." : c && f === 1 ? "//" : o.slice(0, f);
  }, basename: function(o, u) {
    if (u !== void 0 && typeof u != "string") throw new TypeError('"ext" argument must be a string');
    e(o);
    var c = 0, f = -1, d = true, h;
    if (u !== void 0 && u.length > 0 && u.length <= o.length) {
      if (u.length === o.length && u === o) return "";
      var _ = u.length - 1, y = -1;
      for (h = o.length - 1; h >= 0; --h) {
        var I = o.charCodeAt(h);
        if (I === 47) {
          if (!d) {
            c = h + 1;
            break;
          }
        } else y === -1 && (d = false, y = h + 1), _ >= 0 && (I === u.charCodeAt(_) ? --_ === -1 && (f = h) : (_ = -1, f = y));
      }
      return c === f ? f = y : f === -1 && (f = o.length), o.slice(c, f);
    } else {
      for (h = o.length - 1; h >= 0; --h) if (o.charCodeAt(h) === 47) {
        if (!d) {
          c = h + 1;
          break;
        }
      } else f === -1 && (d = false, f = h + 1);
      return f === -1 ? "" : o.slice(c, f);
    }
  }, extname: function(o) {
    e(o);
    for (var u = -1, c = 0, f = -1, d = true, h = 0, _ = o.length - 1; _ >= 0; --_) {
      var y = o.charCodeAt(_);
      if (y === 47) {
        if (!d) {
          c = _ + 1;
          break;
        }
        continue;
      }
      f === -1 && (d = false, f = _ + 1), y === 46 ? u === -1 ? u = _ : h !== 1 && (h = 1) : u !== -1 && (h = -1);
    }
    return u === -1 || f === -1 || h === 0 || h === 1 && u === f - 1 && u === c + 1 ? "" : o.slice(u, f);
  }, format: function(o) {
    if (o === null || typeof o != "object") throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof o);
    return n("/", o);
  }, parse: function(o) {
    e(o);
    var u = { root: "", dir: "", base: "", ext: "", name: "" };
    if (o.length === 0) return u;
    var c = o.charCodeAt(0), f = c === 47, d;
    f ? (u.root = "/", d = 1) : d = 0;
    for (var h = -1, _ = 0, y = -1, I = true, S = o.length - 1, b = 0; S >= d; --S) {
      if (c = o.charCodeAt(S), c === 47) {
        if (!I) {
          _ = S + 1;
          break;
        }
        continue;
      }
      y === -1 && (I = false, y = S + 1), c === 46 ? h === -1 ? h = S : b !== 1 && (b = 1) : h !== -1 && (b = -1);
    }
    return h === -1 || y === -1 || b === 0 || b === 1 && h === y - 1 && h === _ + 1 ? y !== -1 && (_ === 0 && f ? u.base = u.name = o.slice(1, y) : u.base = u.name = o.slice(_, y)) : (_ === 0 && f ? (u.name = o.slice(1, h), u.base = o.slice(1, y)) : (u.name = o.slice(_, h), u.base = o.slice(_, y)), u.ext = o.slice(h, y)), _ > 0 ? u.dir = o.slice(0, _ - 1) : f && (u.dir = "/"), u;
  }, sep: "/", delimiter: ":", win32: null, posix: null };
  return i.posix = i, _u = i, _u;
}
var _u;
var Wg;
var wu;
var Vg = ze(() => {
  x();
  P();
  T();
  mu();
  _u = {}, Wg = false;
  wu = sA();
});
var ry = {};
Mr(ry, { URL: () => wA, Url: () => gA, default: () => He, fileURLToPath: () => ey, format: () => yA, parse: () => _A, pathToFileURL: () => ty, resolve: () => bA, resolveObject: () => mA });
function uA() {
  if (Hg) return vu;
  Hg = true;
  var t = typeof Map == "function" && Map.prototype, e = Object.getOwnPropertyDescriptor && t ? Object.getOwnPropertyDescriptor(Map.prototype, "size") : null, r = t && e && typeof e.get == "function" ? e.get : null, n = t && Map.prototype.forEach, i = typeof Set == "function" && Set.prototype, s = Object.getOwnPropertyDescriptor && i ? Object.getOwnPropertyDescriptor(Set.prototype, "size") : null, o = i && s && typeof s.get == "function" ? s.get : null, u = i && Set.prototype.forEach, c = typeof WeakMap == "function" && WeakMap.prototype, f = c ? WeakMap.prototype.has : null, d = typeof WeakSet == "function" && WeakSet.prototype, h = d ? WeakSet.prototype.has : null, _ = typeof WeakRef == "function" && WeakRef.prototype, y = _ ? WeakRef.prototype.deref : null, I = Boolean.prototype.valueOf, S = Object.prototype.toString, b = Function.prototype.toString, m = String.prototype.match, w = String.prototype.slice, R = String.prototype.replace, A = String.prototype.toUpperCase, g = String.prototype.toLowerCase, O = RegExp.prototype.test, v = Array.prototype.concat, B = Array.prototype.join, D = Array.prototype.slice, L = Math.floor, K = typeof BigInt == "function" ? BigInt.prototype.valueOf : null, U = Object.getOwnPropertySymbols, $ = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? Symbol.prototype.toString : null, G = typeof Symbol == "function" && typeof Symbol.iterator == "object", J = typeof Symbol == "function" && Symbol.toStringTag && (typeof Symbol.toStringTag === G || true) ? Symbol.toStringTag : null, ee = Object.prototype.propertyIsEnumerable, z = (typeof Reflect == "function" ? Reflect.getPrototypeOf : Object.getPrototypeOf) || ([].__proto__ === Array.prototype ? function(k) {
    return k.__proto__;
  } : null);
  function W(k, M) {
    if (k === 1 / 0 || k === -1 / 0 || k !== k || k && k > -1e3 && k < 1e3 || O.call(/e/, M)) return M;
    var re = /[0-9](?=(?:[0-9]{3})+(?![0-9]))/g;
    if (typeof k == "number") {
      var ie = k < 0 ? -L(-k) : L(k);
      if (ie !== k) {
        var oe = String(ie), fe = w.call(M, oe.length + 1);
        return R.call(oe, re, "$&_") + "." + R.call(R.call(fe, /([0-9]{3})/g, "$&_"), /_$/, "");
      }
    }
    return R.call(M, re, "$&_");
  }
  var te = aA, Y = te.custom, X = Oe(Y) ? Y : null;
  vu = function k(M, re, ie, oe) {
    var fe = re || {};
    if (Re(fe, "quoteStyle") && fe.quoteStyle !== "single" && fe.quoteStyle !== "double") throw new TypeError('option "quoteStyle" must be "single" or "double"');
    if (Re(fe, "maxStringLength") && (typeof fe.maxStringLength == "number" ? fe.maxStringLength < 0 && fe.maxStringLength !== 1 / 0 : fe.maxStringLength !== null)) throw new TypeError('option "maxStringLength", if provided, must be a positive integer, Infinity, or `null`');
    var Ft = Re(fe, "customInspect") ? fe.customInspect : true;
    if (typeof Ft != "boolean" && Ft !== "symbol") throw new TypeError("option \"customInspect\", if provided, must be `true`, `false`, or `'symbol'`");
    if (Re(fe, "indent") && fe.indent !== null && fe.indent !== "	" && !(parseInt(fe.indent, 10) === fe.indent && fe.indent > 0)) throw new TypeError('option "indent" must be "\\t", an integer > 0, or `null`');
    if (Re(fe, "numericSeparator") && typeof fe.numericSeparator != "boolean") throw new TypeError('option "numericSeparator", if provided, must be `true` or `false`');
    var ur = fe.numericSeparator;
    if (typeof M > "u") return "undefined";
    if (M === null) return "null";
    if (typeof M == "boolean") return M ? "true" : "false";
    if (typeof M == "string") return ot(M, fe);
    if (typeof M == "number") {
      if (M === 0) return 1 / 0 / M > 0 ? "0" : "-0";
      var Ke = String(M);
      return ur ? W(M, Ke) : Ke;
    }
    if (typeof M == "bigint") {
      var jt = String(M) + "n";
      return ur ? W(M, jt) : jt;
    }
    var Eo = typeof fe.depth > "u" ? 5 : fe.depth;
    if (typeof ie > "u" && (ie = 0), ie >= Eo && Eo > 0 && typeof M == "object") return ne(M) ? "[Array]" : "[Object]";
    var kr = C(fe, ie);
    if (typeof oe > "u") oe = [];
    else if (Et(oe, M) >= 0) return "[Circular]";
    function st(Cr, fi, Iy) {
      if (fi && (oe = D.call(oe), oe.push(fi)), Iy) {
        var nl = { depth: fe.depth };
        return Re(fe, "quoteStyle") && (nl.quoteStyle = fe.quoteStyle), k(Cr, nl, ie + 1, oe);
      }
      return k(Cr, fe, ie + 1, oe);
    }
    if (typeof M == "function" && !be(M)) {
      var Yu = St(M), Ju = F(M, st);
      return "[Function" + (Yu ? ": " + Yu : " (anonymous)") + "]" + (Ju.length > 0 ? " { " + B.call(Ju, ", ") + " }" : "");
    }
    if (Oe(M)) {
      var Xu = G ? R.call(String(M), /^(Symbol\(.*\))_[^)]*$/, "$1") : $.call(M);
      return typeof M == "object" && !G ? p(Xu) : Xu;
    }
    if (vo(M)) {
      for (var dn = "<" + g.call(String(M.nodeName)), Ao = M.attributes || [], ci = 0; ci < Ao.length; ci++) dn += " " + Ao[ci].name + "=" + ce(Z(Ao[ci].value), "double", fe);
      return dn += ">", M.childNodes && M.childNodes.length && (dn += "..."), dn += "</" + g.call(String(M.nodeName)) + ">", dn;
    }
    if (ne(M)) {
      if (M.length === 0) return "[]";
      var Io = F(M, st);
      return kr && !E(Io) ? "[" + N(Io, kr) + "]" : "[ " + B.call(Io, ", ") + " ]";
    }
    if (ge(M)) {
      var xo = F(M, st);
      return !("cause" in Error.prototype) && "cause" in M && !ee.call(M, "cause") ? "{ [" + String(M) + "] " + B.call(v.call("[cause]: " + st(M.cause), xo), ", ") + " }" : xo.length === 0 ? "[" + String(M) + "]" : "{ [" + String(M) + "] " + B.call(xo, ", ") + " }";
    }
    if (typeof M == "object" && Ft) {
      if (X && typeof M[X] == "function" && te) return te(M, { depth: Eo - ie });
      if (Ft !== "symbol" && typeof M.inspect == "function") return M.inspect();
    }
    if (cn(M)) {
      var Zu = [];
      return n && n.call(M, function(Cr, fi) {
        Zu.push(st(fi, M, true) + " => " + st(Cr, M));
      }), l("Map", r.call(M), Zu, kr);
    }
    if (Xe(M)) {
      var el = [];
      return u && u.call(M, function(Cr) {
        el.push(st(Cr, M));
      }), l("Set", o.call(M), el, kr);
    }
    if (li(M)) return a("WeakMap");
    if (fn(M)) return a("WeakSet");
    if (Rr(M)) return a("WeakRef");
    if (we(M)) return p(st(Number(M)));
    if (xe(M)) return p(st(K.call(M)));
    if (ve(M)) return p(I.call(M));
    if (Ae(M)) return p(st(String(M)));
    if (typeof window < "u" && M === window) return "{ [object Window] }";
    if (typeof globalThis < "u" && M === globalThis || typeof Su < "u" && M === Su) return "{ [object globalThis] }";
    if (!de(M) && !be(M)) {
      var To = F(M, st), tl = z ? z(M) === Object.prototype : M instanceof Object || M.constructor === Object, Po = M instanceof Object ? "" : "null prototype", rl = !tl && J && Object(M) === M && J in M ? w.call(Ne(M), 8, -1) : Po ? "Object" : "", Ay = tl || typeof M.constructor != "function" ? "" : M.constructor.name ? M.constructor.name + " " : "", Oo = Ay + (rl || Po ? "[" + B.call(v.call([], rl || [], Po || []), ": ") + "] " : "");
      return To.length === 0 ? Oo + "{}" : kr ? Oo + "{" + N(To, kr) + "}" : Oo + "{ " + B.call(To, ", ") + " }";
    }
    return String(M);
  };
  function ce(k, M, re) {
    var ie = (re.quoteStyle || M) === "double" ? '"' : "'";
    return ie + k + ie;
  }
  function Z(k) {
    return R.call(String(k), /"/g, "&quot;");
  }
  function ne(k) {
    return Ne(k) === "[object Array]" && (!J || !(typeof k == "object" && J in k));
  }
  function de(k) {
    return Ne(k) === "[object Date]" && (!J || !(typeof k == "object" && J in k));
  }
  function be(k) {
    return Ne(k) === "[object RegExp]" && (!J || !(typeof k == "object" && J in k));
  }
  function ge(k) {
    return Ne(k) === "[object Error]" && (!J || !(typeof k == "object" && J in k));
  }
  function Ae(k) {
    return Ne(k) === "[object String]" && (!J || !(typeof k == "object" && J in k));
  }
  function we(k) {
    return Ne(k) === "[object Number]" && (!J || !(typeof k == "object" && J in k));
  }
  function ve(k) {
    return Ne(k) === "[object Boolean]" && (!J || !(typeof k == "object" && J in k));
  }
  function Oe(k) {
    if (G) return k && typeof k == "object" && k instanceof Symbol;
    if (typeof k == "symbol") return true;
    if (!k || typeof k != "object" || !$) return false;
    try {
      return $.call(k), true;
    } catch {
    }
    return false;
  }
  function xe(k) {
    if (!k || typeof k != "object" || !K) return false;
    try {
      return K.call(k), true;
    } catch {
    }
    return false;
  }
  var it = Object.prototype.hasOwnProperty || function(k) {
    return k in (this || Su);
  };
  function Re(k, M) {
    return it.call(k, M);
  }
  function Ne(k) {
    return S.call(k);
  }
  function St(k) {
    if (k.name) return k.name;
    var M = m.call(b.call(k), /^function\s*([\w$]+)/);
    return M ? M[1] : null;
  }
  function Et(k, M) {
    if (k.indexOf) return k.indexOf(M);
    for (var re = 0, ie = k.length; re < ie; re++) if (k[re] === M) return re;
    return -1;
  }
  function cn(k) {
    if (!r || !k || typeof k != "object") return false;
    try {
      r.call(k);
      try {
        o.call(k);
      } catch {
        return true;
      }
      return k instanceof Map;
    } catch {
    }
    return false;
  }
  function li(k) {
    if (!f || !k || typeof k != "object") return false;
    try {
      f.call(k, f);
      try {
        h.call(k, h);
      } catch {
        return true;
      }
      return k instanceof WeakMap;
    } catch {
    }
    return false;
  }
  function Rr(k) {
    if (!y || !k || typeof k != "object") return false;
    try {
      return y.call(k), true;
    } catch {
    }
    return false;
  }
  function Xe(k) {
    if (!o || !k || typeof k != "object") return false;
    try {
      o.call(k);
      try {
        r.call(k);
      } catch {
        return true;
      }
      return k instanceof Set;
    } catch {
    }
    return false;
  }
  function fn(k) {
    if (!h || !k || typeof k != "object") return false;
    try {
      h.call(k, h);
      try {
        f.call(k, f);
      } catch {
        return true;
      }
      return k instanceof WeakSet;
    } catch {
    }
    return false;
  }
  function vo(k) {
    return !k || typeof k != "object" ? false : typeof HTMLElement < "u" && k instanceof HTMLElement ? true : typeof k.nodeName == "string" && typeof k.getAttribute == "function";
  }
  function ot(k, M) {
    if (k.length > M.maxStringLength) {
      var re = k.length - M.maxStringLength, ie = "... " + re + " more character" + (re > 1 ? "s" : "");
      return ot(w.call(k, 0, M.maxStringLength), M) + ie;
    }
    var oe = R.call(R.call(k, /(['\\])/g, "\\$1"), /[\x00-\x1f]/g, So);
    return ce(oe, "single", M);
  }
  function So(k) {
    var M = k.charCodeAt(0), re = { 8: "b", 9: "t", 10: "n", 12: "f", 13: "r" }[M];
    return re ? "\\" + re : "\\x" + (M < 16 ? "0" : "") + A.call(M.toString(16));
  }
  function p(k) {
    return "Object(" + k + ")";
  }
  function a(k) {
    return k + " { ? }";
  }
  function l(k, M, re, ie) {
    var oe = ie ? N(re, ie) : B.call(re, ", ");
    return k + " (" + M + ") {" + oe + "}";
  }
  function E(k) {
    for (var M = 0; M < k.length; M++) if (Et(k[M], `
`) >= 0) return false;
    return true;
  }
  function C(k, M) {
    var re;
    if (k.indent === "	") re = "	";
    else if (typeof k.indent == "number" && k.indent > 0) re = B.call(Array(k.indent + 1), " ");
    else return null;
    return { base: re, prev: B.call(Array(M + 1), re) };
  }
  function N(k, M) {
    if (k.length === 0) return "";
    var re = `
` + M.prev + M.base;
    return re + B.call(k, "," + re) + `
` + M.prev;
  }
  function F(k, M) {
    var re = ne(k), ie = [];
    if (re) {
      ie.length = k.length;
      for (var oe = 0; oe < k.length; oe++) ie[oe] = Re(k, oe) ? M(k[oe], k) : "";
    }
    var fe = typeof U == "function" ? U(k) : [], Ft;
    if (G) {
      Ft = {};
      for (var ur = 0; ur < fe.length; ur++) Ft["$" + fe[ur]] = fe[ur];
    }
    for (var Ke in k) Re(k, Ke) && (re && String(Number(Ke)) === Ke && Ke < k.length || G && Ft["$" + Ke] instanceof Symbol || (O.call(/[^\w$]/, Ke) ? ie.push(M(Ke, k) + ": " + M(k[Ke], k)) : ie.push(Ke + ": " + M(k[Ke], k))));
    if (typeof U == "function") for (var jt = 0; jt < fe.length; jt++) ee.call(k, fe[jt]) && ie.push("[" + M(fe[jt]) + "]: " + M(k[fe[jt]], k));
    return ie;
  }
  return vu;
}
function lA() {
  if (zg) return Eu;
  zg = true;
  var t = Tr(), e = Ug(), r = uA(), n = sn(), i = t("%WeakMap%", true), s = t("%Map%", true), o = e("WeakMap.prototype.get", true), u = e("WeakMap.prototype.set", true), c = e("WeakMap.prototype.has", true), f = e("Map.prototype.get", true), d = e("Map.prototype.set", true), h = e("Map.prototype.has", true), _ = function(b, m) {
    for (var w = b, R; (R = w.next) !== null; w = R) if (R.key === m) return w.next = R.next, R.next = b.next, b.next = R, R;
  }, y = function(b, m) {
    var w = _(b, m);
    return w && w.value;
  }, I = function(b, m, w) {
    var R = _(b, m);
    R ? R.value = w : b.next = { key: m, next: b.next, value: w };
  }, S = function(b, m) {
    return !!_(b, m);
  };
  return Eu = function() {
    var m, w, R, A = { assert: function(g) {
      if (!A.has(g)) throw new n("Side channel does not contain " + r(g));
    }, get: function(g) {
      if (i && g && (typeof g == "object" || typeof g == "function")) {
        if (m) return o(m, g);
      } else if (s) {
        if (w) return f(w, g);
      } else if (R) return y(R, g);
    }, has: function(g) {
      if (i && g && (typeof g == "object" || typeof g == "function")) {
        if (m) return c(m, g);
      } else if (s) {
        if (w) return h(w, g);
      } else if (R) return S(R, g);
      return false;
    }, set: function(g, O) {
      i && g && (typeof g == "object" || typeof g == "function") ? (m || (m = new i()), u(m, g, O)) : s ? (w || (w = new s()), d(w, g, O)) : (R || (R = { key: {}, next: null }), I(R, g, O));
    } };
    return A;
  }, Eu;
}
function Ru() {
  if (Gg) return Au;
  Gg = true;
  var t = String.prototype.replace, e = /%20/g, r = { RFC1738: "RFC1738", RFC3986: "RFC3986" };
  return Au = { default: r.RFC3986, formatters: { RFC1738: function(n) {
    return t.call(n, e, "+");
  }, RFC3986: function(n) {
    return String(n);
  } }, RFC1738: r.RFC1738, RFC3986: r.RFC3986 }, Au;
}
function Zg() {
  if (Qg) return Iu;
  Qg = true;
  var t = Ru(), e = Object.prototype.hasOwnProperty, r = Array.isArray, n = function() {
    for (var b = [], m = 0; m < 256; ++m) b.push("%" + ((m < 16 ? "0" : "") + m.toString(16)).toUpperCase());
    return b;
  }(), i = function(m) {
    for (; m.length > 1; ) {
      var w = m.pop(), R = w.obj[w.prop];
      if (r(R)) {
        for (var A = [], g = 0; g < R.length; ++g) typeof R[g] < "u" && A.push(R[g]);
        w.obj[w.prop] = A;
      }
    }
  }, s = function(m, w) {
    for (var R = w && w.plainObjects ? /* @__PURE__ */ Object.create(null) : {}, A = 0; A < m.length; ++A) typeof m[A] < "u" && (R[A] = m[A]);
    return R;
  }, o = function b(m, w, R) {
    if (!w) return m;
    if (typeof w != "object") {
      if (r(m)) m.push(w);
      else if (m && typeof m == "object") (R && (R.plainObjects || R.allowPrototypes) || !e.call(Object.prototype, w)) && (m[w] = true);
      else return [m, w];
      return m;
    }
    if (!m || typeof m != "object") return [m].concat(w);
    var A = m;
    return r(m) && !r(w) && (A = s(m, R)), r(m) && r(w) ? (w.forEach(function(g, O) {
      if (e.call(m, O)) {
        var v = m[O];
        v && typeof v == "object" && g && typeof g == "object" ? m[O] = b(v, g, R) : m.push(g);
      } else m[O] = g;
    }), m) : Object.keys(w).reduce(function(g, O) {
      var v = w[O];
      return e.call(g, O) ? g[O] = b(g[O], v, R) : g[O] = v, g;
    }, A);
  }, u = function(m, w) {
    return Object.keys(w).reduce(function(R, A) {
      return R[A] = w[A], R;
    }, m);
  }, c = function(b, m, w) {
    var R = b.replace(/\+/g, " ");
    if (w === "iso-8859-1") return R.replace(/%[0-9a-f]{2}/gi, unescape);
    try {
      return decodeURIComponent(R);
    } catch {
      return R;
    }
  }, f = 1024, d = function(m, w, R, A, g) {
    if (m.length === 0) return m;
    var O = m;
    if (typeof m == "symbol" ? O = Symbol.prototype.toString.call(m) : typeof m != "string" && (O = String(m)), R === "iso-8859-1") return escape(O).replace(/%u[0-9a-f]{4}/gi, function($) {
      return "%26%23" + parseInt($.slice(2), 16) + "%3B";
    });
    for (var v = "", B = 0; B < O.length; B += f) {
      for (var D = O.length >= f ? O.slice(B, B + f) : O, L = [], K = 0; K < D.length; ++K) {
        var U = D.charCodeAt(K);
        if (U === 45 || U === 46 || U === 95 || U === 126 || U >= 48 && U <= 57 || U >= 65 && U <= 90 || U >= 97 && U <= 122 || g === t.RFC1738 && (U === 40 || U === 41)) {
          L[L.length] = D.charAt(K);
          continue;
        }
        if (U < 128) {
          L[L.length] = n[U];
          continue;
        }
        if (U < 2048) {
          L[L.length] = n[192 | U >> 6] + n[128 | U & 63];
          continue;
        }
        if (U < 55296 || U >= 57344) {
          L[L.length] = n[224 | U >> 12] + n[128 | U >> 6 & 63] + n[128 | U & 63];
          continue;
        }
        K += 1, U = 65536 + ((U & 1023) << 10 | D.charCodeAt(K) & 1023), L[L.length] = n[240 | U >> 18] + n[128 | U >> 12 & 63] + n[128 | U >> 6 & 63] + n[128 | U & 63];
      }
      v += L.join("");
    }
    return v;
  }, h = function(m) {
    for (var w = [{ obj: { o: m }, prop: "o" }], R = [], A = 0; A < w.length; ++A) for (var g = w[A], O = g.obj[g.prop], v = Object.keys(O), B = 0; B < v.length; ++B) {
      var D = v[B], L = O[D];
      typeof L == "object" && L !== null && R.indexOf(L) === -1 && (w.push({ obj: O, prop: D }), R.push(L));
    }
    return i(w), m;
  }, _ = function(m) {
    return Object.prototype.toString.call(m) === "[object RegExp]";
  }, y = function(m) {
    return !m || typeof m != "object" ? false : !!(m.constructor && m.constructor.isBuffer && m.constructor.isBuffer(m));
  }, I = function(m, w) {
    return [].concat(m, w);
  }, S = function(m, w) {
    if (r(m)) {
      for (var R = [], A = 0; A < m.length; A += 1) R.push(w(m[A]));
      return R;
    }
    return w(m);
  };
  return Iu = { arrayToObject: s, assign: u, combine: I, compact: h, decode: c, encode: d, isBuffer: y, isRegExp: _, maybeMap: S, merge: o }, Iu;
}
function cA() {
  if (Kg) return xu;
  Kg = true;
  var t = lA(), e = Zg(), r = Ru(), n = Object.prototype.hasOwnProperty, i = { brackets: function(b) {
    return b + "[]";
  }, comma: "comma", indices: function(b, m) {
    return b + "[" + m + "]";
  }, repeat: function(b) {
    return b;
  } }, s = Array.isArray, o = Array.prototype.push, u = function(S, b) {
    o.apply(S, s(b) ? b : [b]);
  }, c = Date.prototype.toISOString, f = r.default, d = { addQueryPrefix: false, allowDots: false, allowEmptyArrays: false, arrayFormat: "indices", charset: "utf-8", charsetSentinel: false, delimiter: "&", encode: true, encodeDotInKeys: false, encoder: e.encode, encodeValuesOnly: false, format: f, formatter: r.formatters[f], indices: false, serializeDate: function(b) {
    return c.call(b);
  }, skipNulls: false, strictNullHandling: false }, h = function(b) {
    return typeof b == "string" || typeof b == "number" || typeof b == "boolean" || typeof b == "symbol" || typeof b == "bigint";
  }, _ = {}, y = function S(b, m, w, R, A, g, O, v, B, D, L, K, U, $, G, J, ee, z) {
    for (var W = b, te = z, Y = 0, X = false; (te = te.get(_)) !== void 0 && !X; ) {
      var ce = te.get(b);
      if (Y += 1, typeof ce < "u") {
        if (ce === Y) throw new RangeError("Cyclic object value");
        X = true;
      }
      typeof te.get(_) > "u" && (Y = 0);
    }
    if (typeof D == "function" ? W = D(m, W) : W instanceof Date ? W = U(W) : w === "comma" && s(W) && (W = e.maybeMap(W, function(Ne) {
      return Ne instanceof Date ? U(Ne) : Ne;
    })), W === null) {
      if (g) return B && !J ? B(m, d.encoder, ee, "key", $) : m;
      W = "";
    }
    if (h(W) || e.isBuffer(W)) {
      if (B) {
        var Z = J ? m : B(m, d.encoder, ee, "key", $);
        return [G(Z) + "=" + G(B(W, d.encoder, ee, "value", $))];
      }
      return [G(m) + "=" + G(String(W))];
    }
    var ne = [];
    if (typeof W > "u") return ne;
    var de;
    if (w === "comma" && s(W)) J && B && (W = e.maybeMap(W, B)), de = [{ value: W.length > 0 ? W.join(",") || null : void 0 }];
    else if (s(D)) de = D;
    else {
      var be = Object.keys(W);
      de = L ? be.sort(L) : be;
    }
    var ge = v ? m.replace(/\./g, "%2E") : m, Ae = R && s(W) && W.length === 1 ? ge + "[]" : ge;
    if (A && s(W) && W.length === 0) return Ae + "[]";
    for (var we = 0; we < de.length; ++we) {
      var ve = de[we], Oe = typeof ve == "object" && typeof ve.value < "u" ? ve.value : W[ve];
      if (!(O && Oe === null)) {
        var xe = K && v ? ve.replace(/\./g, "%2E") : ve, it = s(W) ? typeof w == "function" ? w(Ae, xe) : Ae : Ae + (K ? "." + xe : "[" + xe + "]");
        z.set(b, Y);
        var Re = t();
        Re.set(_, z), u(ne, S(Oe, it, w, R, A, g, O, v, w === "comma" && J && s(W) ? null : B, D, L, K, U, $, G, J, ee, Re));
      }
    }
    return ne;
  }, I = function(b) {
    if (!b) return d;
    if (typeof b.allowEmptyArrays < "u" && typeof b.allowEmptyArrays != "boolean") throw new TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");
    if (typeof b.encodeDotInKeys < "u" && typeof b.encodeDotInKeys != "boolean") throw new TypeError("`encodeDotInKeys` option can only be `true` or `false`, when provided");
    if (b.encoder !== null && typeof b.encoder < "u" && typeof b.encoder != "function") throw new TypeError("Encoder has to be a function.");
    var m = b.charset || d.charset;
    if (typeof b.charset < "u" && b.charset !== "utf-8" && b.charset !== "iso-8859-1") throw new TypeError("The charset option must be either utf-8, iso-8859-1, or undefined");
    var w = r.default;
    if (typeof b.format < "u") {
      if (!n.call(r.formatters, b.format)) throw new TypeError("Unknown format option provided.");
      w = b.format;
    }
    var R = r.formatters[w], A = d.filter;
    (typeof b.filter == "function" || s(b.filter)) && (A = b.filter);
    var g;
    if (b.arrayFormat in i ? g = b.arrayFormat : "indices" in b ? g = b.indices ? "indices" : "repeat" : g = d.arrayFormat, "commaRoundTrip" in b && typeof b.commaRoundTrip != "boolean") throw new TypeError("`commaRoundTrip` must be a boolean, or absent");
    var O = typeof b.allowDots > "u" ? b.encodeDotInKeys === true ? true : d.allowDots : !!b.allowDots;
    return { addQueryPrefix: typeof b.addQueryPrefix == "boolean" ? b.addQueryPrefix : d.addQueryPrefix, allowDots: O, allowEmptyArrays: typeof b.allowEmptyArrays == "boolean" ? !!b.allowEmptyArrays : d.allowEmptyArrays, arrayFormat: g, charset: m, charsetSentinel: typeof b.charsetSentinel == "boolean" ? b.charsetSentinel : d.charsetSentinel, commaRoundTrip: b.commaRoundTrip, delimiter: typeof b.delimiter > "u" ? d.delimiter : b.delimiter, encode: typeof b.encode == "boolean" ? b.encode : d.encode, encodeDotInKeys: typeof b.encodeDotInKeys == "boolean" ? b.encodeDotInKeys : d.encodeDotInKeys, encoder: typeof b.encoder == "function" ? b.encoder : d.encoder, encodeValuesOnly: typeof b.encodeValuesOnly == "boolean" ? b.encodeValuesOnly : d.encodeValuesOnly, filter: A, format: w, formatter: R, serializeDate: typeof b.serializeDate == "function" ? b.serializeDate : d.serializeDate, skipNulls: typeof b.skipNulls == "boolean" ? b.skipNulls : d.skipNulls, sort: typeof b.sort == "function" ? b.sort : null, strictNullHandling: typeof b.strictNullHandling == "boolean" ? b.strictNullHandling : d.strictNullHandling };
  };
  return xu = function(S, b) {
    var m = S, w = I(b), R, A;
    typeof w.filter == "function" ? (A = w.filter, m = A("", m)) : s(w.filter) && (A = w.filter, R = A);
    var g = [];
    if (typeof m != "object" || m === null) return "";
    var O = i[w.arrayFormat], v = O === "comma" && w.commaRoundTrip;
    R || (R = Object.keys(m)), w.sort && R.sort(w.sort);
    for (var B = t(), D = 0; D < R.length; ++D) {
      var L = R[D];
      w.skipNulls && m[L] === null || u(g, y(m[L], L, O, v, w.allowEmptyArrays, w.strictNullHandling, w.skipNulls, w.encodeDotInKeys, w.encode ? w.encoder : null, w.filter, w.sort, w.allowDots, w.serializeDate, w.format, w.formatter, w.encodeValuesOnly, w.charset, B));
    }
    var K = g.join(w.delimiter), U = w.addQueryPrefix === true ? "?" : "";
    return w.charsetSentinel && (w.charset === "iso-8859-1" ? U += "utf8=%26%2310003%3B&" : U += "utf8=%E2%9C%93&"), K.length > 0 ? U + K : "";
  }, xu;
}
function fA() {
  if (Yg) return Tu;
  Yg = true;
  var t = Zg(), e = Object.prototype.hasOwnProperty, r = Array.isArray, n = { allowDots: false, allowEmptyArrays: false, allowPrototypes: false, allowSparse: false, arrayLimit: 20, charset: "utf-8", charsetSentinel: false, comma: false, decodeDotInKeys: false, decoder: t.decode, delimiter: "&", depth: 5, duplicates: "combine", ignoreQueryPrefix: false, interpretNumericEntities: false, parameterLimit: 1e3, parseArrays: true, plainObjects: false, strictDepth: false, strictNullHandling: false }, i = function(_) {
    return _.replace(/&#(\d+);/g, function(y, I) {
      return String.fromCharCode(parseInt(I, 10));
    });
  }, s = function(_, y) {
    return _ && typeof _ == "string" && y.comma && _.indexOf(",") > -1 ? _.split(",") : _;
  }, o = "utf8=%26%2310003%3B", u = "utf8=%E2%9C%93", c = function(y, I) {
    var S = { __proto__: null }, b = I.ignoreQueryPrefix ? y.replace(/^\?/, "") : y;
    b = b.replace(/%5B/gi, "[").replace(/%5D/gi, "]");
    var m = I.parameterLimit === 1 / 0 ? void 0 : I.parameterLimit, w = b.split(I.delimiter, m), R = -1, A, g = I.charset;
    if (I.charsetSentinel) for (A = 0; A < w.length; ++A) w[A].indexOf("utf8=") === 0 && (w[A] === u ? g = "utf-8" : w[A] === o && (g = "iso-8859-1"), R = A, A = w.length);
    for (A = 0; A < w.length; ++A) if (A !== R) {
      var O = w[A], v = O.indexOf("]="), B = v === -1 ? O.indexOf("=") : v + 1, D, L;
      B === -1 ? (D = I.decoder(O, n.decoder, g, "key"), L = I.strictNullHandling ? null : "") : (D = I.decoder(O.slice(0, B), n.decoder, g, "key"), L = t.maybeMap(s(O.slice(B + 1), I), function(U) {
        return I.decoder(U, n.decoder, g, "value");
      })), L && I.interpretNumericEntities && g === "iso-8859-1" && (L = i(L)), O.indexOf("[]=") > -1 && (L = r(L) ? [L] : L);
      var K = e.call(S, D);
      K && I.duplicates === "combine" ? S[D] = t.combine(S[D], L) : (!K || I.duplicates === "last") && (S[D] = L);
    }
    return S;
  }, f = function(_, y, I, S) {
    for (var b = S ? y : s(y, I), m = _.length - 1; m >= 0; --m) {
      var w, R = _[m];
      if (R === "[]" && I.parseArrays) w = I.allowEmptyArrays && (b === "" || I.strictNullHandling && b === null) ? [] : [].concat(b);
      else {
        w = I.plainObjects ? /* @__PURE__ */ Object.create(null) : {};
        var A = R.charAt(0) === "[" && R.charAt(R.length - 1) === "]" ? R.slice(1, -1) : R, g = I.decodeDotInKeys ? A.replace(/%2E/g, ".") : A, O = parseInt(g, 10);
        !I.parseArrays && g === "" ? w = { 0: b } : !isNaN(O) && R !== g && String(O) === g && O >= 0 && I.parseArrays && O <= I.arrayLimit ? (w = [], w[O] = b) : g !== "__proto__" && (w[g] = b);
      }
      b = w;
    }
    return b;
  }, d = function(y, I, S, b) {
    if (y) {
      var m = S.allowDots ? y.replace(/\.([^.[]+)/g, "[$1]") : y, w = /(\[[^[\]]*])/, R = /(\[[^[\]]*])/g, A = S.depth > 0 && w.exec(m), g = A ? m.slice(0, A.index) : m, O = [];
      if (g) {
        if (!S.plainObjects && e.call(Object.prototype, g) && !S.allowPrototypes) return;
        O.push(g);
      }
      for (var v = 0; S.depth > 0 && (A = R.exec(m)) !== null && v < S.depth; ) {
        if (v += 1, !S.plainObjects && e.call(Object.prototype, A[1].slice(1, -1)) && !S.allowPrototypes) return;
        O.push(A[1]);
      }
      if (A) {
        if (S.strictDepth === true) throw new RangeError("Input depth exceeded depth option of " + S.depth + " and strictDepth is true");
        O.push("[" + m.slice(A.index) + "]");
      }
      return f(O, I, S, b);
    }
  }, h = function(y) {
    if (!y) return n;
    if (typeof y.allowEmptyArrays < "u" && typeof y.allowEmptyArrays != "boolean") throw new TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");
    if (typeof y.decodeDotInKeys < "u" && typeof y.decodeDotInKeys != "boolean") throw new TypeError("`decodeDotInKeys` option can only be `true` or `false`, when provided");
    if (y.decoder !== null && typeof y.decoder < "u" && typeof y.decoder != "function") throw new TypeError("Decoder has to be a function.");
    if (typeof y.charset < "u" && y.charset !== "utf-8" && y.charset !== "iso-8859-1") throw new TypeError("The charset option must be either utf-8, iso-8859-1, or undefined");
    var I = typeof y.charset > "u" ? n.charset : y.charset, S = typeof y.duplicates > "u" ? n.duplicates : y.duplicates;
    if (S !== "combine" && S !== "first" && S !== "last") throw new TypeError("The duplicates option must be either combine, first, or last");
    var b = typeof y.allowDots > "u" ? y.decodeDotInKeys === true ? true : n.allowDots : !!y.allowDots;
    return { allowDots: b, allowEmptyArrays: typeof y.allowEmptyArrays == "boolean" ? !!y.allowEmptyArrays : n.allowEmptyArrays, allowPrototypes: typeof y.allowPrototypes == "boolean" ? y.allowPrototypes : n.allowPrototypes, allowSparse: typeof y.allowSparse == "boolean" ? y.allowSparse : n.allowSparse, arrayLimit: typeof y.arrayLimit == "number" ? y.arrayLimit : n.arrayLimit, charset: I, charsetSentinel: typeof y.charsetSentinel == "boolean" ? y.charsetSentinel : n.charsetSentinel, comma: typeof y.comma == "boolean" ? y.comma : n.comma, decodeDotInKeys: typeof y.decodeDotInKeys == "boolean" ? y.decodeDotInKeys : n.decodeDotInKeys, decoder: typeof y.decoder == "function" ? y.decoder : n.decoder, delimiter: typeof y.delimiter == "string" || t.isRegExp(y.delimiter) ? y.delimiter : n.delimiter, depth: typeof y.depth == "number" || y.depth === false ? +y.depth : n.depth, duplicates: S, ignoreQueryPrefix: y.ignoreQueryPrefix === true, interpretNumericEntities: typeof y.interpretNumericEntities == "boolean" ? y.interpretNumericEntities : n.interpretNumericEntities, parameterLimit: typeof y.parameterLimit == "number" ? y.parameterLimit : n.parameterLimit, parseArrays: y.parseArrays !== false, plainObjects: typeof y.plainObjects == "boolean" ? y.plainObjects : n.plainObjects, strictDepth: typeof y.strictDepth == "boolean" ? !!y.strictDepth : n.strictDepth, strictNullHandling: typeof y.strictNullHandling == "boolean" ? y.strictNullHandling : n.strictNullHandling };
  };
  return Tu = function(_, y) {
    var I = h(y);
    if (_ === "" || _ === null || typeof _ > "u") return I.plainObjects ? /* @__PURE__ */ Object.create(null) : {};
    for (var S = typeof _ == "string" ? c(_, I) : _, b = I.plainObjects ? /* @__PURE__ */ Object.create(null) : {}, m = Object.keys(S), w = 0; w < m.length; ++w) {
      var R = m[w], A = d(R, S[R], I, typeof _ == "string");
      b = t.merge(b, A, I);
    }
    return I.allowSparse === true ? b : t.compact(b);
  }, Tu;
}
function dA() {
  if (Jg) return Pu;
  Jg = true;
  var t = cA(), e = fA(), r = Ru();
  return Pu = { formats: r, parse: e, stringify: t }, Pu;
}
function hA() {
  if (Xg) return Or;
  Xg = true;
  var t = nr;
  function e() {
    this.protocol = null, this.slashes = null, this.auth = null, this.host = null, this.port = null, this.hostname = null, this.hash = null, this.search = null, this.query = null, this.pathname = null, this.path = null, this.href = null;
  }
  var r = /^([a-z0-9.+-]+:)/i, n = /:[0-9]*$/, i = /^(\/\/?(?!\/)[^?\s]*)(\?[^\s]*)?$/, s = ["<", ">", '"', "`", " ", "\r", `
`, "	"], o = ["{", "}", "|", "\\", "^", "`"].concat(s), u = ["'"].concat(o), c = ["%", "/", "?", ";", "#"].concat(u), f = ["/", "?", "#"], d = 255, h = /^[+a-z0-9A-Z_-]{0,63}$/, _ = /^([+a-z0-9A-Z_-]{0,63})(.*)$/, y = { javascript: true, "javascript:": true }, I = { javascript: true, "javascript:": true }, S = { http: true, https: true, ftp: true, gopher: true, file: true, "http:": true, "https:": true, "ftp:": true, "gopher:": true, "file:": true }, b = dA();
  function m(g, O, v) {
    if (g && typeof g == "object" && g instanceof e) return g;
    var B = new e();
    return B.parse(g, O, v), B;
  }
  e.prototype.parse = function(g, O, v) {
    if (typeof g != "string") throw new TypeError("Parameter 'url' must be a string, not " + typeof g);
    var B = g.indexOf("?"), D = B !== -1 && B < g.indexOf("#") ? "?" : "#", L = g.split(D), K = /\\/g;
    L[0] = L[0].replace(K, "/"), g = L.join(D);
    var U = g;
    if (U = U.trim(), !v && g.split("#").length === 1) {
      var $ = i.exec(U);
      if ($) return this.path = U, this.href = U, this.pathname = $[1], $[2] ? (this.search = $[2], O ? this.query = b.parse(this.search.substr(1)) : this.query = this.search.substr(1)) : O && (this.search = "", this.query = {}), this;
    }
    var G = r.exec(U);
    if (G) {
      G = G[0];
      var J = G.toLowerCase();
      this.protocol = J, U = U.substr(G.length);
    }
    if (v || G || U.match(/^\/\/[^@/]+@[^@/]+/)) {
      var ee = U.substr(0, 2) === "//";
      ee && !(G && I[G]) && (U = U.substr(2), this.slashes = true);
    }
    if (!I[G] && (ee || G && !S[G])) {
      for (var z = -1, W = 0; W < f.length; W++) {
        var te = U.indexOf(f[W]);
        te !== -1 && (z === -1 || te < z) && (z = te);
      }
      var Y, X;
      z === -1 ? X = U.lastIndexOf("@") : X = U.lastIndexOf("@", z), X !== -1 && (Y = U.slice(0, X), U = U.slice(X + 1), this.auth = decodeURIComponent(Y)), z = -1;
      for (var W = 0; W < c.length; W++) {
        var te = U.indexOf(c[W]);
        te !== -1 && (z === -1 || te < z) && (z = te);
      }
      z === -1 && (z = U.length), this.host = U.slice(0, z), U = U.slice(z), this.parseHost(), this.hostname = this.hostname || "";
      var ce = this.hostname[0] === "[" && this.hostname[this.hostname.length - 1] === "]";
      if (!ce) for (var Z = this.hostname.split(/\./), W = 0, ne = Z.length; W < ne; W++) {
        var de = Z[W];
        if (de && !de.match(h)) {
          for (var be = "", ge = 0, Ae = de.length; ge < Ae; ge++) de.charCodeAt(ge) > 127 ? be += "x" : be += de[ge];
          if (!be.match(h)) {
            var we = Z.slice(0, W), ve = Z.slice(W + 1), Oe = de.match(_);
            Oe && (we.push(Oe[1]), ve.unshift(Oe[2])), ve.length && (U = "/" + ve.join(".") + U), this.hostname = we.join(".");
            break;
          }
        }
      }
      this.hostname.length > d ? this.hostname = "" : this.hostname = this.hostname.toLowerCase(), ce || (this.hostname = t.toASCII(this.hostname));
      var xe = this.port ? ":" + this.port : "", it = this.hostname || "";
      this.host = it + xe, this.href += this.host, ce && (this.hostname = this.hostname.substr(1, this.hostname.length - 2), U[0] !== "/" && (U = "/" + U));
    }
    if (!y[J]) for (var W = 0, ne = u.length; W < ne; W++) {
      var Re = u[W];
      if (U.indexOf(Re) !== -1) {
        var Ne = encodeURIComponent(Re);
        Ne === Re && (Ne = escape(Re)), U = U.split(Re).join(Ne);
      }
    }
    var St = U.indexOf("#");
    St !== -1 && (this.hash = U.substr(St), U = U.slice(0, St));
    var Et = U.indexOf("?");
    if (Et !== -1 ? (this.search = U.substr(Et), this.query = U.substr(Et + 1), O && (this.query = b.parse(this.query)), U = U.slice(0, Et)) : O && (this.search = "", this.query = {}), U && (this.pathname = U), S[J] && this.hostname && !this.pathname && (this.pathname = "/"), this.pathname || this.search) {
      var xe = this.pathname || "", cn = this.search || "";
      this.path = xe + cn;
    }
    return this.href = this.format(), this;
  };
  function w(g) {
    return typeof g == "string" && (g = m(g)), g instanceof e ? g.format() : e.prototype.format.call(g);
  }
  e.prototype.format = function() {
    var g = this.auth || "";
    g && (g = encodeURIComponent(g), g = g.replace(/%3A/i, ":"), g += "@");
    var O = this.protocol || "", v = this.pathname || "", B = this.hash || "", D = false, L = "";
    this.host ? D = g + this.host : this.hostname && (D = g + (this.hostname.indexOf(":") === -1 ? this.hostname : "[" + this.hostname + "]"), this.port && (D += ":" + this.port)), this.query && typeof this.query == "object" && Object.keys(this.query).length && (L = b.stringify(this.query, { arrayFormat: "repeat", addQueryPrefix: false }));
    var K = this.search || L && "?" + L || "";
    return O && O.substr(-1) !== ":" && (O += ":"), this.slashes || (!O || S[O]) && D !== false ? (D = "//" + (D || ""), v && v.charAt(0) !== "/" && (v = "/" + v)) : D || (D = ""), B && B.charAt(0) !== "#" && (B = "#" + B), K && K.charAt(0) !== "?" && (K = "?" + K), v = v.replace(/[?#]/g, function(U) {
      return encodeURIComponent(U);
    }), K = K.replace("#", "%23"), O + D + v + K + B;
  };
  function R(g, O) {
    return m(g, false, true).resolve(O);
  }
  e.prototype.resolve = function(g) {
    return this.resolveObject(m(g, false, true)).format();
  };
  function A(g, O) {
    return g ? m(g, false, true).resolveObject(O) : O;
  }
  return e.prototype.resolveObject = function(g) {
    if (typeof g == "string") {
      var O = new e();
      O.parse(g, false, true), g = O;
    }
    for (var v = new e(), B = Object.keys(this), D = 0; D < B.length; D++) {
      var L = B[D];
      v[L] = this[L];
    }
    if (v.hash = g.hash, g.href === "") return v.href = v.format(), v;
    if (g.slashes && !g.protocol) {
      for (var K = Object.keys(g), U = 0; U < K.length; U++) {
        var $ = K[U];
        $ !== "protocol" && (v[$] = g[$]);
      }
      return S[v.protocol] && v.hostname && !v.pathname && (v.pathname = "/", v.path = v.pathname), v.href = v.format(), v;
    }
    if (g.protocol && g.protocol !== v.protocol) {
      if (!S[g.protocol]) {
        for (var G = Object.keys(g), J = 0; J < G.length; J++) {
          var ee = G[J];
          v[ee] = g[ee];
        }
        return v.href = v.format(), v;
      }
      if (v.protocol = g.protocol, !g.host && !I[g.protocol]) {
        for (var ne = (g.pathname || "").split("/"); ne.length && !(g.host = ne.shift()); ) ;
        g.host || (g.host = ""), g.hostname || (g.hostname = ""), ne[0] !== "" && ne.unshift(""), ne.length < 2 && ne.unshift(""), v.pathname = ne.join("/");
      } else v.pathname = g.pathname;
      if (v.search = g.search, v.query = g.query, v.host = g.host || "", v.auth = g.auth, v.hostname = g.hostname || g.host, v.port = g.port, v.pathname || v.search) {
        var z = v.pathname || "", W = v.search || "";
        v.path = z + W;
      }
      return v.slashes = v.slashes || g.slashes, v.href = v.format(), v;
    }
    var te = v.pathname && v.pathname.charAt(0) === "/", Y = g.host || g.pathname && g.pathname.charAt(0) === "/", X = Y || te || v.host && g.pathname, ce = X, Z = v.pathname && v.pathname.split("/") || [], ne = g.pathname && g.pathname.split("/") || [], de = v.protocol && !S[v.protocol];
    if (de && (v.hostname = "", v.port = null, v.host && (Z[0] === "" ? Z[0] = v.host : Z.unshift(v.host)), v.host = "", g.protocol && (g.hostname = null, g.port = null, g.host && (ne[0] === "" ? ne[0] = g.host : ne.unshift(g.host)), g.host = null), X = X && (ne[0] === "" || Z[0] === "")), Y) v.host = g.host || g.host === "" ? g.host : v.host, v.hostname = g.hostname || g.hostname === "" ? g.hostname : v.hostname, v.search = g.search, v.query = g.query, Z = ne;
    else if (ne.length) Z || (Z = []), Z.pop(), Z = Z.concat(ne), v.search = g.search, v.query = g.query;
    else if (g.search != null) {
      if (de) {
        v.host = Z.shift(), v.hostname = v.host;
        var be = v.host && v.host.indexOf("@") > 0 ? v.host.split("@") : false;
        be && (v.auth = be.shift(), v.hostname = be.shift(), v.host = v.hostname);
      }
      return v.search = g.search, v.query = g.query, (v.pathname !== null || v.search !== null) && (v.path = (v.pathname ? v.pathname : "") + (v.search ? v.search : "")), v.href = v.format(), v;
    }
    if (!Z.length) return v.pathname = null, v.search ? v.path = "/" + v.search : v.path = null, v.href = v.format(), v;
    for (var ge = Z.slice(-1)[0], Ae = (v.host || g.host || Z.length > 1) && (ge === "." || ge === "..") || ge === "", we = 0, ve = Z.length; ve >= 0; ve--) ge = Z[ve], ge === "." ? Z.splice(ve, 1) : ge === ".." ? (Z.splice(ve, 1), we++) : we && (Z.splice(ve, 1), we--);
    if (!X && !ce) for (; we--; we) Z.unshift("..");
    X && Z[0] !== "" && (!Z[0] || Z[0].charAt(0) !== "/") && Z.unshift(""), Ae && Z.join("/").substr(-1) !== "/" && Z.push("");
    var Oe = Z[0] === "" || Z[0] && Z[0].charAt(0) === "/";
    if (de) {
      v.hostname = Oe ? "" : Z.length ? Z.shift() : "", v.host = v.hostname;
      var be = v.host && v.host.indexOf("@") > 0 ? v.host.split("@") : false;
      be && (v.auth = be.shift(), v.hostname = be.shift(), v.host = v.hostname);
    }
    return X = X || v.host && Z.length, X && !Oe && Z.unshift(""), Z.length > 0 ? v.pathname = Z.join("/") : (v.pathname = null, v.path = null), (v.pathname !== null || v.search !== null) && (v.path = (v.pathname ? v.pathname : "") + (v.search ? v.search : "")), v.auth = g.auth || v.auth, v.slashes = v.slashes || g.slashes, v.href = v.format(), v;
  }, e.prototype.parseHost = function() {
    var g = this.host, O = n.exec(g);
    O && (O = O[0], O !== ":" && (this.port = O.substr(1)), g = g.substr(0, g.length - O.length)), g && (this.hostname = g);
  }, Or.parse = m, Or.resolve = R, Or.resolveObject = A, Or.format = w, Or.Url = e, Or;
}
function ey(t) {
  if (typeof t == "string") t = new URL(t);
  else if (!(t instanceof URL)) throw new Deno.errors.InvalidData("invalid argument path , must be a string or URL");
  if (t.protocol !== "file:") throw new Deno.errors.InvalidData("invalid url scheme");
  return Ou ? kA(t) : CA(t);
}
function kA(t) {
  let e = t.hostname, r = t.pathname;
  for (let n = 0; n < r.length; n++) if (r[n] === "%") {
    let i = r.codePointAt(n + 2) || 32;
    if (r[n + 1] === "2" && i === 102 || r[n + 1] === "5" && i === 99) throw new Deno.errors.InvalidData("must not include encoded \\ or / characters");
  }
  if (r = r.replace(IA, "\\"), r = decodeURIComponent(r), e !== "") return `\\\\${e}${r}`;
  {
    let n = r.codePointAt(1) | 32, i = r[2];
    if (n < EA || n > AA || i !== ":") throw new Deno.errors.InvalidData("file url path must be absolute");
    return r.slice(1);
  }
}
function CA(t) {
  if (t.hostname !== "") throw new Deno.errors.InvalidData("invalid file url hostname");
  let e = t.pathname;
  for (let r = 0; r < e.length; r++) if (e[r] === "%") {
    let n = e.codePointAt(r + 2) || 32;
    if (e[r + 1] === "2" && n === 102) throw new Deno.errors.InvalidData("must not include encoded / characters");
  }
  return decodeURIComponent(e);
}
function ty(t) {
  let e = wu.resolve(t), r = t.charCodeAt(t.length - 1);
  (r === SA || Ou && r === vA) && e[e.length - 1] !== wu.sep && (e += "/");
  let n = new URL("file://");
  return e.includes("%") && (e = e.replace(xA, "%25")), !Ou && e.includes("\\") && (e = e.replace(TA, "%5C")), e.includes(`
`) && (e = e.replace(PA, "%0A")), e.includes("\r") && (e = e.replace(OA, "%0D")), e.includes("	") && (e = e.replace(RA, "%09")), n.pathname = e, n;
}
var aA;
var vu;
var Hg;
var Su;
var Eu;
var zg;
var Au;
var Gg;
var Iu;
var Qg;
var xu;
var Kg;
var Tu;
var Yg;
var Pu;
var Jg;
var Or;
var Xg;
var He;
var pA;
var gA;
var yA;
var bA;
var mA;
var _A;
var wA;
var vA;
var SA;
var EA;
var AA;
var Ou;
var IA;
var xA;
var TA;
var PA;
var OA;
var RA;
var ny = ze(() => {
  x();
  P();
  T();
  gg();
  Fg();
  Vg();
  mu();
  aA = Object.freeze(/* @__PURE__ */ Object.create(null)), vu = {}, Hg = false, Su = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : global;
  Eu = {}, zg = false;
  Au = {}, Gg = false;
  Iu = {}, Qg = false;
  xu = {}, Kg = false;
  Tu = {}, Yg = false;
  Pu = {}, Jg = false;
  Or = {}, Xg = false;
  He = hA();
  He.parse;
  He.resolve;
  He.resolveObject;
  He.format;
  He.Url;
  pA = typeof Deno < "u" ? Deno.build.os === "windows" ? "win32" : Deno.build.os : void 0;
  He.URL = typeof URL < "u" ? URL : null;
  He.pathToFileURL = ty;
  He.fileURLToPath = ey;
  gA = He.Url, yA = He.format, bA = He.resolve, mA = He.resolveObject, _A = He.parse, wA = He.URL, vA = 92, SA = 47, EA = 97, AA = 122, Ou = pA === "win32", IA = /\//g, xA = /%/g, TA = /\\/g, PA = /\n/g, OA = /\r/g, RA = /\t/g;
});
var oy = H((d6, iy) => {
  "use strict";
  x();
  P();
  T();
  iy.exports = function() {
    throw new Error("ws does not work in the browser. Browser clients must use the native WebSocket object");
  };
});
var mo = H((ni) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(ni, "__esModule", { value: true });
  ni.BufferedDuplex = void 0;
  ni.writev = ay;
  var MA = Yt(), sy = (ke(), _e(Le));
  function ay(t, e) {
    let r = new Array(t.length);
    for (let n = 0; n < t.length; n++) typeof t[n].chunk == "string" ? r[n] = sy.Buffer.from(t[n].chunk, "utf8") : r[n] = t[n].chunk;
    this._write(sy.Buffer.concat(r), "binary", e);
  }
  var ku = class extends MA.Duplex {
    constructor(e, r, n) {
      super({ objectMode: true });
      __publicField(this, "socket");
      __publicField(this, "proxy");
      __publicField(this, "isSocketOpen");
      __publicField(this, "writeQueue");
      this.proxy = r, this.socket = n, this.writeQueue = [], e.objectMode || (this._writev = ay.bind(this)), this.isSocketOpen = false, this.proxy.on("data", (i) => {
        !this.destroyed && this.readable && this.push(i);
      });
    }
    _read(e) {
      this.proxy.read(e);
    }
    _write(e, r, n) {
      this.isSocketOpen ? this.writeToProxy(e, r, n) : this.writeQueue.push({ chunk: e, encoding: r, cb: n });
    }
    _final(e) {
      this.writeQueue = [], this.proxy.end(e);
    }
    _destroy(e, r) {
      this.writeQueue = [], this.proxy.destroy(), r(e);
    }
    socketReady() {
      this.emit("connect"), this.isSocketOpen = true, this.processWriteQueue();
    }
    writeToProxy(e, r, n) {
      this.proxy.write(e, r) === false ? this.proxy.once("drain", n) : n();
    }
    processWriteQueue() {
      for (; this.writeQueue.length > 0; ) {
        let { chunk: e, encoding: r, cb: n } = this.writeQueue.shift();
        this.writeToProxy(e, r, n);
      }
    }
  };
  ni.BufferedDuplex = ku;
});
var ii = H((ar) => {
  "use strict";
  x();
  P();
  T();
  var Mu = ar && ar.__importDefault || function(t) {
    return t && t.__esModule ? t : { default: t };
  };
  Object.defineProperty(ar, "__esModule", { value: true });
  ar.streamBuilder = ar.browserStreamBuilder = void 0;
  var _o = (ke(), _e(Le)), uy = Mu(oy()), BA = Mu(Xt()), NA = Yt(), LA = Mu(ei()), Cu = mo(), sr = (0, BA.default)("mqttjs:ws"), qA = ["rejectUnauthorized", "ca", "cert", "key", "pfx", "passphrase"];
  function ly(t, e) {
    let r = `${t.protocol}://${t.hostname}:${t.port}${t.path}`;
    return typeof t.transformWsUrl == "function" && (r = t.transformWsUrl(r, t, e)), r;
  }
  function cy(t) {
    let e = t;
    return t.port || (t.protocol === "wss" ? e.port = 443 : e.port = 80), t.path || (e.path = "/"), t.wsOptions || (e.wsOptions = {}), !LA.default && !t.forceNativeWebSocket && t.protocol === "wss" && qA.forEach((r) => {
      Object.prototype.hasOwnProperty.call(t, r) && !Object.prototype.hasOwnProperty.call(t.wsOptions, r) && (e.wsOptions[r] = t[r]);
    }), e;
  }
  function DA(t) {
    let e = cy(t);
    if (e.hostname || (e.hostname = e.host), !e.hostname) {
      if (typeof document > "u") throw new Error("Could not determine host. Specify host manually.");
      let r = new URL(document.URL);
      e.hostname = r.hostname, e.port || (e.port = Number(r.port));
    }
    return e.objectMode === void 0 && (e.objectMode = !(e.binary === true || e.binary === void 0)), e;
  }
  function UA(t, e, r) {
    sr("createWebSocket"), sr(`protocol: ${r.protocolId} ${r.protocolVersion}`);
    let n = r.protocolId === "MQIsdp" && r.protocolVersion === 3 ? "mqttv3.1" : "mqtt";
    sr(`creating new Websocket for url: ${e} and protocol: ${n}`);
    let i;
    return r.createWebsocket ? i = r.createWebsocket(e, [n], r) : i = new uy.default(e, [n], r.wsOptions), i;
  }
  function FA(t, e) {
    let r = e.protocolId === "MQIsdp" && e.protocolVersion === 3 ? "mqttv3.1" : "mqtt", n = ly(e, t), i;
    return e.createWebsocket ? i = e.createWebsocket(n, [r], e) : i = new WebSocket(n, [r]), i.binaryType = "arraybuffer", i;
  }
  var jA = (t, e) => {
    sr("streamBuilder");
    let r = cy(e);
    r.hostname = r.hostname || r.host || "localhost";
    let n = ly(r, t), i = UA(t, n, r), s = uy.default.createWebSocketStream(i, r.wsOptions);
    return s.url = n, i.on("close", () => {
      s.destroy();
    }), s;
  };
  ar.streamBuilder = jA;
  var $A = (t, e) => {
    sr("browserStreamBuilder");
    let r, i = DA(e).browserBufferSize || 1024 * 512, s = e.browserBufferTimeout || 1e3, o = !e.objectMode, u = FA(t, e), c = d(e, S, b);
    e.objectMode || (c._writev = Cu.writev.bind(c)), c.on("close", () => {
      u.close();
    });
    let f = typeof u.addEventListener < "u";
    u.readyState === u.OPEN ? (r = c, r.socket = u) : (r = new Cu.BufferedDuplex(e, c, u), f ? u.addEventListener("open", h) : u.onopen = h), f ? (u.addEventListener("close", _), u.addEventListener("error", y), u.addEventListener("message", I)) : (u.onclose = _, u.onerror = y, u.onmessage = I);
    function d(m, w, R) {
      let A = new NA.Transform({ objectMode: m.objectMode });
      return A._write = w, A._flush = R, A;
    }
    function h() {
      sr("WebSocket onOpen"), r instanceof Cu.BufferedDuplex && r.socketReady();
    }
    function _(m) {
      sr("WebSocket onClose", m), r.end(), r.destroy();
    }
    function y(m) {
      sr("WebSocket onError", m);
      let w = new Error("WebSocket error");
      w.event = m, r.destroy(w);
    }
    async function I(m) {
      if (!c || !c.readable || !c.writable) return;
      let { data: w } = m;
      w instanceof ArrayBuffer ? w = _o.Buffer.from(w) : w instanceof Blob ? w = _o.Buffer.from(await new Response(w).arrayBuffer()) : w = _o.Buffer.from(w, "utf8"), c.push(w);
    }
    function S(m, w, R) {
      if (u.bufferedAmount > i) {
        setTimeout(S, s, m, w, R);
        return;
      }
      o && typeof m == "string" && (m = _o.Buffer.from(m, "utf8"));
      try {
        u.send(m);
      } catch (A) {
        return R(A);
      }
      R();
    }
    function b(m) {
      u.close(), m();
    }
    return r;
  };
  ar.browserStreamBuilder = $A;
});
var Bu = {};
Mr(Bu, { Server: () => Ye, Socket: () => Ye, Stream: () => Ye, _createServerHandle: () => Ye, _normalizeArgs: () => Ye, _setSimultaneousAccepts: () => Ye, connect: () => Ye, createConnection: () => Ye, createServer: () => Ye, default: () => WA, isIP: () => Ye, isIPv4: () => Ye, isIPv6: () => Ye });
function Ye() {
  throw new Error("Node.js net module is not supported by JSPM core outside of Node.js");
}
var WA;
var Nu = ze(() => {
  x();
  P();
  T();
  WA = { _createServerHandle: Ye, _normalizeArgs: Ye, _setSimultaneousAccepts: Ye, connect: Ye, createConnection: Ye, createServer: Ye, isIP: Ye, isIPv4: Ye, isIPv6: Ye, Server: Ye, Socket: Ye, Stream: Ye };
});
var Lu = H((J6, fy) => {
  x();
  P();
  T();
  fy.exports = {};
});
var Du = H((oi) => {
  "use strict";
  x();
  P();
  T();
  var qu = oi && oi.__importDefault || function(t) {
    return t && t.__esModule ? t : { default: t };
  };
  Object.defineProperty(oi, "__esModule", { value: true });
  var VA = qu((Nu(), _e(Bu))), HA = qu(Xt()), zA = qu(Lu()), GA = (0, HA.default)("mqttjs:tcp"), QA = (t, e) => {
    if (e.port = e.port || 1883, e.hostname = e.hostname || e.host || "localhost", e.socksProxy) return (0, zA.default)(e.hostname, e.port, e.socksProxy, { timeout: e.socksTimeout });
    let { port: r, path: n } = e, i = e.hostname;
    return GA("port %d and host %s", r, i), VA.default.createConnection({ port: r, host: i, path: n });
  };
  oi.default = QA;
});
var dy = {};
Mr(dy, { default: () => KA });
var KA;
var hy = ze(() => {
  x();
  P();
  T();
  KA = {};
});
var Fu = H((si) => {
  "use strict";
  x();
  P();
  T();
  var Uu = si && si.__importDefault || function(t) {
    return t && t.__esModule ? t : { default: t };
  };
  Object.defineProperty(si, "__esModule", { value: true });
  var py = (hy(), _e(dy)), YA = Uu((Nu(), _e(Bu))), JA = Uu(Xt()), XA = Uu(Lu()), ZA = (0, JA.default)("mqttjs:tls");
  function eI(t) {
    let { host: e, port: r, socksProxy: n, ...i } = t;
    if (n !== void 0) {
      let s = (0, XA.default)(e, r, n, { timeout: t.socksTimeout });
      return (0, py.connect)({ ...i, socket: s });
    }
    return (0, py.connect)(t);
  }
  var tI = (t, e) => {
    e.port = e.port || 8883, e.host = e.hostname || e.host || "localhost", YA.default.isIP(e.host) === 0 && !e.servername && (e.servername = e.host), e.rejectUnauthorized = e.rejectUnauthorized !== false, delete e.path, ZA("port %d host %s rejectUnauthorized %b", e.port, e.host, e.rejectUnauthorized);
    let r = eI(e);
    r.on("secureConnect", () => {
      e.rejectUnauthorized && !r.authorized ? r.emit("error", new Error("TLS not authorized")) : r.removeListener("error", n);
    });
    function n(i) {
      e.rejectUnauthorized && t.emit("error", i), r.end();
    }
    return r.on("error", n), r;
  };
  si.default = tI;
});
var Wu = H(($u) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty($u, "__esModule", { value: true });
  var gy = (ke(), _e(Le)), rI = Yt(), nI = mo(), vt, ju, Je;
  function iI() {
    let t = new rI.Transform();
    return t._write = (e, r, n) => {
      vt.send({ data: e.buffer, success() {
        n();
      }, fail(i) {
        n(new Error(i));
      } });
    }, t._flush = (e) => {
      vt.close({ success() {
        e();
      } });
    }, t;
  }
  function oI(t) {
    t.hostname || (t.hostname = "localhost"), t.path || (t.path = "/"), t.wsOptions || (t.wsOptions = {});
  }
  function sI(t, e) {
    let r = t.protocol === "wxs" ? "wss" : "ws", n = `${r}://${t.hostname}${t.path}`;
    return t.port && t.port !== 80 && t.port !== 443 && (n = `${r}://${t.hostname}:${t.port}${t.path}`), typeof t.transformWsUrl == "function" && (n = t.transformWsUrl(n, t, e)), n;
  }
  function aI() {
    vt.onOpen(() => {
      Je.socketReady();
    }), vt.onMessage((t) => {
      let { data: e } = t;
      e instanceof ArrayBuffer ? e = gy.Buffer.from(e) : e = gy.Buffer.from(e, "utf8"), ju.push(e);
    }), vt.onClose(() => {
      Je.emit("close"), Je.end(), Je.destroy();
    }), vt.onError((t) => {
      let e = new Error(t.errMsg);
      Je.destroy(e);
    });
  }
  var uI = (t, e) => {
    if (e.hostname = e.hostname || e.host, !e.hostname) throw new Error("Could not determine host. Specify host manually.");
    let r = e.protocolId === "MQIsdp" && e.protocolVersion === 3 ? "mqttv3.1" : "mqtt";
    oI(e);
    let n = sI(e, t);
    vt = wx.connectSocket({ url: n, protocols: [r] }), ju = iI(), Je = new nI.BufferedDuplex(e, ju, vt), Je._destroy = (s, o) => {
      vt.close({ success() {
        o && o(s);
      } });
    };
    let i = Je.destroy;
    return Je.destroy = (s, o) => (Je.destroy = i, setTimeout(() => {
      vt.close({ fail() {
        Je._destroy(s, o);
      } });
    }, 0), Je), aI(), Je;
  };
  $u.default = uI;
});
var zu = H((Hu) => {
  "use strict";
  x();
  P();
  T();
  Object.defineProperty(Hu, "__esModule", { value: true });
  var Vu = (ke(), _e(Le)), lI = Yt(), cI = mo(), Ut, ai, un, yy = false;
  function fI() {
    let t = new lI.Transform();
    return t._write = (e, r, n) => {
      Ut.sendSocketMessage({ data: e.buffer, success() {
        n();
      }, fail() {
        n(new Error());
      } });
    }, t._flush = (e) => {
      Ut.closeSocket({ success() {
        e();
      } });
    }, t;
  }
  function dI(t) {
    t.hostname || (t.hostname = "localhost"), t.path || (t.path = "/"), t.wsOptions || (t.wsOptions = {});
  }
  function hI(t, e) {
    let r = t.protocol === "alis" ? "wss" : "ws", n = `${r}://${t.hostname}${t.path}`;
    return t.port && t.port !== 80 && t.port !== 443 && (n = `${r}://${t.hostname}:${t.port}${t.path}`), typeof t.transformWsUrl == "function" && (n = t.transformWsUrl(n, t, e)), n;
  }
  function pI() {
    yy || (yy = true, Ut.onSocketOpen(() => {
      un.socketReady();
    }), Ut.onSocketMessage((t) => {
      if (typeof t.data == "string") {
        let e = Vu.Buffer.from(t.data, "base64");
        ai.push(e);
      } else {
        let e = new FileReader();
        e.addEventListener("load", () => {
          if (e.result instanceof ArrayBuffer) {
            ai.push(Vu.Buffer.from(e.result));
            return;
          }
          ai.push(Vu.Buffer.from(e.result, "utf-8"));
        }), e.readAsArrayBuffer(t.data);
      }
    }), Ut.onSocketClose(() => {
      un.end(), un.destroy();
    }), Ut.onSocketError((t) => {
      un.destroy(t);
    }));
  }
  var gI = (t, e) => {
    if (e.hostname = e.hostname || e.host, !e.hostname) throw new Error("Could not determine host. Specify host manually.");
    let r = e.protocolId === "MQIsdp" && e.protocolVersion === 3 ? "mqttv3.1" : "mqtt";
    dI(e);
    let n = hI(e, t);
    return Ut = e.my, Ut.connectSocket({ url: n, protocols: r }), ai = fI(), un = new cI.BufferedDuplex(e, ai, Ut), pI(), un;
  };
  Hu.default = gI;
});
var _y = H((ln) => {
  "use strict";
  x();
  P();
  T();
  var wo = ln && ln.__importDefault || function(t) {
    return t && t.__esModule ? t : { default: t };
  };
  Object.defineProperty(ln, "__esModule", { value: true });
  ln.connectAsync = vI;
  var yI = wo(Xt()), bI = wo((ny(), _e(ry))), mI = wo(yo()), Gu = wo(ei());
  typeof (q == null ? void 0 : q.nextTick) != "function" && (q.nextTick = setImmediate);
  var by = (0, yI.default)("mqttjs"), Be = null;
  function _I() {
    return typeof location < "u" ? location.protocol === "https:" ? "wss" : "ws" : typeof document < "u" && new URL(document.URL).protocol === "https:" ? "wss" : "ws";
  }
  function wI(t) {
    let e;
    if (t.auth) if (e = t.auth.match(/^(.+):(.+)$/), e) {
      let [, r, n] = e;
      t.username = r, t.password = n;
    } else t.username = t.auth;
  }
  function my(t, e) {
    var _a, _b, _c2, _d;
    if (by("connecting to an MQTT broker..."), typeof t == "object" && !e && (e = t, t = ""), e = e || {}, t && typeof t == "string") {
      let i = bI.default.parse(t, true), s = {}, o = !i.protocol && !i.hostname && ((_a = i.path) == null ? void 0 : _a.startsWith("/")) && (Gu.default || e.forceNativeWebSocket);
      if (i.port != null && (s.port = Number(i.port)), s.host = i.hostname, s.query = i.query, s.auth = i.auth, s.protocol = i.protocol, s.path = i.path, e = { ...s, ...e }, !e.protocol && !o) throw new Error("Missing protocol");
      e.protocol = (e.protocol || _I()).replace(/:$/, "");
    }
    if (e.unixSocket = e.unixSocket || ((_b = e.protocol) == null ? void 0 : _b.includes("+unix")), e.unixSocket ? e.protocol = e.protocol.replace("+unix", "") : !((_c2 = e.protocol) == null ? void 0 : _c2.startsWith("ws")) && !((_d = e.protocol) == null ? void 0 : _d.startsWith("wx")) && delete e.path, wI(e), e.query && typeof e.query.clientId == "string" && (e.clientId = e.query.clientId), Gu.default || e.unixSocket ? e.socksProxy = void 0 : e.socksProxy === void 0 && typeof q < "u" && (e.socksProxy = q.env.MQTTJS_SOCKS_PROXY), e.cert && e.key) if (e.protocol) {
      if (["mqtts", "wss", "wxs", "alis"].indexOf(e.protocol) === -1) switch (e.protocol) {
        case "mqtt":
          e.protocol = "mqtts";
          break;
        case "ws":
          e.protocol = "wss";
          break;
        case "wx":
          e.protocol = "wxs";
          break;
        case "ali":
          e.protocol = "alis";
          break;
        default:
          throw new Error(`Unknown protocol for secure connection: "${e.protocol}"!`);
      }
    } else throw new Error("Missing secure protocol key");
    if (Be || (Be = {}, !Gu.default && !e.forceNativeWebSocket ? (Be.ws = ii().streamBuilder, Be.wss = ii().streamBuilder, Be.mqtt = Du().default, Be.tcp = Du().default, Be.ssl = Fu().default, Be.tls = Be.ssl, Be.mqtts = Fu().default) : (Be.ws = ii().browserStreamBuilder, Be.wss = ii().browserStreamBuilder, Be.wx = Wu().default, Be.wxs = Wu().default, Be.ali = zu().default, Be.alis = zu().default)), !Be[e.protocol]) {
      let i = ["mqtts", "wss"].indexOf(e.protocol) !== -1;
      e.protocol = ["mqtt", "mqtts", "ws", "wss", "wx", "wxs", "ali", "alis"].filter((s, o) => i && o % 2 === 0 ? false : typeof Be[s] == "function")[0];
    }
    if (e.clean === false && !e.clientId) throw new Error("Missing clientId for unclean clients");
    e.protocol && (e.defaultProtocol = e.protocol);
    function r(i) {
      return e.servers && ((!i._reconnectCount || i._reconnectCount === e.servers.length) && (i._reconnectCount = 0), e.host = e.servers[i._reconnectCount].host, e.port = e.servers[i._reconnectCount].port, e.protocol = e.servers[i._reconnectCount].protocol ? e.servers[i._reconnectCount].protocol : e.defaultProtocol, e.hostname = e.host, i._reconnectCount++), by("calling streambuilder for", e.protocol), Be[e.protocol](i, e);
    }
    let n = new mI.default(r, e);
    return n.on("error", () => {
    }), n;
  }
  function vI(t, e, r = true) {
    return new Promise((n, i) => {
      let s = my(t, e), o = { connect: (c) => {
        u(), n(s);
      }, end: () => {
        u(), n(s);
      }, error: (c) => {
        u(), s.end(), i(c);
      } };
      r === false && (o.close = () => {
        o.error(new Error("Couldn't connect to server"));
      });
      function u() {
        Object.keys(o).forEach((c) => {
          s.off(c, o[c]);
        });
      }
      Object.keys(o).forEach((c) => {
        s.on(c, o[c]);
      });
    });
  }
  ln.default = my;
});
var Ku = H((ye) => {
  "use strict";
  x();
  P();
  T();
  var wy = ye && ye.__createBinding || (Object.create ? function(t, e, r, n) {
    n === void 0 && (n = r);
    var i = Object.getOwnPropertyDescriptor(e, r);
    (!i || ("get" in i ? !e.__esModule : i.writable || i.configurable)) && (i = { enumerable: true, get: function() {
      return e[r];
    } }), Object.defineProperty(t, n, i);
  } : function(t, e, r, n) {
    n === void 0 && (n = r), t[n] = e[r];
  }), SI = ye && ye.__setModuleDefault || (Object.create ? function(t, e) {
    Object.defineProperty(t, "default", { enumerable: true, value: e });
  } : function(t, e) {
    t.default = e;
  }), EI = ye && ye.__importStar || /* @__PURE__ */ function() {
    var t = function(e) {
      return t = Object.getOwnPropertyNames || function(r) {
        var n = [];
        for (var i in r) Object.prototype.hasOwnProperty.call(r, i) && (n[n.length] = i);
        return n;
      }, t(e);
    };
    return function(e) {
      if (e && e.__esModule) return e;
      var r = {};
      if (e != null) for (var n = t(e), i = 0; i < n.length; i++) n[i] !== "default" && wy(r, e, n[i]);
      return SI(r, e), r;
    };
  }(), Qu = ye && ye.__exportStar || function(t, e) {
    for (var r in t) r !== "default" && !Object.prototype.hasOwnProperty.call(e, r) && wy(e, t, r);
  }, ui = ye && ye.__importDefault || function(t) {
    return t && t.__esModule ? t : { default: t };
  };
  Object.defineProperty(ye, "__esModule", { value: true });
  ye.ReasonCodes = ye.KeepaliveManager = ye.UniqueMessageIdProvider = ye.DefaultMessageIdProvider = ye.Store = ye.MqttClient = ye.connectAsync = ye.connect = ye.Client = void 0;
  var vy = ui(yo());
  ye.MqttClient = vy.default;
  var AI = ui(Sa());
  ye.DefaultMessageIdProvider = AI.default;
  var II = ui(hg());
  ye.UniqueMessageIdProvider = II.default;
  var xI = ui(aa());
  ye.Store = xI.default;
  var Sy = EI(_y());
  ye.connect = Sy.default;
  Object.defineProperty(ye, "connectAsync", { enumerable: true, get: function() {
    return Sy.connectAsync;
  } });
  var TI = ui(qa());
  ye.KeepaliveManager = TI.default;
  ye.Client = vy.default;
  Qu(yo(), ye);
  Qu(Ct(), ye);
  Qu(ia(), ye);
  var PI = Mn();
  Object.defineProperty(ye, "ReasonCodes", { enumerable: true, get: function() {
    return PI.ReasonCodes;
  } });
});
var MI = H((nt) => {
  x();
  P();
  T();
  var Ey = nt && nt.__createBinding || (Object.create ? function(t, e, r, n) {
    n === void 0 && (n = r);
    var i = Object.getOwnPropertyDescriptor(e, r);
    (!i || ("get" in i ? !e.__esModule : i.writable || i.configurable)) && (i = { enumerable: true, get: function() {
      return e[r];
    } }), Object.defineProperty(t, n, i);
  } : function(t, e, r, n) {
    n === void 0 && (n = r), t[n] = e[r];
  }), OI = nt && nt.__setModuleDefault || (Object.create ? function(t, e) {
    Object.defineProperty(t, "default", { enumerable: true, value: e });
  } : function(t, e) {
    t.default = e;
  }), RI = nt && nt.__importStar || /* @__PURE__ */ function() {
    var t = function(e) {
      return t = Object.getOwnPropertyNames || function(r) {
        var n = [];
        for (var i in r) Object.prototype.hasOwnProperty.call(r, i) && (n[n.length] = i);
        return n;
      }, t(e);
    };
    return function(e) {
      if (e && e.__esModule) return e;
      var r = {};
      if (e != null) for (var n = t(e), i = 0; i < n.length; i++) n[i] !== "default" && Ey(r, e, n[i]);
      return OI(r, e), r;
    };
  }(), kI = nt && nt.__exportStar || function(t, e) {
    for (var r in t) r !== "default" && !Object.prototype.hasOwnProperty.call(e, r) && Ey(e, t, r);
  };
  Object.defineProperty(nt, "__esModule", { value: true });
  var CI = RI(Ku());
  nt.default = CI;
  kI(Ku(), nt);
});
var mqtt_esm_default = MI();
export {
  mqtt_esm_default as default
};
/*! Bundled license information:

mqtt/dist/mqtt.esm.js:
  (*! Bundled license information:
  
  @jspm/core/nodelibs/browser/chunk-DtuTasat.js:
    (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)
  
  safe-buffer/index.js:
    (*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)
  
  @babel/runtime/helpers/regenerator.js:
    (*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE *)
  *)
*/
//# sourceMappingURL=mqtt.js.map
