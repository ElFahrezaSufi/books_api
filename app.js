const express = require("express");
const cors = require("cors");
const pool = require("./config/db");
const axios = require("axios"); // Pastikan sudah install axios: npm install axios

const app = express();

// ? Middleware
app.use(express.json());
app.use(cors());

// --- KONFIGURASI MANGADEX ---
const MANGADEX_API = "https://api.mangadex.org";
const MANGADEX_COVER = "https://uploads.mangadex.org/covers";

// ! API

// ------------------------------------------------------------
// ? PROXY MANGADEX (List Manga Populer)
// Endpoint ini akan mengambil data dari MangaDex dan meneruskannya ke Frontend
// ------------------------------------------------------------
app.get("/mangadex/list", async (req, res) => {
  try {
    // 1. Server Node.js request ke MangaDex (Server-to-Server)
    const response = await axios.get(`${MANGADEX_API}/manga`, {
      params: {
        limit: 20,
        includes: ["cover_art", "author"],
        "contentRating[]": ["safe", "suggestive"], // Filter konten aman
        "order[followedCount]": "desc", // Urutkan berdasarkan popularitas
      },
      // User-Agent palsu agar tidak ditolak MangaDex
      headers: {
        "User-Agent": "KomiKita-Backend/1.0",
      },
    });

    // 2. Mapping Data (Rapikan format sebelum dikirim ke Frontend)
    const cleanData = response.data.data.map((manga) => {
      const attributes = manga.attributes;

      // Ambil Judul (Prioritas Inggris)
      const title = attributes.title.en || Object.values(attributes.title)[0];

      // Ambil Gambar Cover
      const coverRel = manga.relationships.find((r) => r.type === "cover_art");
      const fileName = coverRel?.attributes?.fileName;

      // Kita kirim URL asli saja.
      // Frontend nanti yang akan membungkusnya dengan wsrv.nl agar gambar muncul.
      let cover = "https://via.placeholder.com/300x450?text=No+Cover";
      if (fileName) {
        cover = `${MANGADEX_COVER}/${manga.id}/${fileName}.256.jpg`; // .256.jpg = thumbnail hemat kuota
      }

      // Ambil Nama Author
      const authorRel = manga.relationships.find((r) => r.type === "author");
      const author = authorRel?.attributes?.name || "Unknown";

      // Ambil Tags (Max 3)
      const tags = attributes.tags
        .map((tag) => tag.attributes.name.en)
        .slice(0, 3);

      return {
        id: manga.id,
        title: title,
        cover: cover,
        author: author,
        rating: (Math.random() * (9 - 7) + 7).toFixed(1), // Mock rating karena list API tidak ada rating
        tags: tags,
        description: attributes.description.en || "Tidak ada deskripsi.",
      };
    });

    // 3. Kirim Response Bersih ke Frontend
    res.status(200).json({
      error: false,
      message: "Data MangaDex berhasil diambil",
      data: cleanData,
    });
  } catch (err) {
    console.error("MangaDex Error:", err.message);
    // Tangani error dari MangaDex (misal 500, 404, dll)
    res.status(500).json({
      error: true,
      message: "Gagal mengambil data dari MangaDex",
      details: err.message,
    });
  }
});

// ------------------------------------------------------------
// ? PROXY MANGADEX CHAPTER LIST (Ambil Daftar Chapter)
// Endpoint ini mengambil list chapter berdasarkan Manga ID
// ------------------------------------------------------------
app.get("/mangadex/manga/:mangaId/chapters", async (req, res) => {
  const { mangaId } = req.params;

  try {
    const response = await axios.get(`${MANGADEX_API}/manga/${mangaId}/feed`, {
      params: {
        "translatedLanguage[]": ["en", "id"], // Ambil bahasa Inggris & Indo
        "order[chapter]": "desc", // Urutkan dari chapter terbaru
        limit: 100, // Batasi 100 chapter
      },
      headers: {
        "User-Agent": "KomiKita-Backend/1.0",
      },
    });

    const chapters = response.data.data.map((ch) => ({
      id: ch.id, // <--- INI CHAPTER ID YANG DIPAKAI UNTUK BACA
      chapter: ch.attributes.chapter,
      title: ch.attributes.title,
      language: ch.attributes.translatedLanguage,
    }));

    res.status(200).json({
      error: false,
      message: "Daftar chapter berhasil diambil",
      data: chapters,
    });

  } catch (err) {
    console.error("Chapter List Error:", err.message);
    res.status(500).json({ 
      error: true, 
      message: "Gagal mengambil daftar chapter",
      details: err.message 
    });
  }
});

// ------------------------------------------------------------
// ? PROXY MANGADEX CHAPTER (Ambil Gambar Chapter)
// Endpoint ini mengambil daftar URL gambar untuk sebuah chapter
// ------------------------------------------------------------
app.get("/mangadex/chapter/:chapterId", async (req, res) => {
  const { chapterId } = req.params;

  try {
    // 1. Request ke endpoint MangaDex At-Home Server
    // Endpoint ini memberikan URL server khusus untuk mengambil gambar chapter tersebut
    const response = await axios.get(
      `${MANGADEX_API}/at-home/server/${chapterId}`,
      {
        headers: {
          "User-Agent": "KomiKita-Backend/1.0",
        },
      }
    );

    const baseUrl = response.data.baseUrl;
    const chapterHash = response.data.chapter.hash;
    const pageFilenames = response.data.chapter.data; // Array nama file gambar (kualitas asli)

    // Jika ingin hemat bandwidth, bisa pakai dataSaver (kualitas rendah):
    // const pageFilenames = response.data.chapter.dataSaver;

    // 2. Rakit URL Gambar Lengkap
    // Format URL MangaDex: {baseUrl}/data/{chapterHash}/{filename}
    const images = pageFilenames.map((filename) => {
      return `${baseUrl}/data/${chapterHash}/${filename}`;
    });

    // 3. Kirim ke Frontend
    res.status(200).json({
      error: false,
      message: "Gambar chapter berhasil diambil",
      data: images, // Array of strings (URL gambar)
    });
  } catch (err) {
    console.error("MangaDex Chapter Error:", err.message);
    res.status(500).json({
      error: true,
      message: "Gagal mengambil gambar chapter",
      details: err.message,
    });
  }
});

// ------------------------------------------------------------
// ? [TESTING] HTML READER VIEWER
// Endpoint ini mengembalikan HTML agar kita bisa melihat gambar langsung
// Akses di browser: http://localhost:3000/test-read/{chapterId}
// ------------------------------------------------------------
// ------------------------------------------------------------
// ? [TESTING] HTML READER VIEWER
// Endpoint ini mengembalikan HTML agar kita bisa melihat gambar langsung
// ------------------------------------------------------------
app.get("/test-read/:chapterId", async (req, res) => {
  const { chapterId } = req.params;

  try {
    const response = await axios.get(`${MANGADEX_API}/at-home/server/${chapterId}`, {
        headers: { "User-Agent": "KomiKita-Backend/1.0" }
    });

    const baseUrl = response.data.baseUrl;
    const chapterHash = response.data.chapter.hash;
    const pageFilenames = response.data.chapter.data;

    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Reader - Chapter ${chapterId}</title>
        <style>
          body { background-color: #1a1a1a; color: white; font-family: sans-serif; margin: 0; display: flex; flex-direction: column; align-items: center; }
          h1 { padding: 20px; text-align: center; }
          .page { max-width: 800px; width: 100%; margin-bottom: 10px; display: block; }
        </style>
      </head>
      <body>
        <h1>Mode Tes Baca: Chapter ${chapterId}</h1>
        <div>
    `;

    pageFilenames.forEach((filename, index) => {
      const originalUrl = `${baseUrl}/data/${chapterHash}/${filename}`;

      // --- PERBAIKAN: Tambahkan Parameter 'n=-1' ---
      // Parameter n=-1 pada wsrv.nl memaksa proxy untuk tidak mengirimkan referer asli
      // Ini membuat MangaDex tidak tahu kalau request ini berasal dari website kamu
      const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(
        originalUrl
      )}&n=-1`;

      htmlContent += `<img class="page" src="${proxyUrl}" loading="lazy" alt="Page ${
        index + 1
      }" />`;
    });

    htmlContent += `
        </div>
      </body>
      </html>
    `;

    res.send(htmlContent);

  } catch (err) {
    res.status(500).send(`<h1 style="color:red">Error: ${err.message}</h1>`);
  }
});

// ------------------------------------------------------------
// ? HEALTH CHECK (Cek status server)
// ------------------------------------------------------------
app.get("/", (req, res) => {
  res.json({ message: "Server KomiKita Backend is Running! 🚀" });
});

module.exports = app;