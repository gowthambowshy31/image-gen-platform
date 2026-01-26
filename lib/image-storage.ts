import fs from "fs/promises"
import path from "path"
import sharp from "sharp"
import { createHash } from "crypto"
import { uploadToS3, deleteFromS3, getS3KeyFromUrl } from "./s3"

interface DownloadImageParams {
  url: string
  productId: string
  variant: string
  order: number
}

interface DownloadImageResult {
  success: boolean
  filePath?: string
  fileName?: string
  width?: number
  height?: number
  fileSize?: number
  error?: string
}

/**
 * Check if S3 is configured
 */
function isS3Configured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET_NAME
  )
}

/**
 * Download an image from a URL and store it (S3 if configured, otherwise local)
 */
export async function downloadAndStoreImage(
  params: DownloadImageParams
): Promise<DownloadImageResult> {
  try {
    const { url, productId, variant, order } = params

    // Generate filename
    const hash = createHash("md5").update(url).digest("hex").substring(0, 8)
    const fileName = `${variant}_${order}_${hash}.jpg`

    // Download image
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Process image with sharp (convert to JPEG, optimize)
    const processedImage = await sharp(buffer)
      .jpeg({ quality: 90 })
      .toBuffer()

    // Get metadata from processed image
    const metadata = await sharp(processedImage).metadata()

    // If S3 is configured, upload to S3
    if (isS3Configured()) {
      const s3Key = `source-images/${productId}/${fileName}`
      const s3Result = await uploadToS3({
        buffer: processedImage,
        key: s3Key,
        contentType: "image/jpeg",
      })

      if (!s3Result.success) {
        throw new Error(s3Result.error || "Failed to upload to S3")
      }

      return {
        success: true,
        filePath: s3Result.url,
        fileName,
        width: metadata.width,
        height: metadata.height,
        fileSize: processedImage.length,
      }
    }

    // Otherwise, save locally
    const uploadDir = path.join(process.cwd(), "public", "uploads", "source-images", productId)
    await fs.mkdir(uploadDir, { recursive: true })
    const filePath = path.join(uploadDir, fileName)
    await fs.writeFile(filePath, processedImage)

    const relativePath = `/uploads/source-images/${productId}/${fileName}`

    return {
      success: true,
      filePath: relativePath,
      fileName,
      width: metadata.width,
      height: metadata.height,
      fileSize: processedImage.length,
    }
  } catch (error) {
    console.error("Error downloading image:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Delete a source image file (from S3 or local)
 */
export async function deleteSourceImage(filePath: string): Promise<boolean> {
  try {
    // Check if it's an S3 URL
    if (filePath.startsWith("https://") && filePath.includes(".s3.")) {
      const s3Key = getS3KeyFromUrl(filePath)
      if (s3Key) {
        return await deleteFromS3(s3Key)
      }
      return false
    }

    // Otherwise delete locally
    const fullPath = path.join(process.cwd(), "public", filePath)
    await fs.unlink(fullPath)
    return true
  } catch (error) {
    console.error("Error deleting source image:", error)
    return false
  }
}

/**
 * Delete all source images for a product (local only - S3 handles via individual deletes)
 */
export async function deleteProductSourceImages(productId: string): Promise<boolean> {
  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "source-images", productId)
    await fs.rm(uploadDir, { recursive: true, force: true })
    return true
  } catch (error) {
    console.error("Error deleting product source images:", error)
    return false
  }
}
