# Mentari Mod

Browser extension (Manifest V3, Chrome/Brave) yang mengotomatiskan pengerjaan quiz di `mentari.unpam.ac.id`: baca soal via API, jawab dengan AI, simpan, lalu submit otomatis.

## Pasang

1. `brave://extensions` (atau `chrome://extensions`) > nyalakan Developer mode.
2. Load unpacked > pilih folder ini.
3. Buka halaman quiz Mentari, isi konfigurasi AI saat diminta (tersimpan lokal di browser, tidak ikut kode).

## Konfigurasi AI

Butuh endpoint OpenAI-compatible (contoh: Ollama, LM Studio, LiteLLM, OpenRouter-compatible gateway), API key, dan nama model. Diisi sekali lewat popup saat pertama jalan.

## File

- `manifest.json` — deklarasi extension
- `content.js` — otomasi halaman quiz/exam/kuesioner
- `background.js` — panggilan AI (bebas CORS halaman)
- `icon*.png` — ikon
