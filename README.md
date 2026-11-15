# MTU hesaplayıcı / MTU calculator

"Bu servisi taşımak için hangi cihaza hangi MTU değerini yazmalıyım?" sorusunu cevaplayan tek
sayfalık web aracı. Derleme adımı ve bağımlılık yok: saf HTML, CSS ve JavaScript.

A single-page tool that answers "which MTU value do I type on which device to carry this
service?". No build step, no dependencies. The interface is available in Turkish and English.

## Ne yapar

- **Başlık yığını:** MPLS (taşıma, servis, FRR, entropy, akış etiketi, control word), VXLAN, GRE,
  IPsec (ESP), SRv6, GTP-U ve PPPoE katmanlarını istediğin sırayla üst üste koyar.
- **İki yön:** müşterinin istediği paket boyundan omurgada gereken MTU'yu ya da omurga MTU'sundan
  müşteriye kalan paket boyunu ve TCP MSS'i hesaplar.
- **Üreticiye göre değer:** Nokia SR OS, Huawei VRP, Cisco IOS / IOS XE, Cisco IOS XR ve Juniper
  Junos için yazılacak değeri, komutu ve kaynağını verir.
- **Doğrulama:** parçalamaya izin vermeyen ping için doğru boyutu üretir.
- **Parçalanma simülasyonu:** IPv4 parçalarını, DF bitini ve IPv6 Packet Too Big davranışını gösterir.
- **Paylaşılabilir bağlantı:** seçimler adres çubuğunda tutulur.

## Çalıştırma

Dosyalar durağandır; herhangi bir web sunucusu yeter:

```bash
python -m http.server 8000
```

Testler (Node 18+):

```bash
node --test test/mtu.test.js
```

## Dosyalar

| Dosya | İçerik |
|---|---|
| `mtu-data.js` | Başlık boyutları, ESP algoritmaları, üretici varsayılanları ve kaynak listesi |
| `mtu-core.js` | Hesap motoru: saf fonksiyonlar, arayüzden bağımsız |
| `mtu-ui.js`, `mtu.css`, `index.html` | Arayüz |
| `base.css`, `shell.js` | Sayfa iskeleti: renkler, üst çubuk, dil ve tema |
| `test/mtu.test.js` | Üretici dokümanlarındaki örneklerle karşılaştıran testler |
| `ARASTIRMA.md` | Her kuralın kaynağı ve güven düzeyi |

Araç kendi başına çalışır: `base.css` ve `shell.js` sayfa iskeletini (renkler, üst çubuk, dil ve tema)
taşır. Kişisel sitemde `araclar/mtu/` altında da aynı dosyalarla yayınlanır.

## Sınırlar

- Üretici kuralları resmi dokümanlardan alındı ama sürüme ve donanıma göre değişebilir. Güven
  düzeyi arayüzde her değerin yanında yazar; ayrıntı `ARASTIRMA.md` içinde.
- IPv4 seçenekleri, IPv6 uzantı başlıkları, TCP seçenekleri ve MACsec hesaba katılmaz.
- ESP ek yükü dolgu yüzünden paket boyuna göre değişir; gösterilen değer en büyük paket içindir.
- Cisco NX-OS ve Arista EOS henüz yok.

## Yeni kapsülleme eklemek

1. Kaynağını `mtu-data.js` içindeki `SOURCES` listesine yaz.
2. `mtu-core.js` içinde `DEFAULTS`, `LAYER_NAMES` ve `fixedBlocks` bölümlerine ekle.
3. `mtu-ui.js` içindeki `layerCard` fonksiyonuna seçeneklerini ekle.
4. Bilinen bir sonucu doğrulayan testi yaz.

## Lisans

MIT. Ayrıntı için `LICENSE` dosyasına bakın.
