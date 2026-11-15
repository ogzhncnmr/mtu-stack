/* Çalıştırma: node --test araclar/mtu/test/
   Beklenen değerlerin çoğu üretici dokümanlarındaki örneklerden ya da RFC'lerden gelir;
   kaynağı her testin üstünde yazıyor. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../mtu-core.js");

const vendor = (r, id) => r.vendors.find((v) => v.id === id);
const val = (r, id, i = 0) => vendor(r, id).rows[i].value;

test("düz IP: 1500 baytlık paket, MSS 1460, çerçeve 1514", () => {
  const r = M.compute({ dir: "need", p: 1500, layers: [] });
  assert.equal(r.L, 1500);
  assert.equal(r.frame, 1514);
  assert.equal(r.frameFcs, 1518);
  assert.equal(r.mss, 1460);
  assert.equal(r.overhead, 0);
});

test("IPv6 müşteri: MSS = P − 60", () => {
  const r = M.compute({ dir: "need", p: 1500, ipver: 6, layers: [] });
  assert.equal(r.mss, 1440);
});

// Cisco 116350: 1500 baytlık IPv4 + 2 etiket = 1508 baytlık MPLS çerçevesi, IOS XR'da mtu 1522
test("L3VPN, 2 etiket: L 1508; IOS 1508, IOS XR 1522, Nokia 1522, Junos 1522, Huawei 1508", () => {
  const r = M.compute({ dir: "need", p: 1500, payload: "ip", layers: [{ t: "mpls" }] });
  assert.equal(r.L, 1508);
  assert.equal(r.labels, 2);
  assert.equal(val(r, "ios"), 1508);
  assert.equal(val(r, "xr"), 1522);
  assert.equal(val(r, "nokia"), 1522);
  assert.equal(val(r, "junos"), 1522);
  assert.equal(val(r, "huawei"), 1508);
});

// Nokia ACG (PMTUD): 1514 baytlık servis için en küçük ağ portu MTU'su 1514 + 4 + 4 + 14 = 1536
test("Nokia Epipe: service-mtu 1514, ağ portu 1536, VC MTU 1500", () => {
  const r = M.compute({ dir: "need", p: 1500, payload: "eth", layers: [{ t: "mpls" }] });
  assert.equal(r.F, 1514);
  assert.equal(val(r, "nokia", 0), 1536);
  assert.equal(val(r, "nokia", 1), 1514);
  assert.equal(val(r, "nokia", 2), 1500);
});

// Nokia ACG (PMTUD): ağ portu 1600 → SDP path MTU 1600 − 14 − 8 = 1578
test("Nokia ters yön: port 1600 → en büyük servis çerçevesi 1578", () => {
  const r = M.compute({ dir: "have", core: 1600, coreUnit: "frame", payload: "eth", layers: [{ t: "mpls" }] });
  assert.equal(r.F, 1578);
  assert.equal(r.P, 1564);
});

// Nokia ACG (PMTUD): ağ portu 512 → IP MTU 498, TCP MSS 458
test("Nokia ters yön: port 512 → IP MTU 498, MSS 458", () => {
  const r = M.compute({ dir: "have", core: 512, coreUnit: "frame", payload: "ip", layers: [] });
  assert.equal(r.P, 498);
  assert.equal(r.mss, 458);
});

test("omurga dot1q ise Nokia ve Junos +4, IOS XR ve Huawei değişmez", () => {
  const a = M.compute({ dir: "need", p: 1500, layers: [{ t: "mpls" }] });
  const b = M.compute({ dir: "need", p: 1500, coreTags: 1, layers: [{ t: "mpls" }] });
  assert.equal(val(b, "nokia") - val(a, "nokia"), 4);
  assert.equal(val(b, "junos") - val(a, "junos"), 4);
  assert.equal(val(b, "xr"), val(a, "xr"));
  assert.equal(val(b, "huawei"), val(a, "huawei"));
});

test("ters yön birimleri: IOS XR mtu 1522 ve Huawei mtu 1508 aynı L'yi verir", () => {
  const xr = M.compute({ dir: "have", core: 1522, coreUnit: "xr", layers: [{ t: "mpls" }] });
  const hw = M.compute({ dir: "have", core: 1508, coreUnit: "l2", layers: [{ t: "mpls" }] });
  assert.equal(xr.L, 1508);
  assert.equal(hw.L, 1508);
  assert.equal(xr.P, 1500);
  assert.equal(hw.P, 1500);
});

test("Epipe seçenekleri: control word +4, akış etiketi +4, entropy +8, FRR +4, müşteri VLAN +4", () => {
  const base = M.compute({ dir: "need", p: 1500, payload: "eth", layers: [{ t: "mpls" }] }).L;
  const L = (extra, st) => M.compute(Object.assign({ dir: "need", p: 1500, payload: "eth", layers: [Object.assign({ t: "mpls" }, extra)] }, st)).L;
  assert.equal(base, 1522);
  assert.equal(L({ cw: 1 }) - base, 4);
  assert.equal(L({ flow: 1 }) - base, 4);
  assert.equal(L({ entropy: 1 }) - base, 8);
  assert.equal(L({ frr: 1 }) - base, 4);
  assert.equal(L({}, { ctags: 1 }) - base, 4);
  // Yanıttaki örnek: VLAN korunuyor + control word → 1530
  assert.equal(L({ cw: 1 }, { ctags: 1 }), 1530);
});

// RFC 7348: 1500 baytlık IP taşıyan çerçeve için alt ağda 1550 bayt IP MTU'su
test("VXLAN IPv4: 50 bayt ek yük, alt ağ 1550; IPv6 alt ağda 1570", () => {
  assert.equal(M.compute({ dir: "need", p: 1500, payload: "eth", layers: [{ t: "vxlan" }] }).L, 1550);
  assert.equal(M.compute({ dir: "need", p: 1500, payload: "eth", layers: [{ t: "vxlan", ip: 6 }] }).L, 1570);
});

test("GRE: 1500 baytlık omurgada 1476; key ile 1472", () => {
  assert.equal(M.compute({ dir: "have", core: 1500, coreUnit: "l2", layers: [{ t: "gre" }] }).P, 1476);
  assert.equal(M.compute({ dir: "have", core: 1500, coreUnit: "l2", layers: [{ t: "gre", key: 1 }] }).P, 1472);
});

test("PPPoE: 1500 baytlık bağlantıda 1492", () => {
  assert.equal(M.compute({ dir: "have", core: 1500, coreUnit: "l2", layers: [{ t: "pppoe" }] }).P, 1492);
});

// RFC 4303 + RFC 3602 / 4106: tünel kipi, 1500 baytlık dış MTU
test("IPsec tünel: AES-CBC + SHA-256 → 1438, AES-CBC + SHA-1 → 1438, AES-GCM → 1446", () => {
  const P = (l) => M.compute({ dir: "have", core: 1500, coreUnit: "l2", layers: [Object.assign({ t: "ipsec" }, l)] }).P;
  assert.equal(P({ enc: "aes-cbc", auth: "sha256" }), 1438);
  assert.equal(P({ enc: "aes-cbc", auth: "sha1" }), 1438);
  assert.equal(P({ enc: "aes-gcm" }), 1446);
  assert.equal(P({ enc: "aes-gcm", natt: 1 }), 1438);
  assert.equal(P({ enc: "aes-gcm", ip: 6 }), 1426);
});

test("IPsec: ileri ve geri yön tutarlı, taşma yok", () => {
  for (const enc of Object.keys(M.DATA.ESP_ENC)) {
    for (const auth of Object.keys(M.DATA.ESP_AUTH)) {
      for (const mode of ["tunnel", "transport"]) {
        for (const core of [1280, 1400, 1500, 1501, 1502, 1503, 9000]) {
          const layers = [{ t: "ipsec", enc, auth, mode }];
          const have = M.compute({ dir: "have", core, coreUnit: "l2", layers });
          assert.ok(have.Lused <= core, `${enc}/${auth}/${mode}/${core}: taşma`);
          // Bir bayt daha büyük müşteri paketi omurgaya sığmamalı
          const need = M.compute({ dir: "need", p: have.P + 1, layers });
          assert.ok(need.L > core, `${enc}/${auth}/${mode}/${core}: en büyük değil`);
        }
      }
    }
  }
});

test("IPsec taşıma kipi: dış IP başlığı eklenmez", () => {
  const tun = M.compute({ dir: "need", p: 1400, layers: [{ t: "ipsec", mode: "tunnel" }] }).L;
  const tra = M.compute({ dir: "need", p: 1400, layers: [{ t: "ipsec", mode: "transport" }] }).L;
  assert.equal(tun - tra, 20);
});

// RFC 8754: SRH = 8 + 16 × SID; RFC 8986: indirgenmiş kapsüllemede ilk SID SRH'ye yazılmaz
test("SRv6: tek SID indirgenmiş 40; 3 SID 96; 3 SID indirgenmiş 80", () => {
  const O = (l) => M.compute({ dir: "need", p: 1500, layers: [Object.assign({ t: "srv6" }, l)] }).overhead;
  assert.equal(O({ segs: 1, reduced: 1 }), 40);
  assert.equal(O({ segs: 1, reduced: 0 }), 64);
  assert.equal(O({ segs: 3, reduced: 0 }), 96);
  assert.equal(O({ segs: 3, reduced: 1 }), 80);
});

// TS 29.281: zorunlu başlık 8; sıra no alanlarıyla 12; PDU Session Container ile 16
test("GTP-U: S1-U 36, sıra numaralı 40, 5G N3 44, IPv6 taşımada 64", () => {
  const O = (l) => M.compute({ dir: "need", p: 1500, layers: [Object.assign({ t: "gtpu" }, l)] }).overhead;
  assert.equal(O({ hdr: "base" }), 36);
  assert.equal(O({ hdr: "seq" }), 40);
  assert.equal(O({ hdr: "5g" }), 44);
  assert.equal(O({ hdr: "5g", ip: 6 }), 64);
});

test("iç içe katmanlar: L3VPN üzerinde 5G N3 = 1500 + 44 + 8", () => {
  const r = M.compute({ dir: "need", p: 1500, layers: [{ t: "mpls" }, { t: "gtpu" }] });
  assert.equal(r.L, 1552);
  const back = M.compute({ dir: "have", core: 1552, coreUnit: "l2", layers: [{ t: "mpls" }, { t: "gtpu" }] });
  assert.equal(back.P, 1500);
});

test("Junos: varsayılan media 1514'te family mpls 1488", () => {
  const r = M.compute({ dir: "have", core: 1514, coreUnit: "frame", layers: [{ t: "mpls" }] });
  assert.equal(vendor(r, "junos").rows[1].value, 1488);
});

test("blokların toplamı çerçeve boyuna eşit", () => {
  const cases = [
    { dir: "need", p: 1500, layers: [] },
    { dir: "need", p: 9000, payload: "eth", ctags: 2, coreTags: 1, layers: [{ t: "mpls", cw: 1, entropy: 1, frr: 1, transport: 3 }] },
    { dir: "need", p: 1400, layers: [{ t: "ipsec", enc: "aes-cbc" }, { t: "gre", key: 1 }] },
    { dir: "need", p: 1300, ipver: 6, layers: [{ t: "srv6", segs: 4, reduced: 0 }, { t: "gtpu" }] }
  ];
  for (const c of cases) {
    const r = M.compute(c);
    const total = r.blocks.reduce((a, b) => a + b.bytes, 0);
    assert.equal(total, r.Lused + r.linkHdr, JSON.stringify(c));
  }
});

test("yetersiz omurga değeri hata döndürür", () => {
  const r = M.compute({ dir: "have", core: 60, coreUnit: "l2", layers: [{ t: "vxlan" }], payload: "eth" });
  assert.equal(r.ok, false);
});

test("uyarılar: IPv6 müşteri 1280 altı, Nokia 9212 üstü, Huawei 9600 üstü", () => {
  const a = M.compute({ dir: "need", p: 1200, ipver: 6, layers: [] });
  assert.ok(a.warnings.some((w) => w.src === "rfc8200"));
  const b = M.compute({ dir: "need", p: 9200, layers: [{ t: "mpls" }] });
  assert.ok(b.warnings.some((w) => w.src === "nokiaMtu"));
  const c = M.compute({ dir: "need", p: 9600, layers: [{ t: "mpls" }] });
  assert.ok(c.warnings.some((w) => w.src === "huaweiIfMtu"));
  const d = M.compute({ dir: "need", p: 1500, layers: [{ t: "mpls" }] });
  assert.equal(d.warnings.length, 0);
});

/* ---- Parçalanma ---- */

// RFC 791: 4000 baytlık paket, MTU 1500 → 1500 + 1500 + 1040
test("IPv4 parçalanma: 4000 bayt, MTU 1500", () => {
  const r = M.fragment({ size: 4000, mtu: 1500, ipver: 4, df: false });
  assert.equal(r.action, "fragment");
  assert.deepEqual(r.fragments.map((f) => f.total), [1500, 1500, 1040]);
  assert.deepEqual(r.fragments.map((f) => f.offsetUnits), [0, 185, 370]);
  assert.deepEqual(r.fragments.map((f) => f.mf), [true, true, false]);
  assert.equal(r.extraBytes, 40);
});

test("IPv4 parçalanma: parça verisi 8'in katına yuvarlanır", () => {
  const r = M.fragment({ size: 1500, mtu: 1006, ipver: 4, df: false });
  assert.deepEqual(r.fragments.map((f) => f.data), [984, 496]);
  assert.ok(r.fragments.every((f) => f.total <= 1006));
});

test("IPv4 DF=1: düşer ve ICMP Type 3 Code 4 döner", () => {
  const r = M.fragment({ size: 1500, mtu: 1400, ipver: 4, df: true });
  assert.equal(r.action, "drop");
  assert.equal(r.icmp.mtu, 1400);
});

// RFC 8200: yönlendirici parçalamaz; kaynak 8 baytlık parçalama başlığıyla böler
test("IPv6: Packet Too Big, kaynak parçalar: 3000 bayt, MTU 1500 → 1496 + 1496 + 112", () => {
  const r = M.fragment({ size: 3000, mtu: 1500, ipver: 6 });
  assert.equal(r.action, "ptb");
  assert.deepEqual(r.fragments.map((f) => f.total), [1496, 1496, 112]);
  assert.equal(r.fragments.reduce((a, f) => a + f.data, 0), 2960);
});

test("sığan paket iletilir; IPv6'da 1280 altı MTU hatadır", () => {
  assert.equal(M.fragment({ size: 1500, mtu: 1500, ipver: 4 }).action, "forward");
  assert.equal(M.fragment({ size: 1500, mtu: 1200, ipver: 6 }).action, "error");
  assert.equal(M.fragment({ size: 1500, mtu: 60, ipver: 4 }).action, "error");
});

/* ---- Adres çubuğu ---- */

test("serialize / parse gidiş dönüşte aynı sonucu verir", () => {
  const states = [
    { dir: "need", p: 1500, payload: "eth", ctags: 1, coreTags: 1, layers: [{ t: "mpls", cw: 1, transport: 2 }] },
    { dir: "have", core: 9212, coreUnit: "frame", payload: "ip", ipver: 6, layers: [{ t: "ipsec", enc: "aes-cbc", auth: "sha1", natt: 1 }, { t: "gre", key: 1 }] },
    { dir: "need", p: 1358, layers: [{ t: "srv6", segs: 3, reduced: 0 }, { t: "gtpu", hdr: "base", ip: 6 }] }
  ];
  for (const s of states) {
    const a = M.compute(s);
    const b = M.compute(M.parse(M.serialize(s)));
    assert.equal(b.L, a.L);
    assert.equal(b.P, a.P);
    assert.deepEqual(M.parse(M.serialize(s)), M.norm(s));
  }
});

test("her kaynak anahtarı SOURCES içinde tanımlı", () => {
  const S = M.DATA.SOURCES;
  const r = M.compute({ dir: "need", p: 1500, payload: "eth", ctags: 2, coreTags: 2, layers: [
    { t: "mpls", cw: 1, entropy: 1, frr: 1, flow: 1, extra: 1 }, { t: "vxlan" }, { t: "gre", key: 1 },
    { t: "ipsec", enc: "aes-cbc", natt: 1 }, { t: "srv6", segs: 2, reduced: 0 }, { t: "gtpu" }, { t: "pppoe" }] });
  for (const b of r.blocks) assert.ok(S[b.src], "blok kaynağı yok: " + b.src);
  for (const v of r.vendors) for (const row of v.rows) for (const k of row.src) assert.ok(S[k], "üretici kaynağı yok: " + k);
  for (const w of r.warnings) assert.ok(S[w.src], "uyarı kaynağı yok: " + w.src);
  for (const e of Object.values(M.DATA.ESP_ENC)) assert.ok(S[e.src]);
  for (const a of Object.values(M.DATA.ESP_AUTH)) assert.ok(S[a.src]);
});
