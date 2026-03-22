const M = globalThis, L = M.ShadowRoot && (M.ShadyCSS === void 0 || M.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, j = /* @__PURE__ */ Symbol(), V = /* @__PURE__ */ new WeakMap();
let et = class {
  constructor(t, e, s) {
    if (this._$cssResult$ = !0, s !== j) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t, this.t = e;
  }
  get styleSheet() {
    let t = this.o;
    const e = this.t;
    if (L && t === void 0) {
      const s = e !== void 0 && e.length === 1;
      s && (t = V.get(e)), t === void 0 && ((this.o = t = new CSSStyleSheet()).replaceSync(this.cssText), s && V.set(e, t));
    }
    return t;
  }
  toString() {
    return this.cssText;
  }
};
const at = (n) => new et(typeof n == "string" ? n : n + "", void 0, j), lt = (n, ...t) => {
  const e = n.length === 1 ? n[0] : t.reduce((s, i, r) => s + ((o) => {
    if (o._$cssResult$ === !0) return o.cssText;
    if (typeof o == "number") return o;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + o + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(i) + n[r + 1], n[0]);
  return new et(e, n, j);
}, ct = (n, t) => {
  if (L) n.adoptedStyleSheets = t.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet);
  else for (const e of t) {
    const s = document.createElement("style"), i = M.litNonce;
    i !== void 0 && s.setAttribute("nonce", i), s.textContent = e.cssText, n.appendChild(s);
  }
}, q = L ? (n) => n : (n) => n instanceof CSSStyleSheet ? ((t) => {
  let e = "";
  for (const s of t.cssRules) e += s.cssText;
  return at(e);
})(n) : n;
const { is: ht, defineProperty: dt, getOwnPropertyDescriptor: pt, getOwnPropertyNames: ut, getOwnPropertySymbols: ft, getPrototypeOf: $t } = Object, R = globalThis, J = R.trustedTypes, gt = J ? J.emptyScript : "", mt = R.reactiveElementPolyfillSupport, x = (n, t) => n, z = { toAttribute(n, t) {
  switch (t) {
    case Boolean:
      n = n ? gt : null;
      break;
    case Object:
    case Array:
      n = n == null ? n : JSON.stringify(n);
  }
  return n;
}, fromAttribute(n, t) {
  let e = n;
  switch (t) {
    case Boolean:
      e = n !== null;
      break;
    case Number:
      e = n === null ? null : Number(n);
      break;
    case Object:
    case Array:
      try {
        e = JSON.parse(n);
      } catch {
        e = null;
      }
  }
  return e;
} }, st = (n, t) => !ht(n, t), Z = { attribute: !0, type: String, converter: z, reflect: !1, useDefault: !1, hasChanged: st };
Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), R.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
let v = class extends HTMLElement {
  static addInitializer(t) {
    this._$Ei(), (this.l ??= []).push(t);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t, e = Z) {
    if (e.state && (e.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(t) && ((e = Object.create(e)).wrapped = !0), this.elementProperties.set(t, e), !e.noAccessor) {
      const s = /* @__PURE__ */ Symbol(), i = this.getPropertyDescriptor(t, s, e);
      i !== void 0 && dt(this.prototype, t, i);
    }
  }
  static getPropertyDescriptor(t, e, s) {
    const { get: i, set: r } = pt(this.prototype, t) ?? { get() {
      return this[e];
    }, set(o) {
      this[e] = o;
    } };
    return { get: i, set(o) {
      const l = i?.call(this);
      r?.call(this, o), this.requestUpdate(t, l, s);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(t) {
    return this.elementProperties.get(t) ?? Z;
  }
  static _$Ei() {
    if (this.hasOwnProperty(x("elementProperties"))) return;
    const t = $t(this);
    t.finalize(), t.l !== void 0 && (this.l = [...t.l]), this.elementProperties = new Map(t.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(x("finalized"))) return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(x("properties"))) {
      const e = this.properties, s = [...ut(e), ...ft(e)];
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
      for (const i of s) e.unshift(q(i));
    } else t !== void 0 && e.push(q(t));
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
    return ct(t, this.constructor.elementStyles), t;
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
      const r = (s.converter?.toAttribute !== void 0 ? s.converter : z).toAttribute(e, s.type);
      this._$Em = t, r == null ? this.removeAttribute(i) : this.setAttribute(i, r), this._$Em = null;
    }
  }
  _$AK(t, e) {
    const s = this.constructor, i = s._$Eh.get(t);
    if (i !== void 0 && this._$Em !== i) {
      const r = s.getPropertyOptions(i), o = typeof r.converter == "function" ? { fromAttribute: r.converter } : r.converter?.fromAttribute !== void 0 ? r.converter : z;
      this._$Em = i;
      const l = o.fromAttribute(e, r.type);
      this[i] = l ?? this._$Ej?.get(i) ?? l, this._$Em = null;
    }
  }
  requestUpdate(t, e, s, i = !1, r) {
    if (t !== void 0) {
      const o = this.constructor;
      if (i === !1 && (r = this[t]), s ??= o.getPropertyOptions(t), !((s.hasChanged ?? st)(r, e) || s.useDefault && s.reflect && r === this._$Ej?.get(t) && !this.hasAttribute(o._$Eu(t, s)))) return;
      this.C(t, e, s);
    }
    this.isUpdatePending === !1 && (this._$ES = this._$EP());
  }
  C(t, e, { useDefault: s, reflect: i, wrapped: r }, o) {
    s && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t) && (this._$Ej.set(t, o ?? e ?? this[t]), r !== !0 || o !== void 0) || (this._$AL.has(t) || (this.hasUpdated || s || (e = void 0), this._$AL.set(t, e)), i === !0 && this._$Em !== t && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t));
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
        for (const [i, r] of this._$Ep) this[i] = r;
        this._$Ep = void 0;
      }
      const s = this.constructor.elementProperties;
      if (s.size > 0) for (const [i, r] of s) {
        const { wrapped: o } = r, l = this[i];
        o !== !0 || this._$AL.has(i) || l === void 0 || this.C(i, void 0, r, l);
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
v.elementStyles = [], v.shadowRootOptions = { mode: "open" }, v[x("elementProperties")] = /* @__PURE__ */ new Map(), v[x("finalized")] = /* @__PURE__ */ new Map(), mt?.({ ReactiveElement: v }), (R.reactiveElementVersions ??= []).push("2.1.2");
const B = globalThis, F = (n) => n, O = B.trustedTypes, K = O ? O.createPolicy("lit-html", { createHTML: (n) => n }) : void 0, it = "$lit$", $ = `lit$${Math.random().toFixed(9).slice(2)}$`, nt = "?" + $, _t = `<${nt}>`, _ = document, w = () => _.createComment(""), C = (n) => n === null || typeof n != "object" && typeof n != "function", W = Array.isArray, yt = (n) => W(n) || typeof n?.[Symbol.iterator] == "function", T = `[ 	
\f\r]`, S = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, G = /-->/g, Q = />/g, g = RegExp(`>|${T}(?:([^\\s"'>=/]+)(${T}*=${T}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), X = /'/g, Y = /"/g, rt = /^(?:script|style|textarea|title)$/i, vt = (n) => (t, ...e) => ({ _$litType$: n, strings: t, values: e }), y = vt(1), b = /* @__PURE__ */ Symbol.for("lit-noChange"), h = /* @__PURE__ */ Symbol.for("lit-nothing"), tt = /* @__PURE__ */ new WeakMap(), m = _.createTreeWalker(_, 129);
function ot(n, t) {
  if (!W(n) || !n.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return K !== void 0 ? K.createHTML(t) : t;
}
const bt = (n, t) => {
  const e = n.length - 1, s = [];
  let i, r = t === 2 ? "<svg>" : t === 3 ? "<math>" : "", o = S;
  for (let l = 0; l < e; l++) {
    const a = n[l];
    let d, p, c = -1, u = 0;
    for (; u < a.length && (o.lastIndex = u, p = o.exec(a), p !== null); ) u = o.lastIndex, o === S ? p[1] === "!--" ? o = G : p[1] !== void 0 ? o = Q : p[2] !== void 0 ? (rt.test(p[2]) && (i = RegExp("</" + p[2], "g")), o = g) : p[3] !== void 0 && (o = g) : o === g ? p[0] === ">" ? (o = i ?? S, c = -1) : p[1] === void 0 ? c = -2 : (c = o.lastIndex - p[2].length, d = p[1], o = p[3] === void 0 ? g : p[3] === '"' ? Y : X) : o === Y || o === X ? o = g : o === G || o === Q ? o = S : (o = g, i = void 0);
    const f = o === g && n[l + 1].startsWith("/>") ? " " : "";
    r += o === S ? a + _t : c >= 0 ? (s.push(d), a.slice(0, c) + it + a.slice(c) + $ + f) : a + $ + (c === -2 ? l : f);
  }
  return [ot(n, r + (n[e] || "<?>") + (t === 2 ? "</svg>" : t === 3 ? "</math>" : "")), s];
};
class P {
  constructor({ strings: t, _$litType$: e }, s) {
    let i;
    this.parts = [];
    let r = 0, o = 0;
    const l = t.length - 1, a = this.parts, [d, p] = bt(t, e);
    if (this.el = P.createElement(d, s), m.currentNode = this.el.content, e === 2 || e === 3) {
      const c = this.el.content.firstChild;
      c.replaceWith(...c.childNodes);
    }
    for (; (i = m.nextNode()) !== null && a.length < l; ) {
      if (i.nodeType === 1) {
        if (i.hasAttributes()) for (const c of i.getAttributeNames()) if (c.endsWith(it)) {
          const u = p[o++], f = i.getAttribute(c).split($), U = /([.?@])?(.*)/.exec(u);
          a.push({ type: 1, index: r, name: U[2], strings: f, ctor: U[1] === "." ? St : U[1] === "?" ? xt : U[1] === "@" ? Et : H }), i.removeAttribute(c);
        } else c.startsWith($) && (a.push({ type: 6, index: r }), i.removeAttribute(c));
        if (rt.test(i.tagName)) {
          const c = i.textContent.split($), u = c.length - 1;
          if (u > 0) {
            i.textContent = O ? O.emptyScript : "";
            for (let f = 0; f < u; f++) i.append(c[f], w()), m.nextNode(), a.push({ type: 2, index: ++r });
            i.append(c[u], w());
          }
        }
      } else if (i.nodeType === 8) if (i.data === nt) a.push({ type: 2, index: r });
      else {
        let c = -1;
        for (; (c = i.data.indexOf($, c + 1)) !== -1; ) a.push({ type: 7, index: r }), c += $.length - 1;
      }
      r++;
    }
  }
  static createElement(t, e) {
    const s = _.createElement("template");
    return s.innerHTML = t, s;
  }
}
function A(n, t, e = n, s) {
  if (t === b) return t;
  let i = s !== void 0 ? e._$Co?.[s] : e._$Cl;
  const r = C(t) ? void 0 : t._$litDirective$;
  return i?.constructor !== r && (i?._$AO?.(!1), r === void 0 ? i = void 0 : (i = new r(n), i._$AT(n, e, s)), s !== void 0 ? (e._$Co ??= [])[s] = i : e._$Cl = i), i !== void 0 && (t = A(n, i._$AS(n, t.values), i, s)), t;
}
class At {
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
    const { el: { content: e }, parts: s } = this._$AD, i = (t?.creationScope ?? _).importNode(e, !0);
    m.currentNode = i;
    let r = m.nextNode(), o = 0, l = 0, a = s[0];
    for (; a !== void 0; ) {
      if (o === a.index) {
        let d;
        a.type === 2 ? d = new k(r, r.nextSibling, this, t) : a.type === 1 ? d = new a.ctor(r, a.name, a.strings, this, t) : a.type === 6 && (d = new wt(r, this, t)), this._$AV.push(d), a = s[++l];
      }
      o !== a?.index && (r = m.nextNode(), o++);
    }
    return m.currentNode = _, i;
  }
  p(t) {
    let e = 0;
    for (const s of this._$AV) s !== void 0 && (s.strings !== void 0 ? (s._$AI(t, s, e), e += s.strings.length - 2) : s._$AI(t[e])), e++;
  }
}
class k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t, e, s, i) {
    this.type = 2, this._$AH = h, this._$AN = void 0, this._$AA = t, this._$AB = e, this._$AM = s, this.options = i, this._$Cv = i?.isConnected ?? !0;
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
    t = A(this, t, e), C(t) ? t === h || t == null || t === "" ? (this._$AH !== h && this._$AR(), this._$AH = h) : t !== this._$AH && t !== b && this._(t) : t._$litType$ !== void 0 ? this.$(t) : t.nodeType !== void 0 ? this.T(t) : yt(t) ? this.k(t) : this._(t);
  }
  O(t) {
    return this._$AA.parentNode.insertBefore(t, this._$AB);
  }
  T(t) {
    this._$AH !== t && (this._$AR(), this._$AH = this.O(t));
  }
  _(t) {
    this._$AH !== h && C(this._$AH) ? this._$AA.nextSibling.data = t : this.T(_.createTextNode(t)), this._$AH = t;
  }
  $(t) {
    const { values: e, _$litType$: s } = t, i = typeof s == "number" ? this._$AC(t) : (s.el === void 0 && (s.el = P.createElement(ot(s.h, s.h[0]), this.options)), s);
    if (this._$AH?._$AD === i) this._$AH.p(e);
    else {
      const r = new At(i, this), o = r.u(this.options);
      r.p(e), this.T(o), this._$AH = r;
    }
  }
  _$AC(t) {
    let e = tt.get(t.strings);
    return e === void 0 && tt.set(t.strings, e = new P(t)), e;
  }
  k(t) {
    W(this._$AH) || (this._$AH = [], this._$AR());
    const e = this._$AH;
    let s, i = 0;
    for (const r of t) i === e.length ? e.push(s = new k(this.O(w()), this.O(w()), this, this.options)) : s = e[i], s._$AI(r), i++;
    i < e.length && (this._$AR(s && s._$AB.nextSibling, i), e.length = i);
  }
  _$AR(t = this._$AA.nextSibling, e) {
    for (this._$AP?.(!1, !0, e); t !== this._$AB; ) {
      const s = F(t).nextSibling;
      F(t).remove(), t = s;
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
  constructor(t, e, s, i, r) {
    this.type = 1, this._$AH = h, this._$AN = void 0, this.element = t, this.name = e, this._$AM = i, this.options = r, s.length > 2 || s[0] !== "" || s[1] !== "" ? (this._$AH = Array(s.length - 1).fill(new String()), this.strings = s) : this._$AH = h;
  }
  _$AI(t, e = this, s, i) {
    const r = this.strings;
    let o = !1;
    if (r === void 0) t = A(this, t, e, 0), o = !C(t) || t !== this._$AH && t !== b, o && (this._$AH = t);
    else {
      const l = t;
      let a, d;
      for (t = r[0], a = 0; a < r.length - 1; a++) d = A(this, l[s + a], e, a), d === b && (d = this._$AH[a]), o ||= !C(d) || d !== this._$AH[a], d === h ? t = h : t !== h && (t += (d ?? "") + r[a + 1]), this._$AH[a] = d;
    }
    o && !i && this.j(t);
  }
  j(t) {
    t === h ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t ?? "");
  }
}
class St extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t) {
    this.element[this.name] = t === h ? void 0 : t;
  }
}
class xt extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t) {
    this.element.toggleAttribute(this.name, !!t && t !== h);
  }
}
class Et extends H {
  constructor(t, e, s, i, r) {
    super(t, e, s, i, r), this.type = 5;
  }
  _$AI(t, e = this) {
    if ((t = A(this, t, e, 0) ?? h) === b) return;
    const s = this._$AH, i = t === h && s !== h || t.capture !== s.capture || t.once !== s.once || t.passive !== s.passive, r = t !== h && (s === h || i);
    i && this.element.removeEventListener(this.name, this, s), r && this.element.addEventListener(this.name, this, t), this._$AH = t;
  }
  handleEvent(t) {
    typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, t) : this._$AH.handleEvent(t);
  }
}
class wt {
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
const Ct = B.litHtmlPolyfillSupport;
Ct?.(P, k), (B.litHtmlVersions ??= []).push("3.3.2");
const Pt = (n, t, e) => {
  const s = e?.renderBefore ?? t;
  let i = s._$litPart$;
  if (i === void 0) {
    const r = e?.renderBefore ?? null;
    s._$litPart$ = i = new k(t.insertBefore(w(), r), r, void 0, e ?? {});
  }
  return i._$AI(n), i;
};
const I = globalThis;
class E extends v {
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
    return b;
  }
}
E._$litElement$ = !0, E.finalized = !0, I.litElementHydrateSupport?.({ LitElement: E });
const kt = I.litElementPolyfillSupport;
kt?.({ LitElement: E });
(I.litElementVersions ??= []).push("4.2.2");
function Ut(n = []) {
  return n.reduce(
    (t, e) => (e.has_pending_approval ? t.attention.push(e) : e.status === "running" ? t.running.push(e) : e.status === "completed" && e.has_unseen_turns ? t.attention.push(e) : t.idle.push(e), t),
    { attention: [], running: [], idle: [] }
  );
}
function Mt(n, t = /* @__PURE__ */ new Date()) {
  if (!n)
    return "recently";
  const e = Date.parse(n);
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
  const r = Math.floor(i / 60);
  return r < 24 ? `${r}h ago` : `${Math.floor(r / 24)}d ago`;
}
function Ot(n) {
  return !!(n.has_unseen_turns || n.hasUnseenActivity);
}
function Nt(n) {
  return !!(n.has_running_dev_server || n.hasRunningDevServer);
}
function Rt(n) {
  return n.latest_process_status || n.latestProcessStatus;
}
function Ht(n) {
  return n.pr_status || n.prStatus;
}
function Tt(n) {
  return !!(n.is_pinned || n.isPinned);
}
function zt(n) {
  const t = [], e = n.status === "running", s = !e && ["failed", "killed"].includes(Rt(n) ?? ""), i = Ot(n), r = !!n.has_pending_approval, o = Nt(n), l = Ht(n);
  o && t.push({ symbol: "🖥️", kind: "dev-server", tone: "brand" }), s && t.push({ symbol: "▲", kind: "process-error", tone: "error" }), r ? t.push({ symbol: "✋", kind: "approval", tone: "brand" }) : e && t.push({ symbol: "⋯", kind: "running", tone: "brand" }), i && !e && !s && t.push({ symbol: "●", kind: "unseen", tone: "brand" }), l === "open" ? t.push({ symbol: "⎇", kind: "pr-open", tone: "success" }) : l === "merged" && t.push({ symbol: "⎇", kind: "pr-merged", tone: "merged" }), Tt(n) && t.push({ symbol: "📌", kind: "pin", tone: "brand" }), t.length === 0 && t.push({ symbol: "•", kind: "idle", tone: "muted" });
  const a = e && !r ? "is-running" : r || n.status === "completed" && i ? "is-attention" : "is-idle";
  return {
    icons: t,
    accentClass: a
  };
}
const Dt = lt`
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
    background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color, #ffffff)) 82%, var(--secondary-background-color, #f3f4f6));
    border-left: 3px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 85%, transparent);
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
`, Lt = [
  { key: "attention", label: "需要注意" },
  { key: "running", label: "运行中" },
  { key: "idle", label: "空闲" }
], N = class N extends E {
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
    return y`
      <ha-card>
        <div class="board">
          ${t.length === 0 ? y`<div class="empty-state">当前没有任务</div>` : t.map(
      ({ key: e, label: s, workspaces: i }) => this.renderSection(e, s, i)
    )}
        </div>
      </ha-card>
    `;
  }
  renderSection(t, e, s) {
    const i = this.collapsedSections.has(t);
    return y`
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
        ${i ? h : y`
              <div class="section-body">
                ${s.map((r) => this.renderWorkspace(r))}
              </div>
            `}
      </section>
    `;
  }
  renderWorkspace(t) {
    const e = zt(t), s = t.relative_time || (t.status === "completed" ? t.completed_at ?? this.entityAttributes?.updated_at : this.entityAttributes?.updated_at), i = t.relative_time || Mt(s), r = t.files_changed ?? 0, o = t.lines_added ?? 0, l = t.lines_removed ?? 0;
    return y`
        <div class="task-card ${e.accentClass}">
        <div class="workspace-name">${t.name}</div>
        <div class="task-meta">
          <span class="meta-status">
            ${e.icons.map(
      (a) => y`<span class="status-icon tone-${a.tone} kind-${a.kind}"
                >${a.symbol}</span
              >`
    )}
          </span>
          <span class="relative-time">${i}</span>
          <span class="meta-files"
            ><span class="file-count">📄 ${r}</span> <span
              class="lines-added"
              >+${o}</span
            >
            <span class="lines-removed">-${l}</span></span
          >
        </div>
      </div>
    `;
  }
  toggleSection(t) {
    const e = new Set(this.collapsedSections);
    e.has(t) ? e.delete(t) : e.add(t), this.collapsedSections = e;
  }
  get entityAttributes() {
    if (!(!this.hass || !this.config?.entity))
      return this.hass.states[this.config.entity]?.attributes;
  }
  get visibleSections() {
    const t = Ut(this.normalizedWorkspaces);
    return Lt.map(({ key: e, label: s }) => ({
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
};
N.styles = Dt, N.properties = {
  hass: { attribute: !1 },
  collapsedSections: { state: !0 }
};
let D = N;
customElements.get("kanban-watcher-card") || customElements.define("kanban-watcher-card", D);
window.customCards = window.customCards ?? [];
window.customCards.some((n) => n.type === "kanban-watcher-card") || window.customCards.push({
  type: "kanban-watcher-card",
  name: "Kanban Watcher Card",
  description: "Compact Home Assistant card for Kanban Watcher workspaces."
});
export {
  D as KanbanWatcherCard
};
