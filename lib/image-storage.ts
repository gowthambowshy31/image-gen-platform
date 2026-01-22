import fs from "fs/promises"
import path from "path"
import sharp from "sharp"
import { createHash } from "crypto"

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
 * Download an image from a URL and store it locally
 */
export async function downloadAndStoreImage(
  params: DownloadImageParams
): Promise<DownloadImageResult> {
  try {
    const { url, productId, variant, order } = params

    // Create upload directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), "public", "uploads", "source-images", productId)
    await fs.mkdir(uploadDir, { recursive: true })

    // Generate filename
    const hash = createHash("md5").update(url).digest("hex").substring(0, 8)
    const fileName = `${variant}_${order}_${hash}.jpg`
    const filePath = path.join(uploadDir, fileName)

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

    // Save to disk
    await fs.writeFile(filePath, processedImage)

    // Get metadata
    const stats = await fs.stat(filePath)
    const metadata = await sharp(filePath).metadata()

    // Return relative path for database storage
    const relativePath = `/uploads/source-images/${productId}/${fileName}`

    return {
      success: true,
      filePath: relativePath,
      fileName,
      width: metadata.width,
      height: metadata.height,
      fileSize: stats.size
    }
  } catch (error) {
    console.error("Error downloading image:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Delete a source image file
 */
export async function deleteSourceImage(filePath: string): Promise<boolean> {
  try {
    const fullPath = path.join(process.cwd(), "public", filePath)
    await fs.unlink(fullPath)
    return true
  } catch (error) {
    console.error("Error deleting source image:", error)
    return false
  }
}

/**
 * Delete all source images for a product
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
