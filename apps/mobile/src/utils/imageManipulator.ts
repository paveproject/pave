import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat, ImageResult } from 'expo-image-manipulator';

export const cropImageRatio = async (
  originalUri: string,
  targetRatio: number = 9 / 16,
): Promise<ImageResult> => {
  const img = await Image.loadAsync(originalUri);
  const originalRatio = img.width / img.height;

  let cropWidth: number, cropHeight: number, originX: number, originY: number;

  if (originalRatio > targetRatio) {
    cropHeight = img.height;
    cropWidth = img.height * targetRatio;
    originX = (img.width - cropWidth) / 2;
    originY = 0;
  } else {
    cropWidth = img.width;
    cropHeight = img.width / targetRatio;
    originY = (img.height - cropHeight) / 2;
    originX = 0;
  }

  const ctx = ImageManipulator.manipulate(img);
  ctx.crop({ originX, originY, width: cropWidth, height: cropHeight });

  const imageRef = await ctx.renderAsync();
  const result = await imageRef.saveAsync({
    format: SaveFormat.JPEG,
  });
  return result;
};
