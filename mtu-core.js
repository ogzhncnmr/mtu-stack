/* =====================================================================
   MTU hesaplayıcı: hesap motoru. Arayüzden bağımsız, saf fonksiyonlar.
   Tarayıcıda window.MTU, Node'da module.exports (testler: test/mtu.test.js).

   Terimler
     P     müşterinin IP paketi (müşteri IP MTU'su)
     F     taşınan müşteri çerçevesi = 14 + taşınan VLAN etiketi × 4 + P  (yalnızca L2 servislerde)
     L     omurga bağlantısının L2 yükü: omurga Ethernet başlığının hemen
           altındaki her şey (etiketler, tünel başlıkları, müşteri yükü)
     kare  L + 14 + omurga VLAN etiketi × 4  (FCS hariç)
   Katmanlar dıştan içe sıralıdır: layers[0] omurga Ethernet'ine en yakın olandır.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./mtu-data.js"));
  else root.MTU = factory(root.MTU_DATA);
})(typeof self !== "undefined" ? self : this, function (D) {
  "use strict";
  var B = D.BYTES;

  function ceilTo(n, b) { return Math.ceil(n / b) * b; }
  function floorTo(n, b) { return Math.floor(n / b) * b; }
  function ipHdr(v) { return Number(v) === 6 ? B.ip6 : B.ip4; }
  function int(v, d) { var n = parseInt(v, 10); return isFinite(n) ? n : d; }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function blk(tr, en, bytes, cat, src) { return { name: { tr: tr, en: en }, bytes: bytes, cat: cat, src: src }; }
  function sum(blocks) { return blocks.reduce(function (a, x) { return a + x.bytes; }, 0); }
  function T(tr, en) { return { tr: tr, en: en }; }

  /* ---------- Katman tanımları ---------- */
  var DEFAULTS = {
    mpls: { transport: 1, service: 1, frr: 0, entropy: 0, flow: 0, extra: 0, cw: 0 },
    vxlan: { ip: 4 },
    gre: { ip: 4, key: 0, csum: 0, seq: 0 },
    ipsec: { mode: "tunnel", ip: 4, enc: "aes-gcm", auth: "sha256", natt: 0 },
    srv6: { segs: 1, reduced: 1 },
    gtpu: { ip: 4, hdr: "5g" },
    pppoe: {}
  };
  var LAYER_NAMES = {
    mpls: T("MPLS etiket yığını", "MPLS label stack"),
    vxlan: T("VXLAN", "VXLAN"),
    gre: T("GRE", "GRE"),
    ipsec: T("IPsec (ESP)", "IPsec (ESP)"),
    srv6: T("SRv6", "SRv6"),
    gtpu: T("GTP-U", "GTP-U"),
    pppoe: T("PPPoE", "PPPoE")
  };
  var GTP_HDR = { base: B.gtp, seq: B.gtp + B.gtpOpt, "5g": B.gtp + B.gtpOpt + B.gtpPsc };

  function normLayer(l) {
    if (!l || !DEFAULTS[l.t]) return null;
    var d = DEFAULTS[l.t], o = { t: l.t };
    Object.keys(d).forEach(function (k) { o[k] = l[k] == null ? d[k] : l[k]; });
    if (o.t === "mpls") {
      o.transport = clamp(int(o.transport, 1), 0, 12);
      o.extra = clamp(int(o.extra, 0), 0, 12);
      ["service", "frr", "entropy", "flow", "cw"].forEach(function (k) { o[k] = Number(o[k]) ? 1 : 0; });
    }
    if (o.ip != null) o.ip = Number(o.ip) === 6 ? 6 : 4;
    if (o.t === "gre") ["key", "csum", "seq"].forEach(function (k) { o[k] = Number(o[k]) ? 1 : 0; });
    if (o.t === "ipsec") {
      o.mode = o.mode === "transport" ? "transport" : "tunnel";
      if (!D.ESP_ENC[o.enc]) o.enc = d.enc;
      if (!D.ESP_AUTH[o.auth]) o.auth = d.auth;
      o.natt = Number(o.natt) ? 1 : 0;
    }
    if (o.t === "srv6") { o.segs = clamp(int(o.segs, 1), 1, 16); o.reduced = Number(o.reduced) ? 1 : 0; }
    if (o.t === "gtpu" && !GTP_HDR[o.hdr]) o.hdr = d.hdr;
    return o;
  }

  function outerIp(v) {
    return Number(v) === 6
      ? blk("Dış IPv6 başlığı", "Outer IPv6 header", B.ip6, "tunnel", "rfc8200")
      : blk("Dış IPv4 başlığı", "Outer IPv4 header", B.ip4, "tunnel", "rfc791");
  }

  /* MPLS katmanındaki etiket sayısı (control word etiket değildir) */
  function labelCount(l) {
    return l.frr + l.transport + l.entropy * 2 + l.extra + l.service + l.flow;
  }

  /* Boyutu yükten bağımsız katmanların blokları (dıştan içe). IPsec burada yok. */
  function fixedBlocks(l) {
    var out = [];
    switch (l.t) {
      case "mpls":
        if (l.frr) out.push(blk("FRR bypass etiketi", "FRR bypass label", B.mplsLabel, "mpls", "rfc3032"));
        if (l.transport) out.push(blk("Taşıma etiketi" + (l.transport > 1 ? " × " + l.transport : ""), "Transport label" + (l.transport > 1 ? " × " + l.transport : ""), B.mplsLabel * l.transport, "mpls", "rfc3032"));
        if (l.entropy) out.push(blk("Entropy label (ELI + EL)", "Entropy label (ELI + EL)", B.mplsLabel * 2, "mpls", "rfc6790"));
        if (l.extra) out.push(blk("Ek etiket" + (l.extra > 1 ? " × " + l.extra : ""), "Extra label" + (l.extra > 1 ? " × " + l.extra : ""), B.mplsLabel * l.extra, "mpls", "rfc3032"));
        if (l.service) out.push(blk("Servis etiketi", "Service label", B.mplsLabel, "mpls", "rfc3032"));
        if (l.flow) out.push(blk("Akış etiketi (FAT PW / hash label)", "Flow label (FAT PW / hash label)", B.mplsLabel, "mpls", "rfc6391"));
        if (l.cw) out.push(blk("Control word", "Control word", B.cw, "mpls", "rfc4385"));
        break;
      case "vxlan":
        out.push(outerIp(l.ip));
        out.push(blk("UDP başlığı", "UDP header", B.udp, "tunnel", "rfc7348"));
        out.push(blk("VXLAN başlığı", "VXLAN header", B.vxlan, "tunnel", "rfc7348"));
        break;
      case "gre":
        var opts = l.key + l.csum + l.seq;
        out.push(outerIp(l.ip));
        out.push(blk("GRE başlığı" + (opts ? " (+" + opts + " seçenek)" : ""), "GRE header" + (opts ? " (+" + opts + " option" + (opts > 1 ? "s" : "") + ")" : ""), B.gre + B.greOpt * opts, "tunnel", opts ? "rfc2890" : "rfc2784"));
        break;
      case "srv6":
        var sids = l.reduced ? l.segs - 1 : l.segs;
        out.push(blk("Dış IPv6 başlığı", "Outer IPv6 header", B.ip6, "tunnel", "rfc8200"));
        if (sids > 0) out.push(blk("SRH (" + sids + " SID)", "SRH (" + sids + " SID" + (sids > 1 ? "s" : "") + ")", B.srh + B.sid * sids, "tunnel", "rfc8754"));
        break;
      case "gtpu":
        out.push(outerIp(l.ip));
        out.push(blk("UDP başlığı", "UDP header", B.udp, "tunnel", "ts29281"));
        out.push(blk("GTP-U başlığı", "GTP-U header", GTP_HDR[l.hdr], "tunnel", l.hdr === "5g" ? "ts38415" : "ts29281"));
        break;
      case "pppoe":
        out.push(blk("PPPoE + PPP başlığı", "PPPoE + PPP header", B.pppoe, "tunnel", "rfc2516"));
        break;
    }
    return out;
  }

  /* ESP: boyut yükün uzunluğuna bağlıdır (dolgu), o yüzden ayrı hesaplanır. */
  function espParams(l) {
    var enc = D.ESP_ENC[l.enc];
    var icv = enc.aead ? enc.icv : D.ESP_AUTH[l.auth].icv;
    return { enc: enc, icv: icv, ih: ipHdr(l.ip), natt: l.natt ? B.udp : 0, align: Math.max(enc.block, 4) };
  }
  function espWrap(l, inner) {
    var p = espParams(l);
    var plain = l.mode === "tunnel" ? inner : inner - p.ih; // transport: IP başlığı şifrelenmez, dışarıda kalır
    if (plain < 0) plain = 0;
    var padded = ceilTo(plain + B.espTrailer, p.align);
    var pad = padded - plain - B.espTrailer;
    var blocks = [];
    if (l.mode === "tunnel") blocks.push(outerIp(l.ip));
    if (p.natt) blocks.push(blk("UDP başlığı (NAT-T)", "UDP header (NAT-T)", B.udp, "sec", "rfc3948"));
    blocks.push(blk("ESP başlığı (SPI + sıra no)", "ESP header (SPI + sequence)", B.esp, "sec", "rfc4303"));
    if (p.enc.iv) blocks.push(blk("ESP IV", "ESP IV", p.enc.iv, "sec", p.enc.src));
    if (pad) blocks.push(blk("ESP dolgusu (paket sonunda)", "ESP padding (at the end)", pad, "sec", "rfc4303"));
    blocks.push(blk("ESP kuyruğu (paket sonunda)", "ESP trailer (at the end)", B.espTrailer, "sec", "rfc4303"));
    if (p.icv) blocks.push(blk("ESP ICV (paket sonunda)", "ESP ICV (at the end)", p.icv, "sec", p.enc.aead ? p.enc.src : D.ESP_AUTH[l.auth].src));
    return { size: inner + sum(blocks), blocks: blocks };
  }
  function espUnwrap(l, outer) {
    var p = espParams(l);
    var avail = outer - p.ih - p.natt - B.esp - p.enc.iv - p.icv;
    var plainMax = floorTo(avail, p.align) - B.espTrailer;
    return l.mode === "tunnel" ? plainMax : plainMax + p.ih;
  }

  function wrap(l, inner) {
    if (l.t === "ipsec") return espWrap(l, inner);
    var b = fixedBlocks(l);
    return { size: inner + sum(b), blocks: b };
  }
  function unwrap(l, outer) {
    if (l.t === "ipsec") return espUnwrap(l, outer);
    return outer - sum(fixedBlocks(l));
  }

  /* ---------- Durum ---------- */
  function norm(s) {
    s = s || {};
    var o = {
      dir: s.dir === "have" ? "have" : "need",
      p: clamp(int(s.p, 1500), 1, 65535),
      core: clamp(int(s.core, 9212), 1, 65535),
      coreUnit: ["l2", "xr", "frame"].indexOf(s.coreUnit) >= 0 ? s.coreUnit : "frame",
      payload: s.payload === "eth" ? "eth" : "ip",
      ipver: Number(s.ipver) === 6 ? 6 : 4,
      ctags: clamp(int(s.ctags, 0), 0, 2),
      coreTags: clamp(int(s.coreTags, 0), 0, 2),
      layers: (s.layers || []).map(normLayer).filter(Boolean)
    };
    // Kapsülleme yoksa müşteri çerçevesi zaten bağlantı çerçevesidir: IP yükü olarak ele alınır.
    if (!o.layers.length) { o.payload = "ip"; o.ctags = 0; }
    return o;
  }

  var PRESETS = {
    ip: { name: T("Düz IP", "Plain IP"), state: { payload: "ip", layers: [] } },
    l3vpn: { name: T("MPLS L3VPN", "MPLS L3VPN"), state: { payload: "ip", layers: [{ t: "mpls" }] } },
    l2vpn: { name: T("Epipe / VPLS", "Epipe / VPLS"), state: { payload: "eth", layers: [{ t: "mpls" }] } },
    evpnvxlan: { name: T("EVPN-VXLAN", "EVPN-VXLAN"), state: { payload: "eth", layers: [{ t: "vxlan" }] } },
    gre: { name: T("GRE tüneli", "GRE tunnel"), state: { payload: "ip", layers: [{ t: "gre" }] } },
    ipsec: { name: T("IPsec tüneli", "IPsec tunnel"), state: { payload: "ip", layers: [{ t: "ipsec" }] } },
    srv6: { name: T("SRv6 L3VPN", "SRv6 L3VPN"), state: { payload: "ip", layers: [{ t: "srv6" }] } },
    gtp: { name: T("5G N3 (GTP-U)", "5G N3 (GTP-U)"), state: { payload: "ip", layers: [{ t: "gtpu" }] } },
    pppoe: { name: T("PPPoE", "PPPoE"), state: { payload: "ip", layers: [{ t: "pppoe" }] } }
  };

  /* ---------- Ana hesap ---------- */
  function compute(input) {
    var s = norm(input);
    var custHdr = s.payload === "eth" ? B.eth + B.vlan * s.ctags : 0;
    var linkHdr = B.eth + B.vlan * s.coreTags;

    function forward(P) {
      var inner = P + custHdr, blocks = [];
      for (var i = s.layers.length - 1; i >= 0; i--) {
        var r = wrap(s.layers[i], inner);
        blocks = r.blocks.concat(blocks);
        inner = r.size;
      }
      return { L: inner, blocks: blocks };
    }
    function backward(L) {
      var x = L;
      for (var i = 0; i < s.layers.length; i++) x = unwrap(s.layers[i], x);
      return x - custHdr;
    }

    var P, Lgiven = null;
    if (s.dir === "need") P = s.p;
    else {
      Lgiven = s.coreUnit === "l2" ? s.core : s.coreUnit === "xr" ? s.core - B.eth : s.core - linkHdr;
      P = backward(Lgiven);
    }
    var minP = ipHdr(s.ipver) + B.tcp + 1;
    if (!(P >= minP)) {
      return { ok: false, state: s, error: T(
        "Bu omurga değeri seçilen başlıkları taşımaya yetmiyor: müşteri paketine yer kalmıyor.",
        "This core value cannot carry the selected headers: no room is left for the customer packet.") };
    }

    var f = forward(P);
    var L = s.dir === "need" ? f.L : Lgiven;      // omurgada ayarlanacak / verilen L2 yükü
    var frame = L + linkHdr;
    var mss = P - ipHdr(s.ipver) - B.tcp;
    var F = s.payload === "eth" ? P + custHdr : null;

    var blocks = [blk("Omurga Ethernet başlığı", "Core Ethernet header", B.eth, "link", "ieee8021q")];
    if (s.coreTags) blocks.push(blk("Omurga VLAN etiketi" + (s.coreTags > 1 ? " × 2" : ""), "Core VLAN tag" + (s.coreTags > 1 ? " × 2" : ""), B.vlan * s.coreTags, "link", "ieee8021q"));
    blocks = blocks.concat(f.blocks);
    if (s.payload === "eth") {
      blocks.push(blk("Müşteri Ethernet başlığı", "Customer Ethernet header", B.eth, "cust", "rfc4448"));
      if (s.ctags) blocks.push(blk("Müşteri VLAN etiketi" + (s.ctags > 1 ? " × 2" : ""), "Customer VLAN tag" + (s.ctags > 1 ? " × 2" : ""), B.vlan * s.ctags, "cust", "ieee8021q"));
    }
    blocks.push(blk(s.ipver === 6 ? "Müşteri IPv6 başlığı" : "Müşteri IPv4 başlığı", s.ipver === 6 ? "Customer IPv6 header" : "Customer IPv4 header", ipHdr(s.ipver), "pay", s.ipver === 6 ? "rfc8200" : "rfc791"));
    blocks.push(blk("TCP başlığı", "TCP header", B.tcp, "pay", "rfc6691"));
    blocks.push(blk("Veri (TCP MSS)", "Data (TCP MSS)", mss, "pay", "rfc6691"));

    var first = s.layers[0];
    var outerKind = !first ? "ip" + s.ipver
      : first.t === "mpls" ? "mpls"
      : first.t === "pppoe" ? "pppoe"
      : first.t === "srv6" ? "ip6"
      : "ip" + first.ip;
    var labels = first && first.t === "mpls" ? labelCount(first) : 0;

    var r = {
      ok: true, state: s,
      P: P, ipver: s.ipver, mss: mss, F: F,
      L: L, Lused: f.L, slack: L - f.L,
      frame: frame, frameFcs: frame + B.fcs,
      overhead: f.L - P,                  // müşteri IP paketinin üstüne binen her şey (omurga Ethernet'i hariç)
      linkHdr: linkHdr, custHdr: custHdr,
      blocks: blocks, outerKind: outerKind, labels: labels,
      ping: { v4: P - B.ip4 - B.icmp, v6: P - B.ip6 - B.icmp }
    };
    r.vendors = vendors(r);
    r.warnings = warnings(r);
    return r;
  }

  /* ---------- Uyarılar ---------- */
  function has(s, t) { return s.layers.some(function (l) { return l.t === t; }); }
  function warnings(r) {
    var s = r.state, w = [];
    if (s.ipver === 6 && r.P < B.ip6Min)
      w.push({ level: "warn", src: "rfc8200", text: T(
        "Müşteri IPv6 kullanıyor ama paket boyu " + r.P + " bayt. IPv6 her bağlantıda en az 1280 bayt ister.",
        "The customer uses IPv6 but the packet size is " + r.P + " bytes. IPv6 requires at least 1280 bytes on every link.") });
    if (r.slack > 0)
      w.push({ level: "info", src: "rfc4303", text: T(
        "Omurgada " + r.slack + " bayt boşta kalıyor: ESP dolgu hizası yüzünden müşteri paketi tam sınıra oturmuyor.",
        r.slack + " bytes stay unused on the core: ESP padding alignment keeps the customer packet from filling it exactly.") });
    if (has(s, "ipsec"))
      w.push({ level: "info", src: "rfc4303", text: T(
        "ESP yükü dolgu yüzünden paket boyuna göre değişir. Buradaki değer en büyük müşteri paketi içindir; daha küçük paketlerde ek yük birkaç bayt farklı olabilir.",
        "ESP overhead varies with packet size because of padding. The figure here is for the largest customer packet; smaller packets can differ by a few bytes.") });
    if (has(s, "gtpu"))
      w.push({ level: "info", src: "ts23501j", text: T(
        "3GPP, taşıma ağı 1500 bayt ve N3 üzerinde IPsec olduğunda UE bağlantı MTU'su için 1358 baytı çoğu kurulum için uygun bulur; doğru değer kurulumunuza bağlıdır.",
        "3GPP considers 1358 bytes suitable as the UE link MTU for most deployments with a 1500-byte transport and IPsec on N3; the right value depends on your deployment.") });
    var srv6 = s.layers.filter(function (l) { return l.t === "srv6"; })[0];
    if (srv6 && !srv6.reduced && srv6.segs === 1)
      w.push({ level: "info", src: "rfc8986", text: T(
        "Tek SID'li politikada SRH atlanabilir (RFC 8986): o durumda ek yük yalnızca 40 bayttır. \"İndirgenmiş kapsülleme\" seçeneğini açın.",
        "With a single-SID policy the SRH may be omitted (RFC 8986): overhead is then just 40 bytes. Turn on \"reduced encapsulation\".") });
    if (r.frame > D.VENDOR.nokia.netPortDefault)
      w.push({ level: "warn", src: "nokiaMtu", text: T(
        "Gereken çerçeve " + r.frame + " bayt: Nokia ağ portlarının varsayılanı olan 9212'yi aşıyor. Donanımın en büyük MTU'sunu kontrol edin.",
        "The required frame is " + r.frame + " bytes: above 9212, the default of Nokia network ports. Check the hardware maximum MTU.") });
    if (r.L > D.VENDOR.huawei.ifMtuMax)
      w.push({ level: "warn", src: "huaweiIfMtu", text: T(
        "Gereken L2 yükü " + r.L + " bayt: Huawei GE arayüzlerinde ayarlanabilen en büyük MTU olan 9600'ü aşıyor.",
        "The required L2 payload is " + r.L + " bytes: above 9600, the largest MTU configurable on Huawei GE interfaces.") });
    return w;
  }

  /* ---------- Üretici çıktıları ----------
     conf: "doc"        resmi dokümanda açıkça yazıyor
           "derived"    dokümandaki kuraldan hesapla türetildi
           "unverified" resmi dokümanda doğrulanamadı                */
  function row(what, value, cmd, note, conf, src) {
    return { what: what, value: value, cmd: cmd || "", note: note, conf: conf, src: src || [] };
  }
  function vendors(r) {
    var s = r.state, L = r.L, P = r.P, F = r.F, t = s.coreTags;
    var isL2 = s.payload === "eth", mpls = r.outerKind === "mpls";
    var V = D.VENDOR, out = [];

    /* Nokia SR OS */
    var port = L + B.eth + B.vlan * t, nk = [];
    nk.push(row(T("Ağ portu MTU'su", "Network port MTU"), port, "configure port 1/1/1 ethernet mtu " + port,
      T("Port MTU'su Ethernet başlığını ve portun kendi VLAN etiketlerini sayar, FCS'yi saymaz. Ağ portlarında varsayılan 9212'dir (Fast Ethernet'te 1514). " + (port <= V.nokia.netPortDefault ? "Varsayılan değer bu servis için yeterli." : "Varsayılan değer yetmiyor."),
        "Port MTU counts the Ethernet header and the port's own VLAN tags, not the FCS. Network ports default to 9212 (1514 on Fast Ethernet). " + (port <= V.nokia.netPortDefault ? "The default is enough for this service." : "The default is not enough.")),
      "doc", ["nokiaMtu", "nokiaPmtud"]));
    if (isL2) {
      nk.push(row(T("Servis MTU'su (service-mtu)", "Service MTU (service-mtu)"), F, "configure service epipe 100 service-mtu " + F,
        T("Müşteri IP paketi + 14 bayt Ethernet başlığı (serviste taşınan VLAN etiketleri varsa onlar da). Varsayılan 1514. SDP path MTU'sundan ve erişim portu MTU'sundan büyük olamaz; control word ve hash label SDP payından düşer.",
          "Customer IP packet + 14-byte Ethernet header (plus any VLAN tags carried in the service). Default 1514. It cannot exceed the SDP path MTU or the access port MTU; the control word and hash label come out of the SDP budget."),
        "doc", ["nokiaPmtud", "nokiaMtu"]));
      nk.push(row(T("Sinyallenen VC MTU'su", "Signalled VC MTU"), F - B.eth, "",
        T("service-mtu − 14. Ayarlanamaz, T-LDP ile iki uç arasında karşılaştırılır; farklıysa servis açılmaz.",
          "service-mtu − 14. Not configurable; compared between both ends by T-LDP, and the service stays down if they differ."),
        "doc", ["nokiaPmtud"]));
      nk.push(row(T("Erişim portu MTU'su (en az)", "Access port MTU (minimum)"), "null " + F + " · dot1q " + (F + 4) + " · qinq " + (F + 8), "configure port 1/1/2 ethernet mtu …",
        T("service-mtu + SAP kapsüllemesi (0, 4 veya 8 bayt). SAP'ta sökülen etiketler service-mtu'ya dahil değildir.",
          "service-mtu + SAP encapsulation (0, 4 or 8 bytes). Tags stripped at the SAP are not part of service-mtu."),
        "doc", ["nokiaPmtud"]));
    } else {
      nk.push(row(T("Servis arayüzü IP MTU'su (ip-mtu)", "Service interface IP MTU (ip-mtu)"), P, "configure service vprn 100 interface \"musteri\" ip-mtu " + P,
        T("Geçerli değer, port MTU'sundan Ethernet başlığı çıkarılınca kalan ile ayarlanan ip-mtu'nun küçüğüdür. Ayarlanmazsa port MTU'sundan türetilir.",
          "The effective value is the smaller of port MTU minus the Ethernet header and the configured ip-mtu. If unset it is derived from the port MTU."),
        "doc", ["nokiaIpMtu", "nokiaPmtud"]));
    }
    out.push({ id: "nokia", name: "Nokia SR OS", rows: nk });

    /* Huawei VRP */
    var hw = [];
    hw.push(row(T("Arayüz MTU'su (mtu)", "Interface MTU (mtu)"), L, "interface GigabitEthernet0/1/0\n mtu " + L,
      T("Huawei'de arayüz MTU'su IP MTU'sudur: Ethernet başlığı ve VLAN etiketleri sayılmaz. Varsayılan 1500, GE arayüzlerde 46–9600." +
        (mpls ? " MPLS MTU'su etiketleri de sayar (IP MTU + etiket × 4) ve fiziksel arayüz MTU'sunu aşamaz; bu yüzden değer etiketleri içerir." : "") +
        (isL2 ? " Dokümana göre yalnızca L2 veya MPLS ile iletilen paketler parçalanmaz ve arayüz MTU'su genelde yalnızca L3 trafiğinde etkilidir; değer, omurganın taşıması gereken boyu gösterir." : ""),
        "On Huawei the interface MTU is an IP MTU: the Ethernet header and VLAN tags are not counted. Default 1500, 46–9600 on GE interfaces." +
        (mpls ? " The MPLS MTU also counts labels (IP MTU + labels × 4) and cannot exceed the physical interface MTU, so this value includes the labels." : "") +
        (isL2 ? " Per the documentation, packets forwarded only through L2 or MPLS are not fragmented and the interface MTU typically applies to L3 traffic only; the value shows what the core has to carry." : "")),
      isL2 ? "derived" : "doc", ["huaweiMtu", "huaweiIfMtu", "huaweiMplsMtu"]));
    if (isL2)
      hw.push(row(T("L2VPN MTU'su (VSI veya PW şablonu)", "L2VPN MTU (VSI or PW template)"), P, "mtu " + P,
        T("Yalnızca VC/PW kurulurken karşılaştırılır, paket iletimini etkilemez. Varsayılan 1500. İki uçta aynı olmalı.",
          "Only compared while the VC/PW is being set up; it does not affect forwarding. Default 1500. Must match on both ends."),
        "doc", ["huaweiMtu"]));
    if (has(s, "gre"))
      hw.push(row(T("GRE tünel payı", "GRE tunnel allowance"), "− " + V.huawei.greReserve, "",
        T("Huawei GRE için 32 bayt düşer (20 IP + 12 GRE): GRE MTU = tünel arayüzü MTU − 32. Standart temel yük 24 bayttır, yani Huawei 8 bayt daha temkinlidir.",
          "Huawei subtracts 32 bytes for GRE (20 IP + 12 GRE): GRE MTU = tunnel interface MTU − 32. The standard base overhead is 24 bytes, so Huawei is 8 bytes more conservative."),
        "doc", ["huaweiMtu"]));
    out.push({ id: "huawei", name: "Huawei VRP", rows: hw });

    /* Cisco IOS / IOS XE */
    var ios = [];
    ios.push(row(T("Arayüz MTU'su (mtu)", "Interface MTU (mtu)"), L, "interface GigabitEthernet0/0/0\n mtu " + L,
      T("Klasik IOS ve IOS XE'de mtu, L2 yükünü sayar: Ethernet başlığı dahil değildir. Varsayılan 1500.",
        "On classic IOS and IOS XE, mtu counts the L2 payload: the Ethernet header is not included. Default 1500."),
      "doc", ["ciscoXrMtu"]));
    if (mpls)
      ios.push(row(T("MPLS MTU'su (mpls mtu)", "MPLS MTU (mpls mtu)"), L, "mpls mtu " + L,
        T("Arayüz MTU'sundan büyük ayarlanamaz (Ethernet'teki override anahtarı hariç; Cisco bunun paket kaybına yol açabileceğini söylüyor). Arayüz MTU'suna eşitse yapılandırmada görünmez.",
          "Cannot be set above the interface MTU (except with the override keyword on Ethernet, which Cisco warns can cause drops). When equal to the interface MTU it does not appear in the configuration."),
        "doc", ["ciscoMplsMtu"]));
    out.push({ id: "ios", name: "Cisco IOS / IOS XE", rows: ios });

    /* Cisco IOS XR */
    var xr = [], xrMtu = L + B.eth;
    xr.push(row(T("Ana arayüz MTU'su (mtu)", "Main interface MTU (mtu)"), xrMtu, "interface TenGigE0/0/0/0\n mtu " + xrMtu,
      T("IOS XR'da mtu 14 baytlık Ethernet başlığını sayar, FCS'yi saymaz. Alt arayüzlerde her VLAN etiketi için 4 bayt kendiliğinden eklenir; etiketleri bu değere katmayın. Varsayılan 1514. Aynı hattın IOS ucundaki değer 14 bayt küçüktür.",
        "On IOS XR, mtu counts the 14-byte Ethernet header, not the FCS. Sub-interfaces add 4 bytes per VLAN tag automatically; do not add tags to this value. Default 1514. The IOS end of the same link is 14 bytes lower."),
      "doc", ["ciscoXrMtu"]));
    xr.push(row(T("Türetilen L3 / MPLS MTU'su", "Derived L3 / MPLS MTU"), L, "",
      T("mtu − 14. ipv4 mtu, ipv6 mtu ve mpls mtu komutları bu değeri yalnızca düşürebilir.",
        "mtu − 14. The ipv4 mtu, ipv6 mtu and mpls mtu commands can only lower it."),
      "doc", ["ciscoXrMtu"]));
    if (isL2)
      xr.push(row(T("Sinyallenen PW MTU'su", "Signalled PW MTU"), P, "",
        T("AC alt arayüz MTU − 14 − sökülen etiket × 4. İki uçta farklıysa PW \"MTU mismatched\" hatasıyla kapalı kalır.",
          "AC sub-interface MTU − 14 − popped tags × 4. If the two ends differ the PW stays down with \"MTU mismatched\"."),
        "doc", ["ciscoXrMtu"]));
    out.push({ id: "xr", name: "Cisco IOS XR", rows: xr });

    /* Juniper Junos */
    var jn = [], media = L + B.eth + B.vlan * t;
    jn.push(row(T("Fiziksel (media) MTU", "Physical (media) MTU"), media, "set interfaces xe-0/0/0 mtu " + media,
      T("Media MTU, protokol MTU'su ile kapsülleme yükünün toplamından küçük olamaz: Ethernet 14 bayt, tek 802.1Q etiketiyle 18 bayt. FCS sayılmaz. Varsayılan 1514." + (t === 2 ? " Çift etiket için 22 bayt, tek etiket değerinden türetildi." : ""),
        "Media MTU cannot be smaller than the protocol MTU plus encapsulation overhead: 14 bytes for Ethernet, 18 with one 802.1Q tag. FCS is not counted. Default 1514." + (t === 2 ? " 22 bytes for two tags is derived from the single-tag value." : "")),
      t === 2 ? "derived" : "doc", ["junosMtu"]));
    if (mpls) {
      var mplsDef = L - V.junos.mplsReserve;
      jn.push(row(T("Varsayılan family mpls MTU'su", "Default family mpls MTU"), mplsDef, "set interfaces xe-0/0/0 unit 0 family mpls mtu …",
        T("Ayarlanmazsa Junos fiziksel MTU'dan kapsülleme yükünü ve 3 etiketlik payı (12 bayt) düşer." +
          (r.labels > 3 ? " Bu yığında " + r.labels + " etiket var: 3 etiketlik varsayılan pay yetmez." : r.labels < 3 ? " Bu yığında " + r.labels + " etiket var; pay gerekenden " + (12 - r.labels * 4) + " bayt büyük, yani varsayılan MPLS MTU'su müşteri paketinden küçük kalabilir." : "") +
          " Elle girilen değerin etiketleri sayıp saymadığını resmi dokümanda doğrulayamadım; show interfaces çıktısıyla kontrol edin.",
          "If unset, Junos subtracts the encapsulation overhead and room for 3 labels (12 bytes) from the physical MTU." +
          (r.labels > 3 ? " This stack has " + r.labels + " labels: the default 3-label allowance is not enough." : r.labels < 3 ? " This stack has " + r.labels + " labels; the allowance is " + (12 - r.labels * 4) + " bytes larger than needed, so the default MPLS MTU can end up below the customer packet." : "") +
          " I could not verify in the official documentation whether a manually configured value counts the labels; check it with show interfaces."),
        "unverified", ["junosMtu", "junosMtuStmt"]));
    }
    out.push({ id: "junos", name: "Juniper Junos", rows: jn });

    return out;
  }

  /* ---------- Parçalanma simülasyonu ----------
     size: IP paketinin toplam boyu, mtu: sığması gereken IP MTU'su */
  function fragment(input) {
    var size = int(input.size, 0), mtu = int(input.mtu, 0), v = Number(input.ipver) === 6 ? 6 : 4;
    var df = !!input.df, ih = ipHdr(v), min = v === 6 ? B.ip6Min : B.ip4Min;
    var res = { ipver: v, size: size, mtu: mtu, df: df, fragments: [] };
    if (size < ih + 1) { res.action = "error"; res.error = T("Paket boyu IP başlığından küçük olamaz.", "The packet cannot be smaller than the IP header."); return res; }
    if (size > 65535) { res.action = "error"; res.error = T("IP paketi 65535 baytı aşamaz.", "An IP packet cannot exceed 65535 bytes."); return res; }
    if (mtu < min) {
      res.action = "error";
      res.error = v === 6
        ? T("IPv6 bağlantı MTU'su 1280 bayttan küçük olamaz (RFC 8200).", "An IPv6 link MTU cannot be below 1280 bytes (RFC 8200).")
        : T("IPv4 bağlantı MTU'su 68 bayttan küçük olamaz (RFC 791).", "An IPv4 link MTU cannot be below 68 bytes (RFC 791).");
      return res;
    }
    if (size <= mtu) { res.action = "forward"; return res; }

    // Parça başına taşınabilen veri, 8 baytın katı olmalıdır (son parça hariç).
    var per = v === 6 ? floorTo(mtu - ih - B.ip6Frag, 8) : floorTo(mtu - ih, 8);
    var data = size - ih, hdr = v === 6 ? ih + B.ip6Frag : ih, off = 0, i = 0;
    while (off < data) {
      var chunk = Math.min(per, data - off);
      res.fragments.push({ i: ++i, offset: off, offsetUnits: off / 8, data: chunk, total: hdr + chunk, mf: off + chunk < data });
      off += chunk;
    }
    res.totalBytes = res.fragments.reduce(function (a, x) { return a + x.total; }, 0);
    res.extraBytes = res.totalBytes - size;
    if (v === 6) {
      res.action = "ptb";            // yönlendirici düşürür, kaynak parçalar
      res.icmp = { name: "ICMPv6 Packet Too Big (Type 2)", mtu: mtu, src: "rfc4443" };
    } else if (df) {
      res.action = "drop";           // DF=1: düşürülür
      res.icmp = { name: "ICMP Destination Unreachable, Fragmentation Needed (Type 3, Code 4)", mtu: mtu, src: "rfc1191" };
    } else res.action = "fragment";  // DF=0: yönlendirici parçalar
    return res;
  }

  /* ---------- Durumu adres çubuğuna yazma / okuma ---------- */
  function serialize(input) {
    var s = norm(input), parts = ["d=" + s.dir];
    parts.push(s.dir === "need" ? "p=" + s.p : "c=" + s.core + "&u=" + s.coreUnit);
    parts.push("pl=" + s.payload, "v=" + s.ipver);
    if (s.ctags) parts.push("ct=" + s.ctags);
    if (s.coreTags) parts.push("kt=" + s.coreTags);
    var ls = s.layers.map(function (l) {
      var d = DEFAULTS[l.t];
      return [l.t].concat(Object.keys(d).filter(function (k) { return String(l[k]) !== String(d[k]); }).map(function (k) { return k + "_" + l[k]; })).join(".");
    });
    if (ls.length) parts.push("l=" + ls.join("~"));
    return parts.join("&");
  }
  function parse(str) {
    var q = {};
    String(str || "").replace(/^#/, "").split("&").forEach(function (kv) {
      var i = kv.indexOf("="); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    if (!q.d) return null;
    var layers = (q.l ? q.l.split("~") : []).map(function (x) {
      var p = x.split("."), o = { t: p[0] };
      p.slice(1).forEach(function (kv) { var i = kv.indexOf("_"); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); });
      return o;
    });
    return norm({ dir: q.d, p: q.p, core: q.c, coreUnit: q.u, payload: q.pl, ipver: q.v, ctags: q.ct, coreTags: q.kt, layers: layers });
  }

  return {
    compute: compute, fragment: fragment, norm: norm, normLayer: normLayer,
    serialize: serialize, parse: parse, labelCount: labelCount,
    layerOverhead: function (l, inner) { l = normLayer(l); return wrap(l, inner).size - inner; },
    PRESETS: PRESETS, DEFAULTS: DEFAULTS, LAYER_NAMES: LAYER_NAMES, DATA: D
  };
});
