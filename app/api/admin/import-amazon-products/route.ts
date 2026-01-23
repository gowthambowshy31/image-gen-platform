import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AmazonSPService } from "@/lib/amazon-sp"

// POST /api/admin/import-amazon-products - Import products from Amazon FBA inventory
export async function POST() {
  try {
    const amazonClient = new AmazonSPService()

    // Fetch FBA inventory
    console.log("Fetching FBA inventory from Amazon...")
    const inventory = await amazonClient.getFBAInventoryWithQuantity()

    if (!inventory || inventory.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No FBA inventory found"
      })
    }

    console.log(`Found ${inventory.length} FBA products`)

    // Get admin user for createdBy
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN" }
    })

    if (!adminUser) {
      return NextResponse.json({
        success: false,
        error: "No admin user found. Please initialize database first."
      })
    }

    let processed = 0
    let skipped = 0
    let errors = 0

    // Process in batches of 10 to avoid timeout
    const batchSize = 10
    const maxProducts = 50 // Limit for initial import to avoid timeout

    for (let i = 0; i < Math.min(inventory.length, maxProducts); i++) {
      const item = inventory[i]
      const asin = item.asin

      try {
        // Check if product already exists
        const existingProduct = await prisma.product.findFirst({
          where: { asin },
          include: { sourceImages: true }
        })

        if (existingProduct && existingProduct.sourceImages.length > 0) {
          console.log(`Skipping ${asin} - already exists with images`)
          skipped++
          continue
        }

        // Fetch product details from Amazon
        console.log(`Fetching details for ${asin}...`)
        const productDetails = await amazonClient.getProductByASIN(asin)

        if (!productDetails) {
          console.log(`Could not fetch details for ${asin}`)
          errors++
          continue
        }

        // Create or update product
        const product = existingProduct
          ? existingProduct
          : await prisma.product.create({
              data: {
                asin,
                title: productDetails.title || `Product ${asin}`,
                category: productDetails.productType || "Uncategorized",
                status: "NOT_STARTED",
                createdById: adminUser.id,
                metadata: {
                  brand: productDetails.brand,
                  manufacturer: productDetails.manufacturer,
                  quantity: item.quantity
                }
              }
            })

        // Download and save images
        if (productDetails.images && productDetails.images.length > 0) {
          for (let imgIndex = 0; imgIndex < productDetails.images.length; imgIndex++) {
            const image = productDetails.images[imgIndex]

            try {
              // Create source image record (URL only, no local download in serverless)
              await prisma.sourceImage.create({
                data: {
                  productId: product.id,
                  amazonImageUrl: image.link,
                  localFilePath: null,
                  variant: image.variant || (imgIndex === 0 ? "MAIN" : `PT0${imgIndex}`),
                  imageOrder: imgIndex,
                  width: image.width,
                  height: image.height
                }
              })
            } catch (imgError) {
              console.error(`Error saving image for ${asin}:`, imgError)
            }
          }
        }

        processed++
        console.log(`Processed ${asin} (${processed}/${maxProducts})`)

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error) {
        console.error(`Error processing ${asin}:`, error)
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      skipped,
      errors,
      total: inventory.length,
      message: `Imported ${processed} products. ${inventory.length > maxProducts ? `Limited to first ${maxProducts} products.` : ""}`
    })
  } catch (error) {
    console.error("Error importing Amazon products:", error)
    return NextResponse.json(
      { error: "Failed to import Amazon products", details: String(error) },
      { status: 500 }
    )
  }
}

// GET /api/admin/import-amazon-products - Check import status
export async function GET() {
  try {
    const productCount = await prisma.product.count()
    const sourceImageCount = await prisma.sourceImage.count()

    return NextResponse.json({
      products: productCount,
      sourceImages: sourceImageCount
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get import status" },
      { status: 500 }
    )
  }
}
