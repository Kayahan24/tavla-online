# Tavla Online - Multiplayer Backgammon

Online karsilikli tavla oyunu. Oda kodu ile arkadasinla oyna!

## Nasil Calisir

1. Bir oyuncu "Oda Olustur" yapar, 4 haneli kod alir
2. Digeri kodu girerek "Odaya Katil" yapar
3. Karsilikli tavla oynarsiniz!

## Render.com'da Ucretsiz Deploy (Adim Adim)

### 1. GitHub'a yukle
- github.com'da yeni repo olustur (ornek: `tavla-online`)
- Bu klasordeki tum dosyalari yukle:
  ```
  tavla-online/
    package.json
    server.js
    public/
      index.html
  ```

### 2. Render.com'a deploy et
1. [render.com](https://render.com) adresine git, ucretsiz hesap ac
2. Dashboard'da **"New +"** > **"Web Service"** tikla
3. GitHub reponla bagla, `tavla-online` reposunu sec
4. Ayarlar:
   - **Name**: tavla-online (veya istedigin isim)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. **"Create Web Service"** tikla

### 3. Hazir!
Birkac dakika icinde `https://tavla-online.onrender.com` adresinde yayinda olacak.

> Not: Render ucretsiz planda sunucu 15 dk kullanilmazsa uyku moduna gecer.
> Ilk acilista 30-50 saniye beklemen gerekebilir.

## Lokal Calistirma

```bash
npm install
npm start
```

Tarayicida `http://localhost:3000` ac.
