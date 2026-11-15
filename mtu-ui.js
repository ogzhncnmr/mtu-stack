/* MTU hesaplayıcı: arayüz. Hesabın tamamı mtu-core.js içindedir; burada yalnızca çizim var. */
(function () {
  "use strict";
  var M = window.MTU, D = M.DATA;
  var L = window.L || function (tr) { return tr; };
  var EN = window.LANG === "en";
  var t = function (o) { return EN ? o.en : o.tr; };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var nf = function (n) { return esc(n); }; // MTU değerleri cihaza yazıldığı gibi gösterilir: binlik ayırıcı yok
  var B = L("bayt", "bytes");

  var CAT = {
    link: { k: "var(--c-link)", name: L("Omurga bağlantısı", "Core link") },
    mpls: { k: "var(--c-mpls)", name: "MPLS" },
    tunnel: { k: "var(--c-tunnel)", name: L("Tünel başlıkları", "Tunnel headers") },
    sec: { k: "var(--c-sec)", name: "IPsec" },
    cust: { k: "var(--c-cust)", name: L("Müşteri Ethernet'i", "Customer Ethernet") },
    pay: { k: "var(--c-pay)", name: L("Müşteri IP paketi", "Customer IP packet") }
  };
  var LAYER_CAT = { mpls: "mpls", ipsec: "sec" };

  /* ---------- Durum ---------- */
  var S = M.parse(location.hash) || M.norm(Object.assign({ dir: "need", p: 1500 }, M.PRESETS.l3vpn.state));
  var preset = location.hash.length > 1 ? null : "l3vpn";
  var vendorTab = "nokia";
  var F = { size: 4000, mtu: null, ipver: null, df: false }; // mtu/ipver null: hesaptan gelir
  var R;

  function src(key, cls) {
    var s = D.SOURCES[key];
    return s ? '<a class="src ' + (cls || "") + '" href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.label) + "</a>" : "";
  }
  function seg(field, opts, cur, attrs) {
    return '<div class="mtu-seg" role="group">' + opts.map(function (o) {
      return '<button type="button" data-act="set" data-f="' + field + '" data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '"' + (o[2] ? " disabled" : "") + (attrs || "") + ">" + esc(o[1]) + "</button>";
    }).join("") + "</div>";
  }
  function sel(i, f, opts, cur, dis) {
    return '<select data-l="' + i + '" data-f="' + f + '"' + (dis ? " disabled" : "") + ">" + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (String(cur) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("") + "</select>";
  }
  function chk(i, f, on, label, bytes) {
    return '<label class="mtu-check"><input type="checkbox" data-l="' + i + '" data-f="' + f + '"' + (on ? " checked" : "") + "><span>" + esc(label) + " <small>+" + bytes + "</small></span></label>";
  }
  var IPV = [[4, "IPv4"], [6, "IPv6"]];

  /* ---------- Denetimler ---------- */
  function layerCard(l, i, n) {
    var body = "";
    if (l.t === "mpls") {
      body =
        '<div class="mtu-row"><label>' + L("Taşıma etiketi sayısı", "Transport labels") + '<input type="number" min="0" max="12" data-l="' + i + '" data-f="transport" value="' + l.transport + '"></label>' +
        "<label>" + L("Ek etiket (BGP-LU, ESI…)", "Extra labels (BGP-LU, ESI…)") + '<input type="number" min="0" max="12" data-l="' + i + '" data-f="extra" value="' + l.extra + '"></label></div>' +
        '<p class="mtu-hint">' + L("LDP veya tek RSVP tüneli 1, LDP over RSVP 2, SR-TE'de segment sayısı kadar.", "1 for LDP or a single RSVP tunnel, 2 for LDP over RSVP, one per segment with SR-TE.") + "</p>" +
        chk(i, "service", l.service, L("Servis etiketi (VPN / PW)", "Service label (VPN / PW)"), 4) +
        chk(i, "frr", l.frr, L("FRR bypass etiketi", "FRR bypass label"), 4) +
        chk(i, "entropy", l.entropy, L("Entropy label (ELI + EL)", "Entropy label (ELI + EL)"), 8) +
        chk(i, "flow", l.flow, L("Akış etiketi (FAT PW, Nokia hash-label)", "Flow label (FAT PW, Nokia hash-label)"), 4) +
        chk(i, "cw", l.cw, "Control word", 4);
    } else if (l.t === "vxlan") {
      body = '<div class="mtu-row"><label>' + L("Alt ağ (underlay)", "Underlay") + sel(i, "ip", IPV, l.ip) + "</label></div>";
    } else if (l.t === "gre") {
      body = '<div class="mtu-row"><label>' + L("Tünel uçları", "Tunnel endpoints") + sel(i, "ip", IPV, l.ip) + "</label></div>" +
        chk(i, "key", l.key, "Key", 4) + chk(i, "csum", l.csum, "Checksum", 4) + chk(i, "seq", l.seq, L("Sıra numarası", "Sequence number"), 4);
    } else if (l.t === "ipsec") {
      var aead = D.ESP_ENC[l.enc].aead;
      body = '<div class="mtu-row"><label>' + L("Kip", "Mode") + sel(i, "mode", [["tunnel", L("Tünel", "Tunnel")], ["transport", L("Taşıma", "Transport")]], l.mode) + "</label>" +
        "<label>" + (l.mode === "tunnel" ? L("Dış IP başlığı", "Outer IP header") : L("Korunan paketin IP sürümü", "IP version of protected packet")) + sel(i, "ip", IPV, l.ip) + "</label>" +
        "<label>" + L("Şifreleme", "Encryption") + sel(i, "enc", Object.keys(D.ESP_ENC).map(function (k) { return [k, k === "null" ? L("NULL (şifreleme yok)", "NULL (no encryption)") : D.ESP_ENC[k].label]; }), l.enc) + "</label>" +
        "<label>" + L("Bütünlük", "Integrity") + sel(i, "auth", Object.keys(D.ESP_AUTH).map(function (k) { return [k, k === "none" ? L("Yok", "None") : D.ESP_AUTH[k].label]; }), l.auth, aead) + "</label></div>" +
        (aead ? '<p class="mtu-hint">' + L("Bu şifre bütünlüğü kendisi sağlar (AEAD); ayrı bütünlük algoritması kullanılmaz.", "This cipher provides integrity itself (AEAD); no separate integrity algorithm is used.") + "</p>" : "") +
        chk(i, "natt", l.natt, L("NAT-T (UDP 4500 içinde ESP)", "NAT-T (ESP inside UDP 4500)"), 8);
    } else if (l.t === "srv6") {
      body = '<div class="mtu-row"><label>' + L("Segment (SID) sayısı", "Segments (SIDs)") + '<input type="number" min="1" max="16" data-l="' + i + '" data-f="segs" value="' + l.segs + '"></label></div>' +
        '<label class="mtu-check"><input type="checkbox" data-l="' + i + '" data-f="reduced"' + (l.reduced ? " checked" : "") + "><span>" + L("İndirgenmiş kapsülleme (H.Encaps.Red): ilk SID SRH'ye yazılmaz", "Reduced encapsulation (H.Encaps.Red): first SID is not written to the SRH") + "</span></label>" +
        '<p class="mtu-hint">' + L("uSID kullanıyorsanız tek taşıyıcıya sığan yol için 1 segment ve indirgenmiş kapsülleme seçin.", "With uSID, pick 1 segment and reduced encapsulation for a path that fits one carrier.") + "</p>";
    } else if (l.t === "gtpu") {
      body = '<div class="mtu-row"><label>' + L("Taşıma ağı", "Transport network") + sel(i, "ip", IPV, l.ip) + "</label>" +
        "<label>" + L("GTP-U başlığı", "GTP-U header") + sel(i, "hdr", [["5g", L("5G N3: PDU Session Container (16)", "5G N3: PDU Session Container (16)")], ["seq", L("Sıra numaralı (12)", "With sequence number (12)")], ["base", L("Yalnızca zorunlu başlık, LTE S1-U (8)", "Mandatory header only, LTE S1-U (8)")]], l.hdr) + "</label></div>";
    }
    var oh = l.t === "ipsec" ? L("değişken", "variable") : "+" + M.layerOverhead(l, 1400) + " " + B;
    return '<div class="mtu-layer" style="--lc:' + CAT[LAYER_CAT[l.t] || "tunnel"].k + '"><div class="mtu-layer__head">' +
      '<span class="mtu-layer__name">' + (i + 1) + ". " + esc(t(M.LAYER_NAMES[l.t])) + '</span><span class="mtu-layer__bytes">' + oh + "</span>" +
      '<button type="button" class="mtu-icon" data-act="up" data-l="' + i + '"' + (i === 0 ? " disabled" : "") + ' aria-label="' + L("Dışa taşı", "Move outward") + '" title="' + L("Dışa taşı", "Move outward") + '">↑</button>' +
      '<button type="button" class="mtu-icon" data-act="down" data-l="' + i + '"' + (i === n - 1 ? " disabled" : "") + ' aria-label="' + L("İçe taşı", "Move inward") + '" title="' + L("İçe taşı", "Move inward") + '">↓</button>' +
      '<button type="button" class="mtu-icon" data-act="del" data-l="' + i + '" aria-label="' + L("Katmanı kaldır", "Remove layer") + '" title="' + L("Katmanı kaldır", "Remove layer") + '">✕</button>' +
      "</div>" + body + "</div>";
  }

  function renderControls() {
    var keep = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-k");
    var noLayers = !S.layers.length;
    var html =
      '<div class="mtu-field"><span class="mtu-legend">' + L("Senaryo", "Scenario") + '</span><div class="mtu-chips">' +
      Object.keys(M.PRESETS).map(function (k) { return '<button type="button" class="mtu-chip" data-act="preset" data-v="' + k + '" aria-pressed="' + (preset === k) + '">' + esc(t(M.PRESETS[k].name)) + "</button>"; }).join("") + "</div></div>" +

      '<div class="mtu-field"><span class="mtu-legend">' + L("Ne biliyorsun?", "What do you know?") + "</span>" +
      seg("dir", [["need", L("Müşterinin istediği boyu", "What the customer needs")], ["have", L("Omurgamın MTU'sunu", "My core MTU")]], S.dir) + "</div>";

    if (S.dir === "need") {
      html += '<div class="mtu-field"><label for="fP">' + L("Müşteri IP paketi (bayt)", "Customer IP packet (bytes)") + '</label><div class="mtu-inline">' +
        '<input id="fP" type="number" min="68" max="65535" data-f="p" data-k="p" value="' + S.p + '">' +
        [1500, 9000].map(function (v) { return '<button type="button" class="mtu-chip" data-act="set" data-f="p" data-v="' + v + '">' + v + "</button>"; }).join("") +
        '</div><p class="mtu-hint">' + L("Müşterinin parçalanmadan geçirmek istediği en büyük IP paketi.", "The largest IP packet the customer wants to pass unfragmented.") + "</p></div>";
    } else {
      html += '<div class="mtu-field"><label for="fC">' + L("Omurga arayüzündeki MTU değeri", "MTU value on the core interface") + "</label>" +
        '<div class="mtu-inline"><input id="fC" type="number" min="68" max="65535" data-f="core" data-k="core" value="' + S.core + '">' +
        [1500, 1514, 9212].map(function (v) { return '<button type="button" class="mtu-chip" data-act="set" data-f="core" data-v="' + v + '">' + v + "</button>"; }).join("") + "</div>" +
        '<label for="fU" style="margin-top:12px">' + L("Bu değer hangi cihazdan?", "Which device is this value from?") + "</label>" +
        '<select id="fU" data-f="coreUnit">' + [
          ["frame", L("Nokia port MTU / Junos media MTU (Ethernet başlığı ve VLAN dahil)", "Nokia port MTU / Junos media MTU (Ethernet header and VLAN included)")],
          ["xr", L("Cisco IOS XR mtu (Ethernet başlığı dahil, VLAN hariç)", "Cisco IOS XR mtu (Ethernet header included, VLAN excluded)")],
          ["l2", L("Huawei mtu / Cisco IOS mtu (yalnızca L2 yükü)", "Huawei mtu / Cisco IOS mtu (L2 payload only)")]
        ].map(function (o) { return '<option value="' + o[0] + '"' + (S.coreUnit === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div>";
    }

    html += '<div class="mtu-field"><span class="mtu-legend">' + L("Müşteri yükü", "Customer payload") + '</span><div class="mtu-inline">' +
      seg("ipver", IPV, S.ipver) +
      seg("payload", [["ip", L("IP paketi (L3 servis)", "IP packet (L3 service)")], ["eth", L("Ethernet çerçevesi (L2 servis)", "Ethernet frame (L2 service)"), noLayers]], S.payload) + "</div>" +
      (S.payload === "eth" ? '<p class="mtu-hint" style="margin:12px 0 6px">' + L("Serviste taşınan müşteri VLAN etiketi", "Customer VLAN tags carried in the service") + "</p>" +
        seg("ctags", [[0, L("Yok (sökülüyor)", "None (stripped)")], [1, L("1 etiket", "1 tag")], [2, L("2 etiket", "2 tags")]], S.ctags) : "") + "</div>" +

      '<div class="mtu-field"><span class="mtu-legend">' + L("Omurga portunun kapsüllemesi", "Core port encapsulation") + "</span>" +
      seg("coreTags", [[0, L("Etiketsiz (null)", "Untagged (null)")], [1, "dot1q"], [2, "QinQ"]], S.coreTags) + "</div>" +

      '<div class="mtu-field"><span class="mtu-legend">' + L("Kapsülleme katmanları (dıştan içe)", "Encapsulation layers (outer to inner)") + "</span>" +
      (noLayers ? '<p class="mtu-empty">' + L("Katman yok: müşteri paketi omurgada olduğu gibi taşınıyor.", "No layers: the customer packet travels on the core as is.") + "</p>" : S.layers.map(function (l, i) { return layerCard(l, i, S.layers.length); }).join("")) +
      '<label for="fAdd" class="sr-only">' + L("Katman ekle", "Add layer") + '</label><select id="fAdd" data-act="add" style="margin-top:12px"><option value="">' + L("+ Katman ekle (en içe)", "+ Add layer (innermost)") + "</option>" +
      Object.keys(M.LAYER_NAMES).map(function (k) { return '<option value="' + k + '">' + esc(t(M.LAYER_NAMES[k])) + "</option>"; }).join("") + "</select></div>" +

      '<div class="mtu-share"><button type="button" data-act="share">' + L("Bağlantıyı kopyala", "Copy link") + '</button><span id="shareMsg" role="status">' + L("Seçimler adres çubuğunda tutulur.", "Your choices are kept in the address bar.") + "</span></div>";

    $("controls").innerHTML = html;
    if (keep) { var el = $("controls").querySelector('[data-k="' + keep + '"]'); if (el) el.focus(); }
  }

  /* ---------- Sonuç ve yığın ---------- */
  function stat(label, value, sub, key) {
    return '<div class="mtu-stat' + (key ? " is-key" : "") + '"><div class="mtu-stat__label">' + label + '</div><div class="mtu-stat__value">' + nf(value) + " <small>" + B + '</small></div><div class="mtu-stat__sub">' + sub + "</div></div>";
  }
  function renderResult() {
    if (!R.ok) { $("result").innerHTML = '<div class="mtu-error" role="alert">' + esc(t(R.error)) + "</div>"; $("stack").innerHTML = ""; return; }
    var need = S.dir === "need";
    var html = '<h3>' + (need ? L("Omurgada gereken", "Required on the core") : L("Müşteriye kalan", "Left for the customer")) + '</h3><div class="mtu-stats">' +
      stat(L("Müşteri IP paketi", "Customer IP packet"), R.P, "IPv" + R.ipver + (R.F ? " · " + L("taşınan çerçeve ", "carried frame ") + nf(R.F) : ""), !need) +
      stat("TCP MSS", R.mss, L("IP paketi − ", "IP packet − ") + (R.ipver === 6 ? 60 : 40), !need) +
      stat(L("Omurga L2 yükü", "Core L2 payload"), R.L, L("Huawei ve Cisco IOS'ta mtu değeri", "The mtu value on Huawei and Cisco IOS"), need) +
      stat(L("Kablodaki çerçeve", "Frame on the wire"), R.frame, L("FCS ile ", "With FCS ") + nf(R.frameFcs) + " · " + L("Nokia port, Junos media MTU", "Nokia port, Junos media MTU"), need) +
      "</div>" +
      '<p class="mtu-hint" style="margin-top:14px">' + L("Müşteri IP paketinin üstüne binen kapsülleme: ", "Encapsulation added on top of the customer IP packet: ") + "<strong>" + nf(R.overhead) + " " + B + "</strong>" +
      (R.linkHdr ? L(", omurga Ethernet başlığı ayrıca ", ", plus the core Ethernet header ") + R.linkHdr + " " + B : "") + ".</p>";
    if (R.warnings.length) html += '<ul class="mtu-notes">' + R.warnings.map(function (w) {
      return '<li class="' + (w.level === "warn" ? "is-warn" : "") + '"><span class="sr-only">' + (w.level === "warn" ? L("Uyarı: ", "Warning: ") : L("Not: ", "Note: ")) + "</span>" + esc(t(w.text)) + " " + src(w.src) + "</li>";
    }).join("") + "</ul>";
    $("result").innerHTML = html;

    var total = R.blocks.reduce(function (a, b) { return a + b.bytes; }, 0);
    var cats = [];
    R.blocks.forEach(function (b) { if (cats.indexOf(b.cat) < 0) cats.push(b.cat); });
    $("stack").innerHTML = "<h3>" + L("Kablodaki çerçeve, dıştan içe", "Frame on the wire, outer to inner") + "</h3>" +
      '<div class="mtu-bar" role="img" aria-label="' + L("Çerçevenin katmanlara göre dağılımı; ayrıntı aşağıdaki tabloda", "Frame split by layer; details in the table below") + '">' +
      R.blocks.map(function (b) { return '<span style="flex:' + b.bytes + " 1 0;--k:" + CAT[b.cat].k + '" title="' + esc(t(b.name)) + ": " + b.bytes + " " + B + '"></span>'; }).join("") + "</div>" +
      '<div class="mtu-bar__cap"><span>0</span><span>' + nf(total) + " " + B + "</span></div>" +
      '<div class="mtu-legend-row">' + cats.map(function (c) { return '<span><i style="--k:' + CAT[c].k + '"></i>' + esc(CAT[c].name) + "</span>"; }).join("") + "</div>" +
      '<table class="mtu-stack"><thead><tr><th>' + L("Katman", "Layer") + '</th><th class="num">' + L("Bayt", "Bytes") + '</th><th class="s">' + L("Kaynak", "Source") + "</th></tr></thead><tbody>" +
      R.blocks.map(function (b) { return '<tr><td><i style="--k:' + CAT[b.cat].k + '"></i>' + esc(t(b.name)) + '</td><td class="num">' + nf(b.bytes) + '</td><td class="s">' + src(b.src) + "</td></tr>"; }).join("") +
      "</tbody><tfoot><tr><td>" + L("Toplam (FCS hariç)", "Total (without FCS)") + '</td><td class="num">' + nf(total) + '</td><td class="s"></td></tr></tfoot></table>' +
      (R.slack ? '<p class="mtu-hint">' + L("Tablo en büyük müşteri paketini gösterir; omurgada " + R.slack + " bayt kullanılmadan kalır.", "The table shows the largest customer packet; " + R.slack + " bytes on the core stay unused.") + "</p>" : "");
  }

  /* ---------- Üreticiler ---------- */
  var CONF = {
    doc: L("Resmi dokümanda", "In official docs"),
    derived: L("Dokümandan türetildi", "Derived from docs"),
    unverified: L("Doğrulanmadı", "Not verified")
  };
  function cmdBlock(cmd) {
    return '<pre class="mtu-cmd"><code>' + esc(cmd) + '</code><button type="button" class="mtu-copy" data-act="copy" data-v="' + esc(cmd) + '">' + L("Kopyala", "Copy") + "</button></pre>";
  }
  function renderVendors() {
    if (!R.ok) { $("vendors").innerHTML = ""; return; }
    var v = R.vendors.filter(function (x) { return x.id === vendorTab; })[0] || R.vendors[0];
    $("vendors").innerHTML =
      '<table class="mtu-sum"><thead><tr><th>' + L("Üretici", "Vendor") + "</th><th>" + L("Omurga arayüzünde ayarlanan", "Configured on the core interface") + '</th><th class="num">' + L("Değer", "Value") + "</th></tr></thead><tbody>" +
      R.vendors.map(function (x) { return "<tr><td>" + esc(x.name) + "</td><td>" + esc(t(x.rows[0].what)) + '</td><td class="num">' + nf(x.rows[0].value) + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<div class="mtu-chips" role="group" aria-label="' + L("Üretici ayrıntısı", "Vendor details") + '">' +
      R.vendors.map(function (x) { return '<button type="button" class="mtu-chip" data-act="vendor" data-v="' + x.id + '" aria-pressed="' + (x.id === v.id) + '">' + esc(x.name) + "</button>"; }).join("") + "</div>" +
      '<div style="margin-top:14px">' + v.rows.map(function (r) {
        return '<div class="mtu-vrow"><div class="mtu-vrow__top"><span class="mtu-vrow__what">' + esc(t(r.what)) + '</span><span class="mtu-badge ' + r.conf + '">' + CONF[r.conf] + '</span><span class="mtu-vrow__val">' + nf(r.value) + "</span></div>" +
          (r.cmd ? cmdBlock(r.cmd) : "") + "<p>" + esc(t(r.note)) + '</p><div class="srcs">' + L("Kaynak: ", "Source: ") + r.src.map(function (k) { return src(k); }).join(" · ") + "</div></div>";
      }).join("") + "</div>" +
      '<p class="mtu-hint">' + L("Komutlardaki port, servis ve arayüz adları örnektir; kendi yapılandırmanıza göre değiştirin.", "Port, service and interface names in the commands are examples; replace them with your own.") + "</p>";
  }

  /* ---------- Doğrulama komutları ---------- */
  function renderVerify() {
    if (!R.ok) { $("verify").innerHTML = ""; return; }
    var v6 = R.ipver === 6, pay = v6 ? R.ping.v6 : R.ping.v4, host = v6 ? "2001:db8::1" : "192.0.2.1";
    var list = [
      ["Linux", "ping " + (v6 ? "-6 " : "") + "-M do -s " + pay + " " + host],
      ["Windows", "ping " + (v6 ? "-6 " : "-f ") + "-l " + pay + " " + host],
      ["Cisco IOS / IOS XE", "ping " + (v6 ? "ipv6 " : "") + host + " size " + R.P + (v6 ? "" : " df-bit")],
      ["Juniper Junos", "ping " + host + " size " + pay + (v6 ? "" : " do-not-fragment")],
      ["Huawei VRP", "ping " + (v6 ? "ipv6 " : "-f ") + "-s " + pay + " " + host]
    ];
    if (R.F && R.outerKind === "mpls") list.push(["Nokia SR OS (SDP)", "oam sdp-mtu 1 size-inc " + (R.F - 5) + " " + (R.F + 5) + " step 1"]);
    $("verify").innerHTML = '<div class="mtu-cmds">' + list.map(function (c) { return "<div><h3 lang=\"en\">" + esc(c[0]) + "</h3>" + cmdBlock(c[1]) + "</div>"; }).join("") + "</div>" +
      '<p class="mtu-hint" style="margin-top:16px">' + (v6
        ? L("IPv6'da yönlendiriciler parçalamaz, ayrıca DF bayrağı gerekmez. Ping verisi = IP paketi − 48 (40 IPv6 + 8 ICMPv6).", "IPv6 routers never fragment, so no DF flag is needed. Ping data = IP packet − 48 (40 IPv6 + 8 ICMPv6).")
        : L("Ping verisi = IP paketi − 28 (20 IPv4 + 8 ICMP). Cisco'da size IP paketinin tamamıdır, diğerlerinde yalnızca veridir.", "Ping data = IP packet − 28 (20 IPv4 + 8 ICMP). On Cisco, size is the whole IP packet; on the others it is the data only.")) +
      " " + L("Bu boyut geçmeli, bir bayt fazlası geçmemelidir. Adresler dokümantasyon aralığındandır; üretici komutlarının sözdizimini kendi sürümünüzde doğrulayın.", "This size must pass and one byte more must not. Addresses are from the documentation range; check vendor command syntax on your own release.") +
      (R.F && R.outerKind === "mpls" ? " " + L("Nokia'da SDP path MTU'su en az service-mtu kadar olmalıdır: ", "On Nokia the SDP path MTU must be at least the service-mtu: ") + src("nokiaPmtud") : "") + "</p>";
  }

  /* ---------- Parçalanma ---------- */
  function renderFragForm() {
    var mtu = F.mtu == null ? (R.ok ? R.P : 1500) : F.mtu, v = F.ipver == null ? S.ipver : F.ipver;
    $("frag").innerHTML = '<div class="mtu-frag-form">' +
      '<div><label class="mtu-legend" for="gS">' + L("Paket boyu (bayt)", "Packet size (bytes)") + '</label><input id="gS" type="number" min="21" max="65535" data-g="size" value="' + F.size + '"></div>' +
      '<div><label class="mtu-legend" for="gM">' + L("Sığması gereken IP MTU'su", "IP MTU it has to fit") + '</label><input id="gM" type="number" min="68" max="65535" data-g="mtu" value="' + mtu + '"></div>' +
      '<div><span class="mtu-legend">' + L("IP sürümü", "IP version") + '</span><div class="mtu-seg" role="group">' + IPV.map(function (o) { return '<button type="button" data-act="gver" data-v="' + o[0] + '" aria-pressed="' + (v === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div></div>" +
      '<div><label class="mtu-check"><input type="checkbox" data-g="df"' + (F.df ? " checked" : "") + (v === 6 ? " disabled" : "") + "><span>" + L("DF biti açık (parçalanmasın)", "DF bit set (don't fragment)") + "</span></label></div></div>" +
      '<p class="mtu-hint">' + (F.mtu == null ? L("MTU, yukarıdaki hesaptan gelen müşteri IP paketine bağlı; elle değiştirebilirsiniz.", "The MTU follows the customer IP packet from the calculation above; you can override it.") : '<button type="button" class="mtu-chip" data-act="glink">' + L("Hesaptaki değere bağla", "Follow the calculation") + "</button>") + '</p><div id="fragOut" aria-live="polite"></div>';
    renderFragOut();
  }
  function renderFragOut() {
    var mtu = F.mtu == null ? (R.ok ? R.P : 1500) : F.mtu, v = F.ipver == null ? S.ipver : F.ipver;
    var r = M.fragment({ size: F.size, mtu: mtu, ipver: v, df: F.df }), html;
    if (r.action === "error") html = '<p class="mtu-verdict bad">' + esc(t(r.error)) + "</p>";
    else if (r.action === "forward") html = '<p class="mtu-verdict ok"><strong>' + L("Sığıyor.", "It fits.") + "</strong> " + L(nf(r.size) + " baytlık paket " + nf(r.mtu) + " baytlık MTU'dan parçalanmadan geçer.", "A " + nf(r.size) + "-byte packet passes a " + nf(r.mtu) + "-byte MTU without fragmentation.") + "</p>";
    else {
      var n = r.fragments.length;
      var head = r.action === "drop"
        ? '<p class="mtu-verdict bad"><strong>' + L("Paket düşer.", "The packet is dropped.") + "</strong> " + L("DF biti açık olduğu için yönlendirici parçalayamaz ve kaynağa şu iletiyi yollar:", "With DF set the router cannot fragment and sends the source:") + " <code>" + esc(r.icmp.name) + ", Next-Hop MTU " + r.icmp.mtu + "</code> " + src(r.icmp.src) +
          "<small>" + L("Kaynak bu iletiyi alırsa paket boyunu düşürür (PMTUD). ICMP yolda süzülüyorsa bağlantı sessizce takılır. DF kapalı olsaydı paket aşağıdaki gibi " + n + " parçaya bölünürdü.", "If the source receives it, it lowers its packet size (PMTUD). If ICMP is filtered on the path, the connection silently stalls. With DF clear the packet would be split into " + n + " fragments as below.") + "</small></p>"
        : r.action === "ptb"
          ? '<p class="mtu-verdict warn"><strong>' + L("Yönlendirici parçalamaz.", "The router does not fragment.") + "</strong> " + L("IPv6'da paketi düşürür ve kaynağa şu iletiyi yollar:", "On IPv6 it drops the packet and sends the source:") + " <code>" + esc(r.icmp.name) + ", MTU " + r.icmp.mtu + "</code> " + src(r.icmp.src) +
            "<small>" + L("Parçalamayı yalnızca kaynak yapabilir; her parçaya 8 baytlık parçalama başlığı eklenir. Kaynak bölerse sonuç aşağıdaki " + n + " parçadır.", "Only the source may fragment; each fragment gets an 8-byte fragment header. If the source splits it, the result is the " + n + " fragments below.") + " " + src("rfc8200") + "</small></p>"
          : '<p class="mtu-verdict warn"><strong>' + L(n + " parçaya bölünür.", "Split into " + n + " fragments.") + "</strong> " + L("Her parça kendi 20 baytlık IPv4 başlığını taşır; son parça dışındakilerin verisi 8 baytın katıdır.", "Each fragment carries its own 20-byte IPv4 header; data in all but the last is a multiple of 8 bytes.") + " " + src("rfc791") + "</p>";
      html = head +
        '<div class="mtu-fbar" role="img" aria-label="' + L("Parçaların boyları; ayrıntı tabloda", "Fragment sizes; details in the table") + '">' + r.fragments.map(function (f) { return '<span style="flex:' + f.total + ' 1 0" title="#' + f.i + ": " + f.total + " " + B + '"><b style="flex:' + (f.total - f.data) + ' 0 0"></b><em style="flex:' + f.data + ' 1 0"></em></span>'; }).join("") + "</div>" +
        '<div class="mtu-legend-row"><span><i style="--k:var(--c-link)"></i>' + L("Başlık", "Header") + '</span><span><i style="--k:var(--c-pay)"></i>' + L("Veri", "Data") + "</span></div>" +
        '<table class="mtu-stack"><thead><tr><th>#</th><th class="num">' + L("Ofset (bayt)", "Offset (bytes)") + '</th><th class="num">' + L("Ofset alanı", "Offset field") + '</th><th class="num">' + L("Veri", "Data") + '</th><th class="num">' + L("Toplam", "Total") + "</th><th>" + L("Devamı var (MF)", "More fragments (MF)") + "</th></tr></thead><tbody>" +
        r.fragments.slice(0, 60).map(function (f) { return "<tr><td>" + f.i + '</td><td class="num">' + nf(f.offset) + '</td><td class="num">' + nf(f.offsetUnits) + '</td><td class="num">' + nf(f.data) + '</td><td class="num">' + nf(f.total) + "</td><td>" + (f.mf ? L("1 (evet)", "1 (yes)") : L("0 (son parça)", "0 (last)")) + "</td></tr>"; }).join("") +
        "</tbody><tfoot><tr><td colspan=\"4\">" + L("Kabloya çıkan toplam", "Total sent") + '</td><td class="num">' + nf(r.totalBytes) + "</td><td>+" + nf(r.extraBytes) + " " + B + "</td></tr></tfoot></table>";
    }
    $("fragOut").innerHTML = html;
  }

  /* ---------- Kaynaklar ---------- */
  function renderSources() {
    var S_ = D.SOURCES, keys = Object.keys(S_);
    var li = function (kind) { return keys.filter(function (k) { return S_[k].kind === kind; }).map(function (k) { return "<li>" + src(k) + "</li>"; }).join(""); };
    $("sources").innerHTML =
      '<div class="mtu-vrow"><div class="mtu-vrow__top"><span class="mtu-badge doc">' + CONF.doc + "</span></div><p>" + L("Değer ya da kural üreticinin resmi dokümanında açıkça yazıyor.", "The value or rule is stated explicitly in the vendor's official documentation.") + "</p></div>" +
      '<div class="mtu-vrow"><div class="mtu-vrow__top"><span class="mtu-badge derived">' + CONF.derived + "</span></div><p>" + L("Dokümanda yazan kuraldan hesapla çıkarıldı; kuralın kendisi resmi, sonuç benim çıkarımım.", "Calculated from a documented rule; the rule is official, the result is my inference.") + "</p></div>" +
      '<div class="mtu-vrow"><div class="mtu-vrow__top"><span class="mtu-badge unverified">' + CONF.unverified + "</span></div><p>" + L("Resmi dokümanda doğrulayamadım. Cihazda kontrol etmeden güvenmeyin.", "I could not verify this in official documentation. Do not rely on it without checking on the device.") + "</p></div>" +
      "<details><summary>" + L("Standartlar (RFC, 3GPP, IEEE)", "Standards (RFC, 3GPP, IEEE)") + "</summary><ul>" + li("std") + "</ul></details>" +
      "<details open><summary>" + L("Üretici dokümanları", "Vendor documentation") + "</summary><ul>" + li("vendor") + "</ul></details>";
  }

  /* ---------- Güncelleme ---------- */
  function update(full) {
    S = M.norm(S);
    R = M.compute(S);
    if (full) renderControls();
    renderResult(); renderVendors(); renderVerify(); renderFragForm();
    try { history.replaceState(null, "", "#" + M.serialize(S)); } catch (e) { /* file:// */ }
  }
  function copy(text, done) {
    var ok = function () { done && done(true); }, no = function () { done && done(false); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, no); else no();
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || b.tagName === "SELECT") return;
    var a = b.dataset.act, i = Number(b.dataset.l), v = b.dataset.v;
    if (a === "preset") { var p = M.PRESETS[v].state; S.payload = p.payload; S.layers = JSON.parse(JSON.stringify(p.layers)); S.ctags = 0; preset = v; update(true); }
    else if (a === "set") { S[b.dataset.f] = /^\d+$/.test(v) ? Number(v) : v; if (b.dataset.f === "payload") preset = null; update(true); }
    else if (a === "del") { S.layers.splice(i, 1); preset = null; update(true); }
    else if (a === "up" && i > 0) { S.layers.splice(i - 1, 0, S.layers.splice(i, 1)[0]); preset = null; update(true); }
    else if (a === "down" && i < S.layers.length - 1) { S.layers.splice(i + 1, 0, S.layers.splice(i, 1)[0]); preset = null; update(true); }
    else if (a === "vendor") { vendorTab = v; renderVendors(); }
    else if (a === "gver") { F.ipver = Number(v); if (F.ipver === 6) F.df = false; renderFragForm(); }
    else if (a === "glink") { F.mtu = null; F.ipver = null; renderFragForm(); }
    else if (a === "copy") copy(v, function (ok) { var o = b.textContent; b.textContent = ok ? L("Kopyalandı", "Copied") : L("Kopyalanamadı", "Copy failed"); setTimeout(function () { b.textContent = o; }, 1400); });
    else if (a === "share") copy(location.href, function (ok) { $("shareMsg").textContent = ok ? L("Bağlantı kopyalandı.", "Link copied.") : L("Kopyalanamadı; adres çubuğundan alabilirsiniz.", "Could not copy; take it from the address bar."); });
  });

  $("controls").addEventListener("input", function (e) {
    var el = e.target;
    if (el.type !== "number") return;
    var n = parseInt(el.value, 10);
    if (!isFinite(n)) return;
    if (el.dataset.l != null) { S.layers[Number(el.dataset.l)][el.dataset.f] = n; preset = null; update(false); }
    else if (el.dataset.f) { S[el.dataset.f] = n; update(false); }
  });
  $("controls").addEventListener("change", function (e) {
    var el = e.target;
    if (el.dataset.act === "add") { if (el.value) { S.layers.push({ t: el.value }); preset = null; update(true); } return; }
    if (el.type === "number") { update(true); return; }           // alanı sınırlanmış değerle eşitle
    if (el.dataset.l != null) { S.layers[Number(el.dataset.l)][el.dataset.f] = el.type === "checkbox" ? (el.checked ? 1 : 0) : el.value; preset = null; update(true); }
    else if (el.dataset.f) { S[el.dataset.f] = el.value; update(true); }
  });
  $("frag").addEventListener("input", function (e) {
    var el = e.target, g = el.dataset.g;
    if (!g) return;
    if (g === "df") { F.df = el.checked; renderFragOut(); return; }
    var n = parseInt(el.value, 10);
    if (!isFinite(n)) return;
    F[g] = n; renderFragOut();
  });
  $("frag").addEventListener("change", function (e) { if (e.target.dataset.g === "mtu") renderFragForm(); });

  renderSources();
  update(true);
})();
