import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AmazonSPService } from "@/lib/amazon-sp"

// POST /api/admin/import-amazon-products - Import products from Amazon FBA inventory
export async function POST() {
  try {
    // Check environment variables first
    const envCheck = {
      AMAZON_REGION: !!process.env.AMAZON_REGION,
      AMAZON_MARKETPLACE_ID: !!process.env.AMAZON_MARKETPLACE_ID,
      AMAZON_CLIENT_ID: !!process.env.AMAZON_CLIENT_ID,
      AMAZON_CLIENT_SECRET: !!process.env.AMAZON_CLIENT_SECRET,
      AMAZON_REFRESH_TOKEN: !!process.env.AMAZON_REFRESH_TOKEN,
      DATABASE_URL: !!process.env.DATABASE_URL
    }

    const missingEnvVars = Object.entries(envCheck)
      .filter(([_, value]) => !value)
      .map(([key]) => key)

    if (missingEnvVars.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing environment variables: ${missingEnvVars.join(", ")}`,
        envCheck
      }, { status: 500 })
    }

    const amazonClient = new AmazonSPService()

    // Fetch FBA inventory
    console.log("Fetching FBA inventory from Amazon...")
    let inventory
    try {
      inventory = await amazonClient.getFBAInventoryWithQuantity()
    } catch (inventoryError) {
      return NextResponse.json({
        success: false,
        error: "Failed to fetch FBA inventory from Amazon",
        details: String(inventoryError),
        envCheck
      }, { status: 500 })
    }

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

    // Process ALL products - skipped ones don't count toward limit
    // Only limit actual API calls to Amazon (new products to fetch)
    const maxNewProducts = 100 // Max new products to import per request (to avoid timeout)

    for (let i = 0; i < inventory.length; i++) {
      // Stop if we've processed enough NEW products
      if (processed >= maxNewProducts) {
        console.log(`Reached limit of ${maxNewProducts} new products`)
        break
      }

      const item = inventory[i]
      const asin = item.asin

      try {
        // Check if product already exists (fast DB query, no limit needed)
        const existingProduct = await prisma.product.findFirst({
          where: { asin },
          include: { sourceImages: true }
        })

        if (existingProduct && existingProduct.sourceImages.length > 0) {
          // Skip silently - don't log every skip to reduce noise
          skipped++
          continue
        }

        // Fetch product details from Amazon
        console.log(`Fetching details for ${asin}... (${processed + 1}/${maxNewProducts})`)
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
        console.log(`Processed ${asin} (${processed}/${maxNewProducts})`)

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300))
      } catch (error) {
        console.error(`Error processing ${asin}:`, error)
        errors++
      }
    }

    const hasMore = processed >= maxNewProducts && (skipped + processed + errors) < inventory.length

    return NextResponse.json({
      success: true,
      processed,
      skipped,
      errors,
      total: inventory.length,
      hasMore,
      message: `Imported ${processed} products. Skipped ${skipped} existing.${hasMore ? " Run again to import more." : ""}`
    })
  } catch (error) {
    console.error("Error importing Amazon products:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to import Amazon products",
        details: String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
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
