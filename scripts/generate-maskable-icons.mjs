import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

async function generateMaskableIcon(inputPath, outputPath, size) {
  // Maskable icons need 10% padding on each side (safe zone is center 80%)
  const padding = Math.floor(size * 0.1);
  const iconSize = size - (padding * 2);

  // Create white background
  const background = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  });

  // Resize the input icon
  const icon = await sharp(inputPath)
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();

  // Composite icon on white background
  await background
    .composite([{
      input: icon,
      top: padding,
      left: padding
    }])
    .png()
    .toFile(outputPath);

  console.log(`Generated: ${outputPath} (${size}x${size})`);
}

async function main() {
  const inputIcon = path.join(publicDir, 'icons', 'icon-512x512.png');

  // Generate maskable icons
  await generateMaskableIcon(
    inputIcon,
    path.join(publicDir, 'icons', 'icon-maskable-512x512.png'),
    512
  );

  await generateMaskableIcon(
    inputIcon,
    path.join(publicDir, 'icons', 'icon-maskable-192x192.png'),
    192
  );

  console.log('Done! Maskable icons generated.');
}

main().catch(console.error);
