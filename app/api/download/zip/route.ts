import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import archiver from "archiver"
import { PassThrough } from "stream"

interface ImageData {
  url: string
  fileName: string
}

async function fetchImageAsBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${url}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, imageType, productIds } = body

    // Validate input
    if (!productId && !productIds) {
      return NextResponse.json(
        { error: "productId or productIds is required" },
        { status: 400 }
      )
    }

    const images: ImageData[] = []

    // Single product download
    if (productId) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          sourceImages: true,
          images: {
            include: {
              imageType: true
            }
          }
        }
      })

      if (!product) {
        return NextResponse.json(
          { error: "Product not found" },
          { status: 404 }
        )
      }

      const productPrefix = product.asin || product.id

      if (imageType === "source") {
        // Download source images
        product.sourceImages.forEach((img, index) => {
          images.push({
            url: img.amazonImageUrl,
            fileName: `${productPrefix}-source-${img.variant || index + 1}.jpg`
          })
        })
      } else if (imageType === "generated") {
        // Download generated images
        product.images.forEach((img) => {
          const url = img.filePath?.startsWith("http")
            ? img.filePath
            : `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/uploads/${img.fileName}`
          images.push({
            url,
            fileName: img.fileName
          })
        })
      } else {
        // Download all images
        product.sourceImages.forEach((img, index) => {
          images.push({
            url: img.amazonImageUrl,
            fileName: `${productPrefix}-source-${img.variant || index + 1}.jpg`
          })
        })
        product.images.forEach((img) => {
          const url = img.filePath?.startsWith("http")
            ? img.filePath
            : `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/uploads/${img.fileName}`
          images.push({
            url,
            fileName: img.fileName
          })
        })
      }
    }

    // Multi-product download (for dashboard bulk download)
    if (productIds && Array.isArray(productIds)) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: {
          sourceImages: true,
          images: {
            include: {
              imageType: true
            }
          }
        }
      })

      products.forEach((product) => {
        const productPrefix = product.asin || product.id

        if (imageType === "source" || imageType === "all") {
          product.sourceImages.forEach((img, index) => {
            images.push({
              url: img.amazonImageUrl,
              fileName: `${productPrefix}/source-${img.variant || index + 1}.jpg`
            })
          })
        }

        if (imageType === "generated" || imageType === "all") {
          product.images.forEach((img) => {
            const url = img.filePath?.startsWith("http")
              ? img.filePath
              : `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/uploads/${img.fileName}`
            images.push({
              url,
              fileName: `${productPrefix}/${img.fileName}`
            })
          })
        }
      })
    }

    if (images.length === 0) {
      return NextResponse.json(
        { error: "No images found to download" },
        { status: 404 }
      )
    }

    // Create ZIP archive
    const archive = archiver("zip", {
      zlib: { level: 5 } // Compression level
    })

    const passThrough = new PassThrough()
    archive.pipe(passThrough)

    // Add images to archive
    const fetchPromises = images.map(async (img) => {
      try {
        const buffer = await fetchImageAsBuffer(img.url)
        archive.append(buffer, { name: img.fileName })
      } catch (error) {
        console.error(`Failed to fetch ${img.url}:`, error)
        // Continue with other images even if one fails
      }
    })

    await Promise.all(fetchPromises)
    await archive.finalize()

    // Collect the stream into a buffer
    const chunks: Buffer[] = []
    for await (const chunk of passThrough) {
      chunks.push(Buffer.from(chunk))
    }
    const zipBuffer = Buffer.concat(chunks)

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="images.zip"`,
        "Content-Length": zipBuffer.length.toString()
      }
    })
  } catch (error) {
    console.error("Error creating ZIP:", error)
    return NextResponse.json(
      { error: "Failed to create ZIP file" },
      { status: 500 }
    )
  }
}
