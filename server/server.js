require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const admin = require("firebase-admin");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
app.use(cors());
app.use(express.json());

// ---- Firebase Admin Init ----
function initFirebaseAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Missing FIREBASE_PROJECT_ID in environment.");

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const jsonBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const pathToJson = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (jsonBase64) {
    const parsed = JSON.parse(Buffer.from(jsonBase64, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(parsed), projectId });
    return;
  }

  if (json) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
      projectId,
    });
    return;
  }

  if (pathToJson) {
    const abs = path.isAbsolute(pathToJson) ? pathToJson : path.join(process.cwd(), pathToJson);
    const raw = fs.readFileSync(abs, "utf8");
    const parsed = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
      projectId,
    });
    return;
  }

  // Last resort for local dev: use default credentials.
  admin.initializeApp({ projectId });
}

// Avoid re-init errors in watch mode.
if (!admin.apps.length) initFirebaseAdmin();

const db = admin.firestore();

// ---- S3 Init ----
const AWS_REGION = process.env.AWS_REGION;
const AWS_BUCKET = process.env.AWS_S3_BUCKET;
if (!AWS_REGION) throw new Error("Missing AWS_REGION in environment.");
if (!AWS_BUCKET) throw new Error("Missing AWS_S3_BUCKET in environment.");

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

function isAclNotSupportedError(err) {
  const name = err && err.name ? err.name : "";
  const code = err && (err.Code || err.code) ? (err.Code || err.code) : "";
  const msg = err && err.message ? err.message : "";

  if (code === "AccessControlListNotSupported" || name === "AccessControlListNotSupported") return true;

  const text = `${name} ${code} ${msg}`.toLowerCase();
  return text.includes("accesscontroallistnotsupported") || text.includes("does not allow acls");
}

async function uploadVideoToS3({ key, body, contentType }) {
  const baseParams = {
    Bucket: AWS_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType || "application/octet-stream",
  };

  const objectAcl = process.env.AWS_S3_OBJECT_ACL;
  if (!objectAcl) return new Upload({ client: s3Client, params: baseParams }).done();

  try {
    const upload = new Upload({
      client: s3Client,
      params: { ...baseParams, ACL: objectAcl },
    });
    return await upload.done();
  } catch (err) {
    if (isAclNotSupportedError(err)) {
      // Retry without ACL if bucket disallows ACLs.
      return new Upload({ client: s3Client, params: baseParams }).done();
    }
    throw err;
  }
}

// ---- Middleware ----
const UPLOAD_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 200 * 1024 * 1024);
const TMP_UPLOAD_DIR = path.join(__dirname, "tmp");
if (!fs.existsSync(TMP_UPLOAD_DIR)) fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, TMP_UPLOAD_DIR);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || "") || "";
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "");
    const name = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_BYTES },
  fileFilter: function (req, file, cb) {
    const ok =
      !file.mimetype || file.mimetype.startsWith("video/") || file.mimetype === "application/octet-stream";
    cb(ok ? null : new Error("Only video uploads are allowed."), ok);
  },
});

// ---- Helpers ----
function jsonError(res, statusCode, message, details) {
  return res.status(statusCode).json({ success: false, error: message, details });
}

function serializeVideoDoc(doc) {
  const data = doc.data() || {};
  const createdAt = data.createdAt;
  let createdAtIso = null;
  if (createdAt && typeof createdAt.toDate === "function") createdAtIso = createdAt.toDate().toISOString();
  else if (createdAt instanceof Date) createdAtIso = createdAt.toISOString();

  return {
    id: doc.id,
    title: data.title || "",
    subject: data.subject || "",
    createdBy: data.createdBy || "",
    url: data.url || "",
    status: data.status || "",
    createdAt: createdAtIso,
  };
}

// ---- Static ----
app.use(express.static(path.join(__dirname, "..")));  
app.use('/public', express.static(path.join(__dirname, "..", "public")));  
// Copy CSS/JS to public for public pages
app.get('*', function(req, res, next) {
  if (req.path.endsWith('.css') || req.path.endsWith('.js')) {
    // Try root first
    next();
  } else {
    next();
  }
});
app.use('/public', express.static(path.join(__dirname, "..", "public")));  // Override public if needed

// ---- Routes ----
app.post("/upload-video", upload.single("video"), async (req, res) => {
  let tmpPath = null;
  try {
    const { title, subject, createdBy } = req.body || {};
    const file = req.file;

    if (!title || !subject || !createdBy) return jsonError(res, 400, "Missing required fields: title, subject, createdBy.");
    if (!file) return jsonError(res, 400, "Missing video file.");

    tmpPath = file.path;

    const original = file.originalname || "video";
    const ext = path.extname(original).toLowerCase();
    const key = `videos/${Date.now()}-${Math.random().toString(16).slice(2)}${ext || ""}`;

    // 1) Upload to S3 first.
    const s3Result = await uploadVideoToS3({
      key,
      body: fs.createReadStream(file.path),
      contentType: file.mimetype,
    });

    const url = s3Result && s3Result.Location ? s3Result.Location : null;
    if (!url) return jsonError(res, 500, "S3 upload succeeded but no Location URL was returned.");

    // 2) Only after successful S3 upload: write Firestore document.
    const docData = {
      title,
      subject,
      createdBy,
      url,
      status: "pending",
      createdAt: new Date(),
    };

    await db.collection("videos").add(docData);
    return res.json({ success: true, url });
  } catch (err) {
    console.error(err);
    const message = err && err.message ? err.message : "Failed to upload video.";
    return jsonError(res, 500, message);
  } finally {
    if (tmpPath) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {}
    }
  }
});

app.get("/videos", async (_req, res) => {
  try {
    const snapshot = await db.collection("videos").where("status", "==", "approved").get();
    const docs = snapshot.docs.map(serializeVideoDoc);

    // Generate presigned URLs for teacher-uploaded videos (their stored URL is a raw S3 Location)
    const withUrls = await Promise.all(docs.map(async (video) => {
      if (!video.url) return video;
      // Extract the S3 key from the stored URL
      const match = video.url.match(/amazonaws\.com\/(.+)$/);
      if (!match) return video; // not an S3 URL, return as-is
      try {
        const command = new GetObjectCommand({ Bucket: AWS_BUCKET, Key: decodeURIComponent(match[1]) });
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        return { ...video, url: signedUrl };
      } catch (e) {
        return video; // fallback to original if signing fails
      }
    }));

    return res.json(withUrls);
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, "Failed to fetch approved videos.");
  }
});

app.get("/admin/videos", async (_req, res) => {
  try {
    const snapshot = await db.collection("videos").where("status", "==", "pending").get();
    return res.json(snapshot.docs.map(serializeVideoDoc));
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, "Failed to fetch pending videos.");
  }
});

// ---- Proxy stream for teacher-uploaded videos by Firestore ID ----
app.get("/video-stream/:id", async (req, res) => {
  try {
    const snap = await db.collection("videos").doc(req.params.id).get();
    if (!snap.exists) return jsonError(res, 404, "Video not found.");
    const data = snap.data();
    // Extract S3 key from stored URL
    const match = (data.url || '').match(/amazonaws\.com\/(.+?)(\?|$)/);
    if (!match) return jsonError(res, 400, "Invalid video URL.");
    const key = decodeURIComponent(match[1]);

    const rangeHeader = req.headers.range;
    const headCmd = new GetObjectCommand({ Bucket: AWS_BUCKET, Key: key });
    const headRes = await s3Client.send(headCmd);
    const contentType = headRes.ContentType || "video/mp4";
    const contentLength = headRes.ContentLength;

    if (rangeHeader && contentLength) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : contentLength - 1;
      const rangeCmd = new GetObjectCommand({ Bucket: AWS_BUCKET, Key: key, Range: `bytes=${start}-${end}` });
      const rangeRes = await s3Client.send(rangeCmd);
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${contentLength}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": contentType,
      });
      rangeRes.Body.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        ...(contentLength ? { "Content-Length": contentLength } : {}),
      });
      headRes.Body.pipe(res);
    }
  } catch (err) {
    console.error("video-stream error:", err.message);
    return jsonError(res, 500, "Failed to stream video.");
  }
});

app.post("/admin/approve/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return jsonError(res, 400, "Missing video id.");
    const ref = db.collection("videos").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, "Video not found.");
    await ref.update({ status: "approved" });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, "Failed to approve video.");
  }
});

app.post("/admin/reject/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return jsonError(res, 400, "Missing video id.");
    const ref = db.collection("videos").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, "Video not found.");
    await ref.update({ status: "rejected" });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return jsonError(res, 500, "Failed to reject video.");
  }
});

// ---- Lesson video streaming proxy ----
const LESSON_S3_KEYS = {
  'intro-algebra':       'videos/algebra.mp4',
  'linear-equations':    'videos/linear eq.mp4',
  'quadratics':          'videos/quad_equ.mp4',
  'intro-algebra-hi':    'videos/hindi/Algebra _ Cheat Sheet Series For Class 6th.mp4',
  'linear-equations-hi': 'videos/hindi/linear eq one shot.mp4',
  'quadratics-hi':       'videos/hindi/Quadratic Equation FULL CHAPTER Concept in 10 Minutes _ CBSE Class 10 Maths Chapter 4.mp4',
};

app.get("/lesson-video/:lessonId", async (req, res) => {
  const key = LESSON_S3_KEYS[req.params.lessonId];
  if (!key) return jsonError(res, 404, "Lesson video not found.");
  try {
    // First fetch without range to get content length
    const headCmd = new GetObjectCommand({ Bucket: AWS_BUCKET, Key: key });
    const headRes = await s3Client.send(headCmd);
    const contentType = headRes.ContentType || "video/mp4";
    const contentLength = headRes.ContentLength;
    const rangeHeader = req.headers.range;

    if (rangeHeader && contentLength) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : contentLength - 1;
      const chunkSize = end - start + 1;
      const rangeCmd = new GetObjectCommand({ Bucket: AWS_BUCKET, Key: key, Range: `bytes=${start}-${end}` });
      const rangeRes = await s3Client.send(rangeCmd);
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${contentLength}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
      });
      rangeRes.Body.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        ...(contentLength ? { "Content-Length": contentLength } : {}),
      });
      headRes.Body.pipe(res);
    }
  } catch (err) {
    console.error("Video stream error:", err.message);
    return jsonError(res, 500, "Failed to stream video.");
  }
});


app.use((err, _req, res, next) => {
  if (!err) return next();
  const msg = err.message ? err.message : "Upload failed.";
  if (err.code === "LIMIT_FILE_SIZE") return jsonError(res, 400, `File too large. Max size is ${UPLOAD_MAX_BYTES} bytes.`);
  return jsonError(res, 400, msg);
});

// Catch-all route for HTML pages - BEFORE JSON fallback
app.get('*', (req, res, next) => {
  const filePath = path.join(__dirname, '..', req.path.replace(/^\//, '') + '.html');
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  next();
});

// ---- Fallback ----
app.use((_req, res) => res.status(404).json({ success: false, error: "Not found." }));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Edu Bridge server running on http://localhost:${PORT}`);
});

