const D = globalThis, I = D.ShadowRoot && (D.ShadyCSS === void 0 || D.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, z = /* @__PURE__ */ Symbol(), q = /* @__PURE__ */ new WeakMap();
let re = class {
  constructor(e, t, s) {
    if (this._$cssResult$ = !0, s !== z) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = e, this.t = t;
  }
  get styleSheet() {
    let e = this.o;
    const t = this.t;
    if (I && e === void 0) {
      const s = t !== void 0 && t.length === 1;
      s && (e = q.get(t)), e === void 0 && ((this.o = e = new CSSStyleSheet()).replaceSync(this.cssText), s && q.set(t, e));
    }
    return e;
  }
  toString() {
    return this.cssText;
  }
};
const ce = (r) => new re(typeof r == "string" ? r : r + "", void 0, z), he = (r, ...e) => {
  const t = r.length === 1 ? r[0] : e.reduce((s, i, n) => s + ((o) => {
    if (o._$cssResult$ === !0) return o.cssText;
    if (typeof o == "number") return o;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + o + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(i) + r[n + 1], r[0]);
  return new re(t, r, z);
}, pe = (r, e) => {
  if (I) r.adoptedStyleSheets = e.map((t) => t instanceof CSSStyleSheet ? t : t.styleSheet);
  else for (const t of e) {
    const s = document.createElement("style"), i = D.litNonce;
    i !== void 0 && s.setAttribute("nonce", i), s.textContent = t.cssText, r.appendChild(s);
  }
}, F = I ? (r) => r : (r) => r instanceof CSSStyleSheet ? ((e) => {
  let t = "";
  for (const s of e.cssRules) t += s.cssText;
  return ce(t);
})(r) : r;
const { is: ue, defineProperty: ge, getOwnPropertyDescriptor: fe, getOwnPropertyNames: me, getOwnPropertySymbols: $e, getPrototypeOf: be } = Object, T = globalThis, G = T.trustedTypes, xe = G ? G.emptyScript : "", ve = T.reactiveElementPolyfillSupport, S = (r, e) => r, H = { toAttribute(r, e) {
  switch (e) {
    case Boolean:
      r = r ? xe : null;
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
} }, ne = (r, e) => !ue(r, e), V = { attribute: !0, type: String, converter: H, reflect: !1, useDefault: !1, hasChanged: ne };
Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), T.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
let v = class extends HTMLElement {
  static addInitializer(e) {
    this._$Ei(), (this.l ??= []).push(e);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(e, t = V) {
    if (t.state && (t.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(e) && ((t = Object.create(t)).wrapped = !0), this.elementProperties.set(e, t), !t.noAccessor) {
      const s = /* @__PURE__ */ Symbol(), i = this.getPropertyDescriptor(e, s, t);
      i !== void 0 && ge(this.prototype, e, i);
    }
  }
  static getPropertyDescriptor(e, t, s) {
    const { get: i, set: n } = fe(this.prototype, e) ?? { get() {
      return this[t];
    }, set(o) {
      this[t] = o;
    } };
    return { get: i, set(o) {
      const d = i?.call(this);
      n?.call(this, o), this.requestUpdate(e, d, s);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(e) {
    return this.elementProperties.get(e) ?? V;
  }
  static _$Ei() {
    if (this.hasOwnProperty(S("elementProperties"))) return;
    const e = be(this);
    e.finalize(), e.l !== void 0 && (this.l = [...e.l]), this.elementProperties = new Map(e.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(S("finalized"))) return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(S("properties"))) {
      const t = this.properties, s = [...me(t), ...$e(t)];
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
      for (const i of s) t.unshift(F(i));
    } else e !== void 0 && t.push(F(e));
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
    return pe(e, this.constructor.elementStyles), e;
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
      const n = (s.converter?.toAttribute !== void 0 ? s.converter : H).toAttribute(t, s.type);
      this._$Em = e, n == null ? this.removeAttribute(i) : this.setAttribute(i, n), this._$Em = null;
    }
  }
  _$AK(e, t) {
    const s = this.constructor, i = s._$Eh.get(e);
    if (i !== void 0 && this._$Em !== i) {
      const n = s.getPropertyOptions(i), o = typeof n.converter == "function" ? { fromAttribute: n.converter } : n.converter?.fromAttribute !== void 0 ? n.converter : H;
      this._$Em = i;
      const d = o.fromAttribute(t, n.type);
      this[i] = d ?? this._$Ej?.get(i) ?? d, this._$Em = null;
    }
  }
  requestUpdate(e, t, s, i = !1, n) {
    if (e !== void 0) {
      const o = this.constructor;
      if (i === !1 && (n = this[e]), s ??= o.getPropertyOptions(e), !((s.hasChanged ?? ne)(n, t) || s.useDefault && s.reflect && n === this._$Ej?.get(e) && !this.hasAttribute(o._$Eu(e, s)))) return;
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
        const { wrapped: o } = n, d = this[i];
        o !== !0 || this._$AL.has(i) || d === void 0 || this.C(i, void 0, n, d);
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
v.elementStyles = [], v.shadowRootOptions = { mode: "open" }, v[S("elementProperties")] = /* @__PURE__ */ new Map(), v[S("finalized")] = /* @__PURE__ */ new Map(), ve?.({ ReactiveElement: v }), (T.reactiveElementVersions ??= []).push("2.1.2");
const L = globalThis, K = (r) => r, O = L.trustedTypes, J = O ? O.createPolicy("lit-html", { createHTML: (r) => r }) : void 0, oe = "$lit$", m = `lit$${Math.random().toFixed(9).slice(2)}$`, ae = "?" + m, ye = `<${ae}>`, x = document, E = () => x.createComment(""), k = (r) => r === null || typeof r != "object" && typeof r != "function", j = Array.isArray, _e = (r) => j(r) || typeof r?.[Symbol.iterator] == "function", R = `[ 	
\f\r]`, A = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, Z = /-->/g, Q = />/g, $ = RegExp(`>|${R}(?:([^\\s"'>=/]+)(${R}*=${R}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), X = /'/g, Y = /"/g, de = /^(?:script|style|textarea|title)$/i, Ae = (r) => (e, ...t) => ({ _$litType$: r, strings: e, values: t }), f = Ae(1), y = /* @__PURE__ */ Symbol.for("lit-noChange"), c = /* @__PURE__ */ Symbol.for("lit-nothing"), ee = /* @__PURE__ */ new WeakMap(), b = x.createTreeWalker(x, 129);
function le(r, e) {
  if (!j(r) || !r.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return J !== void 0 ? J.createHTML(e) : e;
}
const Se = (r, e) => {
  const t = r.length - 1, s = [];
  let i, n = e === 2 ? "<svg>" : e === 3 ? "<math>" : "", o = A;
  for (let d = 0; d < t; d++) {
    const a = r[d];
    let h, p, l = -1, u = 0;
    for (; u < a.length && (o.lastIndex = u, p = o.exec(a), p !== null); ) u = o.lastIndex, o === A ? p[1] === "!--" ? o = Z : p[1] !== void 0 ? o = Q : p[2] !== void 0 ? (de.test(p[2]) && (i = RegExp("</" + p[2], "g")), o = $) : p[3] !== void 0 && (o = $) : o === $ ? p[0] === ">" ? (o = i ?? A, l = -1) : p[1] === void 0 ? l = -2 : (l = o.lastIndex - p[2].length, h = p[1], o = p[3] === void 0 ? $ : p[3] === '"' ? Y : X) : o === Y || o === X ? o = $ : o === Z || o === Q ? o = A : (o = $, i = void 0);
    const g = o === $ && r[d + 1].startsWith("/>") ? " " : "";
    n += o === A ? a + ye : l >= 0 ? (s.push(h), a.slice(0, l) + oe + a.slice(l) + m + g) : a + m + (l === -2 ? d : g);
  }
  return [le(r, n + (r[t] || "<?>") + (e === 2 ? "</svg>" : e === 3 ? "</math>" : "")), s];
};
class C {
  constructor({ strings: e, _$litType$: t }, s) {
    let i;
    this.parts = [];
    let n = 0, o = 0;
    const d = e.length - 1, a = this.parts, [h, p] = Se(e, t);
    if (this.el = C.createElement(h, s), b.currentNode = this.el.content, t === 2 || t === 3) {
      const l = this.el.content.firstChild;
      l.replaceWith(...l.childNodes);
    }
    for (; (i = b.nextNode()) !== null && a.length < d; ) {
      if (i.nodeType === 1) {
        if (i.hasAttributes()) for (const l of i.getAttributeNames()) if (l.endsWith(oe)) {
          const u = p[o++], g = i.getAttribute(l).split(m), P = /([.?@])?(.*)/.exec(u);
          a.push({ type: 1, index: n, name: P[2], strings: g, ctor: P[1] === "." ? Ee : P[1] === "?" ? ke : P[1] === "@" ? Ce : N }), i.removeAttribute(l);
        } else l.startsWith(m) && (a.push({ type: 6, index: n }), i.removeAttribute(l));
        if (de.test(i.tagName)) {
          const l = i.textContent.split(m), u = l.length - 1;
          if (u > 0) {
            i.textContent = O ? O.emptyScript : "";
            for (let g = 0; g < u; g++) i.append(l[g], E()), b.nextNode(), a.push({ type: 2, index: ++n });
            i.append(l[u], E());
          }
        }
      } else if (i.nodeType === 8) if (i.data === ae) a.push({ type: 2, index: n });
      else {
        let l = -1;
        for (; (l = i.data.indexOf(m, l + 1)) !== -1; ) a.push({ type: 7, index: n }), l += m.length - 1;
      }
      n++;
    }
  }
  static createElement(e, t) {
    const s = x.createElement("template");
    return s.innerHTML = e, s;
  }
}
function _(r, e, t = r, s) {
  if (e === y) return e;
  let i = s !== void 0 ? t._$Co?.[s] : t._$Cl;
  const n = k(e) ? void 0 : e._$litDirective$;
  return i?.constructor !== n && (i?._$AO?.(!1), n === void 0 ? i = void 0 : (i = new n(r), i._$AT(r, t, s)), s !== void 0 ? (t._$Co ??= [])[s] = i : t._$Cl = i), i !== void 0 && (e = _(r, i._$AS(r, e.values), i, s)), e;
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
    const { el: { content: t }, parts: s } = this._$AD, i = (e?.creationScope ?? x).importNode(t, !0);
    b.currentNode = i;
    let n = b.nextNode(), o = 0, d = 0, a = s[0];
    for (; a !== void 0; ) {
      if (o === a.index) {
        let h;
        a.type === 2 ? h = new M(n, n.nextSibling, this, e) : a.type === 1 ? h = new a.ctor(n, a.name, a.strings, this, e) : a.type === 6 && (h = new Me(n, this, e)), this._$AV.push(h), a = s[++d];
      }
      o !== a?.index && (n = b.nextNode(), o++);
    }
    return b.currentNode = x, i;
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
    this.type = 2, this._$AH = c, this._$AN = void 0, this._$AA = e, this._$AB = t, this._$AM = s, this.options = i, this._$Cv = i?.isConnected ?? !0;
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
    e = _(this, e, t), k(e) ? e === c || e == null || e === "" ? (this._$AH !== c && this._$AR(), this._$AH = c) : e !== this._$AH && e !== y && this._(e) : e._$litType$ !== void 0 ? this.$(e) : e.nodeType !== void 0 ? this.T(e) : _e(e) ? this.k(e) : this._(e);
  }
  O(e) {
    return this._$AA.parentNode.insertBefore(e, this._$AB);
  }
  T(e) {
    this._$AH !== e && (this._$AR(), this._$AH = this.O(e));
  }
  _(e) {
    this._$AH !== c && k(this._$AH) ? this._$AA.nextSibling.data = e : this.T(x.createTextNode(e)), this._$AH = e;
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
    let t = ee.get(e.strings);
    return t === void 0 && ee.set(e.strings, t = new C(e)), t;
  }
  k(e) {
    j(this._$AH) || (this._$AH = [], this._$AR());
    const t = this._$AH;
    let s, i = 0;
    for (const n of e) i === t.length ? t.push(s = new M(this.O(E()), this.O(E()), this, this.options)) : s = t[i], s._$AI(n), i++;
    i < t.length && (this._$AR(s && s._$AB.nextSibling, i), t.length = i);
  }
  _$AR(e = this._$AA.nextSibling, t) {
    for (this._$AP?.(!1, !0, t); e !== this._$AB; ) {
      const s = K(e).nextSibling;
      K(e).remove(), e = s;
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
    this.type = 1, this._$AH = c, this._$AN = void 0, this.element = e, this.name = t, this._$AM = i, this.options = n, s.length > 2 || s[0] !== "" || s[1] !== "" ? (this._$AH = Array(s.length - 1).fill(new String()), this.strings = s) : this._$AH = c;
  }
  _$AI(e, t = this, s, i) {
    const n = this.strings;
    let o = !1;
    if (n === void 0) e = _(this, e, t, 0), o = !k(e) || e !== this._$AH && e !== y, o && (this._$AH = e);
    else {
      const d = e;
      let a, h;
      for (e = n[0], a = 0; a < n.length - 1; a++) h = _(this, d[s + a], t, a), h === y && (h = this._$AH[a]), o ||= !k(h) || h !== this._$AH[a], h === c ? e = c : e !== c && (e += (h ?? "") + n[a + 1]), this._$AH[a] = h;
    }
    o && !i && this.j(e);
  }
  j(e) {
    e === c ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, e ?? "");
  }
}
class Ee extends N {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(e) {
    this.element[this.name] = e === c ? void 0 : e;
  }
}
class ke extends N {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(e) {
    this.element.toggleAttribute(this.name, !!e && e !== c);
  }
}
class Ce extends N {
  constructor(e, t, s, i, n) {
    super(e, t, s, i, n), this.type = 5;
  }
  _$AI(e, t = this) {
    if ((e = _(this, e, t, 0) ?? c) === y) return;
    const s = this._$AH, i = e === c && s !== c || e.capture !== s.capture || e.once !== s.once || e.passive !== s.passive, n = e !== c && (s === c || i);
    i && this.element.removeEventListener(this.name, this, s), n && this.element.addEventListener(this.name, this, e), this._$AH = e;
  }
  handleEvent(e) {
    typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, e) : this._$AH.handleEvent(e);
  }
}
class Me {
  constructor(e, t, s) {
    this.element = e, this.type = 6, this._$AN = void 0, this._$AM = t, this.options = s;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(e) {
    _(this, e);
  }
}
const Pe = L.litHtmlPolyfillSupport;
Pe?.(C, M), (L.litHtmlVersions ??= []).push("3.3.2");
const De = (r, e, t) => {
  const s = t?.renderBefore ?? e;
  let i = s._$litPart$;
  if (i === void 0) {
    const n = t?.renderBefore ?? null;
    s._$litPart$ = i = new M(e.insertBefore(E(), n), n, void 0, t ?? {});
  }
  return i._$AI(r), i;
};
const B = globalThis;
class w extends v {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const e = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= e.firstChild, e;
  }
  update(e) {
    const t = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(e), this._$Do = De(t, this.renderRoot, this.renderOptions);
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
}
w._$litElement$ = !0, w.finalized = !0, B.litElementHydrateSupport?.({ LitElement: w });
const Oe = B.litElementPolyfillSupport;
Oe?.({ LitElement: w });
(B.litElementVersions ??= []).push("4.2.2");
function Ue(r = []) {
  return r.reduce(
    (e, t) => (t.has_pending_approval ? e.attention.push(t) : t.status === "running" ? e.running.push(t) : t.status === "completed" && t.has_unseen_turns ? e.attention.push(t) : e.idle.push(t), e),
    { attention: [], running: [], idle: [] }
  );
}
function Te(r, e = /* @__PURE__ */ new Date()) {
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
function Ne(r) {
  return !!(r.has_unseen_turns || r.hasUnseenActivity);
}
function Re(r) {
  return !!(r.has_running_dev_server || r.hasRunningDevServer);
}
function He(r) {
  return r.latest_process_status || r.latestProcessStatus;
}
function We(r) {
  return r.pr_status || r.prStatus;
}
function Ie(r) {
  return !!(r.is_pinned || r.isPinned);
}
function ze(r) {
  const e = [], t = r.status === "running", s = !t && ["failed", "killed"].includes(He(r) ?? ""), i = Ne(r), n = !!r.has_pending_approval, o = Re(r), d = We(r);
  o && e.push({ symbol: "🖥️", kind: "dev-server", tone: "brand" }), s && e.push({ symbol: "▲", kind: "process-error", tone: "error" }), n ? e.push({ symbol: "✋", kind: "approval", tone: "brand" }) : t && e.push({ symbol: "⋯", kind: "running", tone: "brand" }), i && !t && !s && e.push({ symbol: "●", kind: "unseen", tone: "brand" }), d === "open" ? e.push({ symbol: "⎇", kind: "pr-open", tone: "success" }) : d === "merged" && e.push({ symbol: "⎇", kind: "pr-merged", tone: "merged" }), Ie(r) && e.push({ symbol: "📌", kind: "pin", tone: "brand" }), e.length === 0 && e.push({ symbol: "•", kind: "idle", tone: "muted" });
  const a = t && !n ? "is-running" : n || r.status === "completed" && i ? "is-attention" : "is-idle";
  return {
    icons: e,
    accentClass: a
  };
}
const Le = he`
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
    gap: 14px;
    overflow-y: auto;
    padding: 6px 2px 6px 0;
  }

  .message-row {
    display: flex;
    width: 100%;
  }

  .message-row.is-user {
    justify-content: flex-start;
  }

  .message-row.is-ai {
    justify-content: flex-end;
  }

  .message-bubble {
    width: 100%;
    padding: 8px 10px;
    border-radius: 10px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 70%, transparent);
    color: inherit;
    text-align: left;
  }

  .message-row.is-ai .message-bubble {
    background: color-mix(in srgb, var(--primary-color, #f59e0b) 12%, transparent);
    text-align: right;
  }

  .dialog-composer {
    display: grid;
    gap: 8px;
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

  .dialog-action-secondary {
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 72%, transparent);
    background: transparent;
    color: inherit;
    font-weight: 600;
  }

  .dialog-feedback {
    min-height: 1.25rem;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.8rem;
    line-height: 1.4;
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
`, te = [
  { sender: "user", text: "请先确认这个工作区的下一步安排。" },
  { sender: "ai", text: "我先整理最新状态，稍后给你结论。" },
  { sender: "user", text: "如果需要审批，直接告诉我卡在哪一步。" },
  { sender: "ai", text: "目前还差最后一条确认消息，我会继续跟进。" },
  { sender: "user", text: "如果下午还没有结果，就先给我一个阻塞说明。" },
  { sender: "ai", text: "可以，我会先把阻塞点、影响范围和建议处理顺序写清楚。" },
  { sender: "user", text: "顺便看下是不是有人还没回复你。" },
  { sender: "ai", text: "我已经补发了一次提醒，接下来等对方确认后再继续推进。" },
  { sender: "user", text: "如果对方继续没回复，就先给我一个备选方案。" },
  { sender: "ai", text: "明白，我会准备一个不依赖对方输入的降级处理方案。" },
  { sender: "user", text: "晚上之前给我一个阶段性结论。" },
  { sender: "ai", text: "好的，今晚之前我会回传当前进度、阻塞点和建议动作。" },
  { sender: "user", text: "如果需要我拍板，直接把选项写清楚。" },
  { sender: "ai", text: "收到，我会把可选方案整理成简短列表，方便你直接决策。" },
  { sender: "user", text: "先继续推进，有更新就按这个线程同步。" }
], se = [
  { sender: "user", text: "运行中的任务目前有新的输出吗？" },
  { sender: "ai", text: "有，刚刚补充了一段新的处理结果，还在继续执行。" },
  { sender: "user", text: "先盯住结果，如果异常就立刻提醒我。" },
  { sender: "ai", text: "收到，我会在异常出现时第一时间同步。" },
  { sender: "user", text: "日志里面如果出现重复重试，也一起带上。" },
  { sender: "ai", text: "好的，我会继续观察日志，并在下一轮输出后同步你。" },
  { sender: "user", text: "如果今晚之前能跑完，就顺手帮我总结一次。" },
  { sender: "ai", text: "明白，结束后我会整理一版简短总结放在最后一条消息里。" },
  { sender: "user", text: "有没有发现性能抖动或者处理延迟？" },
  { sender: "ai", text: "目前有轻微波动，但还没超过预期阈值，我会继续监控。" },
  { sender: "user", text: "如果延迟继续升高，就优先保结果不要保速度。" },
  { sender: "ai", text: "了解，我会先确保结果稳定，再考虑吞吐表现。" },
  { sender: "user", text: "下一轮输出后把关键日志摘给我。" },
  { sender: "ai", text: "可以，我会只保留关键片段，避免消息太长影响阅读。" },
  { sender: "user", text: "继续跑，先不要中断。" }
], ie = [
  { sender: "user", text: "这个任务已经结束了吗？" },
  { sender: "ai", text: "已经结束，当前没有新的待处理动作。" },
  { sender: "user", text: "那先保留记录，后续有变更再通知。" },
  { sender: "ai", text: "好的，我会保留上下文并等待下一步指令。" },
  { sender: "user", text: "之前确认过的问题点也一起保留下来。" },
  { sender: "ai", text: "已记录，后续如果重新打开这个任务，我会先把这些点带出来。" },
  { sender: "user", text: "那就先这样，今天不用再继续追了。" },
  { sender: "ai", text: "收到，当前先保持静默，等待新的输入。" },
  { sender: "user", text: "如果有人重新提这个任务，就先提醒我历史结论。" },
  { sender: "ai", text: "可以，我会优先附上之前的结论和保留意见。" },
  { sender: "user", text: "这条线程先别清掉，可能明天还要继续。" },
  { sender: "ai", text: "明白，我会保留完整上下文，方便后续直接续接。" },
  { sender: "user", text: "若有新的相关消息，也合并到这里。" },
  { sender: "ai", text: "可以，相关更新我会继续归档到同一个会话中。" },
  { sender: "user", text: "好，先归档但不要删除。" }
], je = [
  { sender: "user", text: "这个失败任务现在卡在哪里？" },
  { sender: "ai", text: "当前卡在最后一步校验，前面的处理已经完成。" },
  { sender: "user", text: "先确认是不是输入条件有变化。" },
  { sender: "ai", text: "我正在回看最近一次输入，暂时没看到明显变更。" },
  { sender: "user", text: "如果不是输入问题，就查执行链路。" },
  { sender: "ai", text: "明白，我会沿着执行链路逐步排查失败位置。" },
  { sender: "user", text: "把你认为最可能的三个原因列出来。" },
  { sender: "ai", text: "目前优先怀疑依赖超时、重试失效和状态回写异常。" },
  { sender: "user", text: "先验证最便宜的那个。" },
  { sender: "ai", text: "我会优先检查依赖超时和日志缺口，这两项验证成本最低。" },
  { sender: "user", text: "如果 30 分钟内没有结果，就先发阻塞说明。" },
  { sender: "ai", text: "收到，超时后我会先给你阻塞说明和下一步建议。" },
  { sender: "user", text: "别直接重跑，先搞清楚根因。" },
  { sender: "ai", text: "了解，在没有根因前我不会盲目重试。" },
  { sender: "user", text: "继续查，有进展就发这里。" }
], Be = [
  { key: "attention", label: "需要注意" },
  { key: "running", label: "运行中" },
  { key: "idle", label: "空闲" }
], U = class U extends w {
  constructor() {
    super(...arguments), this.collapsedSections = /* @__PURE__ */ new Set(), this.messageDraft = "", this.actionFeedback = "", this.closeWorkspaceDialog = () => {
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
    return f`
      <ha-card>
        <div class="board">
          ${e.length === 0 ? f`<div class="empty-state">当前没有任务</div>` : e.map(
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
    return f`
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
        ${i ? c : f`
              <div class="section-body">
                ${s.map((n) => this.renderWorkspace(n))}
              </div>
            `}
      </section>
    `;
  }
  renderWorkspace(e) {
    const t = ze(e), { relativeTime: s, filesChanged: i, linesAdded: n, linesRemoved: o } = this.getWorkspaceDisplayMeta(e);
    return f`
      <button
        class="task-card ${t.accentClass}"
        type="button"
        @click=${() => this.openWorkspaceDialog(e)}
      >
        <div class="workspace-name">${e.name}</div>
        <div class="task-meta">
          <span class="meta-status">
            ${t.icons.map(
      (d) => f`<span class="status-icon tone-${d.tone} kind-${d.kind}"
                >${d.symbol}</span
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
      return c;
    const t = this.getDialogMessages(e);
    return f`
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
      (s) => f`
                  <div class="message-row is-${s.sender}">
                    <div class="message-bubble">${s.text}</div>
                  </div>
                `
    )}
            </div>
          </section>

          <div class="dialog-composer">
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
                @click=${() => this.handleActionClick("send")}
              >
                发送消息
              </button>
              <button
                class="dialog-action dialog-action-secondary"
                type="button"
                @click=${() => this.handleActionClick("queue")}
              >
                队列消息
              </button>
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
    this.actionFeedback = e === "send" ? "发送消息功能暂未接入，当前仅展示界面。" : "队列消息功能暂未接入，当前仅展示界面。";
  }
  getWorkspaceDisplayMeta(e) {
    const t = e.relative_time || (e.status === "completed" ? e.completed_at ?? this.entityAttributes?.updated_at : this.entityAttributes?.updated_at);
    return {
      relativeTime: e.relative_time || Te(t),
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
    const e = Ue(this.normalizedWorkspaces);
    return Be.map(({ key: t, label: s }) => ({
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
    return {
      "attention-1": te,
      "approval-needed": te,
      "running-1": se,
      "running-active": se,
      "idle-1": ie,
      "idle-completed": ie,
      "attention-failed": je
    }[e.id] ?? [
      { sender: "user", text: `请同步 ${e.name} 的最新情况。` },
      { sender: "ai", text: "我正在整理消息记录，稍后继续反馈。" }
    ];
  }
  scrollMessagesToBottom() {
    const e = this.renderRoot.querySelector(".message-list");
    e && (e.scrollTop = e.scrollHeight);
  }
};
U.styles = Le, U.properties = {
  hass: { attribute: !1 },
  collapsedSections: { state: !0 },
  selectedWorkspaceId: { state: !0 },
  messageDraft: { state: !0 },
  actionFeedback: { state: !0 }
};
let W = U;
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
