const T = globalThis, z = T.ShadowRoot && (T.ShadyCSS === void 0 || T.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, L = /* @__PURE__ */ Symbol(), F = /* @__PURE__ */ new WeakMap();
let ie = class {
  constructor(e, t, s) {
    if (this._$cssResult$ = !0, s !== L) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = e, this.t = t;
  }
  get styleSheet() {
    let e = this.o;
    const t = this.t;
    if (z && e === void 0) {
      const s = t !== void 0 && t.length === 1;
      s && (e = F.get(t)), e === void 0 && ((this.o = e = new CSSStyleSheet()).replaceSync(this.cssText), s && F.set(t, e));
    }
    return e;
  }
  toString() {
    return this.cssText;
  }
};
const ce = (r) => new ie(typeof r == "string" ? r : r + "", void 0, L), de = (r, ...e) => {
  const t = r.length === 1 ? r[0] : e.reduce((s, i, n) => s + ((o) => {
    if (o._$cssResult$ === !0) return o.cssText;
    if (typeof o == "number") return o;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + o + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(i) + r[n + 1], r[0]);
  return new ie(t, r, L);
}, he = (r, e) => {
  if (z) r.adoptedStyleSheets = e.map((t) => t instanceof CSSStyleSheet ? t : t.styleSheet);
  else for (const t of e) {
    const s = document.createElement("style"), i = T.litNonce;
    i !== void 0 && s.setAttribute("nonce", i), s.textContent = t.cssText, r.appendChild(s);
  }
}, V = z ? (r) => r : (r) => r instanceof CSSStyleSheet ? ((e) => {
  let t = "";
  for (const s of e.cssRules) t += s.cssText;
  return ce(t);
})(r) : r;
const { is: pe, defineProperty: ue, getOwnPropertyDescriptor: ge, getOwnPropertyNames: fe, getOwnPropertySymbols: me, getPrototypeOf: be } = Object, U = globalThis, J = U.trustedTypes, $e = J ? J.emptyScript : "", ve = U.reactiveElementPolyfillSupport, w = (r, e) => r, I = { toAttribute(r, e) {
  switch (e) {
    case Boolean:
      r = r ? $e : null;
      break;
    case Object:
    case Array:
      r = r == null ? r : JSON.stringify(r);
  }
  return r;
}, fromAttribute(r, e) {
  let t = r;
  switch (e) {
    case Boolean:
      t = r !== null;
      break;
    case Number:
      t = r === null ? null : Number(r);
      break;
    case Object:
    case Array:
      try {
        t = JSON.parse(r);
      } catch {
        t = null;
      }
  }
  return t;
} }, re = (r, e) => !pe(r, e), K = { attribute: !0, type: String, converter: I, reflect: !1, useDefault: !1, hasChanged: re };
Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), U.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
let _ = class extends HTMLElement {
  static addInitializer(e) {
    this._$Ei(), (this.l ??= []).push(e);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(e, t = K) {
    if (t.state && (t.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(e) && ((t = Object.create(t)).wrapped = !0), this.elementProperties.set(e, t), !t.noAccessor) {
      const s = /* @__PURE__ */ Symbol(), i = this.getPropertyDescriptor(e, s, t);
      i !== void 0 && ue(this.prototype, e, i);
    }
  }
  static getPropertyDescriptor(e, t, s) {
    const { get: i, set: n } = ge(this.prototype, e) ?? { get() {
      return this[t];
    }, set(o) {
      this[t] = o;
    } };
    return { get: i, set(o) {
      const l = i?.call(this);
      n?.call(this, o), this.requestUpdate(e, l, s);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(e) {
    return this.elementProperties.get(e) ?? K;
  }
  static _$Ei() {
    if (this.hasOwnProperty(w("elementProperties"))) return;
    const e = be(this);
    e.finalize(), e.l !== void 0 && (this.l = [...e.l]), this.elementProperties = new Map(e.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(w("finalized"))) return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(w("properties"))) {
      const t = this.properties, s = [...fe(t), ...me(t)];
      for (const i of s) this.createProperty(i, t[i]);
    }
    const e = this[Symbol.metadata];
    if (e !== null) {
      const t = litPropertyMetadata.get(e);
      if (t !== void 0) for (const [s, i] of t) this.elementProperties.set(s, i);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t, s] of this.elementProperties) {
      const i = this._$Eu(t, s);
      i !== void 0 && this._$Eh.set(i, t);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(e) {
    const t = [];
    if (Array.isArray(e)) {
      const s = new Set(e.flat(1 / 0).reverse());
      for (const i of s) t.unshift(V(i));
    } else e !== void 0 && t.push(V(e));
    return t;
  }
  static _$Eu(e, t) {
    const s = t.attribute;
    return s === !1 ? void 0 : typeof s == "string" ? s : typeof e == "string" ? e.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((e) => this.enableUpdating = e), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((e) => e(this));
  }
  addController(e) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(e), this.renderRoot !== void 0 && this.isConnected && e.hostConnected?.();
  }
  removeController(e) {
    this._$EO?.delete(e);
  }
  _$E_() {
    const e = /* @__PURE__ */ new Map(), t = this.constructor.elementProperties;
    for (const s of t.keys()) this.hasOwnProperty(s) && (e.set(s, this[s]), delete this[s]);
    e.size > 0 && (this._$Ep = e);
  }
  createRenderRoot() {
    const e = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return he(e, this.constructor.elementStyles), e;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(!0), this._$EO?.forEach((e) => e.hostConnected?.());
  }
  enableUpdating(e) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((e) => e.hostDisconnected?.());
  }
  attributeChangedCallback(e, t, s) {
    this._$AK(e, s);
  }
  _$ET(e, t) {
    const s = this.constructor.elementProperties.get(e), i = this.constructor._$Eu(e, s);
    if (i !== void 0 && s.reflect === !0) {
      const n = (s.converter?.toAttribute !== void 0 ? s.converter : I).toAttribute(t, s.type);
      this._$Em = e, n == null ? this.removeAttribute(i) : this.setAttribute(i, n), this._$Em = null;
    }
  }
  _$AK(e, t) {
    const s = this.constructor, i = s._$Eh.get(e);
    if (i !== void 0 && this._$Em !== i) {
      const n = s.getPropertyOptions(i), o = typeof n.converter == "function" ? { fromAttribute: n.converter } : n.converter?.fromAttribute !== void 0 ? n.converter : I;
      this._$Em = i;
      const l = o.fromAttribute(t, n.type);
      this[i] = l ?? this._$Ej?.get(i) ?? l, this._$Em = null;
    }
  }
  requestUpdate(e, t, s, i = !1, n) {
    if (e !== void 0) {
      const o = this.constructor;
      if (i === !1 && (n = this[e]), s ??= o.getPropertyOptions(e), !((s.hasChanged ?? re)(n, t) || s.useDefault && s.reflect && n === this._$Ej?.get(e) && !this.hasAttribute(o._$Eu(e, s)))) return;
      this.C(e, t, s);
    }
    this.isUpdatePending === !1 && (this._$ES = this._$EP());
  }
  C(e, t, { useDefault: s, reflect: i, wrapped: n }, o) {
    s && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(e) && (this._$Ej.set(e, o ?? t ?? this[e]), n !== !0 || o !== void 0) || (this._$AL.has(e) || (this.hasUpdated || s || (t = void 0), this._$AL.set(e, t)), i === !0 && this._$Em !== e && (this._$Eq ??= /* @__PURE__ */ new Set()).add(e));
  }
  async _$EP() {
    this.isUpdatePending = !0;
    try {
      await this._$ES;
    } catch (t) {
      Promise.reject(t);
    }
    const e = this.scheduleUpdate();
    return e != null && await e, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [i, n] of this._$Ep) this[i] = n;
        this._$Ep = void 0;
      }
      const s = this.constructor.elementProperties;
      if (s.size > 0) for (const [i, n] of s) {
        const { wrapped: o } = n, l = this[i];
        o !== !0 || this._$AL.has(i) || l === void 0 || this.C(i, void 0, n, l);
      }
    }
    let e = !1;
    const t = this._$AL;
    try {
      e = this.shouldUpdate(t), e ? (this.willUpdate(t), this._$EO?.forEach((s) => s.hostUpdate?.()), this.update(t)) : this._$EM();
    } catch (s) {
      throw e = !1, this._$EM(), s;
    }
    e && this._$AE(t);
  }
  willUpdate(e) {
  }
  _$AE(e) {
    this._$EO?.forEach((t) => t.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(e)), this.updated(e);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(e) {
    return !0;
  }
  update(e) {
    this._$Eq &&= this._$Eq.forEach((t) => this._$ET(t, this[t])), this._$EM();
  }
  updated(e) {
  }
  firstUpdated(e) {
  }
};
_.elementStyles = [], _.shadowRootOptions = { mode: "open" }, _[w("elementProperties")] = /* @__PURE__ */ new Map(), _[w("finalized")] = /* @__PURE__ */ new Map(), ve?.({ ReactiveElement: _ }), (U.reactiveElementVersions ??= []).push("2.1.2");
const j = globalThis, Z = (r) => r, R = j.trustedTypes, Q = R ? R.createPolicy("lit-html", { createHTML: (r) => r }) : void 0, ne = "$lit$", m = `lit$${Math.random().toFixed(9).slice(2)}$`, oe = "?" + m, ye = `<${oe}>`, v = document, S = () => v.createComment(""), E = (r) => r === null || typeof r != "object" && typeof r != "function", q = Array.isArray, _e = (r) => q(r) || typeof r?.[Symbol.iterator] == "function", H = `[ 	
\f\r]`, A = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, G = /-->/g, X = />/g, b = RegExp(`>|${H}(?:([^\\s"'>=/]+)(${H}*=${H}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), Y = /'/g, ee = /"/g, ae = /^(?:script|style|textarea|title)$/i, xe = (r) => (e, ...t) => ({ _$litType$: r, strings: e, values: t }), u = xe(1), y = /* @__PURE__ */ Symbol.for("lit-noChange"), d = /* @__PURE__ */ Symbol.for("lit-nothing"), te = /* @__PURE__ */ new WeakMap(), $ = v.createTreeWalker(v, 129);
function le(r, e) {
  if (!q(r) || !r.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return Q !== void 0 ? Q.createHTML(e) : e;
}
const Ae = (r, e) => {
  const t = r.length - 1, s = [];
  let i, n = e === 2 ? "<svg>" : e === 3 ? "<math>" : "", o = A;
  for (let l = 0; l < t; l++) {
    const a = r[l];
    let h, p, c = -1, g = 0;
    for (; g < a.length && (o.lastIndex = g, p = o.exec(a), p !== null); ) g = o.lastIndex, o === A ? p[1] === "!--" ? o = G : p[1] !== void 0 ? o = X : p[2] !== void 0 ? (ae.test(p[2]) && (i = RegExp("</" + p[2], "g")), o = b) : p[3] !== void 0 && (o = b) : o === b ? p[0] === ">" ? (o = i ?? A, c = -1) : p[1] === void 0 ? c = -2 : (c = o.lastIndex - p[2].length, h = p[1], o = p[3] === void 0 ? b : p[3] === '"' ? ee : Y) : o === ee || o === Y ? o = b : o === G || o === X ? o = A : (o = b, i = void 0);
    const f = o === b && r[l + 1].startsWith("/>") ? " " : "";
    n += o === A ? a + ye : c >= 0 ? (s.push(h), a.slice(0, c) + ne + a.slice(c) + m + f) : a + m + (c === -2 ? l : f);
  }
  return [le(r, n + (r[t] || "<?>") + (e === 2 ? "</svg>" : e === 3 ? "</math>" : "")), s];
};
class C {
  constructor({ strings: e, _$litType$: t }, s) {
    let i;
    this.parts = [];
    let n = 0, o = 0;
    const l = e.length - 1, a = this.parts, [h, p] = Ae(e, t);
    if (this.el = C.createElement(h, s), $.currentNode = this.el.content, t === 2 || t === 3) {
      const c = this.el.content.firstChild;
      c.replaceWith(...c.childNodes);
    }
    for (; (i = $.nextNode()) !== null && a.length < l; ) {
      if (i.nodeType === 1) {
        if (i.hasAttributes()) for (const c of i.getAttributeNames()) if (c.endsWith(ne)) {
          const g = p[o++], f = i.getAttribute(c).split(m), P = /([.?@])?(.*)/.exec(g);
          a.push({ type: 1, index: n, name: P[2], strings: f, ctor: P[1] === "." ? ke : P[1] === "?" ? Se : P[1] === "@" ? Ee : N }), i.removeAttribute(c);
        } else c.startsWith(m) && (a.push({ type: 6, index: n }), i.removeAttribute(c));
        if (ae.test(i.tagName)) {
          const c = i.textContent.split(m), g = c.length - 1;
          if (g > 0) {
            i.textContent = R ? R.emptyScript : "";
            for (let f = 0; f < g; f++) i.append(c[f], S()), $.nextNode(), a.push({ type: 2, index: ++n });
            i.append(c[g], S());
          }
        }
      } else if (i.nodeType === 8) if (i.data === oe) a.push({ type: 2, index: n });
      else {
        let c = -1;
        for (; (c = i.data.indexOf(m, c + 1)) !== -1; ) a.push({ type: 7, index: n }), c += m.length - 1;
      }
      n++;
    }
  }
  static createElement(e, t) {
    const s = v.createElement("template");
    return s.innerHTML = e, s;
  }
}
function x(r, e, t = r, s) {
  if (e === y) return e;
  let i = s !== void 0 ? t._$Co?.[s] : t._$Cl;
  const n = E(e) ? void 0 : e._$litDirective$;
  return i?.constructor !== n && (i?._$AO?.(!1), n === void 0 ? i = void 0 : (i = new n(r), i._$AT(r, t, s)), s !== void 0 ? (t._$Co ??= [])[s] = i : t._$Cl = i), i !== void 0 && (e = x(r, i._$AS(r, e.values), i, s)), e;
}
class we {
  constructor(e, t) {
    this._$AV = [], this._$AN = void 0, this._$AD = e, this._$AM = t;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(e) {
    const { el: { content: t }, parts: s } = this._$AD, i = (e?.creationScope ?? v).importNode(t, !0);
    $.currentNode = i;
    let n = $.nextNode(), o = 0, l = 0, a = s[0];
    for (; a !== void 0; ) {
      if (o === a.index) {
        let h;
        a.type === 2 ? h = new M(n, n.nextSibling, this, e) : a.type === 1 ? h = new a.ctor(n, a.name, a.strings, this, e) : a.type === 6 && (h = new Ce(n, this, e)), this._$AV.push(h), a = s[++l];
      }
      o !== a?.index && (n = $.nextNode(), o++);
    }
    return $.currentNode = v, i;
  }
  p(e) {
    let t = 0;
    for (const s of this._$AV) s !== void 0 && (s.strings !== void 0 ? (s._$AI(e, s, t), t += s.strings.length - 2) : s._$AI(e[t])), t++;
  }
}
class M {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(e, t, s, i) {
    this.type = 2, this._$AH = d, this._$AN = void 0, this._$AA = e, this._$AB = t, this._$AM = s, this.options = i, this._$Cv = i?.isConnected ?? !0;
  }
  get parentNode() {
    let e = this._$AA.parentNode;
    const t = this._$AM;
    return t !== void 0 && e?.nodeType === 11 && (e = t.parentNode), e;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(e, t = this) {
    e = x(this, e, t), E(e) ? e === d || e == null || e === "" ? (this._$AH !== d && this._$AR(), this._$AH = d) : e !== this._$AH && e !== y && this._(e) : e._$litType$ !== void 0 ? this.$(e) : e.nodeType !== void 0 ? this.T(e) : _e(e) ? this.k(e) : this._(e);
  }
  O(e) {
    return this._$AA.parentNode.insertBefore(e, this._$AB);
  }
  T(e) {
    this._$AH !== e && (this._$AR(), this._$AH = this.O(e));
  }
  _(e) {
    this._$AH !== d && E(this._$AH) ? this._$AA.nextSibling.data = e : this.T(v.createTextNode(e)), this._$AH = e;
  }
  $(e) {
    const { values: t, _$litType$: s } = e, i = typeof s == "number" ? this._$AC(e) : (s.el === void 0 && (s.el = C.createElement(le(s.h, s.h[0]), this.options)), s);
    if (this._$AH?._$AD === i) this._$AH.p(t);
    else {
      const n = new we(i, this), o = n.u(this.options);
      n.p(t), this.T(o), this._$AH = n;
    }
  }
  _$AC(e) {
    let t = te.get(e.strings);
    return t === void 0 && te.set(e.strings, t = new C(e)), t;
  }
  k(e) {
    q(this._$AH) || (this._$AH = [], this._$AR());
    const t = this._$AH;
    let s, i = 0;
    for (const n of e) i === t.length ? t.push(s = new M(this.O(S()), this.O(S()), this, this.options)) : s = t[i], s._$AI(n), i++;
    i < t.length && (this._$AR(s && s._$AB.nextSibling, i), t.length = i);
  }
  _$AR(e = this._$AA.nextSibling, t) {
    for (this._$AP?.(!1, !0, t); e !== this._$AB; ) {
      const s = Z(e).nextSibling;
      Z(e).remove(), e = s;
    }
  }
  setConnected(e) {
    this._$AM === void 0 && (this._$Cv = e, this._$AP?.(e));
  }
}
class N {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(e, t, s, i, n) {
    this.type = 1, this._$AH = d, this._$AN = void 0, this.element = e, this.name = t, this._$AM = i, this.options = n, s.length > 2 || s[0] !== "" || s[1] !== "" ? (this._$AH = Array(s.length - 1).fill(new String()), this.strings = s) : this._$AH = d;
  }
  _$AI(e, t = this, s, i) {
    const n = this.strings;
    let o = !1;
    if (n === void 0) e = x(this, e, t, 0), o = !E(e) || e !== this._$AH && e !== y, o && (this._$AH = e);
    else {
      const l = e;
      let a, h;
      for (e = n[0], a = 0; a < n.length - 1; a++) h = x(this, l[s + a], t, a), h === y && (h = this._$AH[a]), o ||= !E(h) || h !== this._$AH[a], h === d ? e = d : e !== d && (e += (h ?? "") + n[a + 1]), this._$AH[a] = h;
    }
    o && !i && this.j(e);
  }
  j(e) {
    e === d ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, e ?? "");
  }
}
class ke extends N {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(e) {
    this.element[this.name] = e === d ? void 0 : e;
  }
}
class Se extends N {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(e) {
    this.element.toggleAttribute(this.name, !!e && e !== d);
  }
}
class Ee extends N {
  constructor(e, t, s, i, n) {
    super(e, t, s, i, n), this.type = 5;
  }
  _$AI(e, t = this) {
    if ((e = x(this, e, t, 0) ?? d) === y) return;
    const s = this._$AH, i = e === d && s !== d || e.capture !== s.capture || e.once !== s.once || e.passive !== s.passive, n = e !== d && (s === d || i);
    i && this.element.removeEventListener(this.name, this, s), n && this.element.addEventListener(this.name, this, e), this._$AH = e;
  }
  handleEvent(e) {
    typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, e) : this._$AH.handleEvent(e);
  }
}
class Ce {
  constructor(e, t, s) {
    this.element = e, this.type = 6, this._$AN = void 0, this._$AM = t, this.options = s;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(e) {
    x(this, e);
  }
}
const Me = j.litHtmlPolyfillSupport;
Me?.(C, M), (j.litHtmlVersions ??= []).push("3.3.2");
const Pe = (r, e, t) => {
  const s = t?.renderBefore ?? e;
  let i = s._$litPart$;
  if (i === void 0) {
    const n = t?.renderBefore ?? null;
    s._$litPart$ = i = new M(e.insertBefore(S(), n), n, void 0, t ?? {});
  }
  return i._$AI(r), i;
};
const B = globalThis;
let k = class extends _ {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const e = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= e.firstChild, e;
  }
  update(e) {
    const t = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(e), this._$Do = Pe(t, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(!0);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(!1);
  }
  render() {
    return y;
  }
};
k._$litElement$ = !0, k.finalized = !0, B.litElementHydrateSupport?.({ LitElement: k });
const Te = B.litElementPolyfillSupport;
Te?.({ LitElement: k });
(B.litElementVersions ??= []).push("4.2.2");
const Re = { CHILD: 2 }, De = (r) => (...e) => ({ _$litDirective$: r, values: e });
class Ue {
  constructor(e) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(e, t, s) {
    this._$Ct = e, this._$AM = t, this._$Ci = s;
  }
  _$AS(e, t) {
    return this.update(e, t);
  }
  update(e, t) {
    return this.render(...t);
  }
}
class O extends Ue {
  constructor(e) {
    if (super(e), this.it = d, e.type !== Re.CHILD) throw Error(this.constructor.directiveName + "() can only be used in child bindings");
  }
  render(e) {
    if (e === d || e == null) return this._t = void 0, this.it = e;
    if (e === y) return e;
    if (typeof e != "string") throw Error(this.constructor.directiveName + "() called with a non-string value");
    if (e === this.it) return this._t;
    this.it = e;
    const t = [e];
    return t.raw = t, this._t = { _$litType$: this.constructor.resultType, strings: t, values: [] };
  }
}
O.directiveName = "unsafeHTML", O.resultType = 1;
const Ne = De(O);
function He(r = []) {
  return r.reduce(
    (e, t) => (t.has_pending_approval ? e.attention.push(t) : t.status === "running" ? e.running.push(t) : t.status === "completed" && t.has_unseen_turns ? e.attention.push(t) : e.idle.push(t), e),
    { attention: [], running: [], idle: [] }
  );
}
function Ie(r, e = /* @__PURE__ */ new Date()) {
  if (!r)
    return "recently";
  const t = Date.parse(r);
  if (Number.isNaN(t))
    return "recently";
  const s = e.getTime() - t;
  if (s < 0)
    return "recently";
  const i = Math.floor(s / 6e4);
  if (i < 1)
    return "just now";
  if (i < 60)
    return `${i}m ago`;
  const n = Math.floor(i / 60);
  return n < 24 ? `${n}h ago` : `${Math.floor(n / 24)}d ago`;
}
function Oe(r) {
  return r.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function se(r) {
  return Oe(r).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
function We(r) {
  const e = r.replace(/\r\n/g, `
`).trim().split(`
`), t = [];
  for (let s = 0; s < e.length; ) {
    const i = e[s]?.trim() ?? "";
    if (!i) {
      s += 1;
      continue;
    }
    if (i.startsWith("- ")) {
      const o = [];
      for (; s < e.length; ) {
        const l = e[s]?.trim() ?? "";
        if (!l.startsWith("- "))
          break;
        o.push(`<li>${se(l.slice(2).trim())}</li>`), s += 1;
      }
      t.push(`<ul>${o.join("")}</ul>`);
      continue;
    }
    const n = [];
    for (; s < e.length; ) {
      const o = e[s]?.trim() ?? "";
      if (!o || o.startsWith("- "))
        break;
      n.push(se(o)), s += 1;
    }
    t.push(`<p>${n.join("<br />")}</p>`);
  }
  return t.join("");
}
function ze(r) {
  return !!(r.has_unseen_turns || r.hasUnseenActivity);
}
function Le(r) {
  return !!(r.has_running_dev_server || r.hasRunningDevServer);
}
function je(r) {
  return r.latest_process_status || r.latestProcessStatus;
}
function qe(r) {
  return r.pr_status || r.prStatus;
}
function Be(r) {
  return !!(r.is_pinned || r.isPinned);
}
function Fe(r) {
  const e = [], t = r.status === "running", s = !t && ["failed", "killed"].includes(je(r) ?? ""), i = ze(r), n = !!r.has_pending_approval, o = Le(r), l = qe(r);
  o && e.push({ symbol: "🖥️", kind: "dev-server", tone: "brand" }), s && e.push({ symbol: "▲", kind: "process-error", tone: "error" }), n ? e.push({ symbol: "✋", kind: "approval", tone: "brand" }) : t && e.push({ symbol: "⋯", kind: "running", tone: "brand" }), i && !t && !s && e.push({ symbol: "●", kind: "unseen", tone: "brand" }), l === "open" ? e.push({ symbol: "⎇", kind: "pr-open", tone: "success" }) : l === "merged" && e.push({ symbol: "⎇", kind: "pr-merged", tone: "merged" }), Be(r) && e.push({ symbol: "📌", kind: "pin", tone: "brand" }), e.length === 0 && e.push({ symbol: "•", kind: "idle", tone: "muted" });
  const a = t && !n ? "is-running" : n || r.status === "completed" && i ? "is-attention" : "is-idle";
  return {
    icons: e,
    accentClass: a
  };
}
const Ve = de`
  :host {
    display: block;
  }

  ha-card {
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--warning-color, #f59e0b) 12%, transparent), transparent 28%),
      var(--ha-card-background, var(--card-background-color, #ffffff));
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 70%, transparent);
    border-radius: 20px;
    box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0, 0, 0, 0.12));
    color: var(--primary-text-color);
    padding: 14px;
  }

  .board {
    display: grid;
    gap: 12px;
  }

  .section {
    border-radius: 14px;
    overflow: hidden;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 65%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 65%, transparent);
  }

  .section-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 12px 14px;
    font: inherit;
    text-align: left;
  }

  .section-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .section-count {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.85rem;
  }

  .chevron {
    color: var(--secondary-text-color, #94a3b8);
    transition: transform 160ms ease;
  }

  .section[collapsed] .chevron {
    transform: rotate(-90deg);
  }

  .section-body {
    display: grid;
    gap: 8px;
    padding: 0 10px 10px;
  }

  .task-card {
    display: grid;
    gap: 6px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color, #ffffff)) 82%, var(--secondary-background-color, #f3f4f6));
    border-left: 3px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 85%, transparent);
    border-top: 0;
    border-right: 0;
    border-bottom: 0;
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .task-card.is-attention {
    border-left-color: #f59e0b;
  }

  .task-card.is-running {
    border-left-color: #10b981;
  }

  .workspace-name {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.98rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .task-meta {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.82rem;
    line-height: 1.2;
  }

  .meta-status,
  .meta-files {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .relative-time {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .status-icon {
    font-weight: 700;
    line-height: 1;
  }

  .tone-brand {
    color: var(--primary-color, #f59e0b);
  }

  .tone-error {
    color: var(--error-color, #f87171);
  }

  .tone-success {
    color: var(--success-color, #34d399);
  }

  .tone-merged {
    color: #a78bfa;
  }

  .tone-muted {
    color: var(--secondary-text-color, #94a3b8);
  }

  .file-count {
    color: var(--secondary-text-color, #94a3b8);
  }

  .meta-files {
    justify-self: end;
    white-space: nowrap;
  }

  .lines-added {
    color: #34d399;
  }

  .lines-removed {
    color: #f87171;
  }

  .empty-state {
    padding: 22px 12px;
    border-radius: 14px;
    text-align: center;
    color: var(--secondary-text-color, #94a3b8);
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 65%, transparent);
    border: 1px dashed color-mix(in srgb, var(--divider-color, #cbd5e1) 70%, transparent);
  }

  .dialog-shell {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    padding: 18px;
  }

  .dialog-overlay {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(15, 23, 42, 0.52);
    cursor: pointer;
  }

  .workspace-dialog {
    position: relative;
    z-index: 1;
    width: min(900px, calc(100vw - 24px));
    height: min(88vh, 900px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 12px;
    padding: 16px;
    border-radius: 22px;
    background: var(--ha-card-background, var(--card-background-color, #ffffff));
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 72%, transparent);
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .dialog-heading {
    min-width: 0;
  }

  .dialog-title {
    margin: 0;
    font-size: 1.08rem;
    line-height: 1.2;
  }

  .dialog-close {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }

  .dialog-messages {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
  }

  .dialog-panel-title {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--secondary-text-color, #64748b);
  }

  .message-list {
    min-height: 0;
    display: grid;
    gap: 8px;
    overflow-y: auto;
    padding: 6px 2px 6px 0;
  }

  .message-row {
    width: 100%;
  }

  .message-bubble {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    border-radius: 10px;
    line-height: 1.35;
    white-space: normal;
    word-break: break-word;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 44%, transparent);
    color: inherit;
    text-align: left;
  }

  .message-bubble p,
  .message-bubble ul {
    margin: 0;
  }

  .message-bubble p + p,
  .message-bubble p + ul,
  .message-bubble ul + p,
  .message-bubble ul + ul {
    margin-top: 6px;
  }

  .message-bubble ul {
    padding-left: 18px;
  }

  .message-bubble li + li {
    margin-top: 4px;
  }

  .message-bubble code {
    font-family:
      ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas,
      "Liberation Mono", "Courier New", monospace;
    font-size: 0.92em;
    padding: 0.08em 0.35em;
    border-radius: 6px;
    background: color-mix(in srgb, var(--divider-color, #cbd5e1) 36%, transparent);
  }

  .message-bubble.is-user {
    background: color-mix(in srgb, var(--primary-color, #f59e0b) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary-color, #f59e0b) 24%, transparent);
  }

  .message-bubble.is-ai {
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 44%, transparent);
  }

  .dialog-composer {
    display: grid;
    gap: 8px;
  }

  .queue-list {
    display: grid;
    gap: 6px;
  }

  .queue-item {
    display: grid;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 72%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 60%, transparent);
  }

  .queue-index {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.76rem;
    line-height: 1.2;
  }

  .queue-content {
    line-height: 1.4;
    word-break: break-word;
  }

  .message-input {
    width: 100%;
    min-height: 44px;
    max-height: 88px;
    resize: none;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 72%, transparent);
    background: color-mix(in srgb, var(--ha-card-background, #ffffff) 92%, transparent);
    color: inherit;
    font: inherit;
    line-height: 1.4;
    box-sizing: border-box;
  }

  .dialog-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .dialog-action {
    flex: 1 1 160px;
    min-height: 36px;
    border-radius: 8px;
    font: inherit;
    cursor: pointer;
    padding: 0 12px;
  }

  .dialog-action-primary {
    border: 0;
    background: var(--primary-color, #f59e0b);
    color: #ffffff;
    font-weight: 700;
  }

  .dialog-action-primary,
  .dialog-action-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .dialog-action-secondary {
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 72%, transparent);
    background: transparent;
    color: inherit;
    font-weight: 600;
  }

  .action-spinner {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #ffffff;
    animation: spinner-rotate 900ms linear infinite;
    flex: none;
  }

  .dialog-feedback {
    min-height: 1.25rem;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  @keyframes spinner-rotate {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    .workspace-dialog {
      width: min(100vw - 12px, 900px);
      height: min(92vh, 900px);
      padding: 12px;
      border-radius: 18px;
    }

    .task-meta {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .meta-files {
      justify-self: start;
    }
  }
`, Je = [
  { key: "attention", label: "需要注意" },
  { key: "running", label: "运行中" },
  { key: "idle", label: "空闲" }
], D = class D extends k {
  constructor() {
    super(...arguments), this.collapsedSections = /* @__PURE__ */ new Set(), this.messageDraft = "", this.actionFeedback = "", this.queuedItems = [], this.closeWorkspaceDialog = () => {
      this.selectedWorkspaceId = void 0, this.messageDraft = "", this.actionFeedback = "";
    }, this.handleMessageInput = (e) => {
      this.messageDraft = e.target.value;
    }, this.handleKeyDown = (e) => {
      e.key === "Escape" && this.selectedWorkspace && this.closeWorkspaceDialog();
    };
  }
  connectedCallback() {
    super.connectedCallback(), this.addEventListener("keydown", this.handleKeyDown);
  }
  disconnectedCallback() {
    this.removeEventListener("keydown", this.handleKeyDown), super.disconnectedCallback();
  }
  setConfig(e) {
    if (!e?.entity)
      throw new Error("`entity` is required");
    this.config = e;
  }
  getCardSize() {
    return Math.max(1, this.visibleSections.length * 2);
  }
  render() {
    const e = this.visibleSections;
    return u`
      <ha-card>
        <div class="board">
          ${e.length === 0 ? u`<div class="empty-state">当前没有任务</div>` : e.map(
      ({ key: t, label: s, workspaces: i }) => this.renderSection(t, s, i)
    )}
        </div>
        ${this.renderDialog()}
      </ha-card>
    `;
  }
  updated(e) {
    e.has("selectedWorkspaceId") && this.selectedWorkspaceId && this.scrollMessagesToBottom();
  }
  renderSection(e, t, s) {
    const i = this.collapsedSections.has(e);
    return u`
      <section class="section" ?collapsed=${i}>
        <button
          class="section-toggle"
          type="button"
          @click=${() => this.toggleSection(e)}
        >
          <span class="section-title-row">
            <span class="section-title">${t}</span>
            <span class="section-count">${s.length}</span>
          </span>
          <span class="chevron" aria-hidden="true">▾</span>
        </button>
        ${i ? d : u`
              <div class="section-body">
                ${s.map((n) => this.renderWorkspace(n))}
              </div>
            `}
      </section>
    `;
  }
  renderWorkspace(e) {
    const t = Fe(e), { relativeTime: s, filesChanged: i, linesAdded: n, linesRemoved: o } = this.getWorkspaceDisplayMeta(e);
    return u`
      <button
        class="task-card ${t.accentClass}"
        type="button"
        @click=${() => this.openWorkspaceDialog(e)}
      >
        <div class="workspace-name">${e.name}</div>
        <div class="task-meta">
          <span class="meta-status">
            ${t.icons.map(
      (l) => u`<span class="status-icon tone-${l.tone} kind-${l.kind}"
                >${l.symbol}</span
              >`
    )}
          </span>
          <span class="relative-time">${s}</span>
          <span class="meta-files"
            ><span class="file-count">📄 ${i}</span> <span
              class="lines-added"
              >+${n}</span
            >
            <span class="lines-removed">-${o}</span></span
          >
        </div>
      </button>
    `;
  }
  renderDialog() {
    const e = this.selectedWorkspace;
    if (!e)
      return d;
    const t = this.getDialogMessages(e), s = e.status === "running", i = this.getQueueItems(e.id);
    return u`
      <div class="dialog-shell" role="presentation">
        <button
          class="dialog-overlay"
          type="button"
          aria-label="关闭工作区详情"
          @click=${this.closeWorkspaceDialog}
        ></button>
        <section
          class="workspace-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="${e.name} 工作区详情"
        >
          <div class="dialog-header">
            <div class="dialog-heading">
              <h2 class="dialog-title">${e.name}</h2>
            </div>
            <button
              class="dialog-close"
              type="button"
              aria-label="关闭"
              @click=${this.closeWorkspaceDialog}
            >
              ✕
            </button>
          </div>

          <section class="dialog-messages">
            <div class="dialog-panel-title">对话消息</div>
            <div class="message-list">
              ${t.map(
      (n) => u`
                  <div class="message-row">
                    <div class="message-bubble ${n.sender === "user" ? "is-user" : "is-ai"}">${Ne(We(this.compactMessageText(n.text)))}</div>
                  </div>
                `
    )}
            </div>
          </section>

          <div class="dialog-composer">
            ${i.length > 0 ? u`
                  <div class="queue-list">
                    ${i.map(
      (n, o) => u`
                        <div class="queue-item">
                          <span class="queue-index">队列 ${o + 1}</span>
                          <span class="queue-content">${n.content}</span>
                        </div>
                      `
    )}
                  </div>
                ` : d}
            <textarea
              class="message-input"
              rows="2"
              placeholder="输入消息"
              .value=${this.messageDraft}
              @input=${this.handleMessageInput}
            ></textarea>
            <div class="dialog-actions">
              <button
                class="dialog-action dialog-action-primary"
                type="button"
                @click=${() => this.handleActionClick(s ? "stop" : "send")}
              >
                ${s ? u`
                      <span class="action-spinner" aria-hidden="true"></span>
                      <span>停止</span>
                    ` : "发送消息"}
              </button>
              ${s ? u`
                    <button
                      class="dialog-action dialog-action-secondary"
                      type="button"
                      @click=${() => this.handleActionClick("queue")}
                    >
                      加入队列
                    </button>
                  ` : d}
            </div>
            <div class="dialog-feedback" aria-live="polite">
              ${this.actionFeedback || "消息操作暂未接入真实接口。"}
            </div>
          </div>
        </section>
      </div>
    `;
  }
  toggleSection(e) {
    const t = new Set(this.collapsedSections);
    t.has(e) ? t.delete(e) : t.add(e), this.collapsedSections = t;
  }
  openWorkspaceDialog(e) {
    this.selectedWorkspaceId = e.id, this.messageDraft = "", this.actionFeedback = "";
  }
  handleActionClick(e) {
    if (e === "queue" && this.selectedWorkspaceId) {
      const t = this.messageDraft.trim() || "未填写内容的排队消息";
      this.queuedItems = [
        ...this.queuedItems.filter((s) => s.workspaceId !== this.selectedWorkspaceId),
        { workspaceId: this.selectedWorkspaceId, content: t }
      ], this.actionFeedback = "加入队列功能暂未接入，当前仅展示界面。";
      return;
    }
    this.actionFeedback = e === "send" ? "发送消息功能暂未接入，当前仅展示界面。" : "停止功能暂未接入，当前仅展示界面。";
  }
  getWorkspaceDisplayMeta(e) {
    const t = e.relative_time || (e.status === "completed" ? e.completed_at ?? this.entityAttributes?.updated_at : this.entityAttributes?.updated_at);
    return {
      relativeTime: e.relative_time || Ie(t),
      filesChanged: e.files_changed ?? 0,
      linesAdded: e.lines_added ?? 0,
      linesRemoved: e.lines_removed ?? 0
    };
  }
  get entityAttributes() {
    if (!(!this.hass || !this.config?.entity))
      return this.hass.states[this.config.entity]?.attributes;
  }
  get selectedWorkspace() {
    if (this.selectedWorkspaceId)
      return this.normalizedWorkspaces.find(
        (e) => e.id === this.selectedWorkspaceId
      );
  }
  get visibleSections() {
    const e = He(this.normalizedWorkspaces);
    return Je.map(({ key: t, label: s }) => ({
      key: t,
      label: s,
      workspaces: e[t]
    })).filter((t) => t.workspaces.length > 0);
  }
  get normalizedWorkspaces() {
    const e = this.entityAttributes?.workspaces;
    if (Array.isArray(e))
      return e.filter(this.isWorkspaceLike);
    if (typeof e == "string")
      try {
        const t = JSON.parse(e);
        return Array.isArray(t) ? t.filter(this.isWorkspaceLike) : [];
      } catch {
        return [];
      }
    return [];
  }
  isWorkspaceLike(e) {
    return !!(e && typeof e == "object" && "id" in e && "name" in e && typeof e.id == "string" && typeof e.name == "string");
  }
  getDialogMessages(e) {
    const t = this.getRecentSessionMessages(e);
    return t.length > 0 ? t : [
      {
        sender: "ai",
        text: e.latest_session_id ?? e.last_session_id ? "暂无同步的对话消息。" : "当前工作区还没有可展示的对话消息。"
      }
    ];
  }
  getRecentSessionMessages(e) {
    const t = e.latest_session_id ?? e.last_session_id;
    if (!t || !this.hass)
      return [];
    const s = Object.values(this.hass.states).find((l) => l.attributes?.session_id === t);
    if (!s)
      return [];
    const i = s.attributes, n = i?.recent_messages, o = this.parseRecentMessages(n);
    return o.length > 0 ? o : typeof i?.last_message == "string" && i.last_message.trim() ? [{ sender: "ai", text: i.last_message.trim() }] : [];
  }
  parseRecentMessages(e) {
    const t = typeof e == "string" ? this.parseRecentMessagesString(e) : e;
    return Array.isArray(t) ? t.map((s) => this.normalizeSessionMessage(s)).filter((s) => !!s) : [];
  }
  parseRecentMessagesString(e) {
    try {
      return JSON.parse(e);
    } catch {
      return [];
    }
  }
  normalizeSessionMessage(e) {
    if (!e || typeof e.content != "string")
      return;
    const t = e.content.trim();
    if (t)
      return {
        sender: e.role === "user" ? "user" : "ai",
        text: this.compactMessageText(t)
      };
  }
  compactMessageText(e) {
    return e.replace(/\r\n/g, `
`).split(`
`).map((t) => t.trim().replace(/[ \t]{2,}/g, " ")).join(`
`).replace(/\n{3,}/g, `

`).trim();
  }
  scrollMessagesToBottom() {
    const e = this.renderRoot.querySelector(".message-list");
    e && (e.scrollTop = e.scrollHeight);
  }
  getQueueItems(e) {
    return this.queuedItems.filter((t) => t.workspaceId === e);
  }
};
D.styles = Ve, D.properties = {
  hass: { attribute: !1 },
  collapsedSections: { state: !0 },
  selectedWorkspaceId: { state: !0 },
  messageDraft: { state: !0 },
  actionFeedback: { state: !0 }
};
let W = D;
customElements.get("kanban-watcher-card") || customElements.define("kanban-watcher-card", W);
window.customCards = window.customCards ?? [];
window.customCards.some((r) => r.type === "kanban-watcher-card") || window.customCards.push({
  type: "kanban-watcher-card",
  name: "Kanban Watcher Card",
  description: "Compact Home Assistant card for Kanban Watcher workspaces."
});
export {
  W as KanbanWatcherCard
};
