/* ===== EDIT KONTEN DI SINI =====
   Semua isi halaman Live, Gallery, dan History diatur dari file ini.
   Entri bertanda "CONTOH" hanyalah isian sementara — ganti atau hapus. */
const SITE = {
  live: {
    channelUrl: "",          // link channel YouTube, contoh: "https://youtube.com/@namachannel"
    videoId: "",             // ID video/live (bagian setelah v=). Kosongkan jika belum ada.
    isLive: false,           // true = tampil badge LIVE merah
    title: "Belum ada siaran berlangsung",
    schedule: [              // jadwal siaran
      { day: "SEN", date: "", title: "CONTOH — Judul siaran", time: "20:00 WIB" },
      { day: "RAB", date: "", title: "CONTOH — Judul siaran", time: "20:00 WIB" },
      { day: "SAB", date: "", title: "CONTOH — Judul siaran", time: "19:00 WIB" }
    ]
  },
  gallery: [                 // src = path gambar, mis. "assets/gallery/foto1.webp"
    { src: "", title: "CONTOH — Momen 1", cat: "Event" },
    { src: "", title: "CONTOH — Momen 2", cat: "Event" },
    { src: "", title: "CONTOH — Momen 3", cat: "Member" },
    { src: "", title: "CONTOH — Momen 4", cat: "Member" },
    { src: "", title: "CONTOH — Momen 5", cat: "Screenshot" },
    { src: "", title: "CONTOH — Momen 6", cat: "Screenshot" }
  ],
  history: [
    { year: "TAHUN", title: "CONTOH — Awal terbentuk", text: "Tulis cerita singkat momen ini di content.js." },
    { year: "TAHUN", title: "CONTOH — Pencapaian pertama", text: "Tulis cerita singkat momen ini di content.js." },
    { year: "TAHUN", title: "CONTOH — Ekspansi anggota", text: "Tulis cerita singkat momen ini di content.js." },
    { year: "SEKARANG", title: "CONTOH — MAPENDOS FOR LIFE", text: "Tulis cerita singkat momen ini di content.js." }
  ]
};
