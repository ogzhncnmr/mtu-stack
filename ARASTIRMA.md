# Araştırma notları: üreticiler MTU'yu nasıl sayar?

Araçtaki her kuralın nereden geldiğini ve ne kadar güvenilir olduğunu burada tutuyorum.
Araştırma tarihi: 15 Kasım 2026. Üretici dokümanları sürüme göre değişir; canlı ağda
uygulamadan önce kendi sürümünüzün dokümanıyla karşılaştırın.

Güven düzeyleri:

- **Dokümanda**: kural ya da değer resmi dokümanda açıkça yazıyor.
- **Türetildi**: dokümandaki kuraldan hesapla çıkardım.
- **Doğrulanmadı**: resmi dokümanda bulamadım; ikincil kaynak ya da genel bilgi.

## Ortak terimler

| Terim | Anlamı |
|---|---|
| P | Müşterinin IP paketi |
| F | Taşınan müşteri çerçevesi: 14 + taşınan VLAN etiketi × 4 + P (yalnızca L2 servis) |
| L | Omurga bağlantısının L2 yükü: omurga Ethernet başlığının altındaki her şey |
| Çerçeve | L + 14 + omurga VLAN etiketi × 4, FCS hariç |

Aynı hat için üreticilerin komutuna yazılan değer:

| Üretici | Komut | Yazılan değer | Ethernet başlığı | Port VLAN etiketi |
|---|---|---|---|---|
| Nokia SR OS | `port … ethernet mtu` | L + 14 + 4t | Sayılır | Sayılır |
| Huawei VRP | `mtu` | L | Sayılmaz | Sayılmaz |
| Cisco IOS / IOS XE | `mtu` | L | Sayılmaz | Sayılmaz |
| Cisco IOS XR | `mtu` (ana arayüz) | L + 14 | Sayılır | Alt arayüzde kendiliğinden eklenir |
| Juniper Junos | `mtu` (fiziksel) | L + 14 + 4t | Sayılır | Sayılır |

Hiçbiri FCS'yi (4 bayt) saymaz.

## Nokia SR OS

| Kural | Güven | Kaynak |
|---|---|---|
| Port MTU varsayılanları: erişim null 1514, erişim dot1q 1518, Fast Ethernet ağ portu 1514, diğer Ethernet ağ portları 9212 (donanım sınırı daha düşükse o) | Dokümanda | [MTU configuration guidelines, 25.7](https://documentation.nokia.com/sr/25-7/7x50-shared/interface-configuration/mtu-configuration-guidelines.html) |
| MTU değeri FCS'yi hiçbir zaman içermez | Dokümanda | [ACG: Path MTU Discovery](https://documentation.nokia.com/acg/24-10-2/books/mpls-classic/c145-pmtud.html) |
| Erişim portu MTU ≥ service-mtu + kapsülleme (null 0, dot1q 4, qinq 8) | Dokümanda | ACG: Path MTU Discovery |
| Ağ portu MTU ≥ SDP path MTU + MPLS etiketleri (taşıma, servis, hash/entropy, OAM) + Ethernet başlığı (dot1q ise + VLAN etiketi) | Dokümanda | ACG: Path MTU Discovery |
| service-mtu = müşteriye sunulan IP + Ethernet yükü; yalnızca L2 servislerde. Epipe örneğinde varsayılan 1514 | Dokümanda | ACG: Path MTU Discovery |
| VC MTU = service-mtu − 14; ayarlanamaz, iki uçta eşit olmalı | Dokümanda | ACG: Path MTU Discovery |
| SDP path MTU varsayılanı ağ portu MTU'sundan türetilir: port − 2 etiket − Ethernet başlığı | Dokümanda | ACG: Path MTU Discovery |
| Control word kullanılıyorsa SDP path MTU payından düşer | Dokümanda (7210 SAS kılavuzu) | [Services overview, 7210 SAS](https://documentation.nokia.com/sas/23-9/books/mts-services-overview/services-overview-mts_services_overview.html) |
| L3 arayüzde geçerli IP MTU = min(port MTU − Ethernet başlığı, ayarlanan `ip-mtu`) | Dokümanda | [IP Router Command Reference, 15.0](https://infocenter.nokia.com/public/7750SR150R1A/topic/com.sr.router.config/html/ip_router_cli.html) |

Dokümandaki örnekler, testlerde birebir kullanıldı:

- 1514 baytlık servis için en küçük ağ portu MTU'su: 1514 + 4 + 4 + 14 = **1536**
- Ağ portu 1600 → SDP path MTU 1600 − 14 − 8 = **1578**
- Ağ portu 512 → IP MTU 498, TCP MSS 458

Açık kalan noktalar:

- 7210 SAS'ta dot1q SAP'a gelen 1500 baytlık IP çerçevesi etiketle birlikte 1518 sayılıyor ve 1514'lük service-mtu'yu geçemiyor. Bu davranış 7750 SR'dan farklı; araç 7750 SR davranışını modelliyor.
- Türetilen SDP path MTU'sunun hash label'ı kendiliğinden düşüp düşmediğini resmi dokümanda bulamadım.
- MD-CLI komut sözdizimini ayrıca doğrulamadım; araçtaki komutlar klasik CLI yazımıyla.

## Huawei VRP

Kaynak: [ME60 V800R022: Understanding MTU](https://support.huawei.com/enterprise/en/doc/EDOC1100278569/bc7714b7/understanding-mtu)
(aynı metin NE40E ve NetEngine 8000 dokümanlarında da var), [NE40E: Interface MTU Setting](https://support.huawei.com/enterprise/en/doc/EDOC1100058383/81fc1150/interface-mtu-setting),
[NE40E: MPLS MTU Setting](https://support.huawei.com/enterprise/en/doc/EDOC1100058383/f6fb21c6/mpls-mtu-setting).

| Kural | Güven |
|---|---|
| Arayüzde ayarlanan MTU, IP MTU'sudur (L3 kavramı). Genelde yalnızca L3 trafiğinde etkilidir; L2 paketi arayüz MTU'sunu aşsa da parçalanmaz | Dokümanda |
| Cihaz MTU'yu paketi gönderirken denetler, alırken denetlemez | Dokümanda |
| Varsayılan 1500; Ethernet 46–1500, GE / Eth-Trunk / VLANIF 46–9600 | Dokümanda |
| MPLS MTU = etiket yığını + IP başlığı + IP yükü. Formül: MPLS MTU = IP MTU + etiket sayısı × 4 | Dokümanda |
| Seçilen MPLS MTU fiziksel arayüz MTU'sundan büyük olamaz; `mpls mtu` ayarlanmazsa arayüz MTU'su geçerlidir | Dokümanda |
| MPLS MTU yalnızca IP ağından MPLS tüneline giren L3 trafiğinde etkilidir | Dokümanda |
| Yalnızca L2 veya MPLS ile iletilen paketler parçalanmaz; IPv6 iletiminde parçalama yoktur | Dokümanda |
| DF=1 ve paket büyükse düşürülür, ICMP iletisi döner; zorla parçalama (`ipv4 force-fragment enable`) varsayılan olarak kapalıdır | Dokümanda |
| L2VPN MTU'su (PWE3, BGP VLL, VPLS) yalnızca VC/PW kurulumunda karşılaştırılır, paket iletimini etkilemez; varsayılan 1500 | Dokümanda |
| PWE3'te öncelik sırası: `mpls l2vc` komutundaki MTU, PW şablonu, AC arayüzünün MTU'su, 1500 | Dokümanda |
| GRE MTU = tünel arayüzü MTU − 32 (20 IP + 12 GRE); varsayılan 1468 | Dokümanda |
| Etiket sayıları: LDP 1, tek TE tüneli 1, LDP over TE 2, LDP over TE + FRR bypass 3 genel etiket; üstüne 1 VPN etiketi. PHP varsa bir eksik | Dokümanda |
| L2 servislerde omurga arayüzüne yazılacak değer olarak L'yi önermem | Türetildi |

Açık kalan nokta: arama sonuçlarında `interface-mtu check-mode label-contained-length` diye bir
komut geçiyor; bazı platformlarda etiket uzunluğunun denetime dahil edilip edilmediğini
değiştiriyor olabilir. Komut sayfasını açamadım, bu yüzden araçta kullanmadım.

## Cisco IOS / IOS XE ve IOS XR

Kaynak: [MTU Behavior on Cisco IOS XR and Cisco IOS Routers (116350)](https://www.cisco.com/c/en/us/support/docs/ios-nx-os-software/ios-xr-software/116350-trouble-ios-xr-mtu-00.html),
[MPLS MTU Command Changes](https://www.cisco.com/en/US/docs/ios-xml/ios/mp_basic/configuration/15-0m/mp-mtu-cmd-changes.html).

| Kural | Güven |
|---|---|
| Klasik IOS'ta `mtu` L2 yükünü sayar; başlık dahil değildir | Dokümanda |
| IOS XR'da `mtu` L2 başlığını sayar: Ethernet 14, PPP/HDLC 4 bayt. Varsayılan 1514 | Dokümanda |
| IOS'ta `mtu x` olan hattın XR ucu `mtu x + 14` olmalıdır | Dokümanda |
| XR'da alt arayüz MTU'su = ana arayüz + etiket başına 4 bayt, kendiliğinden | Dokümanda |
| XR'da `ipv4 mtu`, `ipv6 mtu`, `mpls mtu` türetilen değeri yalnızca düşürebilir | Dokümanda |
| 1500 baytlık IPv4 + 2 etiket için XR'da `mtu 1522` (1522 − 14 = 1508) | Dokümanda |
| LDP ile sinyallenen PW MTU'su L2 başlığını içermez; iki uçta farklıysa PW "MTU mismatched" ile kapalı kalır | Dokümanda |
| ASR 9000 EVC: sinyallenen MTU = alt arayüz MTU − 14 − sökülen etiket × 4 + eklenen etiket × 4 | Dokümanda |
| 1514'lük varsayılan MTU ön ek, FCS ve çerçeveler arası boşluğu içermez | Dokümanda |
| IOS'ta `mpls mtu` arayüz MTU'sundan büyük ayarlanamaz; Ethernet'te `override` istisnadır ve Cisco paket kaybı uyarısı yapar | Dokümanda |
| IOS'ta `mpls mtu` değerinin etiketleri saydığı | Doğrulanmadı (genel bilgi; doküman açıkça yazmıyor) |

## Juniper Junos

Kaynak: [Media MTU and Protocol MTU](https://www.juniper.net/documentation/us/en/software/junos/interfaces-fundamentals/topics/topic-map/media-mtu.html)
(Juniper dokümanları artık networkingdocs.hpe.com adresine yönleniyor).

| Kural | Güven |
|---|---|
| Ethernet'te varsayılan media MTU 1514; FCS sayılmaz, kablodaki en büyük çerçeve 1518 | Dokümanda |
| Media MTU ≥ protokol MTU + kapsülleme yükü | Dokümanda |
| Kapsülleme yükleri: Ethernet v2 14, 802.1Q/Ethernet v2 18 bayt | Dokümanda |
| Varsayılan protokol MTU'ları: IPv4 1500, MPLS 1488, ISO 1497 | Dokümanda |
| MPLS MTU ayarlanmazsa: fiziksel MTU − kapsülleme yükü − 12 (3 etiket) | Dokümanda |
| En büyük media MTU platforma göre değişir: MX ve PTX 9500, yeni MPC'ler ve MX204/304/10004/10008 16000, ACX 9216–10000 | Dokümanda |
| Çift etiketli portta kapsülleme yükünün 22 bayt olduğu | Türetildi |
| `vlan-tagging` açılınca varsayılan media MTU'nun kendiliğinden 1518 olduğu | Doğrulanmadı (yalnızca topluluk kaynakları) |
| Elle girilen `family mpls mtu` değerinin etiketleri sayıp saymadığı | Doğrulanmadı |
| l2circuit ve VPLS'te sinyallenen varsayılan MTU | Doğrulanmadı (araçta kullanılmıyor) |

Not: `mtu (interfaces)` ifade sayfası MPLS varsayılanını 1448 olarak veriyor; aynı dokümanın
tablosu ve formülü 1488 diyor. 1514 − 14 − 12 = 1488 olduğu için 1488'i kullandım.

## Kapsülleme başlıkları

| Başlık | Bayt | Kaynak |
|---|---|---|
| Ethernet (FCS hariç) / VLAN etiketi | 14 / 4 | IEEE 802.3, 802.1Q |
| MPLS etiketi | 4 | RFC 3032 |
| Control word | 4 | RFC 4385 |
| Entropy label (ELI + EL) | 8 | RFC 6790 |
| Akış etiketi (FAT PW) | 4 | RFC 6391 |
| VXLAN (IPv4 alt ağda toplam 50: 14 iç Ethernet + 8 + 8 + 20) | 8 | RFC 7348 |
| GRE temel başlık; checksum, key, sıra no her biri +4 | 4 | RFC 2784, RFC 2890 |
| PPPoE + PPP | 6 + 2 | RFC 2516 |
| SRH sabit kısım + her SID | 8 + 16 | RFC 8754 |
| GTP-U zorunlu başlık; sıra no alanları +4; PDU Session Container +4 | 8 | 3GPP TS 29.281, TS 38.415 |

### IPsec (ESP)

RFC 4303'e göre ESP paketi: SPI + sıra no (8), IV, şifreli yük, dolgu, dolgu uzunluğu + sonraki
başlık (2), ICV. Dolgu, (yük + 2) baytı şifrenin blok boyuna ve 4 bayta hizalar; bu yüzden ek yük
paket boyuna göre değişir ve araç ileri/geri yönü ayrı hesaplar.

| Şifre | IV | Hiza | ICV | Kaynak |
|---|---|---|---|---|
| AES-GCM | 8 | 4 | 16 | RFC 4106 |
| ChaCha20-Poly1305 | 8 | 4 | 16 | RFC 7634 |
| AES-CBC | 16 | 16 | bütünlük algoritmasından | RFC 3602 |
| AES-CTR | 8 | 4 | bütünlük algoritmasından | RFC 3686 |
| 3DES-CBC | 8 | 8 | bütünlük algoritmasından | RFC 2451 |

Bütünlük: HMAC-SHA-1-96 12, HMAC-SHA-256-128 16, HMAC-SHA-384-192 24, HMAC-SHA-512-256 32
(RFC 2404, RFC 4868). NAT-T: +8 bayt UDP (RFC 3948). Tünel kipi dış IP başlığı ekler,
taşıma kipi eklemez.

1500 baytlık dış MTU'da tünel kipi sonuçları: AES-CBC + SHA-256 → 1438, AES-GCM → 1446.
AES-GCM için 8, 12 ve 16 baytlık ICV seçenekleri var; araç 16'yı kullanıyor.

### SRv6

RFC 8986: H.Encaps dış IPv6 başlığı (40) ve SRH ekler. H.Encaps.Red'de ilk SID yalnızca hedef
adrese yazılır, SRH'ye girmez; tek SID'li politikada SRH hiç eklenmeyebilir. uSID'de birden çok
kısa SID tek 128 bitlik taşıyıcıya sığar; araçta bunu "1 segment + indirgenmiş" ile
modelliyorum.

### GTP-U

5G N3'te QFI taşımak için PDU Session Container uzantı başlığı kullanılır; bu, 4 baytlık
seçenek alanlarını da zorunlu kılar, toplam 16 bayt. PPI gibi ek alanlar varsa uzantı daha uzun
olabilir; araç en kısa hâlini kullanıyor. 3GPP TS 23.501 Ek J, 1500 baytlık taşıma ve N3'te IPsec
için UE bağlantı MTU'sunda 1358 baytı çoğu kurulum için uygun bulur. Ekin tam metnini
okuyamadım; bu bilgi RFC 7849 ve ikincil kaynaklardan.

### Parçalanma

- IPv4 (RFC 791): her parça kendi 20 baytlık başlığını taşır; son parça dışındakilerin verisi
  8 baytın katıdır. DF=1 ise paket düşer, ICMP Type 3 Code 4 döner (RFC 1191).
- IPv6 (RFC 8200): yönlendirici parçalamaz, ICMPv6 Packet Too Big döner (RFC 4443). Yalnızca
  kaynak parçalar; her parçaya 8 baytlık parçalama başlığı eklenir. En küçük bağlantı MTU'su 1280.
- Araç IPv4 seçeneklerini ve IPv6 uzantı başlıklarını hesaba katmaz.

## Doğrulama komutları

Linux ve Windows ping seçenekleri yaygın ve kararlı. Cisco (`size` = IP paketinin tamamı),
Junos ve Huawei (`size` / `-s` = yalnızca veri) sözdizimi genel bilgiye dayanıyor, resmi dokümandan
ayrıca doğrulamadım. Nokia'nın `oam sdp-mtu … size-inc` komutu ACG dokümanındaki örnekten.
