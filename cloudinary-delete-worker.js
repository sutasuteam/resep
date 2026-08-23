/**
 * ============================================================
 * CLOUDINARY DELETE WORKER — Kotak Resep
 * ============================================================
 * Fungsi worker ini HANYA satu: menghapus video di Cloudinary
 * saat sebuah resep dihapus dari aplikasi. Ini WAJIB lewat
 * server (Worker), karena penghapusan di Cloudinary butuh
 * API Secret — dan API Secret TIDAK BOLEH ditaruh di kode
 * yang berjalan di browser (index.html), karena siapa saja
 * bisa melihatnya lewat "Inspect Element".
 *
 * CARA PASANG:
 * 1. Di folder baru, jalankan:
 *      npm create cloudflare@latest cloudinary-delete-worker
 *    Pilih "Hello World" worker (JavaScript).
 * 2. Ganti isi src/index.js (atau worker.js) dengan file ini.
 * 3. Ambil API Key & API Secret dari Cloudinary Dashboard
 *    (Settings → API Keys).
 * 4. Set sebagai secret (BUKAN ditulis langsung di kode):
 *      wrangler secret put CLOUDINARY_API_KEY
 *      wrangler secret put CLOUDINARY_API_SECRET
 *    Lalu isi CLOUDINARY_CLOUD_NAME di bagian env vars biasa
 *    (wrangler.toml, bagian [vars]) karena itu bukan rahasia.
 * 5. Deploy:
 *      wrangler deploy
 * 6. Salin URL Worker yang muncul (mis. https://xxxx.workers.dev)
 *    dan tempel ke CLOUDINARY_DELETE_WORKER_URL di index.html
 *    aplikasi Kotak Resep.
 * ============================================================
 */

export default {
  async fetch(request, env) {

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    try {
      const body = await request.json();
      const publicId = body.public_id;
      const resourceType = body.resource_type || "video";

      if (!publicId) {
        return new Response(JSON.stringify({ error: "public_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;

      // Cloudinary Admin API delete membutuhkan signature SHA-1
      // dari string "public_id=...&timestamp=..." + API secret
      const timestamp = Math.floor(Date.now() / 1000);
      const toSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-1", encoder.encode(toSign));
      const signature = [...new Uint8Array(hashBuffer)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      const form = new URLSearchParams();
      form.append("public_id", publicId);
      form.append("timestamp", timestamp.toString());
      form.append("api_key", apiKey);
      form.append("signature", signature);

      const cloudinaryRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString()
        }
      );

      const result = await cloudinaryRes.json();

      return new Response(JSON.stringify(result), {
        status: cloudinaryRes.ok ? 200 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }
  }
};
