import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config/env.js';

/**
 * Local (server-side) file storage. Replaces Cloudinary.
 *
 * Files are written under UPLOAD_DIR (production: /var/www/uploads, served by nginx) and
 * exposed at UPLOAD_PUBLIC_URL (e.g. https://api.example.com/uploads). In development the
 * express app serves UPLOAD_DIR itself at /uploads.
 */

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || config.uploadPath || 'uploads');

const stripTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

export const getUploadDir = () => UPLOAD_DIR;

export const getUploadPublicBase = () =>
    stripTrailingSlash(process.env.UPLOAD_PUBLIC_URL) || `http://localhost:${config.port || 5000}/uploads`;

const sanitizeFolder = (folder) =>
    String(folder || 'uploads')
        .split(/[\\/]+/)
        .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, ''))
        .filter(Boolean)
        .join('/') || 'uploads';

const buildFilename = (ext) => `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

const writeFile = async (buffer, folder, ext) => {
    const safeFolder = sanitizeFolder(folder);
    const dir = path.join(UPLOAD_DIR, safeFolder);
    await fs.mkdir(dir, { recursive: true });

    const filename = buildFilename(ext);
    await fs.writeFile(path.join(dir, filename), buffer);

    const publicId = `${safeFolder}/${filename}`;
    return {
        public_id: publicId,
        secure_url: `${getUploadPublicBase()}/${publicId}`,
        bytes: buffer.length,
        format: ext,
    };
};

const saveImage = async (buffer, folder) => {
    if (!buffer) {
        throw new Error('File buffer is required');
    }
    const webp = await sharp(buffer, { failOn: 'none' }).rotate().webp({ quality: 82 }).toBuffer();
    return writeFile(webp, folder, 'webp');
};

const extFromBuffer = (buffer) => {
    const head = buffer.subarray(0, 12);
    if (head.subarray(4, 8).toString() === 'ftyp') return 'mp4';
    if (head.subarray(0, 4).toString('hex') === '1a45dfa3') return 'webm';
    if (head.subarray(0, 4).toString() === '%PDF') return 'pdf';
    return 'bin';
};

export const uploadImageBuffer = async (buffer, folder = 'uploads') => (await saveImage(buffer, folder)).secure_url;

export const uploadImageBufferDetailed = async (buffer, folder = 'uploads') => saveImage(buffer, folder);

export const uploadBufferDetailed = async (buffer, { folder = 'uploads', resourceType = 'auto' } = {}) => {
    if (!buffer) {
        throw new Error('File buffer is required');
    }
    if (resourceType === 'image') {
        return saveImage(buffer, folder);
    }
    return writeFile(buffer, folder, extFromBuffer(buffer));
};

/** Delete a stored file by the public_id returned at upload time. Never throws. */
export const deleteStoredFile = async (publicId) => {
    if (!publicId || typeof publicId !== 'string') return;
    const target = path.resolve(UPLOAD_DIR, publicId);
    if (!target.startsWith(UPLOAD_DIR + path.sep)) return; // path traversal guard
    await fs.unlink(target).catch(() => {});
};
