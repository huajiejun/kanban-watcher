const U = globalThis, W = U.ShadowRoot && (U.ShadyCSS === void 0 || U.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, L = /* @__PURE__ */ Symbol(), q = /* @__PURE__ */ new WeakMap();
let se = class {
  constructor(e, t, s) {
    if (this._$cssResult$ = !0, s !== L) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = e, this.t = t;
  }
  get styleSheet() {
    let e = this.o;
    const t = this.t;
    if (W && e === void 0) {
      const s = t !== void 0 && t.length === 1;
      s && (e = q.get(t)), e === void 0 && ((this.o = e = new CSSStyleSheet()).replaceSync(this.cssText), s && q.set(t, e));
    }
    return e;
  }
  toString() {
    return this.cssText;
  }
};
const le = (r) => new se(typeof r == "string" ? r : r + "", void 0, L), de = (r, ...e) => {
  const t = r.length === 1 ? r[0] : e.reduce((s, i, n) => s + ((o) => {
    if (o._$cssResult$ === !0) return o.cssText;
    if (typeof o == "number") return o;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + o + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(i) + r[n + 1], r[0]);
  return new se(t, r, L);
}, ce = (r, e) => {
  if (W) r.adoptedStyleSheets = e.map((t) => t instanceof CSSStyleSheet ? t : t.styleSheet);
  else for (const t of e) {
    const s = document.createElement("style"), i = U.litNonce;
    i !== void 0 && s.setAttribute("nonce", i), s.textContent = t.cssText, r.appendChild(s);
  }
}, F = W ? (r) => r : (r) => r instanceof CSSStyleSheet ? ((e) => {
  let t = "";
  for (const s of e.cssRules) t += s.cssText;
  return le(t);
})(r) : r;
const { is: he, defineProperty: pe, getOwnPropertyDescriptor: ue, getOwnPropertyNames: ge, getOwnPropertySymbols: fe, getPrototypeOf: me } = Object, R = globalThis, V = R.trustedTypes, be = V ? V.emptyScript : "", ve = R.reactiveElementPolyfillSupport, k = (r, e) => r, z = { toAttribute(r, e) {
  switch (e) {
    case Boolean:
      r = r ? be : null;
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
} }, ie = (r, e) => !he(r, e), K = { attribute: !0, type: String, converter: z, reflect: !1, useDefault: !1, hasChanged: ie };
Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), R.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
let y = class extends HTMLElement {
  static addInitializer(e) {
    this._$Ei(), (this.l ??= []).push(e);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(e, t = K) {
    if (t.state && (t.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(e) && ((t = Object.create(t)).wrapped = !0), this.elementProperties.set(e, t), !t.noAccessor) {
      const s = /* @__PURE__ */ Symbol(), i = this.getPropertyDescriptor(e, s, t);
      i !== void 0 && pe(this.prototype, e, i);
    }
  }
  static getPropertyDescriptor(e, t, s) {
    const { get: i, set: n } = ue(this.prototype, e) ?? { get() {
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
    if (this.hasOwnProperty(k("elementProperties"))) return;
    const e = me(this);
    e.finalize(), e.l !== void 0 && (this.l = [...e.l]), this.elementProperties = new Map(e.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(k("finalized"))) return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(k("properties"))) {
      const t = this.properties, s = [...ge(t), ...fe(t)];
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
    return ce(e, this.constructor.elementStyles), e;
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
      const n = (s.converter?.toAttribute !== void 0 ? s.converter : z).toAttribute(t, s.type);
      this._$Em = e, n == null ? this.removeAttribute(i) : this.setAttribute(i, n), this._$Em = null;
    }
  }
  _$AK(e, t) {
    const s = this.constructor, i = s._$Eh.get(e);
    if (i !== void 0 && this._$Em !== i) {
      const n = s.getPropertyOptions(i), o = typeof n.converter == "function" ? { fromAttribute: n.converter } : n.converter?.fromAttribute !== void 0 ? n.converter : z;
      this._$Em = i;
      const l = o.fromAttribute(t, n.type);
      this[i] = l ?? this._$Ej?.get(i) ?? l, this._$Em = null;
    }
  }
  requestUpdate(e, t, s, i = !1, n) {
    if (e !== void 0) {
      const o = this.constructor;
      if (i === !1 && (n = this[e]), s ??= o.getPropertyOptions(e), !((s.hasChanged ?? ie)(n, t) || s.useDefault && s.reflect && n === this._$Ej?.get(e) && !this.hasAttribute(o._$Eu(e, s)))) return;
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
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[k("elementProperties")] = /* @__PURE__ */ new Map(), y[k("finalized")] = /* @__PURE__ */ new Map(), ve?.({ ReactiveElement: y }), (R.reactiveElementVersions ??= []).push("2.1.2");
const I = globalThis, J = (r) => r, D = I.trustedTypes, Z = D ? D.createPolicy("lit-html", { createHTML: (r) => r }) : void 0, re = "$lit$", m = `lit$${Math.random().toFixed(9).slice(2)}$`, ne = "?" + m, $e = `<${ne}>`, $ = document, S = () => $.createComment(""), E = (r) => r === null || typeof r != "object" && typeof r != "function", j = Array.isArray, ye = (r) => j(r) || typeof r?.[Symbol.iterator] == "function", N = `[ 	
\f\r]`, A = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, G = /-->/g, Q = />/g, b = RegExp(`>|${N}(?:([^\\s"'>=/]+)(${N}*=${N}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), X = /'/g, Y = /"/g, oe = /^(?:script|style|textarea|title)$/i, _e = (r) => (e, ...t) => ({ _$litType$: r, strings: e, values: t }), f = _e(1), _ = /* @__PURE__ */ Symbol.for("lit-noChange"), c = /* @__PURE__ */ Symbol.for("lit-nothing"), ee = /* @__PURE__ */ new WeakMap(), v = $.createTreeWalker($, 129);
function ae(r, e) {
  if (!j(r) || !r.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return Z !== void 0 ? Z.createHTML(e) : e;
}
const xe = (r, e) => {
  const t = r.length - 1, s = [];
  let i, n = e === 2 ? "<svg>" : e === 3 ? "<math>" : "", o = A;
  for (let l = 0; l < t; l++) {
    const a = r[l];
    let h, p, d = -1, u = 0;
    for (; u < a.length && (o.lastIndex = u, p = o.exec(a), p !== null); ) u = o.lastIndex, o === A ? p[1] === "!--" ? o = G : p[1] !== void 0 ? o = Q : p[2] !== void 0 ? (oe.test(p[2]) && (i = RegExp("</" + p[2], "g")), o = b) : p[3] !== void 0 && (o = b) : o === b ? p[0] === ">" ? (o = i ?? A, d = -1) : p[1] === void 0 ? d = -2 : (d = o.lastIndex - p[2].length, h = p[1], o = p[3] === void 0 ? b : p[3] === '"' ? Y : X) : o === Y || o === X ? o = b : o === G || o === Q ? o = A : (o = b, i = void 0);
    const g = o === b && r[l + 1].startsWith("/>") ? " " : "";
    n += o === A ? a + $e : d >= 0 ? (s.push(h), a.slice(0, d) + re + a.slice(d) + m + g) : a + m + (d === -2 ? l : g);
  }
  return [ae(r, n + (r[t] || "<?>") + (e === 2 ? "</svg>" : e === 3 ? "</math>" : "")), s];
};
class C {
  constructor({ strings: e, _$litType$: t }, s) {
    let i;
    this.parts = [];
    let n = 0, o = 0;
    const l = e.length - 1, a = this.parts, [h, p] = xe(e, t);
    if (this.el = C.createElement(h, s), v.currentNode = this.el.content, t === 2 || t === 3) {
      const d = this.el.content.firstChild;
      d.replaceWith(...d.childNodes);
    }
    for (; (i = v.nextNode()) !== null && a.length < l; ) {
      if (i.nodeType === 1) {
        if (i.hasAttributes()) for (const d of i.getAttributeNames()) if (d.endsWith(re)) {
          const u = p[o++], g = i.getAttribute(d).split(m), M = /([.?@])?(.*)/.exec(u);
          a.push({ type: 1, index: n, name: M[2], strings: g, ctor: M[1] === "." ? ke : M[1] === "?" ? we : M[1] === "@" ? Se : T }), i.removeAttribute(d);
        } else d.startsWith(m) && (a.push({ type: 6, index: n }), i.removeAttribute(d));
        if (oe.test(i.tagName)) {
          const d = i.textContent.split(m), u = d.length - 1;
          if (u > 0) {
            i.textContent = D ? D.emptyScript : "";
            for (let g = 0; g < u; g++) i.append(d[g], S()), v.nextNode(), a.push({ type: 2, index: ++n });
            i.append(d[u], S());
          }
        }
      } else if (i.nodeType === 8) if (i.data === ne) a.push({ type: 2, index: n });
      else {
        let d = -1;
        for (; (d = i.data.indexOf(m, d + 1)) !== -1; ) a.push({ type: 7, index: n }), d += m.length - 1;
      }
      n++;
    }
  }
  static createElement(e, t) {
    const s = $.createElement("template");
    return s.innerHTML = e, s;
  }
}
function x(r, e, t = r, s) {
  if (e === _) return e;
  let i = s !== void 0 ? t._$Co?.[s] : t._$Cl;
  const n = E(e) ? void 0 : e._$litDirective$;
  return i?.constructor !== n && (i?._$AO?.(!1), n === void 0 ? i = void 0 : (i = new n(r), i._$AT(r, t, s)), s !== void 0 ? (t._$Co ??= [])[s] = i : t._$Cl = i), i !== void 0 && (e = x(r, i._$AS(r, e.values), i, s)), e;
}
class Ae {
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
    const { el: { content: t }, parts: s } = this._$AD, i = (e?.creationScope ?? $).importNode(t, !0);
    v.currentNode = i;
    let n = v.nextNode(), o = 0, l = 0, a = s[0];
    for (; a !== void 0; ) {
      if (o === a.index) {
        let h;
        a.type === 2 ? h = new P(n, n.nextSibling, this, e) : a.type === 1 ? h = new a.ctor(n, a.name, a.strings, this, e) : a.type === 6 && (h = new Ee(n, this, e)), this._$AV.push(h), a = s[++l];
      }
      o !== a?.index && (n = v.nextNode(), o++);
    }
    return v.currentNode = $, i;
  }
  p(e) {
    let t = 0;
    for (const s of this._$AV) s !== void 0 && (s.strings !== void 0 ? (s._$AI(e, s, t), t += s.strings.length - 2) : s._$AI(e[t])), t++;
  }
}
class P {
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
    e = x(this, e, t), E(e) ? e === c || e == null || e === "" ? (this._$AH !== c && this._$AR(), this._$AH = c) : e !== this._$AH && e !== _ && this._(e) : e._$litType$ !== void 0 ? this.$(e) : e.nodeType !== void 0 ? this.T(e) : ye(e) ? this.k(e) : this._(e);
  }
  O(e) {
    return this._$AA.parentNode.insertBefore(e, this._$AB);
  }
  T(e) {
    this._$AH !== e && (this._$AR(), this._$AH = this.O(e));
  }
  _(e) {
    this._$AH !== c && E(this._$AH) ? this._$AA.nextSibling.data = e : this.T($.createTextNode(e)), this._$AH = e;
  }
  $(e) {
    const { values: t, _$litType$: s } = e, i = typeof s == "number" ? this._$AC(e) : (s.el === void 0 && (s.el = C.createElement(ae(s.h, s.h[0]), this.options)), s);
    if (this._$AH?._$AD === i) this._$AH.p(t);
    else {
      const n = new Ae(i, this), o = n.u(this.options);
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
    for (const n of e) i === t.length ? t.push(s = new P(this.O(S()), this.O(S()), this, this.options)) : s = t[i], s._$AI(n), i++;
    i < t.length && (this._$AR(s && s._$AB.nextSibling, i), t.length = i);
  }
  _$AR(e = this._$AA.nextSibling, t) {
    for (this._$AP?.(!1, !0, t); e !== this._$AB; ) {
      const s = J(e).nextSibling;
      J(e).remove(), e = s;
    }
  }
  setConnected(e) {
    this._$AM === void 0 && (this._$Cv = e, this._$AP?.(e));
  }
}
class T {
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
    if (n === void 0) e = x(this, e, t, 0), o = !E(e) || e !== this._$AH && e !== _, o && (this._$AH = e);
    else {
      const l = e;
      let a, h;
      for (e = n[0], a = 0; a < n.length - 1; a++) h = x(this, l[s + a], t, a), h === _ && (h = this._$AH[a]), o ||= !E(h) || h !== this._$AH[a], h === c ? e = c : e !== c && (e += (h ?? "") + n[a + 1]), this._$AH[a] = h;
    }
    o && !i && this.j(e);
  }
  j(e) {
    e === c ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, e ?? "");
  }
}
class ke extends T {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(e) {
    this.element[this.name] = e === c ? void 0 : e;
  }
}
class we extends T {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(e) {
    this.element.toggleAttribute(this.name, !!e && e !== c);
  }
}
class Se extends T {
  constructor(e, t, s, i, n) {
    super(e, t, s, i, n), this.type = 5;
  }
  _$AI(e, t = this) {
    if ((e = x(this, e, t, 0) ?? c) === _) return;
    const s = this._$AH, i = e === c && s !== c || e.capture !== s.capture || e.once !== s.once || e.passive !== s.passive, n = e !== c && (s === c || i);
    i && this.element.removeEventListener(this.name, this, s), n && this.element.addEventListener(this.name, this, e), this._$AH = e;
  }
  handleEvent(e) {
    typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, e) : this._$AH.handleEvent(e);
  }
}
class Ee {
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
const Ce = I.litHtmlPolyfillSupport;
Ce?.(C, P), (I.litHtmlVersions ??= []).push("3.3.2");
const Pe = (r, e, t) => {
  const s = t?.renderBefore ?? e;
  let i = s._$litPart$;
  if (i === void 0) {
    const n = t?.renderBefore ?? null;
    s._$litPart$ = i = new P(e.insertBefore(S(), n), n, void 0, t ?? {});
  }
  return i._$AI(r), i;
};
const B = globalThis;
class w extends y {
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
    return _;
  }
}
w._$litElement$ = !0, w.finalized = !0, B.litElementHydrateSupport?.({ LitElement: w });
const Me = B.litElementPolyfillSupport;
Me?.({ LitElement: w });
(B.litElementVersions ??= []).push("4.2.2");
function Ue(r = []) {
  return r.reduce(
    (e, t) => (t.has_pending_approval ? e.attention.push(t) : t.status === "running" ? e.running.push(t) : t.status === "completed" && t.has_unseen_turns ? e.attention.push(t) : e.idle.push(t), e),
    { attention: [], running: [], idle: [] }
  );
}
function De(r, e = /* @__PURE__ */ new Date()) {
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
  return !!(r.has_unseen_turns || r.hasUnseenActivity);
}
function Re(r) {
  return !!(r.has_running_dev_server || r.hasRunningDevServer);
}
function Te(r) {
  return r.latest_process_status || r.latestProcessStatus;
}
function Ne(r) {
  return r.pr_status || r.prStatus;
}
function ze(r) {
  return !!(r.is_pinned || r.isPinned);
}
function te(r) {
  const e = [], t = r.status === "running", s = !t && ["failed", "killed"].includes(Te(r) ?? ""), i = Oe(r), n = !!r.has_pending_approval, o = Re(r), l = Ne(r);
  o && e.push({ symbol: "🖥️", kind: "dev-server", tone: "brand" }), s && e.push({ symbol: "▲", kind: "process-error", tone: "error" }), n ? e.push({ symbol: "✋", kind: "approval", tone: "brand" }) : t && e.push({ symbol: "⋯", kind: "running", tone: "brand" }), i && !t && !s && e.push({ symbol: "●", kind: "unseen", tone: "brand" }), l === "open" ? e.push({ symbol: "⎇", kind: "pr-open", tone: "success" }) : l === "merged" && e.push({ symbol: "⎇", kind: "pr-merged", tone: "merged" }), ze(r) && e.push({ symbol: "📌", kind: "pin", tone: "brand" }), e.length === 0 && e.push({ symbol: "•", kind: "idle", tone: "muted" });
  const a = t && !n ? "is-running" : n || r.status === "completed" && i ? "is-attention" : "is-idle";
  return {
    icons: e,
    accentClass: a
  };
}
const He = de`
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
    width: min(640px, calc(100vw - 36px));
    max-height: min(760px, calc(100vh - 36px));
    overflow: auto;
    display: grid;
    gap: 16px;
    padding: 20px;
    border-radius: 22px;
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--primary-color, #f59e0b) 14%, transparent), transparent 32%),
      var(--ha-card-background, var(--card-background-color, #ffffff));
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
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .dialog-eyebrow {
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--secondary-text-color, #94a3b8);
  }

  .dialog-title {
    margin: 0;
    font-size: 1.32rem;
    line-height: 1.2;
  }

  .dialog-close {
    width: 36px;
    height: 36px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 70%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 72%, transparent);
    color: inherit;
    cursor: pointer;
    font: inherit;
  }

  .dialog-summary,
  .dialog-panel {
    border-radius: 18px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 70%, transparent);
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 60%, transparent);
  }

  .dialog-summary {
    display: grid;
    gap: 12px;
    padding: 16px;
  }

  .dialog-summary.is-attention {
    border-color: color-mix(in srgb, #f59e0b 45%, var(--divider-color, #e5e7eb));
  }

  .dialog-summary.is-running {
    border-color: color-mix(in srgb, #10b981 45%, var(--divider-color, #e5e7eb));
  }

  .dialog-summary-top,
  .dialog-summary-bottom {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .dialog-summary-time {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.9rem;
  }

  .dialog-summary-bottom {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.88rem;
  }

  .dialog-panel {
    overflow: hidden;
  }

  .dialog-panel-title {
    padding: 14px 16px 0;
    font-size: 0.96rem;
    font-weight: 700;
  }

  .dialog-panel-body {
    display: grid;
    gap: 14px;
    padding: 14px 16px 16px;
  }

  .dialog-content-card {
    display: grid;
    gap: 10px;
    padding: 16px;
    border-radius: 16px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--ha-card-background, #ffffff) 94%, #f8fafc),
      color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 86%, #fff7ed)
    );
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 65%, transparent);
  }

  .dialog-content-kicker {
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--primary-color, #f59e0b);
    font-weight: 700;
  }

  .dialog-content-title {
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.3;
  }

  .dialog-content-text {
    margin: 0;
    color: var(--secondary-text-color, #94a3b8);
    line-height: 1.5;
  }

  .dialog-content-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .dialog-content-item {
    display: grid;
    gap: 6px;
    padding: 12px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--ha-card-background, #ffffff) 84%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 62%, transparent);
  }

  .dialog-content-label {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.8rem;
  }

  .dialog-content-value {
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.4;
  }

  .message-input {
    width: 100%;
    min-height: 108px;
    resize: vertical;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 72%, transparent);
    background: color-mix(in srgb, var(--ha-card-background, #ffffff) 92%, transparent);
    color: inherit;
    font: inherit;
    box-sizing: border-box;
  }

  .dialog-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .dialog-action {
    flex: 1 1 180px;
    min-height: 42px;
    border-radius: 999px;
    font: inherit;
    cursor: pointer;
    padding: 0 16px;
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
    font-size: 0.84rem;
    line-height: 1.4;
  }

  @media (max-width: 640px) {
    .workspace-dialog {
      width: min(100vw - 20px, 640px);
      padding: 16px;
      border-radius: 18px;
    }

    .dialog-content-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .task-meta {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .meta-files {
      justify-self: start;
    }
  }
`, We = [
  { key: "attention", label: "需要注意" },
  { key: "running", label: "运行中" },
  { key: "idle", label: "空闲" }
], O = class O extends w {
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
    const t = te(e), { relativeTime: s, filesChanged: i, linesAdded: n, linesRemoved: o } = this.getWorkspaceDisplayMeta(e);
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
      (l) => f`<span class="status-icon tone-${l.tone} kind-${l.kind}"
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
      return c;
    const t = te(e), { relativeTime: s, filesChanged: i, linesAdded: n, linesRemoved: o } = this.getWorkspaceDisplayMeta(e);
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
              <div class="dialog-eyebrow">工作区详情</div>
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

          <div class="dialog-summary ${t.accentClass}">
            <div class="dialog-summary-top">
              <span class="meta-status">
                ${t.icons.map(
      (l) => f`<span class="status-icon tone-${l.tone} kind-${l.kind}"
                    >${l.symbol}</span
                  >`
    )}
              </span>
              <span class="dialog-summary-time">${s}</span>
            </div>
            <div class="dialog-summary-bottom">
              <span>状态：${this.getWorkspaceStatusLabel(e)}</span>
              <span>📄 ${i}</span>
              <span class="lines-added">+${n}</span>
              <span class="lines-removed">-${o}</span>
            </div>
          </div>

          <section class="dialog-panel">
            <div class="dialog-panel-title">查看兑换内容</div>
            <div class="dialog-panel-body">
              <div class="dialog-content-card">
                <div class="dialog-content-kicker">兑换摘要</div>
                <div class="dialog-content-title">${e.name} 当前兑换方案</div>
                <p class="dialog-content-text">
                  第一版先展示预设内容，用于承载后续真实兑换详情。当前可查看推荐方案、兑换说明与下一步动作入口。
                </p>
                <div class="dialog-content-grid">
                  <div class="dialog-content-item">
                    <span class="dialog-content-label">推荐档位</span>
                    <span class="dialog-content-value">标准兑换包</span>
                  </div>
                  <div class="dialog-content-item">
                    <span class="dialog-content-label">兑换状态</span>
                    <span class="dialog-content-value">待确认</span>
                  </div>
                  <div class="dialog-content-item">
                    <span class="dialog-content-label">处理建议</span>
                    <span class="dialog-content-value">优先发送消息确认细节</span>
                  </div>
                  <div class="dialog-content-item">
                    <span class="dialog-content-label">预留说明</span>
                    <span class="dialog-content-value">第二期接入真实接口与动态字段</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="dialog-panel">
            <div class="dialog-panel-title">消息操作</div>
            <div class="dialog-panel-body">
              <textarea
                class="message-input"
                rows="4"
                placeholder="输入要发送给当前工作区的消息内容"
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
                ${this.actionFeedback || "动作已预留，第二期接入真实能力。"}
              </div>
            </div>
          </section>
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
    this.actionFeedback = e === "send" ? "发送消息功能将在第二期接入，当前为界面占位。" : "队列消息功能将在第二期接入，当前为界面占位。";
  }
  getWorkspaceStatusLabel(e) {
    return e.has_pending_approval ? "待审批" : e.status === "running" ? "运行中" : e.has_unseen_turns ? "需关注" : "空闲";
  }
  getWorkspaceDisplayMeta(e) {
    const t = e.relative_time || (e.status === "completed" ? e.completed_at ?? this.entityAttributes?.updated_at : this.entityAttributes?.updated_at);
    return {
      relativeTime: e.relative_time || De(t),
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
    return We.map(({ key: t, label: s }) => ({
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
};
O.styles = He, O.properties = {
  hass: { attribute: !1 },
  collapsedSections: { state: !0 },
  selectedWorkspaceId: { state: !0 },
  messageDraft: { state: !0 },
  actionFeedback: { state: !0 }
};
let H = O;
customElements.get("kanban-watcher-card") || customElements.define("kanban-watcher-card", H);
window.customCards = window.customCards ?? [];
window.customCards.some((r) => r.type === "kanban-watcher-card") || window.customCards.push({
  type: "kanban-watcher-card",
  name: "Kanban Watcher Card",
  description: "Compact Home Assistant card for Kanban Watcher workspaces."
});
export {
  H as KanbanWatcherCard
};
