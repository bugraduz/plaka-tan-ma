PLAKA TARAMA - iPHONE PWA PROTOTIPI

Bu sürüm ilk saha testi içindir. Kamera görüntüsünün orta/geniş bölgesinde OCR yapar ve Türk plaka formatına uyan metni kaydeder.

ÖNEMLİ:
- Kamera ve GPS için HTTPS gerekir. Dosyayı iPhone'da doğrudan açmak yeterli değildir.
- İlk kullanımda internet gerekir; Tesseract.js OCR motoru CDN üzerinden yüklenir.
- Bu sürüm özel plaka tespit modeli kullanmaz. Tabela vb. yazıları filtrelemeye çalışır ancak nihai ALPR doğruluğu beklenmemelidir.

EN KOLAY YAYINLAMA:
1) Klasörü GitHub Pages, Cloudflare Pages, Netlify veya benzeri statik HTTPS servisine yükleyin.
2) Oluşan HTTPS adresini iPhone Safari'de açın.
3) Kamera ve konum izinlerini verin.
4) Safari Paylaş > Ana Ekrana Ekle.
5) Uygulamayı ana ekrandaki ikondan açın.

KULLANIM:
- Kamerayı Aç'a basın.
- Plakaları ekrandaki PLAKA OKUMA ALANI içine almaya çalışın.
- Otomatik tarama açıksa uygulama belirlenen aralıkta OCR yapar.
- Aynı plaka 30 saniye içinde tekrar kaydedilmez.
- CSV Dışa Aktar ile kayıtları alın.
