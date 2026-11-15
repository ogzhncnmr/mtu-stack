/* =====================================================================
   MTU hesaplayıcı: veri dosyası.
   Buradaki her sayı bir kaynağa bağlıdır (SOURCES). Yeni bir kapsülleme
   eklemek için önce kaynağını buraya yazın, sonra mtu-core.js içinde kullanın.
   Tarayıcıda window.MTU_DATA, Node'da module.exports olarak yüklenir.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MTU_DATA = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Kaynaklar. kind: "std" (RFC / 3GPP / IEEE) | "vendor" (üretici dokümanı) */
  var SOURCES = {
    ieee8021q: { kind: "std", label: "IEEE 802.1Q", url: "https://www.ieee802.org/1/pages/802.1Q.html" },
    rfc791: { kind: "std", label: "RFC 791 (IPv4)", url: "https://www.rfc-editor.org/rfc/rfc791" },
    rfc1191: { kind: "std", label: "RFC 1191 (IPv4 PMTUD)", url: "https://www.rfc-editor.org/rfc/rfc1191" },
    rfc8200: { kind: "std", label: "RFC 8200 (IPv6)", url: "https://www.rfc-editor.org/rfc/rfc8200" },
    rfc8201: { kind: "std", label: "RFC 8201 (IPv6 PMTUD)", url: "https://www.rfc-editor.org/rfc/rfc8201" },
    rfc4443: { kind: "std", label: "RFC 4443 (ICMPv6)", url: "https://www.rfc-editor.org/rfc/rfc4443" },
    rfc6691: { kind: "std", label: "RFC 6691 (TCP MSS)", url: "https://www.rfc-editor.org/rfc/rfc6691" },
    rfc3032: { kind: "std", label: "RFC 3032 (MPLS Label Stack Encoding)", url: "https://www.rfc-editor.org/rfc/rfc3032" },
    rfc4385: { kind: "std", label: "RFC 4385 (Control word)", url: "https://www.rfc-editor.org/rfc/rfc4385" },
    rfc4448: { kind: "std", label: "RFC 4448 (Ethernet over MPLS)", url: "https://www.rfc-editor.org/rfc/rfc4448" },
    rfc6790: { kind: "std", label: "RFC 6790 (Entropy label)", url: "https://www.rfc-editor.org/rfc/rfc6790" },
    rfc6391: { kind: "std", label: "RFC 6391 (FAT PW flow label)", url: "https://www.rfc-editor.org/rfc/rfc6391" },
    rfc8077: { kind: "std", label: "RFC 8077 (Pseudowire setup using LDP)", url: "https://www.rfc-editor.org/rfc/rfc8077" },
    rfc7432: { kind: "std", label: "RFC 7432 (EVPN)", url: "https://www.rfc-editor.org/rfc/rfc7432" },
    rfc7348: { kind: "std", label: "RFC 7348 (VXLAN)", url: "https://www.rfc-editor.org/rfc/rfc7348" },
    rfc2784: { kind: "std", label: "RFC 2784 (GRE)", url: "https://www.rfc-editor.org/rfc/rfc2784" },
    rfc2890: { kind: "std", label: "RFC 2890 (GRE key and sequence number)", url: "https://www.rfc-editor.org/rfc/rfc2890" },
    rfc2516: { kind: "std", label: "RFC 2516 (PPPoE)", url: "https://www.rfc-editor.org/rfc/rfc2516" },
    rfc4303: { kind: "std", label: "RFC 4303 (ESP)", url: "https://www.rfc-editor.org/rfc/rfc4303" },
    rfc3948: { kind: "std", label: "RFC 3948 (UDP encapsulation of ESP, NAT-T)", url: "https://www.rfc-editor.org/rfc/rfc3948" },
    rfc4106: { kind: "std", label: "RFC 4106 (AES-GCM in ESP)", url: "https://www.rfc-editor.org/rfc/rfc4106" },
    rfc7634: { kind: "std", label: "RFC 7634 (ChaCha20-Poly1305)", url: "https://www.rfc-editor.org/rfc/rfc7634" },
    rfc3602: { kind: "std", label: "RFC 3602 (AES-CBC)", url: "https://www.rfc-editor.org/rfc/rfc3602" },
    rfc3686: { kind: "std", label: "RFC 3686 (AES-CTR)", url: "https://www.rfc-editor.org/rfc/rfc3686" },
    rfc2451: { kind: "std", label: "RFC 2451 (ESP CBC-mode ciphers, 3DES)", url: "https://www.rfc-editor.org/rfc/rfc2451" },
    rfc2410: { kind: "std", label: "RFC 2410 (NULL encryption)", url: "https://www.rfc-editor.org/rfc/rfc2410" },
    rfc2403: { kind: "std", label: "RFC 2403 (HMAC-MD5-96)", url: "https://www.rfc-editor.org/rfc/rfc2403" },
    rfc2404: { kind: "std", label: "RFC 2404 (HMAC-SHA-1-96)", url: "https://www.rfc-editor.org/rfc/rfc2404" },
    rfc3566: { kind: "std", label: "RFC 3566 (AES-XCBC-MAC-96)", url: "https://www.rfc-editor.org/rfc/rfc3566" },
    rfc4868: { kind: "std", label: "RFC 4868 (HMAC-SHA-2)", url: "https://www.rfc-editor.org/rfc/rfc4868" },
    rfc8754: { kind: "std", label: "RFC 8754 (SRv6 SRH)", url: "https://www.rfc-editor.org/rfc/rfc8754" },
    rfc8986: { kind: "std", label: "RFC 8986 (SRv6 Network Programming)", url: "https://www.rfc-editor.org/rfc/rfc8986" },
    ts29281: { kind: "std", label: "3GPP TS 29.281 (GTP-U)", url: "https://www.3gpp.org/dynareport/29281.htm" },
    ts38415: { kind: "std", label: "3GPP TS 38.415 (PDU Session Container)", url: "https://www.3gpp.org/dynareport/38415.htm" },
    ts23501j: { kind: "std", label: "3GPP TS 23.501 Annex J (Link MTU considerations)", url: "https://www.3gpp.org/dynareport/23501.htm" },

    nokiaMtu: { kind: "vendor", label: "Nokia SR OS 25.7: MTU configuration guidelines", url: "https://documentation.nokia.com/sr/25-7/7x50-shared/interface-configuration/mtu-configuration-guidelines.html" },
    nokiaPmtud: { kind: "vendor", label: "Nokia Advanced Configuration Guide: Path MTU Discovery", url: "https://documentation.nokia.com/acg/24-10-2/books/mpls-classic/c145-pmtud.html" },
    nokiaIpMtu: { kind: "vendor", label: "Nokia 7750 SR: IP Router Configuration Command Reference (ip-mtu)", url: "https://infocenter.nokia.com/public/7750SR150R1A/topic/com.sr.router.config/html/ip_router_cli.html" },
    huaweiMtu: { kind: "vendor", label: "Huawei ME60 V800R022: Understanding MTU", url: "https://support.huawei.com/enterprise/en/doc/EDOC1100278569/bc7714b7/understanding-mtu" },
    huaweiIfMtu: { kind: "vendor", label: "Huawei NE40E: Interface MTU Setting", url: "https://support.huawei.com/enterprise/en/doc/EDOC1100058383/81fc1150/interface-mtu-setting" },
    huaweiMplsMtu: { kind: "vendor", label: "Huawei NE40E: MPLS MTU Setting", url: "https://support.huawei.com/enterprise/en/doc/EDOC1100058383/f6fb21c6/mpls-mtu-setting" },
    ciscoXrMtu: { kind: "vendor", label: "Cisco: MTU Behavior on Cisco IOS XR and Cisco IOS Routers (116350)", url: "https://www.cisco.com/c/en/us/support/docs/ios-nx-os-software/ios-xr-software/116350-trouble-ios-xr-mtu-00.html" },
    ciscoMplsMtu: { kind: "vendor", label: "Cisco IOS: MPLS MTU Command Changes", url: "https://www.cisco.com/en/US/docs/ios-xml/ios/mp_basic/configuration/15-0m/mp-mtu-cmd-changes.html" },
    junosMtu: { kind: "vendor", label: "Junos: Media MTU and Protocol MTU", url: "https://www.juniper.net/documentation/us/en/software/junos/interfaces-fundamentals/topics/topic-map/media-mtu.html" },
    junosMtuStmt: { kind: "vendor", label: "Junos: mtu (interfaces) statement", url: "https://networkingdocs.hpe.com/documentation/us/en/software/junos/cli-reference/topics/ref/statement/mtu-edit-interfaces-ni.html" }
  };

  /* Sabit başlık boyutları (bayt) */
  var BYTES = {
    eth: 14,        // 6 hedef MAC + 6 kaynak MAC + 2 EtherType; FCS hariç
    fcs: 4,
    vlan: 4,        // her 802.1Q / 802.1ad etiketi
    mplsLabel: 4,   // RFC 3032
    cw: 4,          // RFC 4385
    ip4: 20,        // seçeneksiz IPv4 başlığı
    ip6: 40,
    ip6Frag: 8,     // IPv6 parçalama uzantı başlığı
    udp: 8,
    tcp: 20,        // seçeneksiz TCP başlığı
    icmp: 8,
    vxlan: 8,       // RFC 7348
    gre: 4,         // RFC 2784 temel başlık
    greOpt: 4,      // checksum, key ve sıra numarasının her biri
    pppoe: 8,       // 6 PPPoE + 2 PPP
    esp: 8,         // SPI + sıra numarası
    espTrailer: 2,  // pad length + next header
    srh: 8,         // SRH sabit kısmı
    sid: 16,        // her SRv6 segmenti
    gtp: 8,         // GTP-U zorunlu başlık
    gtpOpt: 4,      // sıra no / N-PDU / sonraki uzantı alanı
    gtpPsc: 4,      // PDU Session Container (en kısa hâli)
    ip6Min: 1280,   // RFC 8200: IPv6 için en küçük bağlantı MTU'su
    ip4Min: 68      // RFC 791: IPv4 için en küçük bağlantı MTU'su
  };

  /* ESP şifreleme: iv = paketteki IV, block = dolgu hizası, icv = AEAD ise bütünlük etiketi */
  var ESP_ENC = {
    "aes-gcm": { label: "AES-GCM (16 bayt ICV)", iv: 8, block: 4, icv: 16, aead: true, src: "rfc4106" },
    "chacha20": { label: "ChaCha20-Poly1305", iv: 8, block: 4, icv: 16, aead: true, src: "rfc7634" },
    "aes-cbc": { label: "AES-CBC", iv: 16, block: 16, src: "rfc3602" },
    "aes-ctr": { label: "AES-CTR", iv: 8, block: 4, src: "rfc3686" },
    "3des-cbc": { label: "3DES-CBC", iv: 8, block: 8, src: "rfc2451" },
    "null": { label: "NULL (şifreleme yok)", iv: 0, block: 4, src: "rfc2410" }
  };
  /* ESP bütünlük (AEAD seçiliyse kullanılmaz) */
  var ESP_AUTH = {
    "sha256": { label: "HMAC-SHA-256-128", icv: 16, src: "rfc4868" },
    "sha1": { label: "HMAC-SHA-1-96", icv: 12, src: "rfc2404" },
    "sha384": { label: "HMAC-SHA-384-192", icv: 24, src: "rfc4868" },
    "sha512": { label: "HMAC-SHA-512-256", icv: 32, src: "rfc4868" },
    "md5": { label: "HMAC-MD5-96", icv: 12, src: "rfc2403" },
    "xcbc": { label: "AES-XCBC-MAC-96", icv: 12, src: "rfc3566" },
    "none": { label: "Yok", icv: 0, src: "rfc4303" }
  };

  /* Üretici varsayılanları ve sınırları. Hepsi resmi dokümandan; ayrıntı ARASTIRMA.md içinde. */
  var VENDOR = {
    nokia: { netPortDefault: 9212, serviceMtuDefault: 1514 },
    huawei: { ifMtuDefault: 1500, ifMtuMax: 9600, l2vpnMtuDefault: 1500, greReserve: 32 },
    ios: { mtuDefault: 1500 },
    xr: { mtuDefault: 1514 },
    junos: { mediaDefault: 1514, mplsReserve: 12 }
  };

  return { SOURCES: SOURCES, BYTES: BYTES, ESP_ENC: ESP_ENC, ESP_AUTH: ESP_AUTH, VENDOR: VENDOR };
});
