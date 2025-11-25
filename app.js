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
      details: err.message 
    });
  }
});

// ------------------------------------------------------------
// ? HEALTH CHECK (Cek status server)
// ------------------------------------------------------------
app.get("/", (req, res) => {
  res.json({ message: "Server KomiKita Backend is Running! 🚀" });
});

module.exports = app;