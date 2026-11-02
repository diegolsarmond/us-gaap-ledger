import fs from 'node:fs';
import path from 'node:path';

function createIco(pngFiles, outputPath) {
  const images = pngFiles.map(file => {
    const data = fs.readFileSync(file);
    // Parse width and height from PNG header (IHDR chunk is at bytes 12-28, width at 16, height at 20)
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return { data, width, height, size: data.length };
  });

  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;
  let offset = headerSize + dirEntrySize * numImages;

  const totalSize = offset + images.reduce((acc, img) => acc + img.size, 0);
  const buffer = Buffer.alloc(totalSize);

  // ICO header
  buffer.writeUInt16LE(0, 0); // Reserved
  buffer.writeUInt16LE(1, 2); // ICO type
  buffer.writeUInt16LE(numImages, 4); // Number of images

  let currentOffset = offset;
  images.forEach((img, index) => {
    const entryOffset = headerSize + index * dirEntrySize;
    buffer.writeUInt8(img.width >= 256 ? 0 : img.width, entryOffset);
    buffer.writeUInt8(img.height >= 256 ? 0 : img.height, entryOffset + 1);
    buffer.writeUInt8(0, entryOffset + 2); // Color palette
    buffer.writeUInt8(0, entryOffset + 3); // Reserved
    buffer.writeUInt16LE(1, entryOffset + 4); // Color planes
    buffer.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    buffer.writeUInt32LE(img.size, entryOffset + 8); // Image size in bytes
    buffer.writeUInt32LE(currentOffset, entryOffset + 12); // Image data offset

    img.data.copy(buffer, currentOffset);
    currentOffset += img.size;
  });

  fs.writeFileSync(outputPath, buffer);
  console.log(`Successfully generated ${outputPath} with ${numImages} sizes: ${images.map(i => `${i.width}x${i.height}`).join(', ')}`);
}

const publicDir = path.resolve('public');
const pngFiles = [
  path.join(publicDir, 'favicon-16.png'),
  path.join(publicDir, 'favicon-32.png'),
  path.join(publicDir, 'favicon-48.png')
];

createIco(pngFiles, path.join(publicDir, 'favicon.ico'));
