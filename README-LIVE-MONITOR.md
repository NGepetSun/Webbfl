# BFL Live Monitor (no YouTube API key)

## Arsitektur

YouTube public RSS + watch page -> GitHub Actions monitor -> `data/live-status.json` -> Vercel `/api/live` -> website.

Vercel tidak lagi melakukan polling 70+ channel setiap kali halaman Live dibuka.

## Setup

1. Upload/push project ini ke GitHub.
2. Pastikan repository memakai branch default yang dipakai Vercel.
3. Buka GitHub -> Actions -> **BFL Live Monitor** -> Run workflow untuk test pertama.
4. Setelah itu workflow terjadwal akan menjalankan monitor otomatis.
5. Vercel tetap deploy project yang sama. Endpoint `/api/live` hanya membaca cache.

Tidak perlu YouTube API key.

## Interval

GitHub Actions scheduled workflow memiliki interval minimum 5 menit. Karena itu status dapat tertinggal beberapa menit dari kondisi YouTube. Workflow juga bisa mengalami delay saat GitHub sedang padat.

## Status

- `LIVE`: terkonfirmasi live.
- `OFFLINE`: pemeriksaan berhasil dan tidak ada live yang terkonfirmasi.
- `UNKNOWN`: pemeriksaan gagal/tidak dapat dikonfirmasi. `UNKNOWN` tidak menghapus live sebelumnya selama stale window.
- `stale: true`: status LIVE terakhir dipertahankan sementara karena pengecekan terbaru gagal.

## Penting

Jangan menghapus `data/live-status.json`; file ini adalah cache yang dibaca oleh Vercel.
