const U = globalThis, D = U.ShadowRoot && (U.ShadyCSS === void 0 || U.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, j = /* @__PURE__ */ Symbol(), q = /* @__PURE__ */ new WeakMap();
let st = class {
  constructor(t, e, s) {
    if (this._$cssResult$ = !0, s !== j) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t, this.t = e;
  }
  get styleSheet() {
    let t = this.o;
    const e = this.t;
    if (D && t === void 0) {
      const s = e !== void 0 && e.length === 1;
      s && (t = q.get(e)), t === void 0 && ((this.o = t = new CSSStyleSheet()).replaceSync(this.cssText), s && q.set(e, t));
    }
    return t;
  }
  toString() {
    return this.cssText;
  }
};
const ct = (r) => new st(typeof r == "string" ? r : r + "", void 0, j), lt = (r, ...t) => {
  const e = r.length === 1 ? r[0] : t.reduce((s, i, n) => s + ((o) => {
    if (o._$cssResult$ === !0) return o.cssText;
    if (typeof o == "number") return o;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + o + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(i) + r[n + 1], r[0]);
  return new st(e, r, j);
}, dt = (r, t) => {
  if (D) r.adoptedStyleSheets = t.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet);
  else for (const e of t) {
    const s = document.createElement("style"), i = U.litNonce;
    i !== void 0 && s.setAttribute("nonce", i), s.textContent = e.cssText, r.appendChild(s);
  }
}, F = D ? (r) => r : (r) => r instanceof CSSStyleSheet ? ((t) => {
  let e = "";
  for (const s of t.cssRules) e += s.cssText;
  return ct(e);
})(r) : r;
const { is: ht, defineProperty: pt, getOwnPropertyDescriptor: ut, getOwnPropertyNames: ft, getOwnPropertySymbols: gt, getPrototypeOf: mt } = Object, R = globalThis, J = R.trustedTypes, $t = J ? J.emptyScript : "", bt = R.reactiveElementPolyfillSupport, S = (r, t) => r, I = { toAttribute(r, t) {
  switch (t) {
    case Boolean:
      r = r ? $t : null;
      break;
    case Object:
    case Array:
      r = r == null ? r : JSON.stringify(r);
  }
  return r;
}, fromAttribute(r, t) {
  let e = r;
  switch (t) {
    case Boolean:
      e = r !== null;
      break;
    case Number:
      e = r === null ? null : Number(r);
      break;
    case Object:
    case Array:
      try {
        e = JSON.parse(r);
      } catch {
        e = null;
      }
  }
  return e;
} }, it = (r, t) => !ht(r, t), Z = { attribute: !0, type: String, converter: I, reflect: !1, useDefault: !1, hasChanged: it };
Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), R.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
let y = class extends HTMLElement {
  static addInitializer(t) {
    this._$Ei(), (this.l ??= []).push(t);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t, e = Z) {
    if (e.state && (e.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(t) && ((e = Object.create(e)).wrapped = !0), this.elementProperties.set(t, e), !e.noAccessor) {
      const s = /* @__PURE__ */ Symbol(), i = this.getPropertyDescriptor(t, s, e);
      i !== void 0 && pt(this.prototype, t, i);
    }
  }
  static getPropertyDescriptor(t, e, s) {
    const { get: i, set: n } = ut(this.prototype, t) ?? { get() {
      return this[e];
    }, set(o) {
      this[e] = o;
    } };
    return { get: i, set(o) {
      const c = i?.call(this);
      n?.call(this, o), this.requestUpdate(t, c, s);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(t) {
    return this.elementProperties.get(t) ?? Z;
  }
  static _$Ei() {
    if (this.hasOwnProperty(S("elementProperties"))) return;
    const t = mt(this);
    t.finalize(), t.l !== void 0 && (this.l = [...t.l]), this.elementProperties = new Map(t.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(S("finalized"))) return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(S("properties"))) {
      const e = this.properties, s = [...ft(e), ...gt(e)];
      for (const i of s) this.createProperty(i, e[i]);
    }
    const t = this[Symbol.metadata];
    if (t !== null) {
      const e = litPropertyMetadata.get(t);
      if (e !== void 0) for (const [s, i] of e) this.elementProperties.set(s, i);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [e, s] of this.elementProperties) {
      const i = this._$Eu(e, s);
      i !== void 0 && this._$Eh.set(i, e);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(t) {
    const e = [];
    if (Array.isArray(t)) {
      const s = new Set(t.flat(1 / 0).reverse());
      for (const i of s) e.unshift(F(i));
    } else t !== void 0 && e.push(F(t));
    return e;
  }
  static _$Eu(t, e) {
    const s = e.attribute;
    return s === !1 ? void 0 : typeof s == "string" ? s : typeof t == "string" ? t.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t) => this.enableUpdating = t), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t) => t(this));
  }
  addController(t) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t), this.renderRoot !== void 0 && this.isConnected && t.hostConnected?.();
  }
  removeController(t) {
    this._$EO?.delete(t);
  }
  _$E_() {
    const t = /* @__PURE__ */ new Map(), e = this.constructor.elementProperties;
    for (const s of e.keys()) this.hasOwnProperty(s) && (t.set(s, this[s]), delete this[s]);
    t.size > 0 && (this._$Ep = t);
  }
  createRenderRoot() {
    const t = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return dt(t, this.constructor.elementStyles), t;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(!0), this._$EO?.forEach((t) => t.hostConnected?.());
  }
  enableUpdating(t) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t) => t.hostDisconnected?.());
  }
  attributeChangedCallback(t, e, s) {
    this._$AK(t, s);
  }
  _$ET(t, e) {
    const s = this.constructor.elementProperties.get(t), i = this.constructor._$Eu(t, s);
    if (i !== void 0 && s.reflect === !0) {
      const n = (s.converter?.toAttribute !== void 0 ? s.converter : I).toAttribute(e, s.type);
      this._$Em = t, n == null ? this.removeAttribute(i) : this.setAttribute(i, n), this._$Em = null;
    }
  }
  _$AK(t, e) {
    const s = this.constructor, i = s._$Eh.get(t);
    if (i !== void 0 && this._$Em !== i) {
      const n = s.getPropertyOptions(i), o = typeof n.converter == "function" ? { fromAttribute: n.converter } : n.converter?.fromAttribute !== void 0 ? n.converter : I;
      this._$Em = i;
      const c = o.fromAttribute(e, n.type);
      this[i] = c ?? this._$Ej?.get(i) ?? c, this._$Em = null;
    }
  }
  requestUpdate(t, e, s, i = !1, n) {
    if (t !== void 0) {
      const o = this.constructor;
      if (i === !1 && (n = this[t]), s ??= o.getPropertyOptions(t), !((s.hasChanged ?? it)(n, e) || s.useDefault && s.reflect && n === this._$Ej?.get(t) && !this.hasAttribute(o._$Eu(t, s)))) return;
      this.C(t, e, s);
    }
    this.isUpdatePending === !1 && (this._$ES = this._$EP());
  }
  C(t, e, { useDefault: s, reflect: i, wrapped: n }, o) {
    s && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t) && (this._$Ej.set(t, o ?? e ?? this[t]), n !== !0 || o !== void 0) || (this._$AL.has(t) || (this.hasUpdated || s || (e = void 0), this._$AL.set(t, e)), i === !0 && this._$Em !== t && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t));
  }
  async _$EP() {
    this.isUpdatePending = !0;
    try {
      await this._$ES;
    } catch (e) {
      Promise.reject(e);
    }
    const t = this.scheduleUpdate();
    return t != null && await t, !this.isUpdatePending;
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
        const { wrapped: o } = n, c = this[i];
        o !== !0 || this._$AL.has(i) || c === void 0 || this.C(i, void 0, n, c);
      }
    }
    let t = !1;
    const e = this._$AL;
    try {
      t = this.shouldUpdate(e), t ? (this.willUpdate(e), this._$EO?.forEach((s) => s.hostUpdate?.()), this.update(e)) : this._$EM();
    } catch (s) {
      throw t = !1, this._$EM(), s;
    }
    t && this._$AE(e);
  }
  willUpdate(t) {
  }
  _$AE(t) {
    this._$EO?.forEach((e) => e.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(t)), this.updated(t);
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
  shouldUpdate(t) {
    return !0;
  }
  update(t) {
    this._$Eq &&= this._$Eq.forEach((e) => this._$ET(e, this[e])), this._$EM();
  }
  updated(t) {
  }
  firstUpdated(t) {
  }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[S("elementProperties")] = /* @__PURE__ */ new Map(), y[S("finalized")] = /* @__PURE__ */ new Map(), bt?.({ ReactiveElement: y }), (R.reactiveElementVersions ??= []).push("2.1.2");
const L = globalThis, K = (r) => r, O = L.trustedTypes, G = O ? O.createPolicy("lit-html", { createHTML: (r) => r }) : void 0, rt = "$lit$", m = `lit$${Math.random().toFixed(9).slice(2)}$`, nt = "?" + m, vt = `<${nt}>`, v = document, E = () => v.createComment(""), k = (r) => r === null || typeof r != "object" && typeof r != "function", B = Array.isArray, yt = (r) => B(r) || typeof r?.[Symbol.iterator] == "function", T = `[ 	
\f\r]`, x = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, Q = /-->/g, X = />/g, $ = RegExp(`>|${T}(?:([^\\s"'>=/]+)(${T}*=${T}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), Y = /'/g, tt = /"/g, ot = /^(?:script|style|textarea|title)$/i, _t = (r) => (t, ...e) => ({ _$litType$: r, strings: t, values: e }), u = _t(1), _ = /* @__PURE__ */ Symbol.for("lit-noChange"), d = /* @__PURE__ */ Symbol.for("lit-nothing"), et = /* @__PURE__ */ new WeakMap(), b = v.createTreeWalker(v, 129);
function at(r, t) {
  if (!B(r) || !r.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return G !== void 0 ? G.createHTML(t) : t;
}
const At = (r, t) => {
  const e = r.length - 1, s = [];
  let i, n = t === 2 ? "<svg>" : t === 3 ? "<math>" : "", o = x;
  for (let c = 0; c < e; c++) {
    const a = r[c];
    let h, p, l = -1, f = 0;
    for (; f < a.length && (o.lastIndex = f, p = o.exec(a), p !== null); ) f = o.lastIndex, o === x ? p[1] === "!--" ? o = Q : p[1] !== void 0 ? o = X : p[2] !== void 0 ? (ot.test(p[2]) && (i = RegExp("</" + p[2], "g")), o = $) : p[3] !== void 0 && (o = $) : o === $ ? p[0] === ">" ? (o = i ?? x, l = -1) : p[1] === void 0 ? l = -2 : (l = o.lastIndex - p[2].length, h = p[1], o = p[3] === void 0 ? $ : p[3] === '"' ? tt : Y) : o === tt || o === Y ? o = $ : o === Q || o === X ? o = x : (o = $, i = void 0);
    const g = o === $ && r[c + 1].startsWith("/>") ? " " : "";
    n += o === x ? a + vt : l >= 0 ? (s.push(h), a.slice(0, l) + rt + a.slice(l) + m + g) : a + m + (l === -2 ? c : g);
  }
  return [at(r, n + (r[e] || "<?>") + (t === 2 ? "</svg>" : t === 3 ? "</math>" : "")), s];
};
class C {
  constructor({ strings: t, _$litType$: e }, s) {
    let i;
    this.parts = [];
    let n = 0, o = 0;
    const c = t.length - 1, a = this.parts, [h, p] = At(t, e);
    if (this.el = C.createElement(h, s), b.currentNode = this.el.content, e === 2 || e === 3) {
      const l = this.el.content.firstChild;
      l.replaceWith(...l.childNodes);
    }
    for (; (i = b.nextNode()) !== null && a.length < c; ) {
      if (i.nodeType === 1) {
        if (i.hasAttributes()) for (const l of i.getAttributeNames()) if (l.endsWith(rt)) {
          const f = p[o++], g = i.getAttribute(l).split(m), M = /([.?@])?(.*)/.exec(f);
          a.push({ type: 1, index: n, name: M[2], strings: g, ctor: M[1] === "." ? St : M[1] === "?" ? wt : M[1] === "@" ? Et : H }), i.removeAttribute(l);
        } else l.startsWith(m) && (a.push({ type: 6, index: n }), i.removeAttribute(l));
        if (ot.test(i.tagName)) {
          const l = i.textContent.split(m), f = l.length - 1;
          if (f > 0) {
            i.textContent = O ? O.emptyScript : "";
            for (let g = 0; g < f; g++) i.append(l[g], E()), b.nextNode(), a.push({ type: 2, index: ++n });
            i.append(l[f], E());
          }
        }
      } else if (i.nodeType === 8) if (i.data === nt) a.push({ type: 2, index: n });
      else {
        let l = -1;
        for (; (l = i.data.indexOf(m, l + 1)) !== -1; ) a.push({ type: 7, index: n }), l += m.length - 1;
      }
      n++;
    }
  }
  static createElement(t, e) {
    const s = v.createElement("template");
    return s.innerHTML = t, s;
  }
}
function A(r, t, e = r, s) {
  if (t === _) return t;
  let i = s !== void 0 ? e._$Co?.[s] : e._$Cl;
  const n = k(t) ? void 0 : t._$litDirective$;
  return i?.constructor !== n && (i?._$AO?.(!1), n === void 0 ? i = void 0 : (i = new n(r), i._$AT(r, e, s)), s !== void 0 ? (e._$Co ??= [])[s] = i : e._$Cl = i), i !== void 0 && (t = A(r, i._$AS(r, t.values), i, s)), t;
}
class xt {
  constructor(t, e) {
    this._$AV = [], this._$AN = void 0, this._$AD = t, this._$AM = e;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t) {
    const { el: { content: e }, parts: s } = this._$AD, i = (t?.creationScope ?? v).importNode(e, !0);
    b.currentNode = i;
    let n = b.nextNode(), o = 0, c = 0, a = s[0];
    for (; a !== void 0; ) {
      if (o === a.index) {
        let h;
        a.type === 2 ? h = new P(n, n.nextSibling, this, t) : a.type === 1 ? h = new a.ctor(n, a.name, a.strings, this, t) : a.type === 6 && (h = new kt(n, this, t)), this._$AV.push(h), a = s[++c];
      }
      o !== a?.index && (n = b.nextNode(), o++);
    }
    return b.currentNode = v, i;
  }
  p(t) {
    let e = 0;
    for (const s of this._$AV) s !== void 0 && (s.strings !== void 0 ? (s._$AI(t, s, e), e += s.strings.length - 2) : s._$AI(t[e])), e++;
  }
}
class P {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t, e, s, i) {
    this.type = 2, this._$AH = d, this._$AN = void 0, this._$AA = t, this._$AB = e, this._$AM = s, this.options = i, this._$Cv = i?.isConnected ?? !0;
  }
  get parentNode() {
    let t = this._$AA.parentNode;
    const e = this._$AM;
    return e !== void 0 && t?.nodeType === 11 && (t = e.parentNode), t;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t, e = this) {
    t = A(this, t, e), k(t) ? t === d || t == null || t === "" ? (this._$AH !== d && this._$AR(), this._$AH = d) : t !== this._$AH && t !== _ && this._(t) : t._$litType$ !== void 0 ? this.$(t) : t.nodeType !== void 0 ? this.T(t) : yt(t) ? this.k(t) : this._(t);
  }
  O(t) {
    return this._$AA.parentNode.insertBefore(t, this._$AB);
  }
  T(t) {
    this._$AH !== t && (this._$AR(), this._$AH = this.O(t));
  }
  _(t) {
    this._$AH !== d && k(this._$AH) ? this._$AA.nextSibling.data = t : this.T(v.createTextNode(t)), this._$AH = t;
  }
  $(t) {
    const { values: e, _$litType$: s } = t, i = typeof s == "number" ? this._$AC(t) : (s.el === void 0 && (s.el = C.createElement(at(s.h, s.h[0]), this.options)), s);
    if (this._$AH?._$AD === i) this._$AH.p(e);
    else {
      const n = new xt(i, this), o = n.u(this.options);
      n.p(e), this.T(o), this._$AH = n;
    }
  }
  _$AC(t) {
    let e = et.get(t.strings);
    return e === void 0 && et.set(t.strings, e = new C(t)), e;
  }
  k(t) {
    B(this._$AH) || (this._$AH = [], this._$AR());
    const e = this._$AH;
    let s, i = 0;
    for (const n of t) i === e.length ? e.push(s = new P(this.O(E()), this.O(E()), this, this.options)) : s = e[i], s._$AI(n), i++;
    i < e.length && (this._$AR(s && s._$AB.nextSibling, i), e.length = i);
  }
  _$AR(t = this._$AA.nextSibling, e) {
    for (this._$AP?.(!1, !0, e); t !== this._$AB; ) {
      const s = K(t).nextSibling;
      K(t).remove(), t = s;
    }
  }
  setConnected(t) {
    this._$AM === void 0 && (this._$Cv = t, this._$AP?.(t));
  }
}
class H {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t, e, s, i, n) {
    this.type = 1, this._$AH = d, this._$AN = void 0, this.element = t, this.name = e, this._$AM = i, this.options = n, s.length > 2 || s[0] !== "" || s[1] !== "" ? (this._$AH = Array(s.length - 1).fill(new String()), this.strings = s) : this._$AH = d;
  }
  _$AI(t, e = this, s, i) {
    const n = this.strings;
    let o = !1;
    if (n === void 0) t = A(this, t, e, 0), o = !k(t) || t !== this._$AH && t !== _, o && (this._$AH = t);
    else {
      const c = t;
      let a, h;
      for (t = n[0], a = 0; a < n.length - 1; a++) h = A(this, c[s + a], e, a), h === _ && (h = this._$AH[a]), o ||= !k(h) || h !== this._$AH[a], h === d ? t = d : t !== d && (t += (h ?? "") + n[a + 1]), this._$AH[a] = h;
    }
    o && !i && this.j(t);
  }
  j(t) {
    t === d ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t ?? "");
  }
}
class St extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t) {
    this.element[this.name] = t === d ? void 0 : t;
  }
}
class wt extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t) {
    this.element.toggleAttribute(this.name, !!t && t !== d);
  }
}
class Et extends H {
  constructor(t, e, s, i, n) {
    super(t, e, s, i, n), this.type = 5;
  }
  _$AI(t, e = this) {
    if ((t = A(this, t, e, 0) ?? d) === _) return;
    const s = this._$AH, i = t === d && s !== d || t.capture !== s.capture || t.once !== s.once || t.passive !== s.passive, n = t !== d && (s === d || i);
    i && this.element.removeEventListener(this.name, this, s), n && this.element.addEventListener(this.name, this, t), this._$AH = t;
  }
  handleEvent(t) {
    typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, t) : this._$AH.handleEvent(t);
  }
}
class kt {
  constructor(t, e, s) {
    this.element = t, this.type = 6, this._$AN = void 0, this._$AM = e, this.options = s;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t) {
    A(this, t);
  }
}
const Ct = L.litHtmlPolyfillSupport;
Ct?.(C, P), (L.litHtmlVersions ??= []).push("3.3.2");
const Pt = (r, t, e) => {
  const s = e?.renderBefore ?? t;
  let i = s._$litPart$;
  if (i === void 0) {
    const n = e?.renderBefore ?? null;
    s._$litPart$ = i = new P(t.insertBefore(E(), n), n, void 0, e ?? {});
  }
  return i._$AI(r), i;
};
const V = globalThis;
class w extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t.firstChild, t;
  }
  update(t) {
    const e = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t), this._$Do = Pt(e, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(!0);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(!1);
  }
  render() {
    return _;
  }
}
w._$litElement$ = !0, w.finalized = !0, V.litElementHydrateSupport?.({ LitElement: w });
const Mt = V.litElementPolyfillSupport;
Mt?.({ LitElement: w });
(V.litElementVersions ??= []).push("4.2.2");
function Ut(r = []) {
  return r.reduce(
    (t, e) => (e.has_pending_approval ? t.attention.push(e) : e.status === "running" ? t.running.push(e) : e.status === "completed" && e.has_unseen_turns ? t.attention.push(e) : t.idle.push(e), t),
    { attention: [], running: [], idle: [] }
  );
}
function z(r, t = /* @__PURE__ */ new Date()) {
  if (!r)
    return "recently";
  const e = Date.parse(r);
  if (Number.isNaN(e))
    return "recently";
  const s = t.getTime() - e;
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
function Ot(r) {
  return !!(r.has_unseen_turns || r.hasUnseenActivity);
}
function Nt(r) {
  return !!(r.has_running_dev_server || r.hasRunningDevServer);
}
function Rt(r) {
  return r.latest_process_status || r.latestProcessStatus;
}
function Ht(r) {
  return r.pr_status || r.prStatus;
}
function Tt(r) {
  return !!(r.is_pinned || r.isPinned);
}
function zt(r) {
  const t = [], e = r.status === "running", s = !e && ["failed", "killed"].includes(Rt(r) ?? ""), i = Ot(r), n = !!r.has_pending_approval, o = Nt(r), c = Ht(r);
  o && t.push({ symbol: "🖥️", kind: "dev-server", tone: "brand" }), s && t.push({ symbol: "▲", kind: "process-error", tone: "error" }), n ? t.push({ symbol: "✋", kind: "approval", tone: "brand" }) : e && t.push({ symbol: "⋯", kind: "running", tone: "brand" }), i && !e && !s && t.push({ symbol: "●", kind: "unseen", tone: "brand" }), c === "open" ? t.push({ symbol: "⎇", kind: "pr-open", tone: "success" }) : c === "merged" && t.push({ symbol: "⎇", kind: "pr-merged", tone: "merged" }), Tt(r) && t.push({ symbol: "📌", kind: "pin", tone: "brand" }), t.length === 0 && t.push({ symbol: "•", kind: "idle", tone: "muted" });
  const a = e && !n ? "is-running" : n || r.status === "completed" && i ? "is-attention" : "is-idle";
  return {
    icons: t,
    accentClass: a
  };
}
const It = lt`
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
    padding: 10px 12px;
    border-radius: 12px;
    width: 100%;
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

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.48);
  }

  .conversation-dialog {
    width: min(720px, 100%);
    max-height: min(80vh, 720px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 14px;
    overflow: hidden;
    border-radius: 20px;
    padding: 18px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--primary-color, #f59e0b) 8%, var(--ha-card-background, var(--card-background-color, #ffffff))) 0%, var(--ha-card-background, var(--card-background-color, #ffffff)) 100%);
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 65%, transparent);
    box-shadow: 0 20px 48px rgba(15, 23, 42, 0.28);
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .dialog-title {
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .dialog-subtitle {
    margin-top: 4px;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.8rem;
    word-break: break-all;
  }

  .dialog-close {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 85%, transparent);
    color: var(--secondary-text-color, #64748b);
    cursor: pointer;
    font-size: 1.2rem;
    line-height: 1;
  }

  .dialog-empty,
  .conversation-list {
    min-height: 0;
    overflow: auto;
  }

  .dialog-empty {
    display: grid;
    place-items: center;
    padding: 28px 16px;
    border-radius: 14px;
    color: var(--secondary-text-color, #94a3b8);
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 70%, transparent);
  }

  .conversation-list {
    display: grid;
    gap: 10px;
  }

  .conversation-item {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 55%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 55%, transparent);
  }

  .conversation-item.role-user {
    background: color-mix(in srgb, var(--primary-color, #f59e0b) 10%, var(--ha-card-background, var(--card-background-color, #ffffff)));
  }

  .conversation-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .conversation-role {
    font-weight: 700;
  }

  .conversation-content {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }
`, Wt = [
  { key: "attention", label: "需要注意" },
  { key: "running", label: "运行中" },
  { key: "idle", label: "空闲" }
], N = class N extends w {
  constructor() {
    super(...arguments), this.collapsedSections = /* @__PURE__ */ new Set();
  }
  setConfig(t) {
    if (!t?.entity)
      throw new Error("`entity` is required");
    this.config = t;
  }
  getCardSize() {
    return Math.max(1, this.visibleSections.length * 2);
  }
  render() {
    const t = this.visibleSections;
    return u`
      <ha-card>
        <div class="board">
          ${t.length === 0 ? u`<div class="empty-state">当前没有任务</div>` : t.map(
      ({ key: e, label: s, workspaces: i }) => this.renderSection(e, s, i)
    )}
        </div>
        ${this.renderConversationDialog()}
      </ha-card>
    `;
  }
  renderSection(t, e, s) {
    const i = this.collapsedSections.has(t);
    return u`
      <section class="section" ?collapsed=${i}>
        <button
          class="section-toggle"
          type="button"
          @click=${() => this.toggleSection(t)}
        >
          <span class="section-title-row">
            <span class="section-title">${e}</span>
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
  renderWorkspace(t) {
    const e = zt(t), s = t.relative_time || (t.status === "completed" ? t.completed_at ?? this.entityAttributes?.updated_at : this.entityAttributes?.updated_at), i = t.relative_time || z(s), n = t.files_changed ?? 0, o = t.lines_added ?? 0, c = t.lines_removed ?? 0;
    return u`
      <button
        class="task-card ${e.accentClass}"
        type="button"
        @click=${() => this.openConversation(t.id)}
      >
        <div class="workspace-name">${t.name}</div>
        <div class="task-meta">
          <span class="meta-status">
            ${e.icons.map(
      (a) => u`<span class="status-icon tone-${a.tone} kind-${a.kind}"
                >${a.symbol}</span
              >`
    )}
          </span>
          <span class="relative-time">${i}</span>
          <span class="meta-files"
            ><span class="file-count">📄 ${n}</span> <span
              class="lines-added"
              >+${o}</span
            >
            <span class="lines-removed">-${c}</span></span
          >
        </div>
      </button>
    `;
  }
  toggleSection(t) {
    const e = new Set(this.collapsedSections);
    e.has(t) ? e.delete(t) : e.add(t), this.collapsedSections = e;
  }
  openConversation(t) {
    this.selectedWorkspaceId = t;
  }
  closeConversation() {
    this.selectedWorkspaceId = void 0;
  }
  get entityAttributes() {
    if (!(!this.hass || !this.config?.entity))
      return this.hass.states[this.config.entity]?.attributes;
  }
  get visibleSections() {
    const t = Ut(this.normalizedWorkspaces);
    return Wt.map(({ key: e, label: s }) => ({
      key: e,
      label: s,
      workspaces: t[e]
    })).filter((e) => e.workspaces.length > 0);
  }
  get normalizedWorkspaces() {
    const t = this.entityAttributes?.workspaces;
    if (Array.isArray(t))
      return t.filter(this.isWorkspaceLike);
    if (typeof t == "string")
      try {
        const e = JSON.parse(t);
        return Array.isArray(e) ? e.filter(this.isWorkspaceLike) : [];
      } catch {
        return [];
      }
    return [];
  }
  isWorkspaceLike(t) {
    return !!(t && typeof t == "object" && "id" in t && "name" in t && typeof t.id == "string" && typeof t.name == "string");
  }
  renderConversationDialog() {
    const t = this.selectedWorkspace;
    if (!t)
      return d;
    const e = this.sessionAttributesForWorkspace(t), s = this.sessionMessages(e), i = e?.updated_at ? z(e.updated_at) : "";
    return u`
      <div class="dialog-backdrop" @click=${this.closeConversation}>
        <section
          class="conversation-dialog"
          @click=${(n) => n.stopPropagation()}
        >
          <div class="dialog-header">
            <div>
              <div class="dialog-title">${t.name}</div>
              <div class="dialog-subtitle">
                ${t.latest_session_id ?? t.latestSessionId ?? "无 session"}
                ${i ? u`<span>· ${i}</span>` : d}
              </div>
            </div>
            <button
              class="dialog-close"
              type="button"
              @click=${this.closeConversation}
              aria-label="关闭对话弹窗"
            >
              ×
            </button>
          </div>
          ${s.length === 0 ? u`<div class="dialog-empty">暂无对话记录</div>` : u`
                <div class="conversation-list">
                  ${s.map((n) => this.renderConversationMessage(n))}
                </div>
              `}
        </section>
      </div>
    `;
  }
  renderConversationMessage(t) {
    const e = (t.role ?? "assistant").toLowerCase(), s = t.timestamp ? z(t.timestamp) : "";
    return u`
      <article class="conversation-item role-${e}">
        <div class="conversation-meta">
          <span class="conversation-role">${e}</span>
          ${s ? u`<span class="conversation-time">${s}</span>` : d}
        </div>
        <div class="conversation-content">${t.content ?? ""}</div>
      </article>
    `;
  }
  get selectedWorkspace() {
    if (this.selectedWorkspaceId)
      return this.normalizedWorkspaces.find((t) => t.id === this.selectedWorkspaceId);
  }
  sessionAttributesForWorkspace(t) {
    const e = t.latest_session_id ?? t.latestSessionId;
    if (!e || !this.hass?.states)
      return;
    for (const i of Object.values(this.hass.states)) {
      const n = this.asSessionAttributes(i.attributes);
      if ((n?.session_id ?? n?.sessionId) === e)
        return n;
    }
    const s = `sensor.kanban_watcher_kanban_session_${e.slice(0, 8)}`;
    return this.asSessionAttributes(this.hass.states[s]?.attributes);
  }
  sessionMessages(t) {
    const e = t?.recent_messages;
    if (Array.isArray(e))
      return e.filter((s) => this.isConversationMessage(s));
    if (typeof e == "string")
      try {
        const s = JSON.parse(e);
        return Array.isArray(s) ? s.filter((i) => this.isConversationMessage(i)) : [];
      } catch {
        return [];
      }
    return [];
  }
  asSessionAttributes(t) {
    if (!t || typeof t != "object")
      return;
    const e = t;
    if (typeof (e.session_id ?? e.sessionId) == "string")
      return e;
  }
  isConversationMessage(t) {
    return !!(t && typeof t == "object" && typeof t.content == "string");
  }
};
N.styles = It, N.properties = {
  hass: { attribute: !1 },
  collapsedSections: { state: !0 },
  selectedWorkspaceId: { state: !0 }
};
let W = N;
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
