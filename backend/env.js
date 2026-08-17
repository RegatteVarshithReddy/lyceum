import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repo root .env in local dev (npm run dev's cwd is backend/); Docker
// injects env vars directly via docker-compose's env_file, so this is a
// silent no-op there (file doesn't exist in the image).
dotenv.config({ path: path.join(__dirname, "../.env") });
